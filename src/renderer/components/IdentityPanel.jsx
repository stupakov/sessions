import { useState } from 'react'
import { AlertTriangle, MapPin, Library, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react'

// Surfaces the reconcile sets the per-folder list can't show (docs §5/§6):
// missing rows (reddish + Locate), ambiguous matches (pick a candidate), and a
// muted count of out-of-scope "other libraries".
export default function IdentityPanel({ missing = [], ambiguous = [], otherLibraries = [], onLocate, onResolveAmbiguous }) {
  const [showOther, setShowOther] = useState(false)
  if (!missing.length && !ambiguous.length && !otherLibraries.length) return null

  return (
    <div className="space-y-2 border-b border-border bg-amber-50/40 px-4 py-3">
      {missing.length > 0 && (
        <section>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {missing.length} missing project{missing.length === 1 ? '' : 's'}
          </div>
          <ul className="space-y-1">
            {missing.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-1.5"
              >
                <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.folderName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.absPath}
                    {m.status ? ` · ${m.status}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => onLocate(m)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs text-red-700 hover:bg-red-100"
                >
                  <MapPin className="h-3.5 w-3.5" /> Locate…
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ambiguous.length > 0 && (
        <section>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <HelpCircle className="h-3.5 w-3.5" />
            {ambiguous.length} match{ambiguous.length === 1 ? '' : 'es'} need confirming
          </div>
          <ul className="space-y-1">
            {ambiguous.map((a) => (
              <li key={a.project.absPath} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5">
                <div className="truncate text-sm font-medium">{a.project.folderName}</div>
                <div className="mb-1 truncate text-xs text-muted-foreground">
                  Could be one of these tracked projects:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {a.candidates.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onResolveAmbiguous(c.id, a.project.absPath)}
                      title={`exact ${c.exactOverlap}, size ${c.sizeOverlap}`}
                      className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs hover:bg-amber-100"
                    >
                      {c.folderName || `#${c.id}`}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {otherLibraries.length > 0 && (
        <section>
          <button
            onClick={() => setShowOther((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {showOther ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Library className="h-3.5 w-3.5" />
            {otherLibraries.length} project{otherLibraries.length === 1 ? '' : 's'} from another library
          </button>
          {showOther && (
            <ul className="mt-1 space-y-0.5 pl-6">
              {otherLibraries.map((o) => (
                <li key={o.id} className="truncate text-xs text-muted-foreground">
                  {o.folderName} <span className="opacity-60">— {o.absPath}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
