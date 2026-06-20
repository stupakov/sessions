// Status colors are assigned by the status's position in the configured list, so a
// status keeps its color across renames (index is stable) while each status stays
// visually distinct. Full class strings are written out so Tailwind keeps them.

const PALETTE = [
  { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
  { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500' },
  { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  { bg: 'bg-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-600' },
  { bg: 'bg-rose-100', text: 'text-rose-700', dot: 'bg-rose-500' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', dot: 'bg-fuchsia-500' },
  { bg: 'bg-lime-100', text: 'text-lime-700', dot: 'bg-lime-600' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' }
]

const UNKNOWN = { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' }

export function statusColor(statuses, name) {
  if (!name) return UNKNOWN
  const i = statuses.indexOf(name)
  // Past the palette length, fall back to gray rather than silently reusing an
  // in-use color (so a collision is visually obvious).
  return i === -1 || i >= PALETTE.length ? UNKNOWN : PALETTE[i]
}

// Star rating color graded by value: low = red, high = green.
const RATING = {
  1: 'text-red-400 fill-red-400',
  2: 'text-orange-400 fill-orange-400',
  3: 'text-amber-400 fill-amber-400',
  4: 'text-lime-500 fill-lime-500',
  5: 'text-green-500 fill-green-500'
}

export function ratingColor(value) {
  return RATING[value] || 'text-amber-400 fill-amber-400'
}

// Distinct color per Ableton major version.
const ABLETON = {
  9: 'bg-stone-200 text-stone-700',
  10: 'bg-teal-100 text-teal-700',
  11: 'bg-violet-100 text-violet-700',
  12: 'bg-sky-100 text-sky-700',
  13: 'bg-rose-100 text-rose-700'
}

export function abletonColor(major) {
  return ABLETON[major] || 'bg-gray-100 text-gray-600'
}
