import { execFile } from 'node:child_process'
import path from 'node:path'
import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { findProjects } from './scanner/index.js'
import { getSettings, setSettings, getAllMeta, setProjectMeta } from './db.js'
import { mlog } from './logger.js'

// Wrap an ipcMain.handle callback with logging + error capture so failures show
// up in the in-app Debug Console instead of failing silently.
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args)
    } catch (err) {
      mlog('error', `${channel} failed: ${err?.stack || err}`)
      throw err
    }
  })
}

// Open a file with a specific macOS application bundle, or the system default.
function openWithApp(absPath, appPath) {
  return new Promise((resolve) => {
    if (appPath) {
      execFile('open', ['-a', appPath, absPath], (err) => {
        if (err) {
          mlog('error', `open -a "${appPath}" failed: ${err.message}; using default`)
          shell.openPath(absPath).then(() => resolve())
        } else resolve()
      })
    } else {
      shell.openPath(absPath).then((res) => {
        if (res) mlog('error', `openPath("${absPath}"): ${res}`)
        resolve()
      })
    }
  })
}

async function scanProjects() {
  const settings = getSettings()
  if (!settings.root) {
    mlog('info', 'scan: no root folder set')
    return []
  }
  const t = Date.now()
  const projects = await findProjects(settings.root)
  const meta = getAllMeta()
  const withExport = projects.filter((p) => p.exports.default).length
  mlog(
    'info',
    `scan: ${projects.length} projects (${withExport} with exports) in ${Date.now() - t}ms — ${settings.root}`
  )
  return projects.map((p) => ({
    ...p,
    meta: meta[p.relPath] ?? { status: null, rating: 0, notes: '', updatedAt: 0 }
  }))
}

export function registerIpc() {
  handle('settings:get', () => getSettings())
  handle('settings:set', (_e, patch) => {
    mlog('info', `settings:set ${Object.keys(patch).join(', ')}`)
    return setSettings(patch)
  })

  handle('projects:scan', () => scanProjects())

  handle('meta:set', (_e, relPath, patch) => {
    mlog('info', `meta:set ${relPath} ${JSON.stringify(patch)}`)
    return setProjectMeta(relPath, patch)
  })

  handle('dialog:selectRoot', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose your Ableton projects folder',
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths[0]) {
      mlog('info', 'selectRoot: canceled')
      return getSettings()
    }
    mlog('info', `selectRoot: ${res.filePaths[0]}`)
    return setSettings({ root: res.filePaths[0] })
  })

  handle('dialog:selectApp', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose an application',
      defaultPath: '/Applications',
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['app'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    mlog('info', `selectApp: ${res.filePaths[0]}`)
    return res.filePaths[0]
  })

  handle('open:project', (_e, absPath) => {
    mlog('info', `open project: ${absPath}`)
    return shell.openPath(absPath).then((res) => {
      if (res) mlog('error', `open project failed: ${res}`)
    })
  })

  handle('open:export', (_e, absPath) => {
    const settings = getSettings()
    const ext = path.extname(absPath).toLowerCase()
    const appPath = ext === '.mp3' ? settings.mp3App : ext === '.wav' ? settings.wavApp : null
    mlog('info', `play export: ${absPath} (${appPath || 'system default'})`)
    return openWithApp(absPath, appPath)
  })

  handle('reveal', (_e, absPath) => shell.showItemInFolder(absPath))
}
