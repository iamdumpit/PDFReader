import { create } from 'zustand'
import { useDoc } from './documentStore'
import { useAnn } from './annotationStore'

/**
 * Tabs are layered over the existing single-document stores: `useDoc` / `useAnn` always hold the
 * *active* tab. Switching tabs parks the active tab's state in a snapshot and restores another.
 */
type DocSnap = Pick<
  ReturnType<typeof useDoc.getState>,
  | 'doc'
  | 'fileName'
  | 'filePath'
  | 'bytes'
  | 'modified'
  | 'protection'
  | 'history'
  | 'fingerprint'
  | 'pageSizes'
  | 'outline'
  | 'userBookmarks'
  | 'scale'
  | 'currentPage'
  | 'query'
  | 'hits'
  | 'activeHit'
>
type AnnSnap = Pick<ReturnType<typeof useAnn.getState>, 'annotations' | 'past' | 'future'>

interface Snapshot {
  doc: DocSnap
  ann: AnnSnap
}

interface Tab {
  id: string
  snap: Snapshot | null // null while the tab is active
}

interface TabState {
  tabs: Tab[]
  activeId: string | null
  switchTab: (id: string) => void
  closeTab: (id: string) => void
  openFile: (name: string, data: Uint8Array, path: string | null) => Promise<void>
  openDialog: () => Promise<void>
  openPath: (path: string) => Promise<void>
  cycle: (delta: number) => void
}

let tabCounter = 0
let nonce = 1_000_000

function capture(): Snapshot {
  const d = useDoc.getState()
  const a = useAnn.getState()
  return {
    doc: {
      doc: d.doc,
      fileName: d.fileName,
      filePath: d.filePath,
      bytes: d.bytes,
      modified: d.modified,
      protection: d.protection,
      history: d.history,
      fingerprint: d.fingerprint,
      pageSizes: d.pageSizes,
      outline: d.outline,
      userBookmarks: d.userBookmarks,
      scale: d.scale,
      currentPage: d.currentPage,
      query: d.query,
      hits: d.hits,
      activeHit: d.activeHit
    },
    ann: { annotations: a.annotations, past: a.past, future: a.future }
  }
}

function restore(s: Snapshot): void {
  useDoc.setState({
    ...s.doc,
    error: null,
    searching: false,
    navRequest: { page: s.doc.currentPage, nonce: ++nonce }
  })
  useAnn.setState({ ...s.ann, selectedId: null, editingId: null })
}

function showEmpty(): void {
  useDoc.setState({
    doc: null,
    fileName: '',
    filePath: null,
    bytes: null,
    modified: false,
    protection: null,
    history: [],
    organize: false,
    fingerprint: '',
    pageSizes: [],
    outline: [],
    userBookmarks: [],
    currentPage: 1,
    query: '',
    hits: [],
    activeHit: -1,
    searching: false,
    error: null
  })
  useAnn.getState().clear()
}

export const isDirty = (tab: Tab, activeId: string | null): boolean => {
  const anns = tab.id === activeId ? useAnn.getState().annotations : (tab.snap?.ann.annotations ?? [])
  const doc = tab.id === activeId ? useDoc.getState().doc : tab.snap?.doc.doc
  const modified = tab.id === activeId ? useDoc.getState().modified : (tab.snap?.doc.modified ?? false)
  return anns.length > 0 || modified || (doc?.annotationStorage.size ?? 0) > 0
}

export const tabTitle = (tab: Tab, activeId: string | null): string =>
  tab.id === activeId ? useDoc.getState().fileName : (tab.snap?.doc.fileName ?? '')

export const useTabs = create<TabState>((set, get) => ({
  tabs: [],
  activeId: null,

  switchTab: (id) => {
    const { tabs, activeId } = get()
    if (id === activeId) return
    const target = tabs.find((t) => t.id === id)
    if (!target?.snap) return
    const parked = capture()
    restore(target.snap)
    set({
      activeId: id,
      tabs: tabs.map((t) => (t.id === id ? { ...t, snap: null } : t.id === activeId ? { ...t, snap: parked } : t))
    })
  },

  closeTab: (id) => {
    const { tabs, activeId } = get()
    const tab = tabs.find((t) => t.id === id)
    if (!tab) return
    const dirty = isDirty(tab, activeId)
    const name = tabTitle(tab, activeId) || 'this document'
    if (dirty && !window.confirm(`Close "${name}" and discard its unsaved annotations?`)) return

    const idx = tabs.findIndex((t) => t.id === id)
    const rest = tabs.filter((t) => t.id !== id)
    const closingDoc = tab.id === activeId ? useDoc.getState().doc : tab.snap?.doc.doc
    if (tab.id !== activeId) {
      set({ tabs: rest })
    } else if (rest.length) {
      const next = rest[Math.min(idx, rest.length - 1)]
      restore(next.snap!)
      set({ activeId: next.id, tabs: rest.map((t) => (t.id === next.id ? { ...t, snap: null } : t)) })
    } else {
      showEmpty()
      set({ activeId: null, tabs: [] })
    }
    void closingDoc?.loadingTask.destroy()
  },

  openFile: async (name, data, path) => {
    const { tabs, activeId } = get()
    if (path) {
      const same = tabs.find((t) => (t.id === activeId ? useDoc.getState().filePath : t.snap?.doc.filePath) === path)
      if (same) {
        get().switchTab(same.id)
        return
      }
    }
    const parked = activeId ? capture() : null
    // keep the previous document alive: it moves into a snapshot instead of being destroyed
    const ok = await useDoc.getState().openData(name, data, path, false, false)
    if (!ok) return
    const id = `tab${++tabCounter}`
    set({
      activeId: id,
      tabs: [
        ...tabs.map((t) => (t.id === activeId && parked ? { ...t, snap: parked } : t)),
        { id, snap: null }
      ]
    })
  },

  openDialog: async () => {
    const files = (await window.api.openDialog()) as { name: string; data: Uint8Array; path: string }[] | null
    for (const f of files ?? []) await get().openFile(f.name, f.data, f.path)
  },

  openPath: async (path) => {
    const f = await window.api.openPath(path)
    await get().openFile(f.name, f.data, f.path)
  },

  cycle: (delta) => {
    const { tabs, activeId } = get()
    if (tabs.length < 2) return
    const i = tabs.findIndex((t) => t.id === activeId)
    get().switchTab(tabs[(i + delta + tabs.length) % tabs.length].id)
  }
}))
