import { useEffect, useMemo, useRef, useState } from 'react'
import { useAnn, newId } from '../store/annotationStore'
import { NOTE_SIZE, bbox, translate, type Annotation, type Pt } from './types'
import { LINE_HEIGHT, TEXT_PAD, boxHeight, screenMeasure, wrapText } from './textWrap'

interface Props {
  pageNum: number
  scale: number
  width: number
  height: number
}

const DRAW_TOOLS = new Set(['ink', 'rect', 'ellipse', 'line', 'arrow'])

function arrowHead(a: { x1: number; y1: number; x2: number; y2: number; width: number }): string {
  const len = Math.max(10, a.width * 4)
  const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1)
  const p = (d: number): string =>
    `${a.x2 - len * Math.cos(ang + d)},${a.y2 - len * Math.sin(ang + d)}`
  return `M${p(-0.45)} L${a.x2},${a.y2} L${p(0.45)}`
}

function Shape({ a }: { a: Annotation }): React.JSX.Element {
  const common = {
    stroke: a.color,
    strokeWidth: a.width,
    strokeOpacity: a.opacity,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }
  switch (a.type) {
    case 'highlight':
      return (
        <g style={{ mixBlendMode: 'multiply' }}>
          {a.rects.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={a.color} fillOpacity={a.opacity} />
          ))}
        </g>
      )
    case 'underline':
      return (
        <g>
          {a.rects.map((r, i) => (
            <g key={i}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="transparent" />
              <line x1={r.x} y1={r.y + r.h} x2={r.x + r.w} y2={r.y + r.h} {...common} />
            </g>
          ))}
        </g>
      )
    case 'note':
      return (
        <g>
          <title>{a.text}</title>
          <rect x={a.x} y={a.y} width={NOTE_SIZE} height={NOTE_SIZE} fill="#ffd43b" stroke="#7a5500" />
          {[0.3, 0.5, 0.7].map((t) => (
            <line
              key={t}
              x1={a.x + NOTE_SIZE * 0.2}
              x2={a.x + NOTE_SIZE * 0.8}
              y1={a.y + NOTE_SIZE * t}
              y2={a.y + NOTE_SIZE * t}
              stroke="#7a5500"
            />
          ))}
        </g>
      )
    case 'freetext': {
      const lines = wrapText(a.text, a.w - TEXT_PAD * 2, screenMeasure(a.width))
      return (
        <g>
          <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="transparent" />
          {lines.map((line, i) => (
            <text
              key={i}
              x={a.x + TEXT_PAD}
              y={a.y + TEXT_PAD + i * a.width * LINE_HEIGHT}
              dominantBaseline="hanging"
              fontFamily="Helvetica, Arial, sans-serif"
              fontSize={a.width}
              fill={a.color}
              style={{ whiteSpace: 'pre' }}
            >
              {line}
            </text>
          ))}
        </g>
      )
    }
    case 'ink':
      return (
        <g>
          {a.paths.map((path, i) => (
            <path key={i} d={path.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} {...common} />
          ))}
        </g>
      )
    case 'rect':
      return <rect x={a.x} y={a.y} width={a.w} height={a.h} {...common} fill="transparent" />
    case 'ellipse':
      return (
        <ellipse
          cx={a.x + a.w / 2}
          cy={a.y + a.h / 2}
          rx={a.w / 2}
          ry={a.h / 2}
          {...common}
          fill="transparent"
        />
      )
    case 'line':
      return <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} {...common} />
    case 'arrow':
      return (
        <g>
          <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} {...common} />
          <path d={arrowHead(a)} {...common} />
        </g>
      )
    case 'stamp':
      return a.image ? (
        <image href={a.image} x={a.x} y={a.y} width={a.w} height={a.h} preserveAspectRatio="none" />
      ) : (
        <g>
          <rect
            x={a.x + a.width / 2}
            y={a.y + a.width / 2}
            width={a.w - a.width}
            height={a.h - a.width}
            {...common}
            fill="transparent"
          />
          <text
            x={a.x + a.w / 2}
            y={a.y + a.h / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight="bold"
            fontSize={Math.min(a.h * 0.5, (a.w - 12) / Math.max(1, (a.label ?? '').length * 0.72))}
            fill={a.color}
          >
            {a.label}
          </text>
        </g>
      )
  }
}

function useFocusSoon(ref: React.RefObject<HTMLTextAreaElement | null>): void {
  // The pointer-down that created the annotation still has a mouse-down default action
  // (moving focus) pending, so focusing synchronously would be undone.
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [ref])
}

