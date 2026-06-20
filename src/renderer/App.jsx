import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Settings, FolderOpen, Music4, Terminal, ChevronRight, Home } from 'lucide-react'
import ProjectsTable from './components/ProjectsTable.jsx'
import MetadataDialog from './components/MetadataDialog.jsx'
import SettingsDialog from './components/SettingsDialog.jsx'
import DebugConsole from './components/DebugConsole.jsx'
import { log, logError, ingest } from './lib/logger.js'

function basename(p) {
  if (!p) return 'Projects'
  return p.replace(/\/+$/, '').split('/').pop() || 'Projects'
}

export default function App() {
  const [settings, setSettings] = useState(null)
  const [cwd, setCwd] = useState('')
  const [folders, setFolders] = useState([])
  const [projects, setProjects] = useState([])
  const [statusUsage, setStatusUsage] = useState({})
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)

  const loadDir = useCallback(async (rel) => {
    setLoading(true)
    try {
      const res = await window.api.list(rel || '')
      setFolders(res.folders)
      setProjects(res.projects)
      setCwd(res.relPath || '')
      log(`list "${res.relPath || '/'}": ${res.folders.length} folders, ${res.projects.length} projects`)
    } catch (e) {
      logError('list failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadUsage = useCallback(async () => {
    try {
      setStatusUsage(await window.api.statusCounts())
    } catch (e) {
      logError('statusCounts failed:', e)
    }
  }, [])

  // Logging / error capture / bridge sanity-check + debug shortcut.
  useEffect(() => {
    const onErr = (e) => logError('window.onerror:', e.message || e)
    const onRej = (e) => logError('unhandledrejection:', e.reason)
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault()
        setDebugOpen((v) => !v)
      }
    }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
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
      await loadDir('')
      await loadUsage()
    })()
  }, [loadDir, loadUsage])

  const chooseRoot = useCallback(async () => {
    try {
      log('selecting root folder…')
      const next = await window.api.selectRoot()
      setSettings(next)
      await loadDir('')
      await loadUsage()
    } catch (e) {
      logError('selectRoot failed:', e)
    }
  }, [loadDir, loadUsage])

  const saveMeta = useCallback(
    async (relPath, patch) => {
      try {
        const meta = await window.api.setProjectMeta(relPath, patch)
        setProjects((ps) => ps.map((p) => (p.relPath === relPath ? { ...p, meta } : p)))
        if (patch.status !== undefined) loadUsage()
      } catch (e) {
        logError('setProjectMeta failed:', e)
      }
    },
    [loadUsage]
  )

  const saveSettings = useCallback(
    async (patch) => {
      try {
        const { renames, deletions, ...rest } = patch
        if ((renames && Object.keys(renames).length) || (deletions && deletions.length)) {
          await window.api.applyStatusChanges({ renames: renames || {}, deletions: deletions || [] })
        }
        setSettings(await window.api.setSettings(rest))
        await loadDir(cwd)
        await loadUsage()
      } catch (e) {
        logError('setSettings failed:', e)
      }
    },
    [cwd, loadDir, loadUsage]
  )

  const openProject = useCallback((p) => window.api.openProject(p).catch((e) => logError(e)), [])
  const openExport = useCallback((p) => window.api.openExport(p).catch((e) => logError(e)), [])

  const hasRoot = settings?.root

  // Breadcrumb segments from the current relative path.
  const crumbs = useMemo(() => {
    const parts = cwd ? cwd.split('/') : []
    let acc = ''
    return parts.map((seg) => {
      acc = acc ? `${acc}/${seg}` : seg
      return { label: seg, path: acc }
    })
  }, [cwd])

  return (
    <div className="flex h-full flex-col">
      <header className="titlebar-drag flex select-none items-center gap-3 border-b border-border bg-white px-4 py-2 pl-20">
        <div className="flex items-center gap-2 font-semibold">
          <Music4 className="h-4 w-4 text-primary" />
          Ableton Song Manager
        </div>
        <div className="ml-2 flex-1 truncate text-xs text-muted-foreground">
          {settings?.root || 'No folder selected'}
        </div>
        <button
          onClick={() => loadDir(cwd)}
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

      {hasRoot && (
        <nav className="flex select-none items-center gap-1 border-b border-border bg-muted/30 px-4 py-1.5 text-xs">
          <button
            onClick={() => loadDir('')}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-muted"
          >
            <Home className="h-3.5 w-3.5" /> {basename(settings.root)}
          </button>
          {crumbs.map((c) => (
            <span key={c.path} className="inline-flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button onClick={() => loadDir(c.path)} className="rounded px-1.5 py-0.5 hover:bg-muted">
                {c.label}
              </button>
            </span>
          ))}
          <span className="ml-auto text-muted-foreground">
            {folders.length > 0 && `${folders.length} folder${folders.length === 1 ? '' : 's'} · `}
            {projects.length} project{projects.length === 1 ? '' : 's'}
          </span>
        </nav>
      )}

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
          <ProjectsTable
            folders={folders}
            projects={projects}
            statuses={settings?.statuses || []}
            onNavigate={loadDir}
            onEdit={setEditing}
            onRate={(p, v) => saveMeta(p.relPath, { rating: v })}
            onSetStatus={(p, s) => saveMeta(p.relPath, { status: s })}
            onOpenProject={openProject}
            onOpenExport={openExport}
          />
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
        statusUsage={statusUsage}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onChangeRoot={chooseRoot}
        onSave={saveSettings}
      />
    </div>
  )
}
