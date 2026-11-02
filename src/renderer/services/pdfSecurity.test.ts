import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as mupdf from 'mupdf'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { compressStructure, decryptPdf, isEncrypted, permissionBits, protectPdf, ALL_PERMISSIONS } from './pdfSecurity'
import { hasAnyMetadata, readMetadata, stripMetadata } from './pdfMetadata'

async function sample(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.setTitle('Secret plans')
  doc.setAuthor('Ada Lovelace')
  doc.setKeywords(['a', 'b'])
  for (let i = 0; i < 4; i++) {
    const p = doc.addPage([400, 500])
    for (let k = 0; k < 40; k++) p.drawText(`Line ${k} of page ${i} lorem ipsum dolor sit amet`, { x: 20, y: 480 - k * 11, size: 9, font })
  }
  return doc.save({ useObjectStreams: false })
}

describe('compression', () => {
  it('makes a text PDF smaller and keeps every page', async () => {
    const src = await sample()
    const out = await compressStructure(src)
    expect(out.length).toBeLessThan(src.length)
    expect((await PDFDocument.load(out)).getPageCount()).toBe(4)
  })
})

describe('password protection', () => {
  it('encrypts, requires the password, and can be decrypted again', async () => {
    const enc = await protectPdf(await sample(), { userPassword: 'open-me', ownerPassword: 'own', permissions: ALL_PERMISSIONS })
    expect(await isEncrypted(enc)).toBe(true)
    await expect(decryptPdf(enc, 'wrong')).rejects.toThrow(/Incorrect/)

    const plain = await decryptPdf(enc, 'open-me')
    expect(await isEncrypted(plain)).toBe(false)
    expect((await PDFDocument.load(plain)).getPageCount()).toBe(4)
  })

  it('pdf.js refuses to open the encrypted file without the password', async () => {
    const enc = await protectPdf(await sample(), { userPassword: 'pw', ownerPassword: '', permissions: ALL_PERMISSIONS })
    await expect(getDocument({ data: enc.slice() }).promise).rejects.toMatchObject({ name: 'PasswordException' })
    const ok = await getDocument({ data: enc.slice(), password: 'pw' }).promise
    expect(ok.numPages).toBe(4)
  })

  it('keeps earlier results intact after further mupdf calls (no views into WASM memory)', async () => {
    const first = await protectPdf(await sample(), { userPassword: 'pw', ownerPassword: '', permissions: ALL_PERMISSIONS })
    const copy = first.slice()
    for (let i = 0; i < 3; i++) await compressStructure(await sample())
    await decryptPdf(first, 'pw')
    expect(Array.from(first.slice(0, 1000))).toEqual(Array.from(copy.slice(0, 1000)))
    expect(new TextDecoder().decode(first.slice(0, 5))).toBe('%PDF-')
  })

  it('writes the chosen permissions into the file', async () => {
    const perms = { print: false, copy: false, edit: true, annotate: true }
    const enc = await protectPdf(await sample(), { userPassword: 'pw', ownerPassword: 'own', permissions: perms })
    const doc = mupdf.Document.openDocument(enc, 'application/pdf')
    doc.authenticatePassword('pw') // user password: permissions apply
    expect(doc.hasPermission('print')).toBe(false)
    expect(doc.hasPermission('copy')).toBe(false)
    expect(doc.hasPermission('annotate')).toBe(true)
  })

  it('computes permission flags', () => {
    expect(permissionBits(ALL_PERMISSIONS)).toBe(-4)
    expect(permissionBits({ ...ALL_PERMISSIONS, print: false }) & 4).toBe(0)
  })

  it('rejects empty passwords and unsupported characters', async () => {
    const src = await sample()
    await expect(protectPdf(src, { userPassword: '', ownerPassword: '', permissions: ALL_PERMISSIONS })).rejects.toThrow()
    await expect(protectPdf(src, { userPassword: 'a,b', ownerPassword: '', permissions: ALL_PERMISSIONS })).rejects.toThrow(/cannot contain/)
  })
})

describe('metadata', () => {
  it('reads then strips the info dictionary', async () => {
    const src = await sample()
    const before = await readMetadata(src)
    expect(before.title).toBe('Secret plans')
    expect(before.author).toBe('Ada Lovelace')
    expect(hasAnyMetadata(before)).toBe(true)

    const out = await stripMetadata(src, { annotationAuthors: true })
    const after = await readMetadata(out)
    expect(hasAnyMetadata(after)).toBe(false)

    const pdf = await getDocument({ data: out.slice() }).promise
    const info = (await pdf.getMetadata()).info as Record<string, unknown>
    expect(info.Title ?? '').toBe('')
    expect(info.Author ?? '').toBe('')
    expect(info.Producer ?? '').toBe('')
  })

  it('stays clean through further pdf-lib edits (no producer/date added back)', async () => {
    const stripped = await stripMetadata(await sample(), { annotationAuthors: false })
    const { rotatePages } = await import('./pdfPages')
    const edited = await rotatePages(stripped, [0], 90)
    expect(hasAnyMetadata(await readMetadata(edited))).toBe(false)
  })
})
