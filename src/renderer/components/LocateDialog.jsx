import { useEffect, useState, useCallback, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, FolderSearch, Folder, ChevronRight, Home, RotateCcw, Sparkles } from 'lucide-react'

// Locate a missing project (docs §5.1): an in-app, Finder-style folder browser rooted
// at the active library — it can't escape the root and stays read-only (reuses the same
// fs:list navigation as the main view). Signature matches from locateCandidates() are
// surfaced as "suggested" badges on top. Weak/no-overlap picks require a confirm (S7);
// after a (forced) associate, one-level Undo is offered (Detach).
export default function LocateDialog({ row, open, onOpenChange, onResolved }) {
  const [cwd, setCwd] = useState('')
  const [rootName, setRootName] = useState('Library')
  const [folders, setFolders] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState(new Map()) // absPath -> { strong, exactOverlap, sizeOverlap }
  const [topSuggestion, setTopSuggestion] = useState(null) // best strong candidate (any folder)
  const [confirm, setConfirm] = useState(null) // absPath awaiting force-confirm
  const [error, setError] = useState(null)
  const [associated, setAssociated] = useState(false)

  const loadDir = useCallback(async (rel) => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.list(rel || '')
      setFolders(res.folders || [])
      setProjects(res.projects || [])
      setCwd(res.relPath || '')
      if (res.root) setRootName(res.root.replace(/\/+$/, '').split('/').pop() || 'Library')
    } catch {
      setError('Could not list that folder.')
    } finally {
      setLoading(false)
    }
  }, [])

  // On open: fetch signature suggestions once, then show the library root.
  useEffect(() => {
    if (!open || !row) return
    setConfirm(null)
    setError(null)
    setAssociated(false)
    ;(async () => {
      try {
        const cands = await window.api.locateCandidates(row.id)
        const map = new Map()
        for (const c of cands) map.set(c.absPath, c)
        setSuggestions(map)
        const strong = cands.find((c) => c.strong)
        setTopSuggestion(strong || null)
      } catch {
        setSuggestions(new Map())
        setTopSuggestion(null)
      }
    })()
    loadDir('')
  }, [open, row, loadDir])

  const crumbs = useMemo(() => {
    const parts = cwd ? cwd.split('/') : []
    let acc = ''
    return parts.map((seg) => {
      acc = acc ? `${acc}/${seg}` : seg
      return { label: seg, path: acc }
    })
  }, [cwd])

  // Strong matches float to the top of the current folder's project list.
  const sortedProjects = useMemo(() => {
    const rank = (p) => {
      const s = suggestions.get(p.absPath)
      return s?.strong ? 0 : s && (s.exactOverlap || s.sizeOverlap) ? 1 : 2
    }
    return [...projects].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  }, [projects, suggestions])

  if (!row) return null

  async function choose(absPath, force) {
    setError(null)
    const res = await window.api.associate(row.id, absPath, { force })
    if (res?.ok) {
      setAssociated(true)
      onResolved?.()
    } else if (res?.needsConfirm === 'weak-match') {
      setConfirm(absPath)
    } else if (res?.blocked === 'owned-by') {
      setError(`That folder is already tracked as “${res.byName}”.`)
    } else if (res?.error === 'out-of-scope') {
      setError('That folder is outside the current library.')
    } else if (res?.error === 'not-a-project') {
      setError('That folder is not an Ableton project.')
    } else {
      setError('Could not associate.')
    }
  }

  async function undo() {
    await window.api.detach(row.id)
    setAssociated(false)
    onResolved?.()
  }

  function Badge({ absPath }) {
    const s = suggestions.get(absPath)
    if (!s) return null
    const strong = s.strong
    const some = s.exactOverlap || s.sizeOverlap
    if (!strong && !some) return null
    return (
      <span
        className={`shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
          strong ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}
        title={`exact ${s.exactOverlap}, size ${s.sizeOverlap}`}
      >
        {strong && <Sparkles className="h-2.5 w-2.5" />}
        {strong ? 'suggested' : 'weak'}
      </span>
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[82vh] w-[680px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-white p-5 shadow-xl focus:outline-none">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
                <FolderSearch className="h-4 w-4 text-primary" /> Locate “{row.folderName}”
              </Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                Browse to the folder this project moved to. Your status, rating and notes will follow.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {associated ? (
            <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>Associated ✓</span>
              <button
                onClick={undo}
                className="inline-flex items-center gap-1 rounded border border-emerald-300 px-2 py-1 text-xs hover:bg-emerald-100"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Undo
              </button>
            </div>
          ) : (
            <>
              {/* One-click suggestion when the signature strongly matches a folder. */}
              {topSuggestion && (
                <button
                  onClick={() => choose(topSuggestion.absPath, false)}
                  className="mb-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-sm hover:bg-emerald-100"
                >
                  <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">Suggested:</span> {topSuggestion.folderName}
                  </span>
                  <span className="shrink-0 rounded bg-white px-2 py-0.5 text-xs text-emerald-700">
                    Choose
                  </span>
                </button>
              )}

              {/* Breadcrumb */}
              <div className="mb-2 flex items-center gap-1 text-xs">
                <button
                  onClick={() => loadDir('')}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-muted"
                >
                  <Home className="h-3.5 w-3.5" /> {rootName}
                </button>
                {crumbs.map((c) => (
                  <span key={c.path} className="inline-flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <button onClick={() => loadDir(c.path)} className="rounded px-1.5 py-0.5 hover:bg-muted">
                      {c.label}
                    </button>
                  </span>
                ))}
              </div>

              {/* Listing */}
              <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
                {loading ? (
                  <div className="p-4 text-sm text-muted-foreground">Loading…</div>
                ) : folders.length === 0 && projects.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">This folder is empty.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {folders.map((f) => (
                      <li key={'dir:' + f.relPath}>
                        <button
                          onClick={() => loadDir(f.relPath)}
                          className="flex w-full items-center gap-2 bg-amber-50/40 px-3 py-2 text-left hover:bg-amber-50"
                        >
                          <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {f.childCount} item{f.childCount === 1 ? '' : 's'}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                    {sortedProjects.map((p) => {
                      const isConfirm = confirm === p.absPath
                      return (
                        <li key={p.relPath} className="flex items-center gap-3 px-3 py-2">
                          <Folder className="h-4 w-4 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{p.name}</div>
                            <div className="truncate text-xs text-muted-foreground">{p.relPath}</div>
                          </div>
                          <Badge absPath={p.absPath} />
                          {isConfirm ? (
                            <button
                              onClick={() => choose(p.absPath, true)}
                              className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-100"
                              title="No shared versions with the missing project — associate anyway?"
                            >
                              Associate anyway?
                            </button>
                          ) : (
                            <button
                              onClick={() => choose(p.absPath, false)}
                              className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                            >
                              Choose this folder
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
