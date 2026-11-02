import { useEffect, useRef, useState } from 'react'
import { useAnn } from '../store/annotationStore'
import { useDoc } from '../store/documentStore'
import { useForms } from '../store/formStore'
import { SignatureMenu } from './SignatureMenu'
import type { Tool } from './types'

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'text', label: 'Select', title: 'Select text. Click a highlight or underline to select it.' },
  { id: 'select', label: 'Move/Resize', title: 'Click a shape, stamp, signature or note to select it. Drag to move, drag the corner squares to resize, press Delete to remove.' },
  { id: 'highlight', label: 'Highlight', title: 'Highlight selected text' },
  { id: 'underline', label: 'Underline', title: 'Underline selected text' },
  { id: 'note', label: 'Note', title: 'Click to add a sticky note' },
  { id: 'freetext', label: 'Text', title: 'Click to add a text box' },
  { id: 'ink', label: 'Draw', title: 'Freehand drawing' },
  { id: 'rect', label: 'Rect', title: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse', title: 'Ellipse' },
  { id: 'line', label: 'Line', title: 'Line' },
  { id: 'arrow', label: 'Arrow', title: 'Arrow' }
]

const HINTS: Record<Tool, string> = {
  text: 'Select text, or click a highlight to select/delete it.',
  select: 'Click an item to select it · drag to move · drag corner squares to resize · Delete key removes it.',
  highlight: 'Select text to highlight it.',
  underline: 'Select text to underline it.',
  note: 'Click the page to add a note.',
  freetext: 'Click the page and type.',
  ink: 'Draw freehand on the page.',
  rect: 'Drag on the page to draw a rectangle.',
  ellipse: 'Drag on the page to draw an ellipse.',
  line: 'Drag on the page to draw a line.',
  arrow: 'Drag on the page to draw an arrow.',
  stamp: 'Click the page to place it.'
}

const PALETTE = ['#ffd43b', '#e03131', '#f76707', '#2f9e44', '#1c7ed6', '#7048e8', '#212529']
const STAMPS = ['APPROVED', 'REJECTED', 'DRAFT', 'CONFIDENTIAL', 'REVIEWED', 'FINAL']

export function AnnotationBar(): React.JSX.Element {
  const a = useAnn()
  const count = useAnn((s) => s.annotations.length)
  const save = useDoc((s) => s.save)
  const fileRef = useRef<HTMLInputElement>(null)
  const doc = useDoc((s) => s.doc)
  const flatten = useForms((s) => s.flatten)
  const setFlatten = useForms((s) => s.setFlatten)
  const formEdits = useForms((s) => (s.rev, doc?.annotationStorage.size ?? 0))
  const [hasForm, setHasForm] = useState(false)

  useEffect(() => {
    let live = true
    setHasForm(false)
    void doc?.getFieldObjects().then((f) => live && setHasForm(!!f && f.size > 0))
    return () => {
      live = false
    }
  }, [doc])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
      const s = useAnn.getState()
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void useDoc.getState().save(e.shiftKey)
      } else if (e.ctrlKey && !typing && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        s.undo()
      } else if (e.ctrlKey && !typing && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
      } else if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) {
        e.preventDefault()
        s.remove(s.selectedId)
      } else if (e.key === 'Escape' && !typing) {
        s.select(null)
        s.setTool('text')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pickImage = (file: File): void => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const img = new Image()
      img.onload = () => a.setStamp('', { dataUrl, width: img.naturalWidth, height: img.naturalHeight })
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  const markup = a.tool === 'highlight' || a.tool === 'underline'
  const showWidth = !markup && a.tool !== 'note' && a.tool !== 'text' && a.tool !== 'stamp' && a.tool !== 'freetext'

  return (
    <div className="annbar">
      <button onClick={() => void save()} title="Save (Ctrl+S)">
        Save{count + formEdits ? ` (${count + formEdits})` : ''}
      </button>
      <button onClick={() => void save(true)} title="Save As (Ctrl+Shift+S)">
        Save As
      </button>
      <span className="sep" />
      <button disabled={!a.past.length} onClick={a.undo} title="Undo (Ctrl+Z)">
        ↶
      </button>
      <button disabled={!a.future.length} onClick={a.redo} title="Redo (Ctrl+Y)">
        ↷
      </button>
      <span className="sep" />
      {TOOLS.map((t) => (
        <button key={t.id} className={a.tool === t.id ? 'on' : ''} title={t.title} onClick={() => a.setTool(t.id)}>
          {t.label}
        </button>
      ))}
      <select
        className={a.tool === 'stamp' ? 'on' : ''}
        value={a.tool === 'stamp' && !a.stampImage ? a.stampLabel : ''}
        onChange={(e) => {
          if (e.target.value === '__img') fileRef.current?.click()
          else if (e.target.value) a.setStamp(e.target.value, null)
        }}
        title="Stamps"
      >
        <option value="">Stamp…</option>
        {STAMPS.map((s) => (
          <option key={s}>{s}</option>
        ))}
        <option value="__img">Custom image…</option>
      </select>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) pickImage(f)
          e.target.value = ''
        }}
      />
      <SignatureMenu />
      <span className="sep" />
      {PALETTE.map((c) => (
        <button
          key={c}
          className="swatch"
          style={{ background: c, outline: a.color === c ? '2px solid var(--accent)' : 'none' }}
          onClick={() => a.setColor(c)}
          title={c}
        />
      ))}
      <input type="color" value={a.color} onChange={(e) => a.setColor(e.target.value)} title="Custom color" />
      {showWidth && (
        <>
          <span className="muted">Width</span>
          <input type="range" min={1} max={12} step={0.5} value={a.width} onChange={(e) => a.setWidth(Number(e.target.value))} />
        </>
      )}
      {a.tool === 'freetext' && (
        <>
          <span className="muted">Size</span>
          <input type="range" min={8} max={48} step={1} value={a.width} onChange={(e) => a.setWidth(Number(e.target.value))} />
        </>
      )}
      {(markup || a.tool === 'select') && (
        <>
          <span className="muted">Opacity</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={a.opacity}
            onChange={(e) => a.setOpacity(Number(e.target.value))}
          />
        </>
      )}
      <span className="muted hint">{HINTS[a.tool]}</span>
      {hasForm && (
        <>
          <span className="sep" />
          <label className="sigOpt" title="Fill fields directly on the page. Flatten makes the entries permanent and removes the fields when saving.">
            <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
            Flatten form on save
          </label>
        </>
      )}
    </div>
  )
}
