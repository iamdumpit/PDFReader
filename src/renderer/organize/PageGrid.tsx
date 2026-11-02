import { useEffect, useMemo, useRef, useState } from 'react'
import { useDoc } from '../store/documentStore'
import { useUi } from '../store/uiStore'
import {
  deletePages,
  extractPages,
  insertBlankPage,
  insertPages,
  reorderPages,
  rotatePages
} from '../services/pdfPages'
import { PageThumb } from './PageThumb'

/** Where the dragged pages should land, as a position among the *original* page indices. */
export function moveOrder(count: number, moving: number[], target: number): { order: number[]; start: number } {
  const set = new Set(moving)
  const rest = Array.from({ length: count }, (_, i) => i).filter((i) => !set.has(i))
  const pos = rest.filter((i) => i < target).length
  return { order: [...rest.slice(0, pos), ...moving, ...rest.slice(pos)], start: pos }
}

export function PageGrid(): React.JSX.Element {
  const doc = useDoc((s) => s.doc)!
  const fileName = useDoc((s) => s.fileName)
  const history = useDoc((s) => s.history)
  const night = useDoc((s) => s.nightMode)
  const applyEdit = useDoc((s) => s.applyEdit)
  const undoEdit = useDoc((s) => s.undoEdit)
  const setOrganize = useDoc((s) => s.setOrganize)
  const openDialog = useUi((s) => s.openDialog)
  const count = doc.numPages

  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ index: number; after: boolean } | null>(null)
  const anchor = useRef(0)
  const dragging = useRef<number[]>([])

  const sel = useMemo(() => [...selected].sort((a, b) => a - b), [selected])
  const hasSel = sel.length > 0
  const base = fileName.replace(/\.pdf$/i, '') || 'document'

  useEffect(() => {
    setSelected((s) => s.filter((i) => i < count))
  }, [count])

  const run = async (fn: (bytes: Uint8Array) => Promise<Uint8Array>, after?: () => void): Promise<void> => {
    if (busy) return
    setBusy(true)
    setNote(null)
    const ok = await applyEdit(fn)
    setBusy(false)
    if (ok) after?.()
  }

  const rotate = (delta: number): void => void run((b) => rotatePages(b, sel, delta))
  const remove = (): void => {
    if (!hasSel) return
    if (sel.length >= count) return setNote('A PDF needs at least one page.')
    void run((b) => deletePages(b, sel), () => setSelected([]))
  }

  const extract = async (): Promise<void> => {
    if (!hasSel || busy) return
    setBusy(true)
    try {
      const out = await extractPages(await useDoc.getState().bake(), sel)
      const path = await window.api.saveAs(`${base}_extract.pdf`, out)
      setNote(path ? `Saved ${sel.length} page${sel.length === 1 ? '' : 's'} to ${path}` : null)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const insertFromFile = async (): Promise<void> => {
    const files = (await window.api.openDialog()) as { name: string; data: Uint8Array }[] | null
    const f = files?.[0]
    if (!f) return
    const at = hasSel ? sel[sel.length - 1] + 1 : count
    await run(
      (b) => insertPages(b, f.data, null, at),
      () => setNote(`Inserted pages from ${f.name} at position ${at + 1}.`)
    )
  }

  const insertBlank = (): void => {
    const at = hasSel ? sel[sel.length - 1] + 1 : count
    void run((b) => insertBlankPage(b, at), () => setSelected([at]))
  }

  const onClickPage = (i: number, e: React.MouseEvent): void => {
    if (e.shiftKey) {
      const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)]
      setSelected(Array.from({ length: b - a + 1 }, (_, k) => a + k))
    } else if (e.ctrlKey || e.metaKey) {
      setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))
      anchor.current = i
    } else {
      setSelected([i])
      anchor.current = i
    }
  }

  // keyboard: Delete removes, Ctrl+A selects all
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      if (e.key === 'Delete') {
        e.preventDefault()
        remove()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSelected(Array.from({ length: count }, (_, i) => i))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onDragStart = (i: number, e: React.DragEvent): void => {
    const moving = selected.includes(i) ? sel : [i]
    if (!selected.includes(i)) setSelected([i])
    dragging.current = moving
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', moving.join(','))
  }

  const onDragOver = (i: number, e: React.DragEvent): void => {
    if (!dragging.current.length) return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    setDrop({ index: i, after: e.clientX > r.left + r.width / 2 })
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    const moving = dragging.current
    const d = drop
    dragging.current = []
    setDrop(null)
    if (!moving.length || !d) return
    const { order, start } = moveOrder(count, [...moving].sort((a, b) => a - b), d.after ? d.index + 1 : d.index)
    if (order.every((v, i) => v === i)) return
    void run(
      (b) => reorderPages(b, order),
      () => setSelected(moving.map((_, k) => start + k))
    )
  }

  return (
    <div className="organize">
      <div className="orgBar">
        <button onClick={() => setOrganize(false)} title="Back to reading">
          ← Back to reading
        </button>
        <span className="sep" />
        <button disabled={!hasSel || busy} onClick={() => rotate(-90)} title="Rotate left">
          ⟲ Left
        </button>
        <button disabled={!hasSel || busy} onClick={() => rotate(90)} title="Rotate right">
          ⟳ Right
        </button>
        <button disabled={!hasSel || busy} onClick={remove} title="Delete selected pages (Delete)">
          Delete
        </button>
        <button disabled={!hasSel || busy} onClick={() => void extract()} title="Save selected pages as a new PDF">
          Extract…
        </button>
        <span className="sep" />
        <button disabled={busy} onClick={() => void insertFromFile()} title="Insert all pages of another PDF after the selection (or at the end)">
          Insert PDF…
        </button>
        <button disabled={busy} onClick={insertBlank} title="Insert a blank page after the selection (or at the end)">
          Blank page
        </button>
        <span className="sep" />
        <button disabled={busy} onClick={() => openDialog('split')}>
          Split…
        </button>
        <button disabled={busy} onClick={() => openDialog('merge')}>
          Merge…
        </button>
        <span className="sep" />
        <button disabled={!history.length || busy} onClick={() => void undoEdit()} title="Undo the last page change">
          ↶ Undo
        </button>
        <span className="grow muted orgInfo">
          {busy ? 'Working…' : (note ?? `${count} pages · ${sel.length} selected · drag pages to reorder · Ctrl/Shift-click to select several`)}
        </span>
        <button onClick={() => setSelected(Array.from({ length: count }, (_, i) => i))}>Select all</button>
        <button disabled={!hasSel} onClick={() => setSelected([])}>
          None
        </button>
      </div>
      <div
        className="pageGrid"
        onDragEnd={() => {
          dragging.current = []
          setDrop(null)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDrop(null)
        }}
        onDrop={onDrop}
        onDragOver={(e) => dragging.current.length && e.preventDefault()}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={`${doc.fingerprints[0]}-${i}`}
            className={`pageTile${selected.includes(i) ? ' selected' : ''}${
              drop?.index === i ? (drop.after ? ' dropAfter' : ' dropBefore') : ''
            }`}
            draggable
            onClick={(e) => onClickPage(i, e)}
            onDragStart={(e) => onDragStart(i, e)}
            onDragOver={(e) => onDragOver(i, e)}
            onDoubleClick={() => {
              useDoc.getState().goToPage(i + 1)
              setOrganize(false)
            }}
            title="Double-click to open this page"
          >
            <PageThumb doc={doc} pageNum={i + 1} night={night} />
            <span className="pageNo">{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
