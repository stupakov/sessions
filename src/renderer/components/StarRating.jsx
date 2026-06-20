import { Star } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { ratingColor } from '../lib/statusColors.js'

/**
 * Interactive 1–5 star rating, color-graded by value (low = red … high = green).
 * Clicking the current top star clears to 0. Set `readOnly` for a static display.
 */
export default function StarRating({ value = 0, onChange, readOnly = false, size = 16 }) {
  const color = ratingColor(value)
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
              !readOnly && 'transition-transform hover:scale-110',
              readOnly && 'cursor-default'
            )}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            <Star width={size} height={size} className={filled ? color : 'text-gray-300'} />
          </button>
        )
      })}
    </div>
  )
}
