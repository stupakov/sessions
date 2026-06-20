import { useEffect, useRef, useState } from 'react'
import { X, Trash2, Copy, ArrowDownToLine } from 'lucide-react'
import { subscribe, getLogs, clearLogs } from '../lib/logger.js'
import { cn } from '../lib/utils.js'

function time(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

export default function DebugConsole({ open, onClose }) {
  const [, force] = useState(0)
  const [autoScroll, setAutoScroll] = useState(true)
  const bodyRef = useRef(null)

  useEffect(() => subscribe(() => force((n) => n + 1)), [])

  const logs = getLogs()

  useEffect(() => {
    if (open && autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [logs.length, open, autoScroll])

  if (!open) return null

  function copyAll() {
    const text = logs.map((l) => `${time(l.ts)} [${l.source}] ${l.level.toUpperCase()} ${l.message}`).join('\n')
    navigator.clipboard?.writeText(text)
  }

  return (
    <div className="flex h-64 flex-col border-t border-border bg-[#1e1e1e] text-gray-200">
      <div className="flex select-none items-center gap-2 border-b border-black/40 bg-[#252526] px-3 py-1.5 text-xs">
        <span className="font-semibold">Debug Console</span>
        <span className="text-gray-500">{logs.length} entries</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setAutoScroll((v) => !v)}
            title="Auto-scroll"
            className={cn('rounded p-1 hover:bg-white/10', autoScroll && 'text-emerald-400')}
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
          </button>
          <button onClick={copyAll} title="Copy all" className="rounded p-1 hover:bg-white/10">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={clearLogs} title="Clear" className="rounded p-1 hover:bg-white/10">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} title="Close" className="rounded p-1 hover:bg-white/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div ref={bodyRef} className="flex-1 overflow-auto px-3 py-1 font-mono text-[11px] leading-relaxed">
        {logs.length === 0 && <div className="py-4 text-gray-500">No logs yet.</div>}
        {logs.map((l) => (
          <div key={l.id} className="whitespace-pre-wrap break-words">
            <span className="text-gray-500">{time(l.ts)}</span>{' '}
            <span className={l.source === 'main' ? 'text-sky-400' : 'text-fuchsia-400'}>
              [{l.source}]
            </span>{' '}
            <span className={l.level === 'error' ? 'text-red-400' : 'text-gray-300'}>{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
