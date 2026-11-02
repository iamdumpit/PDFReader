import { create } from 'zustand'

interface FormState {
  /** Bumped whenever a form value changes so views depending on `annotationStorage.size` refresh. */
  rev: number
  /** Flatten form fields into page content when saving. */
  flatten: boolean
  bump: () => void
  setFlatten: (flatten: boolean) => void
}

export const useForms = create<FormState>((set) => ({
  rev: 0,
  flatten: false,
  bump: () => set((s) => ({ rev: s.rev + 1 })),
  setFlatten: (flatten) => set({ flatten })
}))
