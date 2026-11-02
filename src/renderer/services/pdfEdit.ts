import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  StandardFonts,
  type PDFContext,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type PDFRef
} from 'pdf-lib'
import { LINE_HEIGHT, TEXT_PAD, wrapText } from '../annotate/textWrap'
import { NOTE_SIZE, type Annotation, type Pt } from '../annotate/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LiteralObject = { [key: string]: any }
type Xf = (x: number, y: number) => Pt

/** Maps displayed (top-left origin, scale 1) coordinates to PDF user space for this page. */
function makeTransform(page: PDFPage): Xf {
  const { x, y, width, height } = page.getCropBox()
  const x0 = x
  const y0 = y
  const x1 = x + width
  const y1 = y + height
  const rot = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270
  switch (rot) {
    case 90:
      return (vx, vy) => ({ x: x0 + vy, y: y0 + vx })
    case 180:
      return (vx, vy) => ({ x: x1 - vx, y: y0 + vy })
    case 270:
      return (vx, vy) => ({ x: x1 - vy, y: y1 - vx })
    default:
      return (vx, vy) => ({ x: x0 + vx, y: y1 - vy })
  }
}

const n = (v: number): string => String(Math.round(v * 1000) / 1000)

function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

function boundsOf(pts: Pt[], pad = 0): [number, number, number, number] {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad]
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const k = 0.5522847498
  return [
    `${n(cx + rx)} ${n(cy)} m`,
    `${n(cx + rx)} ${n(cy + k * ry)} ${n(cx + k * rx)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)} c`,
    `${n(cx - k * rx)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + k * ry)} ${n(cx - rx)} ${n(cy)} c`,
    `${n(cx - rx)} ${n(cy - k * ry)} ${n(cx - k * rx)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)} c`,
    `${n(cx + k * rx)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy - k * ry)} ${n(cx + rx)} ${n(cy)} c`,
    'h'
  ].join('\n')
}

interface Built {
  subtype: string
  rect: [number, number, number, number]
  content: string
  resources?: LiteralObject
  extra?: LiteralObject
  flags?: number
}

function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; png: boolean } {
  const [head, b64] = dataUrl.split(',')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, png: /image\/png/.test(head) }
}

