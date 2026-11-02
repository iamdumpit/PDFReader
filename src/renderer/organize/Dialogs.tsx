import { useState } from 'react'
import { useDoc } from '../store/documentStore'
import { useTabs } from '../store/tabStore'
import { useUi } from '../store/uiStore'
import { everyN, mergePdfs, parseRanges, splitPdf } from '../services/pdfPages'
import { Modal } from './Modal'
import { CompressDialog, MetadataDialog, PasswordDialog, ProtectDialog } from './ToolDialogs'

type SplitMode = 'ranges' | 'every' | 'each'

function SplitDialog(): React.JSX.Element {
  const doc = useDoc((s) => s.doc)
  const fileName = useDoc((s) => s.fileName)
  const close = useUi((s) => s.closeDialog)
  const [mode, setMode] = useState<SplitMode>('ranges')
  const [ranges, setRanges] = useState('')
  const [n, setN] = useState('1')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const count = doc?.numPages ?? 0
  const base = fileName.replace(/\.pdf$/i, '') || 'document'

  const groups = (): number[][] =>
    mode === 'ranges' ? parseRanges(ranges, count) : mode === 'every' ? everyN(count, Number(n)) : everyN(count, 1)

  let preview = ''
  let valid = true
  try {
    const k = groups().length
    preview = `${k} file${k === 1 ? '' : 's'} will be created`
  } catch (e) {
    valid = false
    preview = mode === 'ranges' && !ranges.trim() ? 'Enter the pages for each file.' : e instanceof Error ? e.message : ''
  }

  const go = async (): Promise<void> => {
    setBusy(true)
    setMsg(null)
    try {
      const g = groups()
      const parts = await splitPdf(await useDoc.getState().bake(), g)
      const pad = String(g.length).length
      const files = parts.map((data, i) => {
        const first = g[i][0] + 1
        const last = g[i][g[i].length - 1] + 1
        const label = first === last ? `p${first}` : `p${first}-${last}`
        return { name: `${base}_${String(i + 1).padStart(pad, '0')}_${label}.pdf`, data }
      })
      const dir = await window.api.saveMany(files)
      if (dir) setMsg({ text: `Wrote ${files.length} files to ${dir}`, ok: true })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    }
    setBusy(false)
  }

  return (
    <Modal title="Split PDF">
      {!doc ? (
        <p className="pad">Open a PDF first.</p>
      ) : (
        <>
          <p className="muted">
            {fileName} · {count} pages
          </p>
          <label className="radioRow">
            <input type="radio" checked={mode === 'ranges'} onChange={() => setMode('ranges')} />
            By page ranges
          </label>
          {mode === 'ranges' && (
            <input
              className="wide"
              placeholder="e.g. 1-3, 4, 7-10 (one file per range)"
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
              autoFocus
            />
          )}
          <label className="radioRow">
            <input type="radio" checked={mode === 'every'} onChange={() => setMode('every')} />
            Every
            <input
              className="narrow"
              value={n}
              disabled={mode !== 'every'}
              onChange={(e) => setN(e.target.value)}
            />
            pages
          </label>
          <label className="radioRow">
            <input type="radio" checked={mode === 'each'} onChange={() => setMode('each')} />
            Every page as its own file
          </label>
          <p className={`muted${msg && !msg.ok ? ' err' : ''}`}>{msg ? msg.text : preview}</p>
          <div className="modalActions">
            <button onClick={close}>Close</button>
            <button className="primary" disabled={busy || !valid} onClick={() => void go()}>
              {busy ? 'Working…' : 'Split to folder…'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

interface Item {
  id: number
  name: string
  data: Uint8Array
}

let itemId = 0

function MergeDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeDialog)
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const hasDoc = useDoc((s) => !!s.doc)

  const addCurrent = async (): Promise<void> => {
    const { fileName, bake } = useDoc.getState()
    setItems((l) => [...l, { id: ++itemId, name: fileName || 'current.pdf', data: new Uint8Array() }])
    const data = await bake()
    setItems((l) => l.map((x) => (x.data.length === 0 && x.name === (fileName || 'current.pdf') ? { ...x, data } : x)))
  }

  const addFiles = async (): Promise<void> => {
    const files = (await window.api.openDialog()) as { name: string; data: Uint8Array }[] | null
    if (files?.length) setItems((l) => [...l, ...files.map((f) => ({ id: ++itemId, name: f.name, data: f.data }))])
  }

  const move = (i: number, d: number): void =>
    setItems((l) => {
      const j = i + d
      if (j < 0 || j >= l.length) return l
      const c = [...l]
      ;[c[i], c[j]] = [c[j], c[i]]
      return c
    })

  const go = async (): Promise<void> => {
    setBusy(true)
    setErr(null)
    try {
      const out = await mergePdfs(items.map((i) => i.data))
      await useTabs.getState().openFile('merged.pdf', out, null)
      close()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  return (
    <Modal title="Merge PDFs">
      <p className="muted">Files are joined in the order listed. The result opens in a new tab — use Save As to keep it.</p>
      <div className="mergeList">
        {items.length === 0 && <p className="muted pad">No files yet.</p>}
        {items.map((it, i) => (
          <div key={it.id} className="mergeRow">
            <span className="grow">{i + 1}. {it.name}</span>
            <button className="icon" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
              ↑
            </button>
            <button className="icon" disabled={i === items.length - 1} onClick={() => move(i, 1)} title="Move down">
              ↓
            </button>
            <button className="icon" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))} title="Remove">
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="modalActions">
        <button onClick={() => void addFiles()}>Add PDFs…</button>
        {hasDoc && <button onClick={() => void addCurrent()}>Add current document</button>}
        <span className="grow" />
        {err && <span className="err">{err}</span>}
        <button onClick={close}>Close</button>
        <button className="primary" disabled={busy || items.length < 2 || items.some((i) => !i.data.length)} onClick={() => void go()}>
          {busy ? 'Merging…' : 'Merge'}
        </button>
      </div>
    </Modal>
  )
}

export function Dialogs(): React.JSX.Element {
  const dialog = useUi((s) => s.dialog)
  return (
    <>
      {dialog === 'split' && <SplitDialog />}
      {dialog === 'merge' && <MergeDialog />}
      {dialog === 'compress' && <CompressDialog />}
      {dialog === 'protect' && <ProtectDialog />}
      {dialog === 'metadata' && <MetadataDialog />}
      <PasswordDialog />
    </>
  )
}
