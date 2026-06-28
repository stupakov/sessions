import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  list: (relPath) => ipcRenderer.invoke('fs:list', relPath),
  listAll: () => ipcRenderer.invoke('fs:listAll'),
  setProjectMeta: (relPath, patch) => ipcRenderer.invoke('meta:set', relPath, patch),
  statusCounts: () => ipcRenderer.invoke('meta:statusCounts'),
  applyStatusChanges: (changes) => ipcRenderer.invoke('meta:applyStatusChanges', changes),

  // Identity / reconciliation (docs §6).
  reconcile: () => ipcRenderer.invoke('meta:reconcile'),
  locateCandidates: (metaId) => ipcRenderer.invoke('meta:locateCandidates', metaId),
  associate: (metaId, absPath, opts) => ipcRenderer.invoke('meta:associate', metaId, absPath, opts),
  detach: (metaId) => ipcRenderer.invoke('meta:detach', metaId),

  selectRoot: () => ipcRenderer.invoke('dialog:selectRoot'),
  selectApp: () => ipcRenderer.invoke('dialog:selectApp'),

  openProject: (absPath) => ipcRenderer.invoke('open:project', absPath),
  openExport: (absPath) => ipcRenderer.invoke('open:export', absPath),
  reveal: (absPath) => ipcRenderer.invoke('reveal', absPath),

  // Build a privileged URL the in-app player can stream a local file from.
  mediaUrl: (absPath) => `media://local/${encodeURIComponent(absPath)}`,

  // Debug console: subscribe to log entries emitted by the main process.
  onDebugLog: (cb) => {
    const handler = (_e, entry) => cb(entry)
    ipcRenderer.on('debug:log', handler)
    return () => ipcRenderer.removeListener('debug:log', handler)
  },

  // macOS back/forward swipe gesture → 'back' | 'forward'. Returns an unsubscribe fn.
  onNavSwipe: (cb) => {
    const handler = (_e, dir) => cb(dir)
    ipcRenderer.on('nav:swipe', handler)
    return () => ipcRenderer.removeListener('nav:swipe', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
