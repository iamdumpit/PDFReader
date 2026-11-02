import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, type PDFObject } from 'pdf-lib'
import { compressStructure } from './pdfSecurity'

export type CompressLevel = 'low' | 'medium' | 'high'

export const LEVELS: Record<CompressLevel, { label: string; hint: string; maxDim: number; quality: number }> = {
  low: { label: 'Light', hint: 'Best quality. Re-compresses photos gently.', maxDim: 3000, quality: 0.85 },
  medium: { label: 'Balanced', hint: 'Good for screens and email.', maxDim: 1800, quality: 0.7 },
  high: { label: 'Smallest', hint: 'Strongest. Photos get visibly softer.', maxDim: 1200, quality: 0.5 }
}

export interface CompressResult {
  bytes: Uint8Array
  imagesShrunk: number
}

const name = (s: string): PDFName => PDFName.of(s)

function filterIs(obj: PDFObject | undefined, f: string): boolean {
  if (obj instanceof PDFName) return obj.toString() === `/${f}`
  if (obj instanceof PDFArray) return obj.size() === 1 && obj.get(0)?.toString() === `/${f}`
  return false
}

function simpleColorSpace(dict: PDFDict): boolean {
  const cs = dict.lookup(name('ColorSpace'))
  if (cs instanceof PDFName) return cs.toString() === '/DeviceRGB' || cs.toString() === '/DeviceGray'
  if (cs instanceof PDFArray && cs.get(0)?.toString() === '/ICCBased') {
    const prof = cs.lookup(1)
    const n = prof instanceof PDFRawStream ? prof.dict.lookup(name('N')) : undefined
    return n instanceof PDFNumber && (n.asNumber() === 3 || n.asNumber() === 1)
  }
  return false
}

async function reencode(jpeg: Uint8Array, maxDim: number, quality: number, w: number, h: number) {
  const bmp = await createImageBitmap(new Blob([jpeg as BlobPart], { type: 'image/jpeg' }))
  const k = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
  const nw = Math.max(1, Math.round(bmp.width * k))
  const nh = Math.max(1, Math.round(bmp.height * k))
  const canvas = document.createElement('canvas')
  canvas.width = nw
  canvas.height = nh
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, nw, nh)
  ctx.drawImage(bmp, 0, 0, nw, nh)
  bmp.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
  if (!blob) return null
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: nw, h: nh, srcW: w, srcH: h }
}

/** Downscale and re-encode embedded JPEG photos (the usual cause of huge PDFs). */
export async function shrinkImages(
  source: Uint8Array,
  maxDim: number,
  quality: number
): Promise<{ bytes: Uint8Array; shrunk: number }> {
  const doc = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false })
  const ctx = doc.context
  let shrunk = 0

  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const d = obj.dict
    if (d.lookup(name('Subtype'))?.toString() !== '/Image') continue
    if (!filterIs(d.lookup(name('Filter')), 'DCTDecode')) continue
    if (d.has(name('Decode')) || d.has(name('Mask')) || d.has(name('ImageMask')) || !simpleColorSpace(d)) continue
    const w = d.lookup(name('Width'))
    const h = d.lookup(name('Height'))
    if (!(w instanceof PDFNumber) || !(h instanceof PDFNumber)) continue

    const original = obj.getContents()
    let enc: Awaited<ReturnType<typeof reencode>> = null
    try {
      enc = await reencode(original, maxDim, quality, w.asNumber(), h.asNumber())
    } catch {
      continue // undecodable image: leave as is
    }
    if (!enc || enc.bytes.length >= original.length * 0.95) continue

    d.set(name('Width'), PDFNumber.of(enc.w))
    d.set(name('Height'), PDFNumber.of(enc.h))
    d.set(name('ColorSpace'), name('DeviceRGB'))
    d.set(name('BitsPerComponent'), PDFNumber.of(8))
    d.set(name('Filter'), name('DCTDecode'))
    d.delete(name('DecodeParms'))
    d.set(name('Length'), PDFNumber.of(enc.bytes.length))
    ctx.assign(ref, PDFRawStream.of(d, enc.bytes))
    shrunk++
  }
  return { bytes: shrunk ? await doc.save() : source, shrunk }
}

/** Image downsampling (when a canvas is available) followed by structural compression. */
export async function compressPdf(source: Uint8Array, level: CompressLevel): Promise<CompressResult> {
  const { maxDim, quality } = LEVELS[level]
  let bytes = source
  let imagesShrunk = 0
  if (typeof document !== 'undefined') {
    const r = await shrinkImages(source, maxDim, quality)
    bytes = r.bytes
    imagesShrunk = r.shrunk
  }
  const packed = await compressStructure(bytes)
  return { bytes: packed.length < bytes.length ? packed : bytes, imagesShrunk }
}
