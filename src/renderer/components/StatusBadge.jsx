import { cn } from '../lib/utils.js'
import { statusColor } from '../lib/statusColors.js'

export default function StatusBadge({ status, statuses = [] }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>
  const c = statusColor(statuses, status)
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-medium', c.bg, c.text)}>
      {status}
    </span>
  )
}
