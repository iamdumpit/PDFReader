export interface Signature {
  id: string
  dataUrl: string
  width: number
  height: number
}

const KEY = 'signatures'
const MAX_WIDTH = 600

export function loadSignatures(): Signature[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Signature[]
  } catch {
    return []
  }
}

export function saveSignatures(list: Signature[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage full or unavailable */
  }
}

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = url
  })
}

/**
 * Turn a photo/scan of a signature into a PNG: optionally knock out the paper background
 * (so only the ink shows), trim empty margins and cap the size.
 */
export async function importSignature(file: File, removeBackground: boolean): Promise<Signature> {
  const img = await readImage(file)
  const k = Math.min(1, MAX_WIDTH / img.naturalWidth)
  const w = Math.max(1, Math.round(img.naturalWidth * k))
  const h = Math.max(1, Math.round(img.naturalHeight * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)

  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (removeBackground) {
        // ink is whatever is noticeably darker than white paper
        const darkest = Math.min(px[i], px[i + 1], px[i + 2])
        const a = Math.max(0, Math.min(1, (235 - darkest) / 110))
        px[i + 3] = Math.round(px[i + 3] * a)
      }
      if (px[i + 3] > 12) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('No signature found in that image')
  ctx.putImageData(data, 0, 0)

  const pad = 4
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(w - 1, maxX + pad)
  maxY = Math.min(h - 1, maxY + pad)
  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  const out = document.createElement('canvas')
  out.width = cw
  out.height = ch
  out.getContext('2d')!.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch)

  return {
    id: `sig${Date.now().toString(36)}`,
    dataUrl: out.toDataURL('image/png'),
    width: cw,
    height: ch
  }
}

/** Trim transparent margins from a drawn canvas and return it as a signature, or null if blank. */
export function canvasToSignature(canvas: HTMLCanvasElement): Signature | null {
  const w = canvas.width
  const h = canvas.height
  const px = canvas.getContext('2d')!.getImageData(0, 0, w, h).data
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 12) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const pad = 6
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(w - 1, maxX + pad)
  maxY = Math.min(h - 1, maxY + pad)
  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  const out = document.createElement('canvas')
  out.width = cw
  out.height = ch
  out.getContext('2d')!.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch)
  return { id: `sig${Date.now().toString(36)}`, dataUrl: out.toDataURL('image/png'), width: cw, height: ch }
}
