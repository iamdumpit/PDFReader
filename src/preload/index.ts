import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  openDialog: () => ipcRenderer.invoke('file:open-dialog'),
  openPath: (path: string) => ipcRenderer.invoke('file:open-path', path),
  save: (path: string, data: Uint8Array) => ipcRenderer.invoke('file:save', path, data),
  saveAs: (suggested: string, data: Uint8Array) => ipcRenderer.invoke('file:save-as', suggested, data),
  saveMany: (files: { name: string; data: Uint8Array }[]) => ipcRenderer.invoke('file:save-many', files),
  pathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
