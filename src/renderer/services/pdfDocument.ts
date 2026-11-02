import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'
export { searchDocument, type SearchHit } from './pdfSearch'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type { PDFDocumentProxy }

export interface PageSize {
  width: number
  height: number
}

export interface OutlineNode {
  title: string
  page: number | null
  items: OutlineNode[]
}

export async function loadPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  // pdf.js transfers the buffer to its worker, so hand it a copy
  return pdfjs.getDocument({ data: data.slice() }).promise
}

export async function readPageSizes(doc: PDFDocumentProxy): Promise<PageSize[]> {
  const sizes: PageSize[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    sizes.push({ width: vp.width, height: vp.height })
  }
  return sizes
}

async function destToPage(doc: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest
    if (!Array.isArray(explicit) || explicit.length === 0) return null
    const target = explicit[0]
    if (typeof target === 'number') return target + 1
    return (await doc.getPageIndex(target)) + 1
  } catch {
    return null
  }
}

export async function readOutline(doc: PDFDocumentProxy): Promise<OutlineNode[]> {
  const raw = await doc.getOutline()
  if (!raw) return []
  const walk = async (nodes: typeof raw): Promise<OutlineNode[]> =>
    Promise.all(
      nodes.map(async (n) => ({
        title: n.title,
        page: await destToPage(doc, n.dest),
        items: await walk(n.items ?? [])
      }))
    )
  return walk(raw)
}
