/**
 * Text search that copes with how PDFs really store text: words split over several text runs,
 * line breaks, hyphenated line ends, ligatures, accents, curly quotes and odd spacing.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface RunLike {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}

/** A piece of a match inside one text run (run = one span of the page's text layer). */
export interface Seg {
  item: number
  from: number
  to: number
}

export interface PageText {
  text: string
  /** offset in `text` where each run starts */
  starts: number[]
  lens: number[]
  /** indices of characters in `text` to ignore (soft line-break hyphens) */
  soft: Set<number>
}

const FOLD: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'",
  '“': '"', '”': '"', '„': '"',
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '−': '-',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' '
}

/** Join a page's text runs into one string, inserting spaces/line breaks where a reader would see them. */
export function buildPageText(runs: RunLike[]): PageText {
  let text = ''
  const starts: number[] = []
  const lens: number[] = []
  const soft = new Set<number>()

  runs.forEach((run, j) => {
    if (j > 0) {
      const prev = runs[j - 1]
      const h = Math.max(Math.abs(prev.height), Math.abs(run.height), 1)
      const sameLine = Math.abs(run.transform[5] - prev.transform[5]) < h * 0.5
      if (prev.hasEOL || !sameLine) {
        // a line ending in "-" followed by a lowercase continuation is a split word
        if (/\w-$/.test(prev.str) && /^[a-zà-ÿ]/.test(run.str)) soft.add(text.length - 1)
        else text += ' '
      } else {
        const gap = run.transform[4] - (prev.transform[4] + prev.width)
        if (gap > h * 0.15) text += ' '
      }
    }
    starts.push(text.length)
    lens.push(run.str.length)
    text += run.str
  })
  return { text, starts, lens, soft }
}

interface Normalized {
  norm: string
  /** norm[k] came from text[map[k]] */
  map: number[]
}

/** Lower-case, strip accents and ligatures, fold quotes/dashes, collapse whitespace. */
export function normalize(text: string, soft: Set<number> = new Set()): Normalized {
  const out: string[] = []
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (soft.has(i)) continue
    const ch = FOLD[text[i]] ?? text[i]
    if (/\s/.test(ch)) {
      if (out.length && out[out.length - 1] !== ' ') {
        out.push(' ')
        map.push(i)
      }
      continue
    }
    const folded = ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    for (const c of folded) {
      out.push(FOLD[c] ?? c)
      map.push(i)
    }
  }
  while (out.length && out[out.length - 1] === ' ') {
    out.pop()
    map.pop()
  }
  return { norm: out.join(''), map }
}

export function normalizeQuery(q: string): string {
  return normalize(q).norm
}

/** Match ranges as [start, end) offsets into `page.text`. `loose` ignores all whitespace. */
export function findInPage(page: PageText, query: string, loose = false): [number, number][] {
  const q = normalizeQuery(query)
  if (!q) return []
  let { norm, map } = normalize(page.text, page.soft)
  let needle = q
  if (loose) {
    const keep: number[] = []
    for (let k = 0; k < norm.length; k++) if (norm[k] !== ' ') keep.push(k)
    norm = keep.map((k) => norm[k]).join('')
    map = keep.map((k) => map[k])
    needle = q.replace(/ /g, '')
    if (!needle) return []
  }
  const hits: [number, number][] = []
  let from = 0
  for (;;) {
    const at = norm.indexOf(needle, from)
    if (at < 0) break
    hits.push([map[at], map[at + needle.length - 1] + 1])
    from = at + needle.length
  }
  return hits
}

/** Split a match range into the run pieces it covers. */
export function segmentsFor(page: PageText, start: number, end: number): Seg[] {
  const segs: Seg[] = []
  for (let j = 0; j < page.starts.length; j++) {
    const a = page.starts[j]
    const b = a + page.lens[j]
    if (b <= start || a >= end || a === b) continue
    const from = Math.max(start, a) - a
    const to = Math.min(end, b) - a
    // never highlight just a soft hyphen at the end of a run
    if (to > from) segs.push({ item: j, from, to })
  }
  return segs
}

export function snippetFor(page: PageText, start: number, end: number): string {
  const s = page.text.slice(Math.max(0, start - 24), end + 36)
  return s.replace(/\s+/g, ' ').trim()
}

export interface SearchHit {
  page: number // 1-based
  /** the pieces of this match, per text-layer span on the page */
  segs: Seg[]
  snippet: string
}

export async function searchDocument(
  doc: PDFDocumentProxy,
  query: string,
  signal: { cancelled: boolean }
): Promise<SearchHit[]> {
  if (!normalizeQuery(query)) return []
  const pages: PageText[] = []
  const collect = (p: PageText, n: number, loose: boolean, out: SearchHit[]): void => {
    for (const [a, b] of findInPage(p, query, loose)) {
      out.push({ page: n, segs: segmentsFor(p, a, b), snippet: snippetFor(p, a, b) })
    }
  }

  // exact pass (whitespace-normalised); keep each page's text so a second pass is cheap
  const strict: SearchHit[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    if (signal.cancelled) return strict
    const content = await (await doc.getPage(n)).getTextContent()
    // the text layer has one span per run that has a `str`, in the same order
    const runs = content.items.filter((it): it is typeof it & RunLike => 'str' in it) as RunLike[]
    const text = buildPageText(runs)
    pages.push(text)
    collect(text, n, false, strict)
  }
  if (strict.length) return strict

  // nothing found: retry ignoring whitespace entirely (text stored without spaces, etc.)
  const loose: SearchHit[] = []
  pages.forEach((p, i) => collect(p, i + 1, true, loose))
  return loose
}
