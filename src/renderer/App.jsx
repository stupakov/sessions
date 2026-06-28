import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RefreshCw,
  Settings,
  FolderOpen,
  Music4,
  Terminal,
  ChevronRight,
  ChevronLeft,
  Home
} from 'lucide-react'
import ProjectsTable from './components/ProjectsTable.jsx'
import MetadataDialog from './components/MetadataDialog.jsx'
import SettingsDialog from './components/SettingsDialog.jsx'
import DebugConsole from './components/DebugConsole.jsx'
import PlayerBar from './components/PlayerBar.jsx'
import IdentityPanel from './components/IdentityPanel.jsx'
import LocateDialog from './components/LocateDialog.jsx'
import FilterBar from './components/FilterBar.jsx'
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
  const [track, setTrack] = useState(null) // in-app player current file (absolute path)
  const [missing, setMissing] = useState([])
  const [ambiguous, setAmbiguous] = useState([])
  const [otherLibraries, setOtherLibraries] = useState([])
  const [locating, setLocating] = useState(null) // missing row being located
  const [viewMode, setViewMode] = useState('folder') // 'folder' (navigate) | 'flat' (whole library)
  const [allProjects, setAllProjects] = useState([]) // flat-mode: every project in the library
  const [selectedStatuses, setSelectedStatuses] = useState([]) // [] = all; null entry = "No status"
  const [minRating, setMinRating] = useState(0) // 0 = any

  // Folder-browser navigation history (for back/forward — 3-finger swipe, ⌘[ / ⌘],
  // and the toolbar arrows). `stack` is the visited cwd paths; `index` is the cursor.
  const [hist, setHist] = useState({ stack: [''], index: 0 })
  const histRef = useRef(hist)
  histRef.current = hist
  // Latest back/forward closures, so the swipe/key listeners can stay subscribe-once.
  const navActions = useRef({ back: () => {}, forward: () => {}, blocked: () => false })

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

  // Navigate to a folder and push it onto the history stack (truncating any forward
  // entries), the way a browser does. Folder clicks / breadcrumbs go through here.
  const navigate = useCallback(
    (rel) => {
      const target = rel || ''
      const h = histRef.current
      if (h.stack[h.index] !== target) {
        const stack = [...h.stack.slice(0, h.index + 1), target]
        setHist({ stack, index: stack.length - 1 })
      }
      loadDir(target)
    },
    [loadDir]
  )

  // Reset history to the root (on launch / after choosing a new root).
  const resetHistory = useCallback(() => setHist({ stack: [''], index: 0 }), [])

  const goBack = useCallback(() => {
    const h = histRef.current
    if (h.index <= 0) return
    const index = h.index - 1
    setHist({ ...h, index })
    loadDir(h.stack[index])
  }, [loadDir])

  const goForward = useCallback(() => {
    const h = histRef.current
    if (h.index >= h.stack.length - 1) return
    const index = h.index + 1
    setHist({ ...h, index })
    loadDir(h.stack[index])
  }, [loadDir])

  // Flat mode: load every project in the library (no folder navigation).
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.api.listAll()
      setAllProjects(res.projects || [])
      log(`listAll: ${res.projects?.length || 0} projects`)
    } catch (e) {
      logError('listAll failed:', e)
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

  // Switch between folder navigation and the flat whole-library list.
  const switchMode = useCallback(
    (mode) => {
      if (mode === viewMode) return
      setViewMode(mode)
      if (mode === 'flat') loadAll()
      else loadDir(cwd)
    },
    [viewMode, loadAll, loadDir, cwd]
  )

  // From the flat list, jump to a project's containing folder in folder mode.
  const jumpToFolder = useCallback(
    (relPath) => {
      setViewMode('folder')
      navigate(relPath || '')
    },
    [navigate]
  )

  const toggleStatus = useCallback((value) => {
    setSelectedStatuses((cur) => (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]))
  }, [])

  const clearFilters = useCallback(() => {
    setSelectedStatuses([])
    setMinRating(0)
  }, [])

  // Full identity reconcile pass — persists rebinds/duplicates and collects the
  // missing/ambiguous/other-library sets. Runs before list() (docs §6 sequencing).
  const reconcileNow = useCallback(async () => {
    try {
      const res = await window.api.reconcile()
      setMissing(res.missing || [])
      setAmbiguous(res.ambiguous || [])
      setOtherLibraries(res.otherLibraries || [])
      log(
        `reconcile: ${res.missing?.length || 0} missing, ${res.ambiguous?.length || 0} ambiguous, ${res.otherLibraries?.length || 0} other`
      )
    } catch (e) {
      logError('reconcile failed:', e)
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
      } else if (e.metaKey && e.key === '[') {
        // ⌘[ / ⌘] — browser-style back/forward through folder history.
        e.preventDefault()
        if (!navActions.current.blocked()) navActions.current.back()
      } else if (e.metaKey && e.key === ']') {
        e.preventDefault()
        if (!navActions.current.blocked()) navActions.current.forward()
      }
    }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    window.addEventListener('keydown', onKey)
    let unsub = () => {}
    let unsubSwipe = () => {}
    if (window.api?.onDebugLog) {
      unsub = window.api.onDebugLog(ingest)
      log('app started; IPC bridge present')
    } else {
      logError('window.api is undefined — preload did not load')
    }
    // macOS 3-finger swipe → folder back/forward (ignored while a dialog is open).
    if (window.api?.onNavSwipe) {
      unsubSwipe = window.api.onNavSwipe((dir) => {
        if (navActions.current.blocked()) return
        if (dir === 'back') navActions.current.back()
        else if (dir === 'forward') navActions.current.forward()
      })
    }
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRej)
      window.removeEventListener('keydown', onKey)
      unsub()
      unsubSwipe()
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        setSettings(await window.api.getSettings())
      } catch (e) {
        logError('getSettings failed:', e)
      }
      await reconcileNow()
      resetHistory()
      await loadDir('')
      await loadUsage()
    })()
  }, [loadDir, loadUsage, reconcileNow, resetHistory])

  const chooseRoot = useCallback(async () => {
    try {
      log('selecting root folder…')
      const next = await window.api.selectRoot()
      setSettings(next)
      await reconcileNow()
      resetHistory()
      await loadDir('')
      await loadUsage()
    } catch (e) {
      logError('selectRoot failed:', e)
    }
  }, [loadDir, loadUsage, reconcileNow, resetHistory])

  // Refresh button: re-run the reconcile sweep, then re-list the current view.
  const refresh = useCallback(async () => {
    await reconcileNow()
    if (viewMode === 'flat') await loadAll()
    else await loadDir(cwd)
    await loadUsage()
  }, [reconcileNow, loadAll, loadDir, loadUsage, cwd, viewMode])

  // After a Locate associate/detach, re-run reconcile + list so the UI reflects it.
  const afterLocate = useCallback(async () => {
    await reconcileNow()
    if (viewMode === 'flat') await loadAll()
    else await loadDir(cwd)
    await loadUsage()
  }, [reconcileNow, loadAll, loadDir, loadUsage, cwd, viewMode])

  const resolveAmbiguous = useCallback(
    async (candidateId, absPath) => {
      try {
        await window.api.associate(candidateId, absPath, { force: true })
        await afterLocate()
      } catch (e) {
        logError('resolveAmbiguous failed:', e)
      }
    },
    [afterLocate]
  )

  const saveMeta = useCallback(
    async (relPath, patch) => {
      try {
        const meta = await window.api.setProjectMeta(relPath, patch)
        const apply = (ps) => ps.map((p) => (p.relPath === relPath ? { ...p, meta } : p))
        setProjects(apply)
        setAllProjects(apply)
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

  // Persist a single setting immediately (used for WAV/MP3 app choices).
  const setAppSetting = useCallback(async (patch) => {
    try {
      setSettings(await window.api.setSettings(patch))
    } catch (e) {
      logError('setSettings (app) failed:', e)
    }
  }, [])

  const openProject = useCallback((p) => window.api.openProject(p).catch((e) => logError(e)), [])
  const playExport = useCallback(
    (p) => {
      if (settings?.playMode === 'external') {
        window.api.openExport(p).catch((e) => logError(e))
      } else {
        setTrack(p) // load into the in-app player
      }
    },
    [settings]
  )

  // Keep the swipe/key listeners pointed at the latest closures + modal state.
  navActions.current.back = goBack
  navActions.current.forward = goForward
  navActions.current.blocked = () => !!(editing || settingsOpen || locating)

  const hasRoot = settings?.root
  const canBack = hist.index > 0
  const canForward = hist.index < hist.stack.length - 1

  // Projects shown = current folder (folder mode) or whole library (flat mode), with
  // the status/rating filters applied to whichever set that is.
  const baseProjects = viewMode === 'flat' ? allProjects : projects
  const visibleProjects = useMemo(() => {
    return baseProjects.filter((p) => {
      if (minRating > 0 && (p.meta.rating || 0) < minRating) return false
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(p.meta.status || null)) return false
      return true
    })
  }, [baseProjects, minRating, selectedStatuses])

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
          Sessions
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

      {hasRoot && (
        <FilterBar
          viewMode={viewMode}
          onViewMode={switchMode}
          statuses={settings?.statuses || []}
          selectedStatuses={selectedStatuses}
          onToggleStatus={toggleStatus}
          minRating={minRating}
          onMinRating={setMinRating}
          onClear={clearFilters}
          count={visibleProjects.length}
          total={baseProjects.length}
        />
      )}

      {hasRoot && viewMode === 'folder' && (
        <nav className="flex select-none items-center gap-1 border-b border-border bg-muted/30 px-4 py-1.5 text-xs">
          <div className="mr-1 flex items-center gap-0.5">
            <button
              onClick={goBack}
              disabled={!canBack}
              title="Back (⌘[ or swipe)"
              className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goForward}
              disabled={!canForward}
              title="Forward (⌘] or swipe)"
              className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => navigate('')}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-muted"
          >
            <Home className="h-3.5 w-3.5" /> {basename(settings.root)}
          </button>
          {crumbs.map((c) => (
            <span key={c.path} className="inline-flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button onClick={() => navigate(c.path)} className="rounded px-1.5 py-0.5 hover:bg-muted">
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

      {hasRoot && (
        <IdentityPanel
          missing={missing}
          ambiguous={ambiguous}
          otherLibraries={otherLibraries}
          onLocate={setLocating}
          onResolveAmbiguous={resolveAmbiguous}
        />
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
            folders={viewMode === 'folder' ? folders : []}
            projects={visibleProjects}
            statuses={settings?.statuses || []}
            flat={viewMode === 'flat'}
            onNavigate={navigate}
            onJumpToFolder={jumpToFolder}
            onEdit={setEditing}
            onRate={(p, v) => saveMeta(p.relPath, { rating: v })}
            onSetStatus={(p, s) => saveMeta(p.relPath, { status: s })}
            onOpenProject={openProject}
            onPlay={playExport}
          />
        )}
      </main>

      <LocateDialog
        row={locating}
        open={!!locating}
        onOpenChange={(o) => !o && setLocating(null)}
        onResolved={afterLocate}
      />

      <PlayerBar track={track} onClose={() => setTrack(null)} />

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
        onSetApp={setAppSetting}
        onSave={saveSettings}
      />
    </div>
  )
}
