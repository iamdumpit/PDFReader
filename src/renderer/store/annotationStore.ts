import { create } from 'zustand'
import { TOOL_DEFAULTS, type Annotation, type Tool } from '../annotate/types'

export interface StampImage {
  dataUrl: string
  width: number
  height: number
}

interface AnnState {
  annotations: Annotation[]
  past: Annotation[][]
  future: Annotation[][]
  selectedId: string | null
  editingId: string | null

  tool: Tool
  color: string
  opacity: number
  width: number
  stampLabel: string
  stampImage: StampImage | null

  setTool: (tool: Tool) => void
  setColor: (color: string) => void
  setOpacity: (opacity: number) => void
  setWidth: (width: number) => void
  setStamp: (label: string, image: StampImage | null) => void
  select: (id: string | null) => void
  setEditing: (id: string | null) => void

  add: (a: Annotation) => void
  /** Replace the whole list as one undoable step. */
  commit: (next: Annotation[]) => void
  /** Push an undo snapshot; call once before a series of `patch` calls. */
  beginChange: () => void
  patch: (id: string, fn: (a: Annotation) => Annotation) => void
  remove: (id: string) => void
  undo: () => void
  redo: () => void
  clear: () => void
}

let counter = 0
export const newId = (): string => `a${Date.now().toString(36)}${(counter++).toString(36)}`

export const useAnn = create<AnnState>((set, get) => ({
  annotations: [],
  past: [],
  future: [],
  selectedId: null,
  editingId: null,

  tool: 'text',
  ...TOOL_DEFAULTS.text,
  stampLabel: 'APPROVED',
  stampImage: null,

  setTool: (tool) => set({ tool, selectedId: null, editingId: null, ...TOOL_DEFAULTS[tool] }),
  setColor: (color) => {
    set({ color })
    const id = get().selectedId
    if (id) {
      get().beginChange()
      get().patch(id, (a) => ({ ...a, color }))
    }
  },
  setOpacity: (opacity) => {
    set({ opacity })
    const id = get().selectedId
    if (id) {
      get().beginChange()
      get().patch(id, (a) => ({ ...a, opacity }))
    }
  },
  setWidth: (width) => {
    set({ width })
    const id = get().selectedId
    if (id) {
      get().beginChange()
      get().patch(id, (a) => ({ ...a, width }))
    }
  },
  setStamp: (stampLabel, stampImage) => set({ stampLabel, stampImage, tool: 'stamp' }),
  select: (selectedId) => set({ selectedId }),
  setEditing: (editingId) => set({ editingId }),

  add: (a) =>
    set((s) => ({ annotations: [...s.annotations, a], past: [...s.past, s.annotations], future: [] })),
  commit: (next) => set((s) => ({ annotations: next, past: [...s.past, s.annotations], future: [] })),
  beginChange: () => set((s) => ({ past: [...s.past, s.annotations], future: [] })),
  patch: (id, fn) =>
    set((s) => ({ annotations: s.annotations.map((a) => (a.id === id ? fn(a) : a)) })),
  remove: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
      past: [...s.past, s.annotations],
      future: [],
      selectedId: s.selectedId === id ? null : s.selectedId,
      editingId: s.editingId === id ? null : s.editingId
    })),
  undo: () =>
    set((s) => {
      if (!s.past.length) return s
      const prev = s.past[s.past.length - 1]
      return {
        annotations: prev,
        past: s.past.slice(0, -1),
        future: [...s.future, s.annotations],
        selectedId: null,
        editingId: null
      }
    }),
  redo: () =>
    set((s) => {
      if (!s.future.length) return s
      const next = s.future[s.future.length - 1]
      return {
        annotations: next,
        future: s.future.slice(0, -1),
        past: [...s.past, s.annotations],
        selectedId: null,
        editingId: null
      }
    }),
  clear: () => set({ annotations: [], past: [], future: [], selectedId: null, editingId: null })
}))
