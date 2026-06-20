import { useMemo, useState } from 'react'
import { Play, Music, Folder, ChevronRight, ChevronUp, ChevronDown, StickyNote } from 'lucide-react'
import SplitButton from './SplitButton.jsx'
import StarRating from './StarRating.jsx'
import StatusSelect from './StatusSelect.jsx'
import { formatDate, cn } from '../lib/utils.js'
import { abletonColor } from '../lib/statusColors.js'

function VersionPill({ ableton }) {
  if (!ableton?.major) return null
  return (
    <span
      title={`Ableton Live ${ableton.full}`}
      className={cn(
        'ml-1 shrink-0 rounded px-1 py-px text-[9px] font-bold leading-none',
        abletonColor(ableton.major)
      )}
    >
      {ableton.major}
    </span>
  )
}

const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'rating', label: 'Rating', sortable: true },
  { key: 'notes', label: 'Notes', sortable: true },
  { key: 'modified', label: 'Modified', sortable: true },
  { key: 'open', label: 'Open', sortable: false },
  { key: 'play', label: 'Play', sortable: false }
]

const hasNotes = (p) => !!(p.meta.notes && p.meta.notes.trim())

function compare(a, b, key) {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name)
    case 'status':
      return (a.meta.status || '~').localeCompare(b.meta.status || '~')
    case 'rating':
      return (a.meta.rating || 0) - (b.meta.rating || 0)
    case 'notes':
      return (hasNotes(a) ? 1 : 0) - (hasNotes(b) ? 1 : 0)
    case 'modified':
      return (a.modifiedMs || 0) - (b.modifiedMs || 0)
    default:
      return 0
  }
}

export default function ProjectsTable({
  folders,
  projects,
  statuses,
  onNavigate,
  onEdit,
  onRate,
  onSetStatus,
  onOpenProject,
  onOpenExport
}) {
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })

  const sorted = useMemo(() => {
    const arr = [...projects].sort((a, b) => compare(a, b, sort.key))
    if (sort.dir === 'desc') arr.reverse()
    return arr
  }, [projects, sort])

  function toggleSort(key) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    )
  }

  const isEmpty = folders.length === 0 && projects.length === 0

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-white">
        <tr className="select-none border-b border-border text-left text-xs text-muted-foreground">
          {COLUMNS.map((col) => (
            <th
              key={col.key}
              onClick={col.sortable ? () => toggleSort(col.key) : undefined}
              className={cn(
                'px-3 py-2 font-medium',
                col.sortable && 'cursor-pointer hover:text-foreground'
              )}
            >
              <span className="inline-flex items-center gap-1">
                {col.label}
                {sort.key === col.key &&
                  (sort.dir === 'asc' ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  ))}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {/* Folders first — always alphabetical, navigable */}
        {folders.map((f) => (
          <tr
            key={'dir:' + f.relPath}
            onClick={() => onNavigate(f.relPath)}
            className="cursor-pointer border-b border-border/60 bg-amber-50/40 hover:bg-amber-50"
          >
            <td className="px-3 py-2">
              <span className="inline-flex items-center gap-2 font-medium">
                <Folder className="h-4 w-4 text-amber-500" />
                {f.name}
                {f.childCount > 0 && (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {f.childCount} item{f.childCount === 1 ? '' : 's'}
                  </span>
                )}
              </span>
            </td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
              {formatDate(f.mtimeMs)}
            </td>
            <td className="px-3 py-2" colSpan={2}>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </td>
          </tr>
        ))}

        {/* Projects */}
        {sorted.map((p) => {
          const exp = p.exports.default
          return (
            <tr key={p.relPath} className="border-b border-border/60 hover:bg-muted/40">
              <td className="px-3 py-2">
                <button
                  onClick={() => onEdit(p)}
                  className="text-left font-medium hover:underline"
                  title="Edit notes & status"
                >
                  {p.name}
                </button>
              </td>
              <td className="px-3 py-2">
                <StatusSelect
                  value={p.meta.status}
                  statuses={statuses}
                  onChange={(s) => onSetStatus(p, s)}
                />
              </td>
              <td className="px-3 py-2">
                <StarRating value={p.meta.rating} onChange={(v) => onRate(p, v)} size={14} />
              </td>
              <td className="px-3 py-2">
                <button
                  onClick={() => onEdit(p)}
                  title={hasNotes(p) ? p.meta.notes : 'No notes — click to add'}
                  className="flex items-center"
                >
                  <StickyNote
                    className={cn(
                      'h-4 w-4',
                      hasNotes(p) ? 'text-sky-500' : 'text-gray-300 hover:text-gray-400'
                    )}
                  />
                </button>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                {formatDate(p.modifiedMs)}
              </td>
              <td className="px-3 py-2">
                <SplitButton
                  label={p.latestVersion?.name || '—'}
                  badge={<VersionPill ableton={p.ableton} />}
                  title={`Open ${p.latestVersion?.name || ''} in Ableton${p.ableton ? ` (Live ${p.ableton.full})` : ''}`}
                  onClick={() => onOpenProject(p.latestVersion.path)}
                  items={p.versions.map((v) => ({
                    key: v.path,
                    label: v.name,
                    sublabel: formatDate(v.mtimeMs),
                    onSelect: () => onOpenProject(v.path)
                  }))}
                />
              </td>
              <td className="px-3 py-2">
                <SplitButton
                  icon={<Play className="h-3.5 w-3.5" />}
                  label={exp ? exp.name : 'No export'}
                  title={exp ? `Play ${exp.name}` : 'No export found'}
                  disabled={!exp}
                  onClick={() => exp && onOpenExport(exp.path)}
                  items={p.exports.all.map((e) => ({
                    key: e.path,
                    label: e.name,
                    sublabel: `${e.ext.toUpperCase()} · ${formatDate(e.mtimeMs)}`,
                    onSelect: () => onOpenExport(e.path)
                  }))}
                />
              </td>
            </tr>
          )
        })}

        {isEmpty && (
          <tr>
            <td colSpan={COLUMNS.length} className="px-3 py-10 text-center text-muted-foreground">
              <Music className="mx-auto mb-2 h-6 w-6 opacity-40" />
              Nothing here.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
