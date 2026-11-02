import { describe, expect, it } from 'vitest'
import { buildPageText, findInPage, normalizeQuery, segmentsFor, type RunLike } from './pdfSearch'

let y = 700
/** Build a run at a given x on the current baseline. */
const run = (str: string, x: number, opts: Partial<RunLike> & { line?: number } = {}): RunLike => ({
  str,
  transform: [1, 0, 0, 1, x, opts.line ?? y],
  width: opts.width ?? str.length * 6,
  height: 10,
  hasEOL: opts.hasEOL ?? false
})

const page = (runs: RunLike[]) => buildPageText(runs)
const find = (runs: RunLike[], q: string, loose = false) => {
  const p = page(runs)
  return findInPage(p, q, loose).map(([a, b]) => p.text.slice(a, b))
}

describe('search', () => {
  it('finds a phrase split across several text runs', () => {
    const runs = [run('The quick', 10), run('brown fox', 70), run('jumps', 130)]
    expect(find(runs, 'quick brown')).toHaveLength(1)
    expect(find(runs, 'brown fox jumps')).toHaveLength(1)
  })

  it('inserts a space where runs are visually separated, not where they touch', () => {
    // "Hel" + "lo" are adjacent (one word); "world" has a gap
    const runs = [run('Hel', 10), run('lo', 28), run('world', 60)]
    expect(page(runs).text).toBe('Hello world')
    expect(find(runs, 'hello')).toHaveLength(1)
    expect(find(runs, 'lo wor')).toHaveLength(1)
  })

  it('joins a phrase that wraps onto the next line', () => {
    const runs = [run('first line ends with the', 10, { hasEOL: true }), run('brown fox', 10, { line: 685 })]
    expect(find(runs, 'the brown fox')).toHaveLength(1)
  })

  it('finds a word that was hyphenated at a line end', () => {
    const runs = [run('an exam-', 10, { hasEOL: true }), run('ple of splitting', 10, { line: 685 })]
    expect(find(runs, 'example')).toHaveLength(1)
    expect(find(runs, 'an example of')).toHaveLength(1)
  })

  it('ignores case, accents, ligatures, curly quotes and dash styles', () => {
    const runs = [run('Café ﬁne “quoted” – it’s', 10)]
    expect(find(runs, 'CAFE')).toHaveLength(1)
    expect(find(runs, 'fine')).toHaveLength(1)
    expect(find(runs, '"quoted"')).toHaveLength(1)
    expect(find(runs, "it's")).toHaveLength(1)
    expect(find(runs, '- it')).toHaveLength(1)
  })

  it('is whitespace-tolerant in the query', () => {
    const runs = [run('quick   brown fox', 10)]
    expect(find(runs, '  quick brown   fox ')).toHaveLength(1)
  })

  it('finds every occurrence and reports text per match', () => {
    const runs = [run('cat concatenate CAT', 10)]
    expect(find(runs, 'cat')).toEqual(['cat', 'cat', 'CAT'])
  })

  it('loose mode matches across missing/extra spaces', () => {
    const runs = [run('foo bar baz', 10)]
    expect(find(runs, 'foobar')).toHaveLength(0)
    expect(find(runs, 'foobar', true)).toHaveLength(1)
  })

  it('returns no matches for empty or unmatched queries', () => {
    const runs = [run('hello', 10)]
    expect(find(runs, '')).toHaveLength(0)
    expect(find(runs, '   ')).toHaveLength(0)
    expect(find(runs, 'goodbye')).toHaveLength(0)
    expect(normalizeQuery('  Á  ')).toBe('a')
  })

  it('maps a match back onto the runs it covers', () => {
    const runs = [run('The quick', 10), run('brown fox', 70)]
    const p = page(runs)
    const [[s, e]] = findInPage(p, 'quick brown')
    expect(segmentsFor(p, s, e)).toEqual([
      { item: 0, from: 4, to: 9 },
      { item: 1, from: 0, to: 5 }
    ])
  })

  it('does not report a hyphen-only fragment when a word is split by a soft hyphen', () => {
    const runs = [run('exam-', 10, { hasEOL: true }), run('ple', 10, { line: 685 })]
    const p = page(runs)
    const [[s, e]] = findInPage(p, 'example')
    const segs = segmentsFor(p, s, e)
    expect(segs.map((g) => g.item)).toEqual([0, 1])
  })
})
