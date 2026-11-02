import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { basename, join } from 'path'

interface OpenedFile {
  path: string
  name: string
  data: Uint8Array
}

async function load(path: string): Promise<OpenedFile> {
  const buf = await readFile(path)
  return { path, name: basename(path), data: new Uint8Array(buf) }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#1e1e1e',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

ipcMain.handle('file:open-dialog', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (res.canceled || !res.filePaths.length) return []
  return Promise.all(res.filePaths.map(load))
})

ipcMain.handle('file:open-path', (_e, path: string) => load(path))

ipcMain.handle('file:save', async (_e, path: string, data: Uint8Array) => {
  await writeFile(path, data)
  return path
})

ipcMain.handle('file:save-many', async (e, files: { name: string; data: Uint8Array }[]) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a folder for the new files',
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || !res.filePaths[0]) return null
  for (const f of files) await writeFile(join(res.filePaths[0], f.name), f.data)
  return res.filePaths[0]
})

ipcMain.handle('file:save-as', async (e, suggested: string, data: Uint8Array) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const res = await dialog.showSaveDialog(win, {
    defaultPath: suggested,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (res.canceled || !res.filePath) return null
  await writeFile(res.filePath, data)
  return res.filePath
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
