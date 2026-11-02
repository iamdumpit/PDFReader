import { create } from 'zustand'
import { useAnn } from './annotationStore'
import { embedAnnotations } from '../services/pdfEdit'
import { flattenForm } from '../services/pdfForms'
import { useForms } from './formStore'
import { useUi } from './uiStore'
import { protectedName, withFileName } from '../services/fileNames'
import { ALL_PERMISSIONS, decryptPdf, protectPdf, type Protection } from '../services/pdfSecurity'
import {
  loadPdf,
  readOutline,
  readPageSizes,
  searchDocument,
  type OutlineNode,
  type PageSize,
  type PDFDocumentProxy,
  type SearchHit
} from '../services/pdfDocument'

export type SidebarTab = 'thumbnails' | 'bookmarks' | 'search'

export interface UserBookmark {
  page: number
  label: string
}

interface DocState {
  doc: PDFDocumentProxy | null
  fileName: string
  filePath: string | null
  bytes: Uint8Array | null
  /** true once page-level edits (reorder, delete, ...) have been applied but not saved */
  modified: boolean
  /** when set, Save writes an encrypted file (the in-memory copy stays readable) */
  protection: Protection | null
  /** previous byte states, newest last, for undoing page-level edits */
  history: Uint8Array[]
  fingerprint: string
  pageSizes: PageSize[]
  outline: OutlineNode[]
  userBookmarks: UserBookmark[]
  error: string | null
  loading: boolean

  scale: number
  currentPage: number
  navRequest: { page: number; nonce: number } | null

  /** page-organizer grid shown instead of the reading view */
  organize: boolean

  nightMode: boolean
  sidebarOpen: boolean
  sidebarTab: SidebarTab

  query: string
  hits: SearchHit[]
  activeHit: number
  searching: boolean

  /** Load a PDF into the *current* view (tabs wrap this). Resolves true on success. */
  openData: (
    name: string,
    data: Uint8Array,
    path?: string | null,
    keepPage?: boolean,
    destroyPrev?: boolean
  ) => Promise<boolean>
  openProtected: (
    name: string,
    data: Uint8Array,
    path: string | null,
    keepPage: boolean,
    destroyPrev: boolean
  ) => Promise<boolean>
  save: (asNew?: boolean) => Promise<void>
  /** Current bytes with pending annotations and form entries baked in. */
  bake: () => Promise<Uint8Array>
  /** Apply a page-level edit: bakes pending changes, runs `fn`, reloads, records undo state. */
  applyEdit: (fn: (bytes: Uint8Array) => Promise<Uint8Array>) => Promise<boolean>
  undoEdit: () => Promise<void>
  setOrganize: (on: boolean) => void
  setProtection: (p: Protection | null) => void
  setScale: (scale: number) => void
  setCurrentPage: (page: number) => void
  goToPage: (page: number) => void
  toggleNight: () => void
  toggleSidebar: () => void
  setSidebarTab: (tab: SidebarTab) => void
  runSearch: (query: string) => Promise<void>
  stepHit: (delta: number) => void
  addBookmark: (label: string) => void
  removeBookmark: (page: number) => void
}

const MIN_SCALE = 0.25
const MAX_SCALE = 5

const lsGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const lsSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}

let searchToken: { cancelled: boolean } = { cancelled: false }
let navNonce = 0

