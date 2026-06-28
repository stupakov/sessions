import { FolderTree, List, Star, X } from 'lucide-react'
import { statusColor } from '../lib/statusColors.js'
import { cn } from '../lib/utils.js'

// Display-mode selector (Folders ⇄ All projects) + status / rating filters.
// State is owned by App; this is a controlled component. Filters apply to whatever
// the current mode shows (the open folder, or the whole library).
export default function FilterBar({
  viewMode,
  onViewMode,
  statuses,
  selectedStatuses,
  onToggleStatus,
  minRating,
  onMinRating,
  onClear,
  count,
  total
}) {
  const filtersActive = selectedStatuses.length > 0 || minRating > 0
  const isSel = (v) => selectedStatuses.includes(v)

  return (
    <div className="flex select-none flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-white px-4 py-1.5 text-xs">
      {/* Mode toggle */}
      <div className="inline-flex overflow-hidden rounded-md border border-border">
        <button
          onClick={() => onViewMode('folder')}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1',
            viewMode === 'folder' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          )}
          title="Browse by folder"
        >
          <FolderTree className="h-3.5 w-3.5" /> Folders
        </button>
        <button
          onClick={() => onViewMode('flat')}
          className={cn(
            'inline-flex items-center gap-1 border-l border-border px-2 py-1',
            viewMode === 'flat' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          )}
          title="Flat list of every project in the library"
        >
          <List className="h-3.5 w-3.5" /> All projects
        </button>
      </div>

      <span className="text-muted-foreground">Status:</span>
      <div className="flex flex-wrap items-center gap-1">
        {statuses.map((s) => {
          const c = statusColor(statuses, s)
          const sel = isSel(s)
          return (
            <button
              key={s}
              onClick={() => onToggleStatus(s)}
              className={cn(
                'rounded-full px-2 py-0.5 font-medium ring-1 ring-inset',
                sel ? `${c.bg} ${c.text} ring-current` : 'text-muted-foreground ring-border hover:bg-muted'
              )}
            >
              {s}
            </button>
          )
        })}
        <button
          onClick={() => onToggleStatus(null)}
          className={cn(
            'rounded-full px-2 py-0.5 font-medium ring-1 ring-inset',
            isSel(null) ? 'bg-gray-200 text-gray-700 ring-current' : 'text-muted-foreground ring-border hover:bg-muted'
          )}
        >
          No status
        </button>
      </div>

      {/* Min rating */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Rating ≥</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onMinRating(minRating === n ? 0 : n)}
            title={`At least ${n} star${n === 1 ? '' : 's'}`}
            className="p-0.5"
          >
            <Star
              className={cn(
                'h-3.5 w-3.5',
                n <= minRating ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-300'
              )}
            />
          </button>
        ))}
        {minRating > 0 && <span className="text-muted-foreground">({minRating}+)</span>}
      </div>

      <div className="ml-auto flex items-center gap-2 text-muted-foreground">
        <span>
          {filtersActive ? `${count} of ${total}` : `${total}`} project{total === 1 ? '' : 's'}
        </span>
        {filtersActive && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-muted"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
    </div>
  )
}
