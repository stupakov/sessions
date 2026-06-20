import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'
import { statusColor } from '../lib/statusColors.js'
import { cn } from '../lib/utils.js'

/**
 * Inline status picker shown in the table. Renders the current status as a colored
 * badge; the dropdown lists every configured status plus "None".
 */
export default function StatusSelect({ value, statuses, onChange }) {
  const c = value ? statusColor(statuses, value) : null
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium outline-none',
            value
              ? cn(c.bg, c.text)
              : 'border border-dashed border-border text-muted-foreground hover:bg-muted'
          )}
        >
          {value || 'Set status'}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-50 min-w-[170px] max-h-[min(18rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto rounded-md border border-border bg-white p-1 shadow-lg"
        >
          <DropdownMenu.Item
            onSelect={() => onChange(null)}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted"
          >
            <span className="h-2.5 w-2.5 rounded-full border border-border" />
            <span className="text-muted-foreground">None</span>
            {!value && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenu.Item>
          {statuses.map((s) => {
            const sc = statusColor(statuses, s)
            return (
              <DropdownMenu.Item
                key={s}
                onSelect={() => onChange(s)}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted"
              >
                <span className={cn('h-2.5 w-2.5 rounded-full', sc.dot)} />
                {s}
                {value === s && <Check className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
