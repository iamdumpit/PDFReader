import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { startAutoUpdate } from './updater'

interface OpenedFile {
  path: string
  name: string
  data: Uint8Array
}

async function load(path: string): Promise<OpenedFile> {
  const buf = await readFile(path)
  return { path, name: basename(path), data: new Uint8Array(buf) }
}

/** PDF paths from a command line (Explorer "Open with" / double-click passes the file as an argument). */
function pdfArgs(argv: string[]): string[] {
  return argv.slice(1).filter((a) => extname(a).toLowerCase() === '.pdf' && existsSync(a))
}

// files requested before the window finished loading; the renderer collects them on start
let launchFiles = pdfArgs(process.argv)
let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#1e1e1e',
    icon: join(__dirname, '../../build/icon.png'),
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
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
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

ipcMain.handle('app:launch-files', () => {
  const files = launchFiles
  launchFiles = []
  return files
})

// one window: opening another PDF while the app runs adds it as a tab
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const files = pdfArgs(argv)
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    if (files.length) mainWindow.webContents.send('app:open-files', files)
  })
}

app.whenReady().then(() => {
  createWindow()
  startAutoUpdate(() => mainWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
