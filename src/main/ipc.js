import { execFile } from 'node:child_process'
import path from 'node:path'
import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { findProjects } from './scanner/index.js'
import { getSettings, setSettings, getAllMeta, setProjectMeta } from './db.js'

// Open a file with a specific macOS application bundle, or the system default.
function openWithApp(absPath, appPath) {
  return new Promise((resolve) => {
    if (appPath) {
      execFile('open', ['-a', appPath, absPath], (err) => {
        if (err) shell.openPath(absPath).then(() => resolve())
        else resolve()
      })
    } else {
      shell.openPath(absPath).then(() => resolve())
    }
  })
}

async function scanProjects() {
  const settings = getSettings()
  if (!settings.root) return []
  const projects = await findProjects(settings.root)
  const meta = getAllMeta()
  return projects.map((p) => ({
    ...p,
    meta: meta[p.relPath] ?? { status: null, rating: 0, notes: '', updatedAt: 0 }
  }))
}

export function registerIpc() {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch) => setSettings(patch))

  ipcMain.handle('projects:scan', () => scanProjects())

  ipcMain.handle('meta:set', (_e, relPath, patch) => setProjectMeta(relPath, patch))

  ipcMain.handle('dialog:selectRoot', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose your Ableton projects folder',
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return getSettings()
    return setSettings({ root: res.filePaths[0] })
  })

  ipcMain.handle('dialog:selectApp', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose an application',
      defaultPath: '/Applications',
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['app'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return res.filePaths[0]
  })

  // Open an Ableton project version with the system default (Ableton Live).
  ipcMain.handle('open:project', (_e, absPath) => shell.openPath(absPath))

  // Open an export with the per-type configured app (wav/mp3), else default.
  ipcMain.handle('open:export', (_e, absPath) => {
    const settings = getSettings()
    const ext = path.extname(absPath).toLowerCase()
    const appPath = ext === '.mp3' ? settings.mp3App : ext === '.wav' ? settings.wavApp : null
    return openWithApp(absPath, appPath)
  })

  // Reveal in Finder (handy, still read-only).
  ipcMain.handle('reveal', (_e, absPath) => shell.showItemInFolder(absPath))
}
