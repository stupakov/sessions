import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, shell, BrowserWindow, protocol, net } from 'electron'
import { initDb, setSettings } from './db.js'
import { registerIpc } from './ipc.js'
import { buildAppMenu } from './menu.js'
import { mlog } from './logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Display name (dock / menu / About in packaged builds). Note: in `npm run dev`
// the menu bar still shows "Electron" because that's the running bundle's name;
// the packaged Sessions.app shows "Sessions" correctly.
app.setName('Sessions')
app.setAboutPanelOptions({ applicationName: 'Sessions', applicationVersion: app.getVersion() })
// Pin the data dir to a stable internal id so renaming the app never moves the
// DB/config and it survives upgrades. userData =>
// ~/Library/Application Support/ableton-song-manager/
app.setPath('userData', path.join(app.getPath('appData'), 'ableton-song-manager'))

// Privileged scheme for streaming local audio into the renderer's in-app player —
// seekable (HTTP Range), no full-file read, no weakening of webSecurity/CSP.
// Must be registered before app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: false }
  }
])

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    title: 'Sessions',
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

    // Serve local audio files to the in-app player. URL: media://local/<encoded abs path>
    protocol.handle('media', (request) => {
      const encoded = request.url.slice('media://local/'.length)
      const absPath = decodeURIComponent(encoded)
      return net.fetch(pathToFileURL(absPath).toString())
    })
    // In dev the dock shows the Electron icon; set ours from the PNG.
    if (process.platform === 'darwin' && !app.isPackaged && app.dock) {
      try {
        app.dock.setIcon(path.join(__dirname, '../../build/icon.png'))
      } catch (e) {
        mlog('error', `dock.setIcon failed: ${e.message}`)
      }
    }
    registerIpc()
    buildAppMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
