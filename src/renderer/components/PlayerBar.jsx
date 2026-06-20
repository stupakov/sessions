import { useEffect, useRef, useState } from 'react'
import { Play, Pause, SkipBack, Rewind, FastForward, X } from 'lucide-react'
import BoldDigits from './BoldDigits.jsx'

function fmtTime(s) {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// In-app audio player bar. Shows only when `track` (an absolute file path) is set.
export default function PlayerBar({ track, onClose }) {
  const audioRef = useRef(null)
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

  if (!track) return null

  const fileName = track.split('/').pop()
  const seekBy = (d) => {
    const a = audioRef.current
    if (a) a.currentTime = Math.max(0, Math.min((a.duration || Infinity), a.currentTime + d))
  }
  const restart = () => {
    const a = audioRef.current
    if (a) {
      a.currentTime = 0
      a.play()
    }
  }
  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) a.play()
    else a.pause()
  }
  const scrub = (e) => {
    const a = audioRef.current
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration
  }

  const pct = duration ? (time / duration) * 100 : 0

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
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />

      <div className="flex items-center gap-1">
        <button title="Restart" onClick={restart} className="rounded-md p-1.5 text-black hover:bg-muted">
          <SkipBack className="h-4 w-4" />
        </button>
        <button title="Back 15s" onClick={() => seekBy(-15)} className="rounded-md p-1.5 text-black hover:bg-muted">
          <Rewind className="h-4 w-4" />
        </button>
        <button
          title={playing ? 'Pause' : 'Play'}
          onClick={toggle}
          className="rounded-md border border-border p-1.5 text-black hover:bg-muted"
        >
          {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
        </button>
        <button title="Forward 15s" onClick={() => seekBy(15)} className="rounded-md p-1.5 text-black hover:bg-muted">
          <FastForward className="h-4 w-4" />
        </button>
      </div>

      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {fmtTime(time)}
      </span>
      <div
        onClick={scrub}
        className="group relative h-1.5 flex-1 cursor-pointer rounded-full bg-muted"
        title="Seek"
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
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
