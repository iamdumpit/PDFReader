export type Tool =
  | 'text'
  | 'select'
  | 'highlight'
  | 'underline'
  | 'note'
  | 'freetext'
  | 'ink'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'stamp'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Pt {
  x: number
  y: number
}

/** All coordinates are in PDF points, origin top-left of the page as displayed (scale 1). */
interface Base {
  id: string
  page: number // 1-based
  color: string // #rrggbb
  opacity: number
  width: number // stroke width
}

export type Annotation = Base &
  (
    | { type: 'highlight' | 'underline'; rects: Rect[] }
    | { type: 'note'; x: number; y: number; text: string }
    // for freetext, `width` is the font size in points
    | ({ type: 'freetext'; text: string } & Rect)
    | { type: 'ink'; paths: Pt[][] }
    | ({ type: 'rect' | 'ellipse' } & Rect)
    | { type: 'line' | 'arrow'; x1: number; y1: number; x2: number; y2: number }
    | ({ type: 'stamp'; label?: string; image?: string } & Rect)
  )

export const NOTE_SIZE = 20

export const TOOL_DEFAULTS: Record<Tool, { color: string; opacity: number; width: number }> = {
  text: { color: '#e03131', opacity: 1, width: 2 },
  select: { color: '#e03131', opacity: 1, width: 2 },
  highlight: { color: '#ffd43b', opacity: 0.4, width: 2 },
  underline: { color: '#e03131', opacity: 1, width: 1.5 },
  note: { color: '#ffd43b', opacity: 1, width: 1 },
  freetext: { color: '#212529', opacity: 1, width: 14 },
  ink: { color: '#e03131', opacity: 1, width: 2 },
  rect: { color: '#e03131', opacity: 1, width: 2 },
  ellipse: { color: '#e03131', opacity: 1, width: 2 },
  line: { color: '#e03131', opacity: 1, width: 2 },
  arrow: { color: '#e03131', opacity: 1, width: 2 },
  stamp: { color: '#2f9e44', opacity: 1, width: 2 }
}

export function bbox(a: Annotation): Rect {
  switch (a.type) {
    case 'highlight':
    case 'underline': {
      const xs = a.rects.flatMap((r) => [r.x, r.x + r.w])
      const ys = a.rects.flatMap((r) => [r.y, r.y + r.h])
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
    }
    case 'note':
      return { x: a.x, y: a.y, w: NOTE_SIZE, h: NOTE_SIZE }
    case 'ink': {
      const pts = a.paths.flat()
      const xs = pts.map((p) => p.x)
      const ys = pts.map((p) => p.y)
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
    }
    case 'line':
    case 'arrow':
      return {
        x: Math.min(a.x1, a.x2),
        y: Math.min(a.y1, a.y2),
        w: Math.abs(a.x2 - a.x1),
        h: Math.abs(a.y2 - a.y1)
      }
    default:
      return { x: a.x, y: a.y, w: a.w, h: a.h }
  }
}

export function translate(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case 'highlight':
    case 'underline':
      return { ...a, rects: a.rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })) }
    case 'ink':
      return { ...a, paths: a.paths.map((p) => p.map((q) => ({ x: q.x + dx, y: q.y + dy }))) }
    case 'line':
    case 'arrow':
      return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy }
    default:
      return { ...a, x: a.x + dx, y: a.y + dy }
  }
}