function NoteEditor({ a, scale }: { a: Extract<Annotation, { type: 'note' }>; scale: number }): React.JSX.Element {
  const patch = useAnn((s) => s.patch)
  const remove = useAnn((s) => s.remove)
  const setEditing = useAnn((s) => s.setEditing)
  const [text, setText] = useState(a.text)
  const ref = useRef<HTMLTextAreaElement>(null)
  useFocusSoon(ref)

  const close = (): void => {
    if (!text.trim()) remove(a.id)
    else if (text !== a.text) {
      useAnn.getState().beginChange()
      patch(a.id, (x) => ({ ...x, text }) as Annotation)
    }
    setEditing(null)
  }

  return (
    <div className="noteEditor" style={{ left: (a.x + NOTE_SIZE + 4) * scale, top: a.y * scale }}>
      <textarea
        ref={ref}
        value={text}
        placeholder="Type your note…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey)) close()
          e.stopPropagation()
        }}
      />
      <div className="noteActions">
        <button onClick={close}>Done</button>
        <button onClick={() => remove(a.id)}>Delete</button>
      </div>
    </div>
  )
}

function FreetextEditor({
  a,
  scale
}: {
  a: Extract<Annotation, { type: 'freetext' }>
  scale: number
}): React.JSX.Element {
  const patch = useAnn((s) => s.patch)
  const remove = useAnn((s) => s.remove)
  const setEditing = useAnn((s) => s.setEditing)
  const [text, setText] = useState(a.text)
  const ref = useRef<HTMLTextAreaElement>(null)
  useFocusSoon(ref)

  const close = (): void => {
    if (!text.trim()) remove(a.id)
    else if (text !== a.text) {
      const lines = wrapText(text, a.w - TEXT_PAD * 2, screenMeasure(a.width)).length
      useAnn.getState().beginChange()
      patch(a.id, (x) => ({ ...x, text, h: boxHeight(lines, a.width) }) as Annotation)
    }
    setEditing(null)
  }

  return (
    <textarea
      ref={ref}
      className="ftEditor"
      value={text}
      placeholder="Type text…"
      style={{
        left: a.x * scale,
        top: a.y * scale,
        width: a.w * scale,
        minHeight: a.h * scale,
        fontSize: a.width * scale,
        lineHeight: LINE_HEIGHT,
        padding: TEXT_PAD * scale,
        color: a.color
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={close}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close()
        e.stopPropagation()
      }}
    />
  )
}

