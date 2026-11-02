import { describe, expect, it } from 'vitest'
import { PDFDict, PDFDocument, PDFName, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { embedAnnotations } from './pdfEdit'
import type { Annotation } from '../annotate/types'

// 1x1 red PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function samplePdf(rotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 600])
  page.drawText('Hello annotations', { x: 50, y: 500 })
  if (rotation) page.setRotation(degrees(rotation))
  return doc.save()
}

const base = { page: 1, color: '#e03131', opacity: 1, width: 2 }
const all: Annotation[] = [
  { ...base, id: '1', type: 'highlight', color: '#ffd43b', opacity: 0.4, rects: [{ x: 50, y: 90, w: 100, h: 12 }] },
  { ...base, id: '2', type: 'underline', rects: [{ x: 50, y: 90, w: 100, h: 12 }] },
  { ...base, id: '3', type: 'note', x: 200, y: 50, text: 'Remember this' },
  { ...base, id: '11', type: 'freetext', x: 30, y: 120, w: 160, h: 40, width: 12, color: '#212529', text: 'Typed text that should wrap onto lines' },
  { ...base, id: '4', type: 'ink', paths: [[{ x: 10, y: 10 }, { x: 40, y: 30 }, { x: 70, y: 10 }]] },
  { ...base, id: '5', type: 'rect', x: 20, y: 200, w: 80, h: 40 },
  { ...base, id: '6', type: 'ellipse', x: 120, y: 200, w: 80, h: 40 },
  { ...base, id: '7', type: 'line', x1: 20, y1: 300, x2: 120, y2: 320 },
  { ...base, id: '8', type: 'arrow', x1: 20, y1: 350, x2: 120, y2: 380 },
  { ...base, id: '9', type: 'stamp', x: 200, y: 300, w: 140, h: 36, label: 'APPROVED' },
  { ...base, id: '10', type: 'stamp', x: 200, y: 340, w: 50, h: 50, image: PNG }
]

describe('embedAnnotations', () => {
  for (const rot of [0, 90, 180, 270]) {
    it(`embeds every annotation type on a ${rot}° page`, async () => {
      const out = await embedAnnotations(await samplePdf(rot), all)
      const doc = await PDFDocument.load(out)
      const annots = doc.getPage(0).node.Annots()!
      const subtypes = Array.from({ length: annots.size() }, (_, i) =>
        annots.lookup(i, PDFDict).get(PDFName.of('Subtype'))!.toString()
      )
      expect(subtypes).toEqual([
        '/Highlight', '/Underline', '/Text', '/FreeText', '/Ink', '/Square', '/Circle', '/Line', '/Line', '/Stamp', '/Stamp'
      ])

      // pdf.js must accept them and place each one inside the page
      const pdf = await getDocument({ data: out.slice() }).promise
      const page = await pdf.getPage(1)
      const [, , vw, vh] = page.view
      const parsed = await page.getAnnotations()
      expect(parsed.length).toBe(all.length)
      for (const p of parsed) {
        expect(p.rect[0]).toBeGreaterThanOrEqual(-1)
        expect(p.rect[1]).toBeGreaterThanOrEqual(-1)
        expect(p.rect[2]).toBeLessThanOrEqual(vw + 1)
        expect(p.rect[3]).toBeLessThanOrEqual(vh + 1)
      }
    })
  }

  it('returns a loadable PDF with the same page count and no annots when none given', async () => {
    const out = await embedAnnotations(await samplePdf(), [])
    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getPage(0).node.Annots()?.size() ?? 0).toBe(0)
  })
})
