import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { searchDocument } from './pdfSearch'
import type { PDFDocumentProxy } from 'pdfjs-dist'

/** A PDF laid out the awkward way real ones are: words drawn as separate runs, wrapped lines, a split word. */
async function awkwardPdf(): Promise<PDFDocumentProxy> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const p1 = doc.addPage([400, 400])
  const draw = (t: string, x: number, y: number): void => p1.drawText(t, { x, y, size: 12, font })
  // "quick brown fox" drawn as three separate runs with gaps
  draw('The', 30, 360)
  draw('quick', 60, 360)
  draw('brown', 100, 360)
  draw('fox', 145, 360)
  // a phrase wrapped over two lines
  draw('jumps over the lazy', 30, 340)
  draw('dog and runs away', 30, 326)
  // a word hyphenated at the end of a line
  draw('a very exam-', 30, 300)
  draw('ple of splitting', 30, 286)
  // accents and case
  draw('Café CREME Brûlée', 30, 260)
  const p2 = doc.addPage([400, 400])
  p2.drawText('Second page mentions the quick idea again', { x: 30, y: 360, size: 12, font })
  const bytes = await doc.save()
  return getDocument({ data: bytes.slice() }).promise
}

const search = async (pdf: PDFDocumentProxy, q: string) => searchDocument(pdf, q, { cancelled: false })

describe('searchDocument (real PDF)', () => {
  it('finds words drawn as separate runs, as a phrase, on every page', async () => {
    const pdf = await awkwardPdf()
    const hits = await search(pdf, 'the quick')
    expect(hits.map((h) => h.page)).toEqual([1, 2])
    // the page-1 match spans two text runs
    expect(hits[0].segs.length).toBeGreaterThanOrEqual(2)
  })

  it('finds a phrase that wraps onto the next line', async () => {
    const hits = await search(await awkwardPdf(), 'lazy dog and runs')
    expect(hits).toHaveLength(1)
    expect(hits[0].page).toBe(1)
  })

  it('finds a hyphen-split word', async () => {
    const hits = await search(await awkwardPdf(), 'example')
    expect(hits).toHaveLength(1)
    expect(hits[0].snippet).toMatch(/exam-\s*ple/i)
  })

  it('ignores case and accents', async () => {
    const pdf = await awkwardPdf()
    expect(await search(pdf, 'cafe creme brulee')).toHaveLength(1)
    expect(await search(pdf, 'QUICK')).toHaveLength(2)
  })

  it('falls back to whitespace-insensitive matching when nothing matches exactly', async () => {
    const pdf = await awkwardPdf()
    expect(await search(pdf, 'quickbrown')).toHaveLength(1)
  })

  it('returns nothing for text that is not there, and stops when cancelled', async () => {
    const pdf = await awkwardPdf()
    expect(await search(pdf, 'zebra')).toEqual([])
    expect(await searchDocument(pdf, 'quick', { cancelled: true })).toEqual([])
  })
})
