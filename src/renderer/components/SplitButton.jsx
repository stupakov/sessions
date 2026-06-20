import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils.js'

/**
 * A split button: a primary action plus a dropdown of alternatives.
 *
 * props:
 *  - icon: optional leading icon node
 *  - label: text on the main button
 *  - onClick: primary action
 *  - items: [{ key, label, sublabel, onSelect }]
 *  - disabled: disables the whole control
 *  - title: tooltip for the main button
 */
export default function SplitButton({ icon, label, badge, onClick, items = [], disabled, title }) {
  const hasMenu = items.length > 0
  return (
    <div className="inline-flex items-stretch">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title || label}
        className={cn(
          'inline-flex max-w-[240px] items-center gap-1.5 rounded-l-md border border-border bg-white px-2.5 py-1 text-xs font-medium',
          'hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40',
          !hasMenu && 'rounded-r-md'
        )}
      >
        {icon}
        <span className="truncate">{label}</span>
        {badge}
      </button>
      {hasMenu && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="More versions"
              className={cn(
                'inline-flex items-center rounded-r-md border border-l-0 border-border bg-white px-1',
                'hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40'
              )}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              collisionPadding={8}
              className="z-50 min-w-[200px] max-w-[360px] overflow-y-auto overflow-x-hidden rounded-md border border-border bg-white p-1 shadow-lg max-h-[min(18rem,var(--radix-dropdown-menu-content-available-height))]"
            >
              {items.map((it) => (
                <DropdownMenu.Item
                  key={it.key}
                  onSelect={it.onSelect}
                  className="flex cursor-pointer flex-col rounded px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted"
                >
                  <span className="truncate font-medium">{it.label}</span>
                  {it.sublabel && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {it.sublabel}
                    </span>
                  )}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  )
}
