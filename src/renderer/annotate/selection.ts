import { newId, useAnn } from '../store/annotationStore'
import type { Annotation, Rect } from './types'

/** Turn the current text selection into highlight/underline annotations (one per page). */
export function markupFromSelection(kind: 'highlight' | 'underline', scale: number): boolean {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  const s = useAnn.getState()
  const created: Annotation[] = []

  document.querySelectorAll<HTMLElement>('.page').forEach((pageEl) => {
    if (!range.intersectsNode(pageEl)) return
    const pageRect = pageEl.getBoundingClientRect()
    const rects: Rect[] = []
    pageEl.querySelectorAll<HTMLElement>('.textLayer span:not(.markedContent)').forEach((span) => {
      if (!range.intersectsNode(span)) return
      const r = document.createRange()
      r.selectNodeContents(span)
      if (range.compareBoundaryPoints(Range.START_TO_START, r) > 0) r.setStart(range.startContainer, range.startOffset)
      if (range.compareBoundaryPoints(Range.END_TO_END, r) < 0) r.setEnd(range.endContainer, range.endOffset)
      for (const c of Array.from(r.getClientRects())) {
        if (c.width < 1 || c.height < 1) continue
        rects.push({
          x: (c.left - pageRect.left) / scale,
          y: (c.top - pageRect.top) / scale,
          w: c.width / scale,
          h: c.height / scale
        })
      }
    })
    if (!rects.length) return
    created.push({
      id: newId(),
      page: Number(pageEl.dataset.page),
      type: kind,
      rects,
      color: s.color,
      opacity: s.opacity,
      width: s.width
    })
  })

  if (!created.length) return false
  // New markup overrides older markup of the same kind where they overlap.
  type Markup = Extract<Annotation, { rects: Rect[] }>
  const kept: Annotation[] = []
  for (const old of useAnn.getState().annotations) {
    if (old.type !== kind) {
      kept.push(old)
      continue
    }
    const fresh = created.filter((c) => c.page === old.page) as Markup[]
    if (!fresh.length) {
      kept.push(old)
      continue
    }
    const newRects = fresh.flatMap((c) => c.rects)
    const survivors = (old as Markup).rects.flatMap((r) => subtract(r, newRects))
    if (survivors.length) kept.push({ ...old, rects: survivors } as Annotation)
  }
  useAnn.getState().commit([...kept, ...created])
  sel.removeAllRanges()
  return true
}

/** Remove the horizontal spans of `cut` rects that sit on the same line as `r`. */
function subtract(r: Rect, cuts: Rect[]): Rect[] {
  let parts: Rect[] = [r]
  for (const n of cuts) {
    const v = Math.min(r.y + r.h, n.y + n.h) - Math.max(r.y, n.y)
    if (v < Math.min(r.h, n.h) * 0.5) continue // different line
    parts = parts.flatMap((p) => {
      if (n.x >= p.x + p.w || n.x + n.w <= p.x) return [p]
      const out: Rect[] = []
      if (n.x - p.x > 1) out.push({ ...p, w: n.x - p.x })
      const rightX = n.x + n.w
      if (p.x + p.w - rightX > 1) out.push({ ...p, x: rightX, w: p.x + p.w - rightX })
      return out
    })
  }
  return parts
}

/** Click an existing highlight/underline (with the plain Select tool) to select it for deletion. */
export function selectMarkupAt(e: MouseEvent): void {
  const pageEl = (e.target as Element).closest<HTMLElement>('.page')
  if (!pageEl) return
  const svg = pageEl.querySelector('svg.annLayer')
  const vbWidth = Number(svg?.getAttribute('viewBox')?.split(' ')[2])
  if (!vbWidth) return
  const box = pageEl.getBoundingClientRect()
  const k = box.width / vbWidth // screen px per page unit
  const x = (e.clientX - box.left) / k
  const y = (e.clientY - box.top) / k
  const page = Number(pageEl.dataset.page)
  const s = useAnn.getState()
  for (let i = s.annotations.length - 1; i >= 0; i--) {
    const a = s.annotations[i]
    if (a.page !== page || (a.type !== 'highlight' && a.type !== 'underline')) continue
    if (a.rects.some((r) => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2)) {
      s.select(a.id)
      return
    }
  }
}
