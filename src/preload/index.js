import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  scanProjects: () => ipcRenderer.invoke('projects:scan'),
  setProjectMeta: (relPath, patch) => ipcRenderer.invoke('meta:set', relPath, patch),

  selectRoot: () => ipcRenderer.invoke('dialog:selectRoot'),
  selectApp: () => ipcRenderer.invoke('dialog:selectApp'),

  openProject: (absPath) => ipcRenderer.invoke('open:project', absPath),
  openExport: (absPath) => ipcRenderer.invoke('open:export', absPath),
  reveal: (absPath) => ipcRenderer.invoke('reveal', absPath),

  // Debug console: subscribe to log entries emitted by the main process.
  onDebugLog: (cb) => {
    const handler = (_e, entry) => cb(entry)
    ipcRenderer.on('debug:log', handler)
    return () => ipcRenderer.removeListener('debug:log', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
