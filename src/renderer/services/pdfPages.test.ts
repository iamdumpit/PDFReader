import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  deletePages,
  everyN,
  extractPages,
  insertBlankPage,
  insertPages,
  mergePdfs,
  parseRanges,
  reorderPages,
  rotatePages,
  splitPdf
} from './pdfPages'

/** Pages get distinct widths (100, 200, ...) so their identity survives any shuffling. */
async function sample(n = 4, base = 100): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 1; i <= n; i++) doc.addPage([base * i, 300])
  return doc.save()
}

const widths = async (b: Uint8Array): Promise<number[]> =>
  (await PDFDocument.load(b)).getPages().map((p) => p.getWidth())

describe('page operations', () => {
  it('rotates only the chosen pages, including negative turns', async () => {
    const out = await PDFDocument.load(await rotatePages(await sample(), [1, 3], -90))
    expect(out.getPages().map((p) => p.getRotation().angle)).toEqual([0, 270, 0, 270])
  })

  it('deletes pages but refuses to delete all of them', async () => {
    expect(await widths(await deletePages(await sample(), [0, 2]))).toEqual([200, 400])
    await expect(deletePages(await sample(2), [0, 1])).rejects.toThrow()
  })

  it('reorders by permutation', async () => {
    expect(await widths(await reorderPages(await sample(), [3, 0, 2, 1]))).toEqual([400, 100, 300, 200])
    await expect(reorderPages(await sample(), [0, 0, 1, 2])).rejects.toThrow()
  })

  it('extracts pages into a new document', async () => {
    expect(await widths(await extractPages(await sample(), [2, 0]))).toEqual([300, 100])
  })

  it('inserts pages from another PDF at a position', async () => {
    const out = await insertPages(await sample(3), await sample(2, 1000), [0, 1], 1)
    expect(await widths(out)).toEqual([100, 1000, 2000, 200, 300])
  })

  it('inserts a blank page sized like its neighbour', async () => {
    expect(await widths(await insertBlankPage(await sample(2), 1))).toEqual([100, 100, 200])
    expect(await widths(await insertBlankPage(await sample(2), 2))).toEqual([100, 200, 200])
  })

  it('merges documents in order', async () => {
    expect(await widths(await mergePdfs([await sample(2), await sample(1, 1000)]))).toEqual([100, 200, 1000])
  })

  it('splits by ranges and by every N pages', async () => {
    const src = await sample(5)
    const parts = await splitPdf(src, parseRanges('1-2, 5', 5))
    expect(await Promise.all(parts.map(widths))).toEqual([[100, 200], [500]])
    expect(everyN(5, 2)).toEqual([[0, 1], [2, 3], [4]])
  })

  it('rejects bad ranges with readable errors', () => {
    expect(() => parseRanges('0-2', 5)).toThrow(/outside/)
    expect(() => parseRanges('3-9', 5)).toThrow(/outside/)
    expect(() => parseRanges('a', 5)).toThrow(/not a page/)
    expect(() => parseRanges('', 5)).toThrow(/at least one/)
    expect(() => everyN(5, 0)).toThrow()
  })
})
