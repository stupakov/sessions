import { useMemo, useState } from 'react'
import { Play, Music, ChevronUp, ChevronDown } from 'lucide-react'
import SplitButton from './SplitButton.jsx'
import StarRating from './StarRating.jsx'
import StatusBadge from './StatusBadge.jsx'
import { formatDate, cn } from '../lib/utils.js'

const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'rating', label: 'Rating', sortable: true },
  { key: 'modified', label: 'Modified', sortable: true },
  { key: 'open', label: 'Open', sortable: false },
  { key: 'play', label: 'Play', sortable: false }
]

function compare(a, b, key) {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name)
    case 'status':
      return (a.meta.status || '~').localeCompare(b.meta.status || '~')
    case 'rating':
      return (a.meta.rating || 0) - (b.meta.rating || 0)
    case 'modified':
      return (a.modifiedMs || 0) - (b.modifiedMs || 0)
    default:
      return 0
  }
}

export default function ProjectsTable({ projects, onEdit, onRate, onOpenProject, onOpenExport }) {
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

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-white">
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          {COLUMNS.map((col) => (
            <th
              key={col.key}
              onClick={col.sortable ? () => toggleSort(col.key) : undefined}
              className={cn(
                'px-3 py-2 font-medium',
                col.sortable && 'cursor-pointer select-none hover:text-foreground'
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
                <StatusBadge status={p.meta.status} />
              </td>
              <td className="px-3 py-2">
                <StarRating value={p.meta.rating} onChange={(v) => onRate(p, v)} size={14} />
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                {formatDate(p.modifiedMs)}
              </td>
              <td className="px-3 py-2">
                <SplitButton
                  label={p.latestVersion?.name || '—'}
                  title={`Open ${p.latestVersion?.name || ''} in Ableton`}
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
        {sorted.length === 0 && (
          <tr>
            <td colSpan={COLUMNS.length} className="px-3 py-10 text-center text-muted-foreground">
              <Music className="mx-auto mb-2 h-6 w-6 opacity-40" />
              No projects found in this folder.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
