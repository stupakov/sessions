import { BrowserWindow } from 'electron'

/**
 * Log in the main process: prints to stdout AND broadcasts to every renderer so
 * the in-app Debug Console can show it.
 */
export function mlog(level, message) {
  const entry = { ts: Date.now(), level, source: 'main', message: String(message) }
  ;(level === 'error' ? console.error : console.log)(`[main] ${entry.message}`)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('debug:log', entry)
  }
  return entry
}
