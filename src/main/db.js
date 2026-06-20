import path from 'node:path'
import { app } from 'electron'
import Database from 'better-sqlite3'

export const DEFAULT_STATUSES = [
  'Idea',
  'Loops',
  'Arrangement',
  'Mixing',
  'Mastering',
  'Completed',
  'Released'
]

const SETTING_DEFAULTS = {
  root: null,
  wavApp: null, // absolute path to a .app, or null = system default
  mp3App: null,
  statuses: DEFAULT_STATUSES
}

let db

export function initDb(filePath) {
  const dbPath = filePath ?? path.join(app.getPath('userData'), 'songlist.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_meta (
      rel_path   TEXT PRIMARY KEY,
      status     TEXT,
      rating     INTEGER NOT NULL DEFAULT 0,
      notes      TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `)
  return db
}

// ---- settings -------------------------------------------------------------

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const stored = {}
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value)
    } catch {
      stored[r.key] = r.value
    }
  }
  return { ...SETTING_DEFAULTS, ...stored }
}

export function setSettings(patch) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) stmt.run(key, JSON.stringify(value))
  })
  tx(Object.entries(patch))
  return getSettings()
}

// ---- project metadata -----------------------------------------------------

export function getAllMeta() {
  const rows = db.prepare('SELECT * FROM project_meta').all()
  const map = {}
  for (const r of rows) {
    map[r.rel_path] = {
      status: r.status,
      rating: r.rating,
      notes: r.notes,
      updatedAt: r.updated_at
    }
  }
  return map
}

export function setProjectMeta(relPath, patch, now) {
  const current = db.prepare('SELECT * FROM project_meta WHERE rel_path = ?').get(relPath) ?? {
    status: null,
    rating: 0,
    notes: ''
  }
  const next = {
    status: patch.status !== undefined ? patch.status : current.status,
    rating: patch.rating !== undefined ? patch.rating : current.rating,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    updatedAt: now ?? Date.now()
  }
  db.prepare(
    `INSERT INTO project_meta (rel_path, status, rating, notes, updated_at)
     VALUES (@relPath, @status, @rating, @notes, @updatedAt)
     ON CONFLICT(rel_path) DO UPDATE SET
       status = @status, rating = @rating, notes = @notes, updated_at = @updatedAt`
  ).run({ relPath, ...next })
  return next
}
