import { PDFDocument, degrees } from 'pdf-lib'

const load = (bytes: Uint8Array): Promise<PDFDocument> => PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })

export async function countPages(bytes: Uint8Array): Promise<number> {
  return (await load(bytes)).getPageCount()
}

/** Rotate the given 0-based pages by `delta` degrees (multiples of 90, may be negative). */
export async function rotatePages(bytes: Uint8Array, indices: number[], delta: number): Promise<Uint8Array> {
  const doc = await load(bytes)
  const pages = doc.getPages()
  for (const i of indices) {
    const p = pages[i]
    if (!p) continue
    p.setRotation(degrees((((p.getRotation().angle + delta) % 360) + 360) % 360))
  }
  return doc.save()
}

export async function deletePages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const doc = await load(bytes)
  const drop = new Set(indices)
  if (drop.size >= doc.getPageCount()) throw new Error('A PDF needs at least one page.')
  for (const i of [...drop].sort((a, b) => b - a)) doc.removePage(i)
  return doc.save()
}

/** `order[k]` is the old index of the page that ends up at position k. Must be a permutation. */
export async function reorderPages(bytes: Uint8Array, order: number[]): Promise<Uint8Array> {
  const doc = await load(bytes)
  const pages = doc.getPages()
  if (order.length !== pages.length || new Set(order).size !== pages.length) {
    throw new Error('Invalid page order.')
  }
  // moving the existing page objects keeps form fields, links and outlines pointing at them
  for (let i = pages.length - 1; i >= 0; i--) doc.removePage(i)
  for (const old of order) doc.addPage(pages[old])
  return doc.save()
}

export async function extractPages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const src = await load(bytes)
  const out = await PDFDocument.create({ updateMetadata: false })
  const copied = await out.copyPages(src, indices)
  copied.forEach((p) => out.addPage(p))
  return out.save()
}

/** Insert pages `srcIndices` of `source` into `bytes` so the first one lands at position `at`. */
export async function insertPages(
  bytes: Uint8Array,
  source: Uint8Array,
  srcIndices: number[] | null,
  at: number
): Promise<Uint8Array> {
  const dest = await load(bytes)
  const src = await load(source)
  const indices = srcIndices ?? src.getPageIndices()
  const copied = await dest.copyPages(src, indices)
  copied.forEach((p, k) => dest.insertPage(at + k, p))
  return dest.save()
}

export async function insertBlankPage(bytes: Uint8Array, at: number): Promise<Uint8Array> {
  const doc = await load(bytes)
  const ref = doc.getPages()[Math.min(Math.max(at - 1, 0), doc.getPageCount() - 1)]
  const { width, height } = ref ? ref.getSize() : { width: 595, height: 842 }
  doc.insertPage(at, [width, height])
  return doc.save()
}

export async function mergePdfs(sources: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create({ updateMetadata: false })
  for (const bytes of sources) {
    const src = await load(bytes)
    const copied = await out.copyPages(src, src.getPageIndices())
    copied.forEach((p) => out.addPage(p))
  }
  return out.save()
}

/** "1-3, 5, 8-10" -> [[0,1,2],[4],[7,8,9]] (0-based). Throws a readable error on bad input. */
export function parseRanges(text: string, pageCount: number): number[][] {
  const groups: number[][] = []
  for (const part of text.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part)
    if (!m) throw new Error(`"${part}" is not a page or range.`)
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    if (a < 1 || b < a || b > pageCount) throw new Error(`"${part}" is outside 1–${pageCount}.`)
    groups.push(Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i))
  }
  if (!groups.length) throw new Error('Enter at least one page range.')
  return groups
}

export function everyN(pageCount: number, n: number): number[][] {
  if (!Number.isInteger(n) || n < 1) throw new Error('Enter a whole number of pages (1 or more).')
  const groups: number[][] = []
  for (let i = 0; i < pageCount; i += n) {
    groups.push(Array.from({ length: Math.min(n, pageCount - i) }, (_, k) => i + k))
  }
  return groups
}

export async function splitPdf(bytes: Uint8Array, groups: number[][]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = []
  for (const g of groups) out.push(await extractPages(bytes, g))
  return out
}
