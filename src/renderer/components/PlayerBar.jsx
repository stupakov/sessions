import { useEffect, useRef, useState } from 'react'
import { Play, Pause, SkipBack, Rewind, FastForward, X } from 'lucide-react'
import BoldDigits from './BoldDigits.jsx'

// Seek interval (seconds) shared by the skip buttons and the ←/→ keyboard shortcuts.
const SKIP_SECONDS = 10

function fmtTime(s) {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// In-app audio player bar. Shows only when `track` (an absolute file path) is set.
export default function PlayerBar({ track, onClose }) {
  const audioRef = useRef(null)
  const barRef = useRef(null)
  const draggingRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const src = track ? window.api.mediaUrl(track) : null

  // Load + auto-play whenever the track changes.
  useEffect(() => {
    const a = audioRef.current
    if (!a || !src) return
    setTime(0)
    setDuration(0)
    a.load()
    a.play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false))
  }, [src])

  // While the player is open: Space toggles play/pause, ←/→ seek by 10s. Ignored
  // while typing in a text field so notes/inputs keep working.
  useEffect(() => {
    if (!track) return
    const onKey = (e) => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const a = audioRef.current
      if (!a) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (a.paused) a.play()
        else a.pause()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        a.currentTime = Math.min(a.duration || Infinity, a.currentTime + SKIP_SECONDS)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        a.currentTime = Math.max(0, a.currentTime - SKIP_SECONDS)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [track])

  if (!track) return null

  const fileName = track.split('/').pop()
  const setDur = (e) => {
    const d = e.currentTarget.duration
    if (Number.isFinite(d)) setDuration(d)
  }
  const seekBy = (d) => {
    const a = audioRef.current
    if (a) a.currentTime = Math.max(0, Math.min(a.duration || Infinity, a.currentTime + d))
  }
  const restart = () => {
    const a = audioRef.current
    if (!a) return
    const wasPlaying = !a.paused
    a.currentTime = 0
    if (wasPlaying) a.play() // only resume if it was already playing
  }
  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) a.play()
    else a.pause()
  }

  // Seek by clicking / dragging the timeline.
  const seekToClientX = (clientX) => {
    const a = audioRef.current
    const bar = barRef.current
    if (!a || !bar || !Number.isFinite(a.duration) || a.duration <= 0) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    a.currentTime = ratio * a.duration
    setTime(a.currentTime)
  }
  const onPointerDown = (e) => {
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seekToClientX(e.clientX)
  }
  const onPointerMove = (e) => {
    if (draggingRef.current) seekToClientX(e.clientX)
  }
  const onPointerUp = (e) => {
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0

  return (
    <div className="flex items-center gap-3 border-t border-border bg-white px-4 py-2">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={setDur}
        onDurationChange={setDur}
      />

      <div className="flex items-center gap-1">
        <button title="Restart" onClick={restart} className="rounded-md p-1.5 text-black hover:bg-muted">
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          title={`Back ${SKIP_SECONDS}s`}
          onClick={() => seekBy(-SKIP_SECONDS)}
          className="rounded-md p-1.5 text-black hover:bg-muted"
        >
          <Rewind className="h-4 w-4" />
        </button>
        <button
          title={playing ? 'Pause' : 'Play'}
          onClick={toggle}
          className="rounded-md border border-border p-1.5 text-black hover:bg-muted"
        >
          {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
        </button>
        <button
          title={`Forward ${SKIP_SECONDS}s`}
          onClick={() => seekBy(SKIP_SECONDS)}
          className="rounded-md p-1.5 text-black hover:bg-muted"
        >
          <FastForward className="h-4 w-4" />
        </button>
      </div>

      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {fmtTime(time)}
      </span>

      {/* Timeline: click or drag the dot to transport */}
      <div
        ref={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative flex h-4 flex-1 cursor-pointer touch-none items-center"
        title="Seek"
      >
        <div className="relative h-1.5 w-full rounded-full bg-muted">
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-primary shadow"
            style={{ left: `${pct}%` }}
          />
        </div>
      </div>

      <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{fmtTime(duration)}</span>

      <span className="min-w-0 max-w-[22rem] flex-shrink truncate text-xs font-medium" title={fileName}>
        <BoldDigits text={fileName} />
      </span>

      <button title="Close player" onClick={onClose} className="rounded-md p-1.5 text-black hover:bg-muted">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
