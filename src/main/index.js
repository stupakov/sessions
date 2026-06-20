import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, shell, BrowserWindow } from 'electron'
import { initDb, setSettings } from './db.js'
import { registerIpc } from './ipc.js'
import { mlog } from './logger.js'

// Pin the app identity so the userData location (and thus the DB + config) is the
// SAME in dev and packaged builds, and stable across version upgrades.
// userData => ~/Library/Application Support/ableton-song-manager/
app.setName('ableton-song-manager')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    title: 'Ableton Song Manager',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// Enforce a single instance — two instances sharing one SQLite DB can clobber each
// other's settings. A second launch just focuses the existing window.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    initDb()
    setSettings({ appVersion: app.getVersion() }) // record which version last wrote the config
    mlog('info', `app v${app.getVersion()} ready; userData=${app.getPath('userData')}`)
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
