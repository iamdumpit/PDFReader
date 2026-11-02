import { useEffect, useRef, useState } from 'react'
import { useDoc } from '../store/documentStore'
import { useTabs } from '../store/tabStore'
import { useUi } from '../store/uiStore'

function ToolsMenu({ disabled }: { disabled: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const protectedDoc = useDoc((s) => !!s.protection)
  const openDialog = useUi((s) => s.openDialog)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const item = (label: string, kind: Parameters<typeof openDialog>[0], needsDoc: boolean, hint?: string): React.JSX.Element => (
    <button
      className="menuItem"
      disabled={needsDoc && disabled}
      title={hint}
      onClick={() => {
        setOpen(false)
        openDialog(kind)
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="toolsMenu" ref={ref}>
      <button className={protectedDoc ? 'on' : ''} onClick={() => setOpen((o) => !o)} title="Merge, compress, protect, remove metadata">
        {protectedDoc ? '🔒 Tools ▾' : 'Tools ▾'}
      </button>
      {open && (
        <div className="menuPanel">
          {item('Merge PDFs…', 'merge', false, 'Combine several PDFs into one')}
          {item('Split PDF…', 'split', true)}
          {item('Compress…', 'compress', true, 'Make the file smaller')}
          {item(protectedDoc ? 'Password protection… (on)' : 'Password protect…', 'protect', true)}
          {item('Remove metadata…', 'metadata', true, 'Strip author, title, dates and other hidden details')}
        </div>
      )}
    </div>
  )
}

export function Toolbar(): React.JSX.Element {
  const s = useDoc()
  const [pageInput, setPageInput] = useState('1')
  const [q, setQ] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const total = s.doc?.numPages ?? 0

  useEffect(() => setPageInput(String(s.currentPage)), [s.currentPage])
  useEffect(() => setQ(s.query), [s.query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey) return
      const k = e.key.toLowerCase()
      if (k === 'o') {
        e.preventDefault()
        void useTabs.getState().openDialog()
      } else if (k === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (k === '=' || k === '+') {
        e.preventDefault()
        const st = useDoc.getState()
        st.setScale(st.scale * 1.2)
      } else if (k === '-') {
        e.preventDefault()
        const st = useDoc.getState()
        st.setScale(st.scale / 1.2)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const fitWidth = (): void => {
    const viewer = document.querySelector<HTMLElement>('.viewer')
    const first = s.pageSizes[0]
    if (viewer && first) s.setScale((viewer.clientWidth - 48) / first.width)
  }

  const disabled = !s.doc

  return (
    <header className="toolbar">
      <button onClick={() => void useTabs.getState().openDialog()} title="Open (Ctrl+O)">
        Open
      </button>
      <button onClick={s.toggleSidebar} disabled={disabled} title="Toggle sidebar">
        ☰
      </button>
      <span className="sep" />
      <button disabled={disabled} onClick={() => s.goToPage(s.currentPage - 1)} title="Previous page">
        ‹
      </button>
      <input
        className="pageInput"
        value={pageInput}
        disabled={disabled}
        onChange={(e) => setPageInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && s.goToPage(parseInt(pageInput, 10) || 1)}
      />
      <span className="muted">/ {total}</span>
      <button disabled={disabled} onClick={() => s.goToPage(s.currentPage + 1)} title="Next page">
        ›
      </button>
      <span className="sep" />
      <button disabled={disabled} onClick={() => s.setScale(s.scale / 1.2)} title="Zoom out (Ctrl+-)">
        −
      </button>
      <span className="zoom">{Math.round(s.scale * 100)}%</span>
      <button disabled={disabled} onClick={() => s.setScale(s.scale * 1.2)} title="Zoom in (Ctrl++)">
        +
      </button>
      <button disabled={disabled} onClick={fitWidth} title="Fit width">
        Fit width
      </button>
      <span className="sep" />
      <input
        ref={searchRef}
        className="search"
        placeholder="Search…"
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (e.shiftKey) s.stepHit(-1)
          else if (q === s.query && s.hits.length) s.stepHit(1)
          else void s.runSearch(q)
        }}
      />
      <button disabled={disabled || !s.hits.length} onClick={() => s.stepHit(-1)} title="Previous match">
        ↑
      </button>
      <button disabled={disabled || !s.hits.length} onClick={() => s.stepHit(1)} title="Next match">
        ↓
      </button>
      <button disabled={disabled} className={s.organize ? 'on' : ''} onClick={() => s.setOrganize(!s.organize)} title="Reorder, rotate, delete, extract, insert pages">
        Organize pages
      </button>
      <ToolsMenu disabled={disabled} />
      <span className="grow title">{s.fileName}</span>
      <button onClick={s.toggleNight} className={s.nightMode ? 'on' : ''} title="Night mode">
        {s.nightMode ? '☀ Day' : '☾ Night'}
      </button>
    </header>
  )
}