export function AnnotationLayer({ pageNum, scale, width, height }: Props): React.JSX.Element {
  const all = useAnn((s) => s.annotations)
  const tool = useAnn((s) => s.tool)
  const selectedId = useAnn((s) => s.selectedId)
  const editingId = useAnn((s) => s.editingId)
  const svgRef = useRef<SVGSVGElement>(null)
  const [draft, setDraft] = useState<Annotation | null>(null)
  const draftRef = useRef<Annotation | null>(null)
  const mine = useMemo(() => all.filter((a) => a.page === pageNum), [all, pageNum])
  const editing = mine.find((a) => a.id === editingId && (a.type === 'note' || a.type === 'freetext'))

  const toPage = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }
  const setBoth = (a: Annotation | null): void => {
    draftRef.current = a
    setDraft(a)
  }

  // Adobe-style: once something is placed, switch to Edit with it selected so its handles show.
  const editAfterCreate = (id: string): void => {
    const st = useAnn.getState()
    st.setTool('select')
    st.select(id)
  }

  const onCaptureDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    const s = useAnn.getState()
    const p = toPage(e)
    const base = { id: newId(), page: pageNum, color: s.color, opacity: s.opacity, width: s.width }

    if (s.tool === 'note') {
      const a: Annotation = { ...base, type: 'note', x: p.x, y: p.y, text: '', color: '#ffd43b', opacity: 1 }
      s.add(a)
      s.setEditing(a.id)
      return
    }
    if (s.tool === 'freetext') {
      const a: Annotation = {
        ...base,
        type: 'freetext',
        x: p.x,
        y: p.y,
        w: 200,
        h: boxHeight(1, base.width),
        text: ''
      }
      s.add(a)
      s.setEditing(a.id)
      return
    }
    if (s.tool === 'stamp') {
      const img = s.stampImage
      const w = img ? 150 : Math.max(120, s.stampLabel.length * 15 + 24)
      const h = img ? (150 * img.height) / img.width : 36
      const stamp: Annotation = {
        ...base,
        type: 'stamp',
        x: p.x - w / 2,
        y: p.y - h / 2,
        w,
        h,
        ...(img ? { image: img.dataUrl } : { label: s.stampLabel })
      }
      s.add(stamp)
      editAfterCreate(stamp.id)
      return
    }

    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    switch (s.tool) {
      case 'ink':
        setBoth({ ...base, type: 'ink', paths: [[p]] })
        break
      case 'rect':
      case 'ellipse':
        setBoth({ ...base, type: s.tool, x: p.x, y: p.y, w: 0, h: 0 })
        break
      case 'line':
      case 'arrow':
        setBoth({ ...base, type: s.tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y })
        break
    }
  }

  const onCaptureMove = (e: React.PointerEvent): void => {
    const d = draftRef.current
    if (!d) return
    const p = toPage(e)
    if (d.type === 'ink') {
      setBoth({ ...d, paths: [[...d.paths[0], p]] })
    } else if (d.type === 'rect' || d.type === 'ellipse') {
      // anchor stays at the pointer-down corner, stored in x/y with possibly negative w/h
      setBoth({ ...d, w: p.x - d.x, h: p.y - d.y })
    } else if (d.type === 'line' || d.type === 'arrow') {
      setBoth({ ...d, x2: p.x, y2: p.y })
    }
  }

  const onCaptureUp = (): void => {
    const d = draftRef.current
    setBoth(null)
    if (!d) return
    let done: Annotation | null = d
    if (d.type === 'ink') {
      if (d.paths[0].length < 2) done = null
    } else if (d.type === 'rect' || d.type === 'ellipse') {
      const x = Math.min(d.x, d.x + d.w)
      const y = Math.min(d.y, d.y + d.h)
      done = Math.abs(d.w) < 3 || Math.abs(d.h) < 3 ? null : { ...d, x, y, w: Math.abs(d.w), h: Math.abs(d.h) }
    } else if (d.type === 'line' || d.type === 'arrow') {
      if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 3) done = null
    }
    if (done) {
      useAnn.getState().add(done)
      if (done.type !== 'ink') editAfterCreate(done.id)
    }
  }

  const onShapeDown = (e: React.PointerEvent, a: Annotation): void => {
    if (e.button !== 0) return
    const s = useAnn.getState()
    if (a.type === 'note') {
      e.stopPropagation()
      s.select(a.id)
      s.setEditing(a.id)
      return
    }
    if (a.type === 'freetext' && s.tool !== 'select') {
      e.stopPropagation()
      s.select(a.id)
      return
    }
    if (s.tool !== 'select') return
    e.stopPropagation()
    s.select(a.id)
    const start = { x: e.clientX, y: e.clientY }
    const orig = a
    let began = false
    const move = (ev: PointerEvent): void => {
      const dx = (ev.clientX - start.x) / scale
      const dy = (ev.clientY - start.y) / scale
      if (!began) {
        if (Math.hypot(dx, dy) < 2 / scale) return
        began = true
        useAnn.getState().beginChange()
      }
      useAnn.getState().patch(orig.id, () => translate(orig, dx, dy))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  type RectAnn = Extract<Annotation, { w: number; h: number }>
  const startResize = (e: React.PointerEvent, a: RectAnn, corner: 'nw' | 'ne' | 'sw' | 'se'): void => {
    e.stopPropagation()
    e.preventDefault()
    // the opposite corner stays fixed
    const ax = corner.endsWith('w') ? a.x + a.w : a.x
    const ay = corner.startsWith('n') ? a.y + a.h : a.y
    const lock = a.type === 'stamp' && !!a.image
    const aspect = a.w / a.h
    let began = false
    const move = (ev: PointerEvent): void => {
      const p = toPage(ev)
      let w = Math.max(8, Math.abs(p.x - ax))
      let h = Math.max(8, Math.abs(p.y - ay))
      if (lock) h = w / aspect
      else if (a.type === 'freetext') h = a.h // height follows the wrapped text
      const x = p.x >= ax ? ax : ax - w
      const y = p.y >= ay ? ay : ay - h
      if (!began) {
        began = true
        useAnn.getState().beginChange()
      }
      useAnn.getState().patch(a.id, (cur) => ({ ...cur, x, y, w, h }) as Annotation)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startEndpoint = (e: React.PointerEvent, a: Extract<Annotation, { x1: number }>, end: 1 | 2): void => {
    e.stopPropagation()
    e.preventDefault()
    let began = false
    const move = (ev: PointerEvent): void => {
      const p = toPage(ev)
      if (!began) {
        began = true
        useAnn.getState().beginChange()
      }
      useAnn.getState().patch(a.id, (cur) =>
        (end === 1 ? { ...cur, x1: p.x, y1: p.y } : { ...cur, x2: p.x, y2: p.y }) as Annotation
      )
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const capture = DRAW_TOOLS.has(tool) || tool === 'note' || tool === 'stamp' || tool === 'freetext'
  const sel = mine.find((a) => a.id === selectedId)
  const sb = sel ? bbox(sel) : null

  return (
    <>
      <svg
        ref={svgRef}
        className={`annLayer${capture ? ' capture' : ''}${tool === 'select' ? ' selectable' : ''}`}
        width={width * scale}
        height={height * scale}
        viewBox={`0 0 ${width} ${height}`}
      >
        {mine.map((a) => (
          <g
            key={a.id}
            className={`annShape${a.type === 'note' || a.type === 'freetext' ? ' always' : ''}`}
            onPointerDown={(e) => onShapeDown(e, a)}
            onDoubleClick={() => a.type === 'freetext' && useAnn.getState().setEditing(a.id)}
          >
            <Shape a={a} />
          </g>
        ))}
        {draft && <Shape a={draft.type === 'rect' || draft.type === 'ellipse' ? normalize(draft) : draft} />}
        {sb && (
          <rect
            x={sb.x - 3}
            y={sb.y - 3}
            width={sb.w + 6}
            height={sb.h + 6}
            fill="none"
            stroke="#1c7ed6"
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}
        {sel && tool === 'select' && 'w' in sel && 'h' in sel &&
          (['nw', 'ne', 'sw', 'se'] as const).map((c) => (
            <rect
              key={c}
              className="annHandle"
              x={(c.endsWith('w') ? sel.x : sel.x + sel.w) - 4}
              y={(c.startsWith('n') ? sel.y : sel.y + sel.h) - 4}
              width={8}
              height={8}
              fill="#fff"
              stroke="#1c7ed6"
              strokeWidth={1.5}
              style={{ cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize', pointerEvents: 'auto', touchAction: 'none' }}
              onPointerDown={(e) => startResize(e, sel as RectAnn, c)}
            />
          ))}
        {sel && tool === 'select' && 'x1' in sel &&
          ([1, 2] as const).map((end) => (
            <rect
              key={end}
              className="annHandle"
              x={(end === 1 ? sel.x1 : sel.x2) - 4}
              y={(end === 1 ? sel.y1 : sel.y2) - 4}
              width={8}
              height={8}
              fill="#fff"
              stroke="#1c7ed6"
              strokeWidth={1.5}
              style={{ cursor: 'crosshair', pointerEvents: 'auto', touchAction: 'none' }}
              onPointerDown={(e) => startEndpoint(e, sel, end)}
            />
          ))}
        {capture && (
          <rect
            width={width}
            height={height}
            fill="transparent"
            style={{ cursor: tool === 'note' || tool === 'stamp' || tool === 'freetext' ? 'copy' : 'crosshair', touchAction: 'none' }}
            onPointerDown={onCaptureDown}
            onPointerMove={onCaptureMove}
            onPointerUp={onCaptureUp}
          />
        )}
      </svg>
      {editing && editing.type === 'note' && <NoteEditor key={editing.id} a={editing} scale={scale} />}
      {editing && editing.type === 'freetext' && <FreetextEditor key={editing.id} a={editing} scale={scale} />}
      {sel && sb && !editing && (
        <div
          className="annActions"
          style={{
            left: Math.max(0, sb.x * scale),
            top: sb.y * scale > 36 ? sb.y * scale - 34 : (sb.y + sb.h) * scale + 8
          }}
        >
          {(sel.type === 'note' || sel.type === 'freetext') && (
            <button onClick={() => useAnn.getState().setEditing(sel.id)}>Edit text</button>
          )}
          <button className="danger" onClick={() => useAnn.getState().remove(sel.id)}>
            Delete
          </button>
        </div>
      )}
    </>
  )
}

function normalize(d: Annotation): Annotation {
  if (d.type !== 'rect' && d.type !== 'ellipse') return d
  return {
    ...d,
    x: Math.min(d.x, d.x + d.w),
    y: Math.min(d.y, d.y + d.h),
    w: Math.abs(d.w),
    h: Math.abs(d.h)
  }
}