export const useDoc = create<DocState>((set, get) => ({
  doc: null,
  fileName: '',
  filePath: null,
  bytes: null,
  modified: false,
  protection: null,
  history: [],
  fingerprint: '',
  pageSizes: [],
  outline: [],
  userBookmarks: [],
  error: null,
  loading: false,

  scale: 1.25,
  currentPage: 1,
  navRequest: null,

  organize: false,
  nightMode: lsGet('nightMode') === '1',
  sidebarOpen: true,
  sidebarTab: 'thumbnails',

  query: '',
  hits: [],
  activeHit: -1,
  searching: false,

  openProtected: async (name, data, path, keepPage, destroyPrev) => {
    let wrong = false
    for (;;) {
      const password = await useUi.getState().requestPassword(name, wrong)
      if (password === null) return false
      try {
        const plain = await decryptPdf(data, password)
        const ok = await get().openData(name, plain, path, keepPage, destroyPrev)
        // keep the file protected when it is saved again
        if (ok) set({ protection: { userPassword: password, ownerPassword: '', permissions: ALL_PERMISSIONS } })
        return ok
      } catch (e) {
        if (!(e instanceof Error) || !/Incorrect/.test(e.message)) {
          set({ error: `Could not open PDF: ${e instanceof Error ? e.message : String(e)}` })
          return false
        }
        wrong = true
      }
    }
  },

  openData: async (name, data, path = null, keepPage = false, destroyPrev = true) => {
    set({ loading: true, error: null })
    try {
      const prev = get().doc
      const doc = await loadPdf(data)
      const [pageSizes, outline] = await Promise.all([readPageSizes(doc), readOutline(doc)])
      ;(doc.annotationStorage as { onSetModified: (() => void) | null }).onSetModified = () =>
        useForms.getState().bump()
      const fingerprint = doc.fingerprints[0] ?? name
      const saved = lsGet(`bookmarks:${fingerprint}`)
      searchToken.cancelled = true
      const page = keepPage ? Math.min(get().currentPage, doc.numPages) : 1
      useAnn.getState().clear()
      set({
        doc,
        fileName: name,
        filePath: path,
        bytes: data,
        modified: false,
        protection: keepPage ? get().protection : null,
        history: [],
        fingerprint,
        pageSizes,
        outline,
        userBookmarks: saved ? (JSON.parse(saved) as UserBookmark[]) : [],
        currentPage: page,
        navRequest: { page, nonce: ++navNonce },
        query: '',
        hits: [],
        activeHit: -1,
        searching: false,
        loading: false
      })
      if (destroyPrev) void prev?.loadingTask.destroy()
      return true
    } catch (e) {
      if ((e as { name?: string }).name === 'PasswordException') {
        set({ loading: false })
        return get().openProtected(name, data, path, keepPage, destroyPrev)
      }
      const msg = e instanceof Error ? e.message : String(e)
      set({ loading: false, error: `Could not open PDF: ${msg}` })
      return false
    }
  },

  bake: async () => {
    const { bytes, doc } = get()
    if (!bytes) throw new Error('No document open')
    // form values typed into fields live in pdf.js' annotationStorage; bake them in first
    const withForms = doc && doc.annotationStorage.size ? new Uint8Array(await doc.saveDocument()) : bytes
    const annots = useAnn.getState().annotations
    return annots.length ? embedAnnotations(withForms, annots) : withForms
  },

  save: async (asNew = false) => {
    const { bytes, filePath, fileName } = get()
    if (!bytes) return
    try {
      let out = await get().bake()
      if (useForms.getState().flatten) out = await flattenForm(out)
      const { protection } = get()
      const toWrite = protection ? await protectPdf(out, protection) : out
      // a secured copy is written under a "_Protected" name so it is recognisable (and the
      // original file is not overwritten)
      const suggested = protection ? protectedName(fileName) : fileName
      const target = filePath && protection ? withFileName(filePath, suggested) : filePath
      const path =
        asNew || !target
          ? await window.api.saveAs(suggested, toWrite)
          : await window.api.save(target, toWrite)
      if (!path) return
      const name = path.split(/[\\/]/).pop() ?? fileName
      // the open copy stays readable; the file on disk is the encrypted one
      await get().openData(name, out, path, true)
    } catch (e) {
      set({ error: `Could not save PDF: ${e instanceof Error ? e.message : String(e)}` })
    }
  },

  applyEdit: async (fn) => {
    const { fileName, filePath } = get()
    try {
      const before = await get().bake()
      const history = [...get().history, before]
      const out = await fn(before)
      const ok = await get().openData(fileName, out, filePath, true)
      if (ok) set({ modified: true, history })
      return ok
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      return false
    }
  },

  undoEdit: async () => {
    const { history, fileName, filePath } = get()
    const prev = history[history.length - 1]
    if (!prev) return
    const rest = history.slice(0, -1)
    if (await get().openData(fileName, prev, filePath, true)) set({ history: rest, modified: rest.length > 0 })
  },

  setOrganize: (organize) => set({ organize }),
  setProtection: (protection) => set({ protection, modified: true }),

  setScale: (scale) => set({ scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) }),
  setCurrentPage: (page) => set({ currentPage: page }),
  goToPage: (page) => {
    const n = get().doc?.numPages ?? 1
    const p = Math.min(n, Math.max(1, page))
    set({ currentPage: p, navRequest: { page: p, nonce: ++navNonce } })
  },

  toggleNight: () => {
    const next = !get().nightMode
    lsSet('nightMode', next ? '1' : '0')
    set({ nightMode: next })
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarTab: (tab) => set({ sidebarTab: tab, sidebarOpen: true }),

  runSearch: async (query) => {
    const doc = get().doc
    searchToken.cancelled = true
    const token = { cancelled: false }
    searchToken = token
    set({ query, hits: [], activeHit: -1 })
    if (!doc || !query.trim()) {
      set({ searching: false })
      return
    }
    set({ searching: true, sidebarTab: 'search', sidebarOpen: true })
    const hits = await searchDocument(doc, query.trim(), token)
    if (token.cancelled) return
    set({ hits, searching: false, activeHit: hits.length ? 0 : -1 })
    if (hits.length) get().goToPage(hits[0].page)
  },

  stepHit: (delta) => {
    const { hits, activeHit } = get()
    if (!hits.length) return
    const next = (activeHit + delta + hits.length) % hits.length
    set({ activeHit: next })
    get().goToPage(hits[next].page)
  },

  addBookmark: (label) => {
    const { currentPage, userBookmarks, fingerprint } = get()
    if (userBookmarks.some((b) => b.page === currentPage)) return
    const next = [...userBookmarks, { page: currentPage, label: label || `Page ${currentPage}` }].sort(
      (a, b) => a.page - b.page
    )
    lsSet(`bookmarks:${fingerprint}`, JSON.stringify(next))
    set({ userBookmarks: next })
  },

  removeBookmark: (page) => {
    const { userBookmarks, fingerprint } = get()
    const next = userBookmarks.filter((b) => b.page !== page)
    lsSet(`bookmarks:${fingerprint}`, JSON.stringify(next))
    set({ userBookmarks: next })
  }
}))