export async function embedAnnotations(
  source: Uint8Array,
  annotations: Annotation[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false })
  const ctx = doc.context
  const pages = doc.getPages()
  let bold: PDFFont | undefined
  let regular: PDFFont | undefined
  const images = new Map<string, PDFImage>()

  const build = async (a: Annotation, xf: Xf): Promise<Built> => {
    const [r, g, b] = rgb(a.color)
    const stroke = `${n(r)} ${n(g)} ${n(b)} RG ${n(a.width)} w 1 J 1 j`
    const fill = `${n(r)} ${n(g)} ${n(b)} rg`

    switch (a.type) {
      case 'highlight':
      case 'underline': {
        const all: Pt[] = []
        const quads: number[] = []
        let content = a.type === 'highlight' ? `/GS gs ${fill}\n` : `${stroke}\n`
        for (const q of a.rects) {
          const tl = xf(q.x, q.y)
          const tr = xf(q.x + q.w, q.y)
          const bl = xf(q.x, q.y + q.h)
          const br = xf(q.x + q.w, q.y + q.h)
          all.push(tl, tr, bl, br)
          quads.push(tl.x, tl.y, tr.x, tr.y, bl.x, bl.y, br.x, br.y)
          content +=
            a.type === 'highlight'
              ? `${n(tl.x)} ${n(tl.y)} m ${n(tr.x)} ${n(tr.y)} l ${n(br.x)} ${n(br.y)} l ${n(bl.x)} ${n(bl.y)} l h f\n`
              : `${n(bl.x)} ${n(bl.y)} m ${n(br.x)} ${n(br.y)} l S\n`
        }
        return {
          subtype: a.type === 'highlight' ? 'Highlight' : 'Underline',
          rect: boundsOf(all, a.type === 'underline' ? a.width : 0),
          content,
          resources: {
            ExtGState: {
              GS: { Type: 'ExtGState', ca: a.opacity, CA: a.opacity, BM: a.type === 'highlight' ? 'Multiply' : 'Normal' }
            }
          },
          extra: { QuadPoints: quads }
        }
      }

      case 'note': {
        const p1 = xf(a.x, a.y)
        const p2 = xf(a.x + NOTE_SIZE, a.y + NOTE_SIZE)
        const [x0, y0, x1, y1] = boundsOf([p1, p2])
        const content = [
          '1 0.831 0.231 rg 0.45 0.33 0 RG 1 w',
          `${n(x0 + 0.5)} ${n(y0 + 0.5)} ${n(x1 - x0 - 1)} ${n(y1 - y0 - 1)} re B`,
          '0.45 0.33 0 RG 1 w',
          ...[0.3, 0.5, 0.7].map(
            (t) => `${n(x0 + (x1 - x0) * 0.2)} ${n(y0 + (y1 - y0) * t)} m ${n(x0 + (x1 - x0) * 0.8)} ${n(y0 + (y1 - y0) * t)} l S`
          )
        ].join('\n')
        return {
          subtype: 'Text',
          rect: [x0, y0, x1, y1],
          content,
          extra: { Name: 'Note', Contents: PDFHexString.fromText(a.text) },
          flags: 4 | 8 | 16
        }
      }

      case 'freetext': {
        const p1 = xf(a.x, a.y)
        const p2 = xf(a.x + a.w, a.y + a.h)
        const [x0, y0, x1, y1] = boundsOf([p1, p2])
        regular ??= await doc.embedFont(StandardFonts.Helvetica)
        const font = regular
        const size = a.width
        const safe = a.text.replace(/[^\x20-\x7e\n]/g, '?')
        const lines = wrapText(safe, a.w - TEXT_PAD * 2, (t) => font.widthOfTextAtSize(t, size))
        const body = lines
          .map((line, i) => {
            const base = y1 - TEXT_PAD - size * 0.85 - i * size * LINE_HEIGHT
            const esc = line.replace(/([\\()])/g, '\\$1')
            return `BT /F1 ${n(size)} Tf ${n(x0 + TEXT_PAD)} ${n(base)} Td (${esc}) Tj ET`
          })
          .join('\n')
        const [r, g, b] = rgb(a.color)
        return {
          subtype: 'FreeText',
          rect: [x0, y0, x1, y1],
          content: `${n(r)} ${n(g)} ${n(b)} rg\n${body}`,
          resources: { Font: { F1: font.ref } },
          extra: {
            Contents: PDFHexString.fromText(a.text),
            DA: PDFString.of(`/Helv ${n(size)} Tf ${n(r)} ${n(g)} ${n(b)} rg`)
          }
        }
      }

      case 'ink': {
        const paths = a.paths.map((path) => path.map((p) => xf(p.x, p.y)))
        const content =
          `${stroke}\n` +
          paths
            .map((path) => path.map((p, i) => `${n(p.x)} ${n(p.y)} ${i ? 'l' : 'm'}`).join('\n') + '\nS')
            .join('\n')
        return {
          subtype: 'Ink',
          rect: boundsOf(paths.flat(), a.width),
          content,
          extra: { InkList: paths.map((path) => path.flatMap((p) => [p.x, p.y])) }
        }
      }

      case 'rect':
      case 'ellipse': {
        const p1 = xf(a.x, a.y)
        const p2 = xf(a.x + a.w, a.y + a.h)
        const [x0, y0, x1, y1] = boundsOf([p1, p2])
        const content =
          a.type === 'rect'
            ? `${stroke}\n${n(x0)} ${n(y0)} ${n(x1 - x0)} ${n(y1 - y0)} re S`
            : `${stroke}\n${ellipsePath((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2)}\nS`
        const pad = a.width / 2
        return {
          subtype: a.type === 'rect' ? 'Square' : 'Circle',
          rect: [x0 - pad, y0 - pad, x1 + pad, y1 + pad],
          content,
          extra: { BS: { W: a.width }, RD: [pad, pad, pad, pad] }
        }
      }

      case 'line':
      case 'arrow': {
        const p1 = xf(a.x1, a.y1)
        const p2 = xf(a.x2, a.y2)
        let content = `${stroke}\n${n(p1.x)} ${n(p1.y)} m ${n(p2.x)} ${n(p2.y)} l S`
        const pts = [p1, p2]
        if (a.type === 'arrow') {
          const len = Math.max(10, a.width * 4)
          const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x)
          const h1 = { x: p2.x - len * Math.cos(ang - 0.45), y: p2.y - len * Math.sin(ang - 0.45) }
          const h2 = { x: p2.x - len * Math.cos(ang + 0.45), y: p2.y - len * Math.sin(ang + 0.45) }
          content += `\n${n(h1.x)} ${n(h1.y)} m ${n(p2.x)} ${n(p2.y)} l ${n(h2.x)} ${n(h2.y)} l S`
          pts.push(h1, h2)
        }
        return {
          subtype: 'Line',
          rect: boundsOf(pts, a.width),
          content,
          extra: {
            L: [p1.x, p1.y, p2.x, p2.y],
            LE: ['None', a.type === 'arrow' ? 'OpenArrow' : 'None'],
            BS: { W: a.width }
          }
        }
      }

      case 'stamp': {
        const p1 = xf(a.x, a.y)
        const p2 = xf(a.x + a.w, a.y + a.h)
        const [x0, y0, x1, y1] = boundsOf([p1, p2])
        const w = x1 - x0
        const h = y1 - y0
        if (a.image) {
          let img = images.get(a.image)
          if (!img) {
            const { bytes, png } = dataUrlBytes(a.image)
            img = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
            images.set(a.image, img)
          }
          return {
            subtype: 'Stamp',
            rect: [x0, y0, x1, y1],
            content: `q ${n(w)} 0 0 ${n(h)} ${n(x0)} ${n(y0)} cm /Im Do Q`,
            resources: { XObject: { Im: img.ref } },
            extra: { Name: 'Image' }
          }
        }
        bold ??= await doc.embedFont(StandardFonts.HelveticaBold)
        const label = (a.label ?? '').replace(/[^\x20-\x7e]/g, '?')
        const size = Math.min(h * 0.5, ((w - 12) / Math.max(1, bold.widthOfTextAtSize(label, 1))) || h)
        const tw = bold.widthOfTextAtSize(label, size)
        const esc = label.replace(/([\\()])/g, '\\$1')
        const content = [
          `${stroke}`,
          `${n(x0 + a.width / 2)} ${n(y0 + a.width / 2)} ${n(w - a.width)} ${n(h - a.width)} re S`,
          `BT ${fill} /F1 ${n(size)} Tf ${n(x0 + (w - tw) / 2)} ${n(y0 + (h - size * 0.72) / 2)} Td (${esc}) Tj ET`
        ].join('\n')
        return {
          subtype: 'Stamp',
          rect: [x0, y0, x1, y1],
          content,
          resources: { Font: { F1: bold.ref } },
          extra: { Name: 'Draft', Contents: PDFHexString.fromText(label) }
        }
      }
    }
  }

  const register = (ctx2: PDFContext, a: Annotation, built: Built): PDFRef => {
    const [x0, y0, x1, y1] = built.rect
    const ap = ctx2.register(
      ctx2.stream(built.content, {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [x0, y0, x1, y1],
        Resources: ctx2.obj(built.resources ?? {})
      })
    )
    const dict = ctx2.obj({
      Type: 'Annot',
      Subtype: built.subtype,
      Rect: [x0, y0, x1, y1],
      F: built.flags ?? 4,
      C: rgb(a.color),
      CA: a.opacity,
      T: PDFHexString.fromText('PDF Reader'),
      AP: { N: ap },
      ...built.extra
    })
    if (built.subtype === 'FreeText') dict.delete(PDFName.of('C')) // C is the *background* colour for FreeText
    return ctx2.register(dict)
  }

  for (const a of annotations) {
    const page = pages[a.page - 1]
    if (!page) continue
    const built = await build(a, makeTransform(page))
    page.node.addAnnot(register(ctx, a, built))
  }

  return doc.save()
}
