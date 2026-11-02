import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '../organize/Modal'
import { canvasToSignature, type Signature } from '../services/signatures'

interface Pt {
  x: number
  y: number
  /** 0..1 pen pressure; 0.5 for devices that don't report it */
  p: number
}

interface Stroke {
  pts: Pt[]
  color: string
  size: number
  pressure: boolean
}

const INKS = ['#111827', '#1d3b8b', '#0b5cad', '#7a1f1f']
const PAD_W = 560
const PAD_H = 220

/** Paint one stroke: smooth curves through midpoints, width following pen pressure when present. */
function paint(ctx: CanvasRenderingContext2D, s: Stroke): void {
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const widthAt = (p: Pt): number => (s.pressure ? s.size * (0.35 + p.p * 1.3) : s.size)
  const pts = s.pts
  if (pts.length === 1) {
    ctx.beginPath()
    ctx.arc(pts[0].x, pts[0].y, widthAt(pts[0]) / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  let prev = pts[0]
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i]
    const mid = { x: (prev.x + cur.x) / 2, y: (prev.y + cur.y) / 2 }
    const before = i === 1 ? prev : { x: (pts[i - 2].x + prev.x) / 2, y: (pts[i - 2].y + prev.y) / 2 }
    ctx.lineWidth = widthAt(cur)
    ctx.beginPath()
    ctx.moveTo(before.x, before.y)
    ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y)
    ctx.stroke()
    prev = cur
  }
  const last = pts[pts.length - 1]
  ctx.lineWidth = widthAt(last)
  ctx.beginPath()
  ctx.moveTo((pts[pts.length - 2].x + prev.x) / 2, (pts[pts.length - 2].y + prev.y) / 2)
  ctx.lineTo(last.x, last.y)
  ctx.stroke()
}

interface Props {
  onSave: (sig: Signature) => void
  onClose: () => void
}

export function SignaturePad({ onSave, onClose }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const current = useRef<Stroke | null>(null)
  const [color, setColor] = useState(INKS[0])
  const [size, setSize] = useState(3)
  const [count, setCount] = useState(0)
  const [hint, setHint] = useState<string | null>(null)
  const scale = 2 // backing-store resolution: crisp when the signature is enlarged

  const redraw = useCallback((): void => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    for (const s of strokes.current) paint(ctx, s)
    if (current.current) paint(ctx, current.current)
  }, [])

  useEffect(redraw, [redraw])

  const pos = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * PAD_W,
      y: ((e.clientY - r.top) / r.height) * PAD_H,
      p: e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5
    }
  }

  const down = (e: React.PointerEvent): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pointer already gone (e.g. synthetic events); drawing still works while over the pad */
    }
    setHint(null)
    current.current = { pts: [pos(e)], color, size, pressure: e.pointerType === 'pen' }
    redraw()
  }

  const move = (e: React.PointerEvent): void => {
    const s = current.current
    if (!s) return
    // coalesced events give the full path of a fast stroke
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? []
    const list = evs.length ? evs : [e.nativeEvent as PointerEvent]
    const r = canvasRef.current!.getBoundingClientRect()
    for (const ev of list) {
      s.pts.push({
        x: ((ev.clientX - r.left) / r.width) * PAD_W,
        y: ((ev.clientY - r.top) / r.height) * PAD_H,
        p: ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5
      })
    }
    redraw()
  }

  const up = (): void => {
    const s = current.current
    if (!s) return
    strokes.current.push(s)
    current.current = null
    setCount(strokes.current.length)
    redraw()
  }

  const undo = (): void => {
    strokes.current.pop()
    setCount(strokes.current.length)
    redraw()
  }

  const clear = (): void => {
    strokes.current = []
    setCount(0)
    redraw()
  }

  const save = (): void => {
    const sig = canvasToSignature(canvasRef.current!)
    if (!sig) return setHint('Draw your signature first.')
    onSave(sig)
  }

  // Ctrl+Z inside the pad undoes the last stroke
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.stopPropagation()
        undo()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <Modal title="Draw your signature" onClose={onClose}>
      <p className="muted">Sign below with your mouse, finger or pen.</p>
      <div className="padWrap">
        <canvas
          ref={canvasRef}
          className="sigCanvas"
          width={PAD_W * scale}
          height={PAD_H * scale}
          style={{ width: PAD_W, height: PAD_H }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        <div className="padLine" />
        {count === 0 && !current.current && <span className="padHint">Sign here</span>}
      </div>
      <div className="padTools">
        <span className="muted">Ink</span>
        {INKS.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c, outline: color === c ? '2px solid var(--accent)' : 'none' }}
            onClick={() => setColor(c)}
            title={c}
          />
        ))}
        <span className="muted">Thickness</span>
        <input type="range" min={1.5} max={8} step={0.5} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        <span className="grow" />
        <button disabled={!count} onClick={undo} title="Undo last stroke (Ctrl+Z)">
          ↶ Undo
        </button>
        <button disabled={!count} onClick={clear}>
          Clear
        </button>
      </div>
      {hint && <p className="err">{hint}</p>}
      <div className="modalActions">
        <span className="grow" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={save}>
          Save signature
        </button>
      </div>
    </Modal>
  )
}
