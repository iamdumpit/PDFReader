import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

const SIX_HOURS = 6 * 60 * 60 * 1000

/**
 * Looks for a newer GitHub Release in the background, downloads it, and offers to restart.
 * Only runs in the installed app; failures (offline, no release yet) are ignored.
 */
export function startAutoUpdate(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    const win = getWindow()
    const opts = {
      type: 'info' as const,
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `PDF Reader ${info.version} is ready to install.`,
      detail: 'Restart to finish updating, or it will be installed the next time you close the app.'
    }
    void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)).then((r) => {
      if (r.response === 0) autoUpdater.quitAndInstall()
    })
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch(() => {
      /* offline or no release published yet */
    })
  }
  check()
  setInterval(check, SIX_HOURS)
}
