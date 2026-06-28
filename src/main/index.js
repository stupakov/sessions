import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReadStream, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { app, shell, BrowserWindow, protocol, dialog } from 'electron'
import { initDb, resetDb, setSettings } from './db.js'
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

  // macOS 3-finger swipe → folder back/forward (mirrors the browser gesture). The
  // renderer owns the folder-navigation history; we just forward the direction.
  // (Requires Trackpad ▸ "Swipe between pages" set to include three fingers.)
  // Swiping left (content follows the fingers leftward) goes Back, like Finder/browsers.
  mainWindow.on('swipe', (_e, direction) => {
    if (direction === 'left') mainWindow.webContents.send('nav:swipe', 'back')
    else if (direction === 'right') mainWindow.webContents.send('nav:swipe', 'forward')
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
    // Schema-version gate (docs §3.2). An incompatible (old/newer) project_meta
    // schema can't be read by this pre-release; offer Reset/Quit before any window.
    let schema = initDb()
    if (schema === 'incompatible') {
      const choice = dialog.showMessageBoxSync({
        type: 'warning',
        buttons: ['Reset Database', 'Quit'],
        defaultId: 0,
        cancelId: 1,
        title: 'Incompatible database',
        message: 'Incompatible database.',
        detail:
          "This pre-release version uses a new data format. Your saved data — statuses, ratings, notes, and your selected library folder / app preferences — can't be read and will be cleared."
      })
      if (choice === 1) {
        app.quit()
        return
      }
      schema = resetDb() // unlink + recreate fresh; userData only (RO-safe)
      mlog('info', 'incompatible DB reset by user')
    }
    setSettings({ appVersion: app.getVersion() }) // record which version last wrote the config
    mlog('info', `app v${app.getVersion()} ready; userData=${app.getPath('userData')}`)

    // Serve local audio files to the in-app player with explicit Content-Length and
    // HTTP Range support, so the <audio> element knows the duration and can seek.
    // URL: media://local/<encoded abs path>
    protocol.handle('media', (request) => {
      const absPath = decodeURIComponent(request.url.slice('media://local/'.length))
      let size
      try {
        size = statSync(absPath).size
      } catch {
        return new Response('Not found', { status: 404 })
      }
      const type = absPath.toLowerCase().endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav'
      const rangeHeader = request.headers.get('range')
      const m = rangeHeader && /bytes=(\d*)-(\d*)/.exec(rangeHeader)
      if (m) {
        let start = m[1] ? parseInt(m[1], 10) : 0
        let end = m[2] ? parseInt(m[2], 10) : size - 1
        if (!Number.isFinite(start) || start < 0) start = 0
        if (!Number.isFinite(end) || end >= size) end = size - 1
        const stream = createReadStream(absPath, { start, end })
        return new Response(Readable.toWeb(stream), {
          status: 206,
          headers: {
            'Content-Type': type,
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Content-Length': String(end - start + 1)
          }
        })
      }
      return new Response(Readable.toWeb(createReadStream(absPath)), {
        status: 200,
        headers: {
          'Content-Type': type,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(size)
        }
      })
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
