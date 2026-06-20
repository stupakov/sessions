import { clsx } from 'clsx'

export function cn(...args) {
  return clsx(args)
}

export function formatDate(ms) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
