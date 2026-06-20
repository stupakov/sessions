import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Plus, Trash2, Folder } from 'lucide-react'

function basenameApp(p) {
  if (!p) return 'System default'
  return p.split('/').pop().replace(/\.app$/, '')
}

export default function SettingsDialog({ settings, open, onOpenChange, onChangeRoot, onSave }) {
  const [wavApp, setWavApp] = useState(null)
  const [mp3App, setMp3App] = useState(null)
  const [statuses, setStatuses] = useState([])

  useEffect(() => {
    if (settings) {
      setWavApp(settings.wavApp)
      setMp3App(settings.mp3App)
      setStatuses(settings.statuses || [])
    }
  }, [settings, open])

  async function pickApp(setter) {
    const p = await window.api.selectApp()
    if (p) setter(p)
  }

  function updateStatus(i, val) {
    setStatuses((s) => s.map((x, idx) => (idx === i ? val : x)))
  }
  function removeStatus(i) {
    setStatuses((s) => s.filter((_, idx) => idx !== i))
  }
  function addStatus() {
    setStatuses((s) => [...s, 'New status'])
  }

  function save() {
    const cleaned = statuses.map((s) => s.trim()).filter(Boolean)
    onSave({ wavApp, mp3App, statuses: cleaned })
    onOpenChange(false)
  }

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
                  ['WAV', wavApp, setWavApp],
                  ['MP3', mp3App, setMp3App]
                ].map(([label, val, setter]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-12 text-xs font-medium">{label}</span>
                    <code className="flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
                      {basenameApp(val)}
                    </code>
                    <button
                      onClick={() => pickApp(setter)}
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                    >
                      Choose…
                    </button>
                    <button
                      onClick={() => setter(null)}
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
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Statuses
              </h3>
              <div className="space-y-1.5">
                {statuses.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={s}
                      onChange={(e) => updateStatus(i, e.target.value)}
                      className="flex-1 rounded-md border border-border px-2 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => removeStatus(i)}
                      className="rounded-md border border-border p-1.5 hover:bg-muted"
                      aria-label="Remove status"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addStatus}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" /> Add status
              </button>
            </section>
          </div>

          <div className="mt-6 flex justify-end gap-2">
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
