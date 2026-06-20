import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Settings, FolderOpen, Music4, Terminal } from 'lucide-react'
import ProjectsTable from './components/ProjectsTable.jsx'
import MetadataDialog from './components/MetadataDialog.jsx'
import SettingsDialog from './components/SettingsDialog.jsx'
import DebugConsole from './components/DebugConsole.jsx'
import { log, logError, ingest } from './lib/logger.js'

export default function App() {
  const [settings, setSettings] = useState(null)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await window.api.scanProjects()
      setProjects(rows)
      log(`refresh: ${rows.length} projects`)
    } catch (e) {
      logError('refresh failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Wire up logging: forward main-process logs, capture errors, sanity-check the bridge.
  useEffect(() => {
    const onErr = (e) => logError('window.onerror:', e.message || e)
    const onRej = (e) => logError('unhandledrejection:', e.reason)
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault()
        setDebugOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)

    let unsub = () => {}
    if (window.api?.onDebugLog) {
      unsub = window.api.onDebugLog(ingest)
      log('app started; IPC bridge present')
    } else {
      logError('window.api is undefined — preload did not load')
    }
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRej)
      window.removeEventListener('keydown', onKey)
      unsub()
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        setSettings(await window.api.getSettings())
      } catch (e) {
        logError('getSettings failed:', e)
      }
      await refresh()
    })()
  }, [refresh])

  const chooseRoot = useCallback(async () => {
    try {
      log('selecting root folder…')
      const next = await window.api.selectRoot()
      setSettings(next)
      await refresh()
    } catch (e) {
      logError('selectRoot failed:', e)
    }
  }, [refresh])

  const saveMeta = useCallback(async (relPath, patch) => {
    try {
      const meta = await window.api.setProjectMeta(relPath, patch)
      setProjects((ps) => ps.map((p) => (p.relPath === relPath ? { ...p, meta } : p)))
    } catch (e) {
      logError('setProjectMeta failed:', e)
    }
  }, [])

  const saveSettings = useCallback(async (patch) => {
    try {
      setSettings(await window.api.setSettings(patch))
    } catch (e) {
      logError('setSettings failed:', e)
    }
  }, [])

  const openProject = useCallback((path) => window.api.openProject(path).catch((e) => logError(e)), [])
  const openExport = useCallback((path) => window.api.openExport(path).catch((e) => logError(e)), [])

  const hasRoot = settings?.root

  return (
    <div className="flex h-full flex-col">
      {/* Title / toolbar */}
      <header className="titlebar-drag flex select-none items-center gap-3 border-b border-border bg-white px-4 py-2 pl-20">
        <div className="flex items-center gap-2 font-semibold">
          <Music4 className="h-4 w-4 text-primary" />
          Ableton Song Manager
        </div>
        <div className="ml-2 flex-1 truncate text-xs text-muted-foreground">
          {settings?.root || 'No folder selected'}
        </div>
        <button
          onClick={refresh}
          disabled={!hasRoot || loading}
          className="no-drag inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="no-drag inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </button>
        <button
          onClick={() => setDebugOpen((v) => !v)}
          title="Toggle Debug Console (⌘`)"
          className={`no-drag inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted ${debugOpen ? 'bg-muted' : ''}`}
        >
          <Terminal className="h-3.5 w-3.5" />
          Debug
        </button>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-auto">
        {!hasRoot ? (
          <div className="flex h-full select-none flex-col items-center justify-center gap-4 text-center">
            <Music4 className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-lg font-medium">Choose your Ableton projects folder</p>
              <p className="text-sm text-muted-foreground">
                The app reads it only — it never writes anything back.
              </p>
            </div>
            <button
              onClick={chooseRoot}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <FolderOpen className="h-4 w-4" /> Select folder…
            </button>
          </div>
        ) : (
          <div className="px-2 py-1">
            <div className="select-none px-2 py-2 text-xs text-muted-foreground">
              {projects.length} project{projects.length === 1 ? '' : 's'}
            </div>
            <ProjectsTable
              projects={projects}
              onEdit={setEditing}
              onRate={(p, v) => saveMeta(p.relPath, { rating: v })}
              onOpenProject={openProject}
              onOpenExport={openExport}
            />
          </div>
        )}
      </main>

      <DebugConsole open={debugOpen} onClose={() => setDebugOpen(false)} />

      <MetadataDialog
        project={editing}
        statuses={settings?.statuses || []}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSave={saveMeta}
      />

      <SettingsDialog
        settings={settings}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onChangeRoot={chooseRoot}
        onSave={saveSettings}
      />
    </div>
  )
}
