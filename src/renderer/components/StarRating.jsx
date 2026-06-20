import { Star } from 'lucide-react'
import { cn } from '../lib/utils.js'

/**
 * Interactive 1–5 star rating. Clicking the current top star clears to 0.
 * Set `readOnly` to render a static display.
 */
export default function StarRating({ value = 0, onChange, readOnly = false, size = 16 }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(value === n ? 0 : n)}
            className={cn(
              'rounded p-0.5',
              !readOnly && 'hover:scale-110 transition-transform',
              readOnly && 'cursor-default'
            )}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            <Star
              width={size}
              height={size}
              className={filled ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}
            />
          </button>
        )
      })}
    </div>
  )
}
