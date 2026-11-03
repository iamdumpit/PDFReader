import { useEffect, useState } from 'react'
import { useDoc, type SidebarTab } from '../store/documentStore'
import { Viewer } from '../viewer/Viewer'
import { Thumbnails } from '../sidebar/Thumbnails'
import { Bookmarks } from '../sidebar/Bookmarks'
import { SearchResults } from '../sidebar/SearchResults'
import { Toolbar } from './Toolbar'
import { TabBar } from './TabBar'
import { useTabs } from '../store/tabStore'
import { AnnotationBar } from '../annotate/AnnotationBar'
import { PageGrid } from '../organize/PageGrid'
import { Dialogs } from '../organize/Dialogs'

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'thumbnails', label: 'Pages' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'search', label: 'Search' }
]

export function App(): React.JSX.Element {
  const { doc, sidebarOpen, sidebarTab, setSidebarTab, nightMode, error, loading, organize } = useDoc()
  const [dragging, setDragging] = useState(false)
  const activeTab = useTabs((s) => s.activeId)

  useEffect(() => {
    document.documentElement.dataset.theme = nightMode ? 'night' : 'day'
  }, [nightMode])

  // PDFs handed over by Windows (double-click, "Open with"), at start-up and while running
  useEffect(() => {
    const openAll = (paths: string[]): void => {
      void (async () => {
        for (const p of paths) await useTabs.getState().openPath(p)
      })()
    }
    void window.api.launchFiles?.().then(openAll)
    return window.api.onOpenFiles?.(openAll)
  }, [])

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => /\.pdf$/i.test(f.name))
    void (async () => {
      for (const f of files) await useTabs.getState().openPath(window.api.pathForFile(f))
    })()
  }

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <TabBar />
      <Toolbar />
      {doc && !organize && <AnnotationBar />}
      <div className="body">
        {doc && sidebarOpen && !organize && (
          <aside className="sidebar">
            <nav className="tabs">
              {TABS.map((t) => (
                <button key={t.id} className={sidebarTab === t.id ? 'on' : ''} onClick={() => setSidebarTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </nav>
            {sidebarTab === 'thumbnails' && <Thumbnails />}
            {sidebarTab === 'bookmarks' && <Bookmarks />}
            {sidebarTab === 'search' && <SearchResults />}
          </aside>
        )}
        {doc && organize ? <PageGrid key={activeTab ?? 'none'} /> : <Viewer key={activeTab ?? 'none'} />}
      </div>
      {(error || loading) && <div className={`toast${error ? ' err' : ''}`}>{error ?? 'Opening…'}</div>}
      <Dialogs />
      {dragging && <div className="dropHint">Drop PDF to open</div>}
    </div>
  )
}
