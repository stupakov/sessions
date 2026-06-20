import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import StarRating from './StarRating.jsx'

export default function MetadataDialog({ project, statuses, open, onOpenChange, onSave }) {
  const [status, setStatus] = useState('')
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (project) {
      setStatus(project.meta.status || '')
      setRating(project.meta.rating || 0)
      setNotes(project.meta.notes || '')
    }
  }, [project])

  if (!project) return null

  function save() {
    onSave(project.relPath, { status: status || null, rating, notes })
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[480px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-white p-5 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold">{project.name}</Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                {project.relPath}
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm"
              >
                <option value="">— None —</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Rating</label>
              <StarRating value={rating} onChange={setRating} size={22} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                placeholder="Anything you want to remember about this track…"
                className="w-full resize-y rounded-md border border-border bg-white px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
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
