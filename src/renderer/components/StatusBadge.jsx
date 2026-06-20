import { cn } from '../lib/utils.js'

const COLORS = {
  Idea: 'bg-slate-100 text-slate-700',
  Loops: 'bg-purple-100 text-purple-700',
  Arrangement: 'bg-blue-100 text-blue-700',
  Mixing: 'bg-amber-100 text-amber-700',
  Mastering: 'bg-orange-100 text-orange-700',
  Completed: 'bg-green-100 text-green-700',
  Released: 'bg-emerald-200 text-emerald-800'
}

export default function StatusBadge({ status }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium',
        COLORS[status] || 'bg-gray-100 text-gray-700'
      )}
    >
      {status}
    </span>
  )
}
