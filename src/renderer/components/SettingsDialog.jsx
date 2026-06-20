import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Plus, Trash2, Folder, GripVertical } from 'lucide-react'
import { statusColor } from '../lib/statusColors.js'
import { cn } from '../lib/utils.js'

function basenameApp(p) {
  if (!p) return 'System default'
  return p.split('/').pop().replace(/\.app$/, '')
}

export default function SettingsDialog({
  settings,
  statusUsage = {},
  open,
  onOpenChange,
  onChangeRoot,
  onSetApp,
  onSave
}) {
  const [wavApp, setWavApp] = useState(null)
  const [mp3App, setMp3App] = useState(null)
  const [rows, setRows] = useState([]) // { id, name, original }
  const idRef = useRef(0)
  const dragIndex = useRef(null)
  const [dragging, setDragging] = useState(null)

  useEffect(() => {
    if (settings && open) {
      setWavApp(settings.wavApp)
      setMp3App(settings.mp3App)
      setRows((settings.statuses || []).map((name) => ({ id: ++idRef.current, name, original: name })))
    }
  }, [settings, open])

  // App choices persist immediately (not on Save) so they can't be lost.
  async function pickApp(key, setter) {
    const p = await window.api.selectApp()
    if (p) {
      setter(p)
      onSetApp?.({ [key]: p })
    }
  }
  function resetApp(key, setter) {
    setter(null)
    onSetApp?.({ [key]: null })
  }

  const updateRow = (id, val) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, name: val } : r)))
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id))
  const addRow = () => setRows((rs) => [...rs, { id: ++idRef.current, name: 'New status', original: null }])

  function onDragStart(i) {
    dragIndex.current = i
    setDragging(i)
  }
  function onDragEnter(i) {
    const from = dragIndex.current
    if (from === null || from === i) return
    setRows((rs) => {
      const next = rs.slice()
      const [moved] = next.splice(from, 1)
      next.splice(i, 0, moved)
      return next
    })
    dragIndex.current = i
    setDragging(i)
  }
  function onDragEnd() {
    dragIndex.current = null
    setDragging(null)
  }

  function save() {
    const cleaned = rows.map((r) => ({ ...r, name: r.name.trim() })).filter((r) => r.name)
    const newNames = [...new Set(cleaned.map((r) => r.name))]

    const renames = {}
    for (const r of cleaned) if (r.original && r.original !== r.name) renames[r.original] = r.name

    const keptOriginals = new Set(cleaned.map((r) => r.original).filter(Boolean))
    const deletions = (settings?.statuses || []).filter((o) => !keptOriginals.has(o))

    const inUse = deletions.filter((d) => (statusUsage[d] || 0) > 0)
    if (inUse.length) {
      const lines = inUse
        .map((d) => `  • ${d} — ${statusUsage[d]} song${statusUsage[d] === 1 ? '' : 's'}`)
        .join('\n')
      const ok = window.confirm(
        `These statuses will be removed and cleared from the songs that use them:\n\n${lines}\n\nContinue?`
      )
      if (!ok) return
    }

    // wavApp/mp3App are persisted immediately on pick, so they are intentionally
    // NOT part of this Save — that prevents a status save from clobbering them.
    onSave({ statuses: newNames, renames, deletions })
    onOpenChange(false)
  }

  const orderNames = rows.map((r) => r.name)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[560px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-white p-5 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">Settings</Dialog.Title>
            <Dialog.Close className="rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="space-y-6">
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Projects folder
              </h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
                  {settings?.root || 'No folder selected'}
                </code>
                <button
                  onClick={onChangeRoot}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                >
                  <Folder className="h-3.5 w-3.5" /> Change…
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Read-only. The app never writes to this folder.
              </p>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Open exports with
              </h3>
              <div className="space-y-2">
                {[
                  ['WAV', 'wavApp', wavApp, setWavApp],
                  ['MP3', 'mp3App', mp3App, setMp3App]
                ].map(([label, key, val, setter]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-12 text-xs font-medium">{label}</span>
                    <code className="flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
                      {basenameApp(val)}
                    </code>
                    <button
                      onClick={() => pickApp(key, setter)}
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                    >
                      Choose…
                    </button>
                    <button
                      onClick={() => resetApp(key, setter)}
                      title="Use system default"
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                    >
                      Reset
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Statuses
              </h3>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Drag to reorder — the order sets the progression and each status's color.
              </p>
              <div className="space-y-1.5">
                {rows.map((r, i) => {
                  const c = statusColor(orderNames, r.name)
                  return (
                    <div
                      key={r.id}
                      draggable
                      onDragStart={() => onDragStart(i)}
                      onDragEnter={() => onDragEnter(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnd={onDragEnd}
                      className={cn(
                        'flex items-center gap-2 rounded-md border border-transparent',
                        dragging === i && 'border-border bg-muted/60'
                      )}
                    >
                      <span className="cursor-grab text-muted-foreground active:cursor-grabbing">
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <span className={cn('h-3 w-3 shrink-0 rounded-full', c.dot)} />
                      <input
                        value={r.name}
                        onChange={(e) => updateRow(r.id, e.target.value)}
                        className="flex-1 rounded-md border border-border px-2 py-1.5 text-sm"
                      />
                      {(statusUsage[r.name] || 0) > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {statusUsage[r.name]} used
                        </span>
                      )}
                      <button
                        onClick={() => removeRow(r.id)}
                        className="rounded-md border border-border p-1.5 hover:bg-muted"
                        aria-label="Remove status"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
              <button
                onClick={addRow}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" /> Add status
              </button>
            </section>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              Ableton Song Manager v{settings?.appVersion || '—'}
            </span>
            <div className="ml-auto flex gap-2">
              <Dialog.Close className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                Cancel
              </Dialog.Close>
              <button
                onClick={save}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
