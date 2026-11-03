import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  openDialog: () => ipcRenderer.invoke('file:open-dialog'),
  openPath: (path: string) => ipcRenderer.invoke('file:open-path', path),
  save: (path: string, data: Uint8Array) => ipcRenderer.invoke('file:save', path, data),
  saveAs: (suggested: string, data: Uint8Array) => ipcRenderer.invoke('file:save-as', suggested, data),
  saveMany: (files: { name: string; data: Uint8Array }[]) => ipcRenderer.invoke('file:save-many', files),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  /** PDFs the app was started with (double-click / "Open with"); returned once. */
  launchFiles: (): Promise<string[]> => ipcRenderer.invoke('app:launch-files'),
  /** PDFs opened from Explorer while the app is already running; returns an unsubscribe function. */
  onOpenFiles: (cb: (paths: string[]) => void): (() => void) => {
    const h = (_e: unknown, paths: string[]): void => cb(paths)
    ipcRenderer.on('app:open-files', h)
    return () => ipcRenderer.removeListener('app:open-files', h)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
