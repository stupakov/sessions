// Tiny in-app log bus. Both renderer-side calls and forwarded main-process entries
// land here; the Debug Console subscribes to render them.

const MAX = 1000
const listeners = new Set()
let buffer = []
let counter = 0

function fmt(x) {
  if (typeof x === 'string') return x
  if (x instanceof Error) return x.stack || x.message
  try {
    return JSON.stringify(x)
  } catch {
    return String(x)
  }
}

function add(entry) {
  const full = { id: ++counter, ...entry }
  buffer.push(full)
  if (buffer.length > MAX) buffer = buffer.slice(-MAX)
  listeners.forEach((l) => l())
  return full
}

export function log(...args) {
  return add({ ts: Date.now(), level: 'info', source: 'renderer', message: args.map(fmt).join(' ') })
}

export function logError(...args) {
  return add({ ts: Date.now(), level: 'error', source: 'renderer', message: args.map(fmt).join(' ') })
}

// Ingest a pre-built entry coming from the main process.
export function ingest(entry) {
  return add({ ts: entry.ts, level: entry.level, source: entry.source || 'main', message: entry.message })
}

export function getLogs() {
  return buffer
}

export function clearLogs() {
  buffer = []
  listeners.forEach((l) => l())
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
