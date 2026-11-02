export const LINE_HEIGHT = 1.2
export const TEXT_PAD = 3

/** Greedy word wrap; `measure` returns the width of a string in the target font. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (!line || measure(next) <= maxWidth) line = next
      else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}

let ctx: CanvasRenderingContext2D | null = null
/** Browser-side measurer (Helvetica ≈ Arial metrics, matching the PDF output). */
export function screenMeasure(fontSize: number): (s: string) => number {
  ctx ??= document.createElement('canvas').getContext('2d')!
  ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`
  const c = ctx
  return (s) => c.measureText(s).width
}

export function boxHeight(lines: number, fontSize: number): number {
  return lines * fontSize * LINE_HEIGHT + TEXT_PAD * 2
}
