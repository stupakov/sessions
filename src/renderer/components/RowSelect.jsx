import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils.js'
import BoldDigits from './BoldDigits.jsx'

/**
 * A select-style dropdown that fills its container width. Choosing an item only
 * changes the selection (it performs no action). Pair it with a separate action
 * button. `items`: [{ key, label, sublabel }]. `value` is the selected key.
 */
export default function RowSelect({ items = [], value, onChange, badge, placeholder = '—', disabled }) {
  const selected = items.find((i) => i.key === value) || items[0]
  const label = selected ? selected.label : placeholder
  const isDisabled = disabled || items.length === 0

  const triggerClass =
    'flex h-full w-full items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs'

  if (isDisabled) {
    return (
      <div
        title={placeholder}
        className={cn(triggerClass, 'cursor-not-allowed text-muted-foreground opacity-60')}
      >
        <span className="flex-1 truncate text-left">{placeholder}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </div>
    )
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button title={label} className={cn(triggerClass, 'font-medium outline-none hover:bg-muted')}>
          <span className="flex-1 truncate text-left">
            <BoldDigits text={label} />
          </span>
          {badge}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-50 max-h-[min(18rem,var(--radix-dropdown-menu-content-available-height))] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-md border border-border bg-white p-1 shadow-lg"
        >
          {items.map((it) => (
            <DropdownMenu.Item
              key={it.key}
              title={it.label}
              onSelect={() => onChange(it.key)}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">
                  <BoldDigits text={it.label} />
                </span>
                {it.sublabel && (
                  <span className="truncate text-[11px] text-muted-foreground">{it.sublabel}</span>
                )}
              </div>
              {it.key === value && <Check className="h-3.5 w-3.5 shrink-0" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
