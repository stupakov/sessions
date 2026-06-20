import { execFile } from 'node:child_process'
import path from 'node:path'
import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { listDir } from './scanner/index.js'
import {
  getSettings,
  setSettings,
  getAllMeta,
  setProjectMeta,
  applyStatusChanges,
  getStatusCounts
} from './db.js'
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

// Open a file with the system default app; always resolves (never hangs).
function openDefault(absPath, resolve) {
  shell
    .openPath(absPath)
    .then((res) => {
      if (res) mlog('error', `openPath("${absPath}"): ${res}`)
    })
    .catch((e) => mlog('error', `openPath threw for "${absPath}": ${e.message}`))
    .finally(() => resolve())
}

// Open a file with a specific macOS application bundle, or the system default.
function openWithApp(absPath, appPath) {
  return new Promise((resolve) => {
    if (appPath) {
      execFile('open', ['-a', appPath, absPath], (err) => {
        if (err) {
          mlog('error', `open -a "${appPath}" failed: ${err.message}; using default`)
          openDefault(absPath, resolve)
        } else resolve()
      })
    } else {
      openDefault(absPath, resolve)
    }
  })
}

async function listFolder(relPath = '') {
  const settings = getSettings()
  if (!settings.root) {
    mlog('info', 'list: no root folder set')
    return { relPath: '', root: null, folders: [], projects: [] }
  }
  const t = Date.now()
  const res = await listDir(settings.root, relPath)
  const meta = getAllMeta()
  const projects = res.projects.map((p) => ({
    ...p,
    meta: meta[p.relPath] ?? { status: null, rating: 0, notes: '', updatedAt: 0 }
  }))
  mlog(
    'info',
    `list "${relPath || '/'}": ${res.folders.length} folders, ${projects.length} projects in ${Date.now() - t}ms`
  )
  return { relPath: res.relPath, root: settings.root, folders: res.folders, projects }
}

export function registerIpc() {
  handle('settings:get', () => getSettings())
  handle('settings:set', (_e, patch) => {
    mlog('info', `settings:set ${Object.keys(patch).join(', ')}`)
    return setSettings(patch)
  })

  handle('fs:list', (_e, relPath) => listFolder(relPath || ''))

  handle('meta:set', (_e, relPath, patch) => {
    mlog('info', `meta:set ${relPath} ${JSON.stringify(patch)}`)
    return setProjectMeta(relPath, patch)
  })

  handle('meta:statusCounts', () => getStatusCounts())

  handle('meta:applyStatusChanges', (_e, changes) => {
    mlog('info', `applyStatusChanges ${JSON.stringify(changes)}`)
    applyStatusChanges(changes)
    return true
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
