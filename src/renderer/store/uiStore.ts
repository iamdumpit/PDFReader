import { create } from 'zustand'

export type DialogKind = 'split' | 'merge' | 'compress' | 'protect' | 'metadata' | null

interface PasswordPrompt {
  fileName: string
  wrong: boolean
  resolve: (password: string | null) => void
}

interface UiState {
  dialog: DialogKind
  openDialog: (d: Exclude<DialogKind, null>) => void
  closeDialog: () => void

  passwordPrompt: PasswordPrompt | null
  /** Ask the user for a document password; resolves null if they cancel. */
  requestPassword: (fileName: string, wrong: boolean) => Promise<string | null>
  answerPassword: (password: string | null) => void
}

export const useUi = create<UiState>((set, get) => ({
  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),

  passwordPrompt: null,
  requestPassword: (fileName, wrong) =>
    new Promise((resolve) => set({ passwordPrompt: { fileName, wrong, resolve } })),
  answerPassword: (password) => {
    get().passwordPrompt?.resolve(password)
    set({ passwordPrompt: null })
  }
}))
