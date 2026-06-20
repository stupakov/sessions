import { useMemo, useState } from 'react'
import { Play, Music, Folder, ChevronRight, ChevronUp, ChevronDown, StickyNote } from 'lucide-react'
import RowSelect from './RowSelect.jsx'
import AbletonIcon from './AbletonIcon.jsx'
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
        'shrink-0 rounded px-1 py-px text-[9px] font-bold leading-none',
        abletonColor(ableton.major)
      )}
    >
      {ableton.major}
    </span>
  )
}

// Square launch button: black icon on white, matching the dropdown border.
function SquareButton({ onClick, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-white text-black hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true }, // takes remaining width
  { key: 'status', label: 'Status', sortable: true, className: 'w-40' },
  { key: 'rating', label: 'Rating', sortable: true, className: 'w-28' },
  { key: 'notes', label: 'Notes', sortable: true, className: 'w-16' },
  { key: 'modified', label: 'Modified', sortable: true, className: 'w-44' },
  { key: 'open', label: 'Open', sortable: false, className: 'w-[17rem]' },
  { key: 'play', label: 'Play', sortable: false, className: 'w-[17rem]' }
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
  // Session-only selection per row (resets to newest on restart / fresh mount).
  const [selVer, setSelVer] = useState({})
  const [selExp, setSelExp] = useState({})

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
    <table className="w-full table-fixed border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-white">
        <tr className="select-none border-b border-border text-left text-xs text-muted-foreground">
          {COLUMNS.map((col) => (
            <th
              key={col.key}
              onClick={col.sortable ? () => toggleSort(col.key) : undefined}
              className={cn(
                'px-3 py-2 font-medium',
                col.className,
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
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="truncate">{f.name}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </span>
            </td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
              {formatDate(f.mtimeMs)}
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
              folder: {f.childCount} item{f.childCount === 1 ? '' : 's'}
            </td>
            <td className="px-3 py-2" />
          </tr>
        ))}

        {/* Projects */}
        {sorted.map((p) => {
          return (
            <tr key={p.relPath} className="border-b border-border/60 hover:bg-muted/40">
              <td className="px-3 py-2">
                <button
                  onClick={() => onEdit(p)}
                  className="block max-w-full truncate text-left font-medium hover:underline"
                  title={p.name}
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
                {(() => {
                  const cur = selVer[p.relPath] ?? p.latestVersion?.path
                  const isLatest = cur === p.latestVersion?.path
                  return (
                    <div className="flex w-full items-stretch gap-1.5">
                      <div className="min-w-0 flex-1">
                        <RowSelect
                          items={p.versions.map((v) => ({
                            key: v.path,
                            label: v.name,
                            sublabel: formatDate(v.mtimeMs)
                          }))}
                          value={cur}
                          onChange={(k) => setSelVer((s) => ({ ...s, [p.relPath]: k }))}
                          badge={isLatest ? <VersionPill ableton={p.ableton} /> : null}
                        />
                      </div>
                      <SquareButton
                        title="Open in Ableton"
                        disabled={!cur}
                        onClick={() => cur && onOpenProject(cur)}
                      >
                        <AbletonIcon className="w-[17px]" />
                      </SquareButton>
                    </div>
                  )
                })()}
              </td>
              <td className="px-3 py-2">
                {(() => {
                  const cur = selExp[p.relPath] ?? p.exports.default?.path
                  const hasExp = p.exports.all.length > 0
                  return (
                    <div className="flex w-full items-stretch gap-1.5">
                      <div className="min-w-0 flex-1">
                        <RowSelect
                          items={p.exports.all.map((e) => ({
                            key: e.path,
                            label: e.name,
                            sublabel: `${e.ext.toUpperCase()} · ${formatDate(e.mtimeMs)}`
                          }))}
                          value={cur}
                          onChange={(k) => setSelExp((s) => ({ ...s, [p.relPath]: k }))}
                          placeholder="No export"
                          disabled={!hasExp}
                        />
                      </div>
                      <SquareButton title="Play export" disabled={!cur} onClick={() => cur && onOpenExport(cur)}>
                        <Play className="h-4 w-4 fill-current" />
                      </SquareButton>
                    </div>
                  )
                })()}
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
