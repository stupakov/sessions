import path from 'node:path'
import { unlinkSync } from 'node:fs'
import electron from 'electron'
import Database from 'better-sqlite3'
import { relUnder } from './scanner/signature.js'

// Default-import electron so this module imports cleanly under Vitest/node (where
// `electron` resolves to a path string with no named exports). `app` is only used
// for the default userData DB path; tests always pass an explicit path.
const app = electron?.app

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
  playMode: 'internal', // 'internal' = in-app player; 'external' = open in another app
  wavApp: null, // absolute path to a .app, or null = system default
  mp3App: null,
  statuses: DEFAULT_STATUSES
}

// Bumped on every project_meta schema change. The single integer compatibility
// marker is `PRAGMA user_version`. See docs/project-identity-and-reconciliation.md §3.
export const SCHEMA_VERSION = 1

// from-version -> fn(db) that upgrades in place. Empty this release: there are no
// real users yet, so an incompatible DB is reset rather than migrated (§3.2/§3.3).
const MIGRATIONS = {}

let db
let dbPath
// One level of undo for a forced associate (Locate). In-memory is enough — undo
// is immediate and pre-release (§5.1).
const undoStash = new Map()

// ---- schema versioning ----------------------------------------------------

// Create the current project_meta table + its unique abs_path index. Only called
// from the 'fresh' branch of checkSchema (never unconditionally — see B2 in §3.2).
function createProjectMeta(database) {
  database.exec(`
    CREATE TABLE project_meta (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      abs_path     TEXT NOT NULL,
      folder_name  TEXT NOT NULL DEFAULT '',
      als_files    TEXT NOT NULL DEFAULT '[]',
      status       TEXT,
      rating       INTEGER NOT NULL DEFAULT 0,
      notes        TEXT NOT NULL DEFAULT '',
      updated_at   INTEGER NOT NULL DEFAULT 0,
      last_seen_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS project_meta_abs_path ON project_meta(abs_path);
  `)
}

/**
 * The generalized schema check (§3.3). With MIGRATIONS empty it implements the
 * §3.2 reset policy. Returns 'fresh' | 'ok' | 'migrated' | 'incompatible'.
 *
 * Must run AFTER the unconditional `settings` table is created but BEFORE anything
 * touches or creates `project_meta` (the B2 ordering trap): project_meta is created
 * ONLY in the 'fresh' branch here.
 */
export function checkSchema(database) {
  const hasTable = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='project_meta'")
    .get()
  if (!hasTable) {
    createProjectMeta(database)
    database.pragma(`user_version = ${SCHEMA_VERSION}`)
    return 'fresh'
  }
  const v = database.pragma('user_version', { simple: true })
  if (v === SCHEMA_VERSION) return 'ok'
  if (v < SCHEMA_VERSION && hasMigrationPath(v)) {
    const tx = database.transaction(() => {
      for (let from = v; from < SCHEMA_VERSION; from++) {
        MIGRATIONS[from](database)
        database.pragma(`user_version = ${from + 1}`)
      }
    })
    tx()
    return 'migrated'
  }
  // old (v=0), newer (v>SCHEMA_VERSION), or no migration path -> reset (§3.2).
  return 'incompatible'
}

function hasMigrationPath(from) {
  for (let i = from; i < SCHEMA_VERSION; i++) {
    if (typeof MIGRATIONS[i] !== 'function') return false
  }
  return true
}

/**
 * Reset an incompatible DB: close the handle, unlink songlist.db and its WAL/SHM
 * siblings, then re-init from scratch (taking the 'fresh' path). userData-only —
 * never touches the music root, so the read-only invariant holds (§3.2/§9).
 */
export function resetDb() {
  if (db) {
    db.close()
    db = null
  }
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      unlinkSync(dbPath + suffix)
    } catch {
      /* missing sibling is fine */
    }
  }
  return initDb(dbPath)
}

export function initDb(filePath) {
  dbPath = filePath ?? path.join(app.getPath('userData'), 'songlist.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  // settings is NOT version-gated — create it unconditionally, independent of the
  // project_meta schema check (§3.1).
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  return checkSchema(db) // creates project_meta only on a fresh DB; never before this
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

// ---- project metadata: row mapping ----------------------------------------

function mapRow(r) {
  if (!r) return null
  return {
    id: r.id,
    absPath: r.abs_path,
    folderName: r.folder_name,
    alsFiles: parseAls(r.als_files),
    status: r.status,
    rating: r.rating,
    notes: r.notes,
    updatedAt: r.updated_at,
    lastSeenAt: r.last_seen_at
  }
}

function parseAls(text) {
  try {
    const v = JSON.parse(text ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// All rows mapped to the camelCase shape reconcile() expects.
export function getAllRows() {
  return db.prepare('SELECT * FROM project_meta').all().map(mapRow)
}

export function getRow(id) {
  return mapRow(db.prepare('SELECT * FROM project_meta WHERE id = ?').get(id))
}

function getRowByAbsPath(absPath) {
  return mapRow(db.prepare('SELECT * FROM project_meta WHERE abs_path = ?').get(absPath))
}

// ---- project metadata: reads used by the renderer -------------------------

// How many in-scope projects currently use each status (§6). "In-scope" = abs_path
// under the active root; "present" isn't knowable at count time, so in-scope is the
// deterministic rule. If no root is given, counts all rows.
export function getStatusCounts(root) {
  const rows = db
    .prepare("SELECT abs_path, status FROM project_meta WHERE status IS NOT NULL AND status <> ''")
    .all()
  const map = {}
  for (const r of rows) {
    if (root && relUnder(root, r.abs_path) === null) continue
    map[r.status] = (map[r.status] || 0) + 1
  }
  return map
}

// In-scope rows keyed by derived rel_path = relative(root, abs_path), for the
// per-folder list merge. Out-of-scope rows are excluded (their key would be `../…`);
// the unique abs_path index guarantees two in-scope rows can't collide on a key (§6).
export function getAllMeta(root) {
  const map = {}
  if (!root) return map
  for (const r of db.prepare('SELECT * FROM project_meta').all()) {
    const rel = relUnder(root, r.abs_path)
    if (rel === null || rel === '') continue
    map[rel] = { status: r.status, rating: r.rating, notes: r.notes, updatedAt: r.updated_at }
  }
  return map
}

// Out-of-scope rows: belong to another library (§5.2). Preserved, never "missing".
export function getOtherLibraries(root) {
  return db
    .prepare('SELECT id, folder_name, abs_path FROM project_meta')
    .all()
    .filter((r) => relUnder(root, r.abs_path) === null)
    .map((r) => ({ id: r.id, folderName: r.folder_name, absPath: r.abs_path }))
}

// Detail rows (for the Missing surface) by id, preserving input order.
export function getRowDetails(ids) {
  const stmt = db.prepare(
    'SELECT id, folder_name, abs_path, status, rating, notes FROM project_meta WHERE id = ?'
  )
  const out = []
  for (const id of ids) {
    const r = stmt.get(id)
    if (r) out.push({ id: r.id, folderName: r.folder_name, absPath: r.abs_path, status: r.status, rating: r.rating, notes: r.notes })
  }
  return out
}

// ---- project metadata: writes (all SQL against our own DB) ----------------

// Propagate status renames and deletions across all stored metadata.
export function applyStatusChanges({ renames = {}, deletions = [] } = {}, now) {
  const ts = now ?? Date.now()
  const renameStmt = db.prepare('UPDATE project_meta SET status = ?, updated_at = ? WHERE status = ?')
  const delStmt = db.prepare('UPDATE project_meta SET status = NULL, updated_at = ? WHERE status = ?')
  const tx = db.transaction(() => {
    for (const [oldName, newName] of Object.entries(renames)) {
      if (oldName !== newName) renameStmt.run(newName, ts, oldName)
    }
    for (const name of deletions) delStmt.run(ts, name)
  })
  tx()
}

/**
 * Upsert a project's human metadata, keyed by absolute path (§6). Synchronous and
 * FS-free: the caller (ipc.js) resolves absPath/folderName and reads alsFiles. The
 * ON CONFLICT(abs_path) also refreshes als_files/folder_name so a freshly-tagged
 * project gets a real signature immediately (move-safe without waiting for reconcile).
 */
export function setProjectMeta(absPath, folderName, alsFiles, patch, now) {
  const current = getRowByAbsPath(absPath)
  const next = {
    status: patch.status !== undefined ? patch.status : current?.status ?? null,
    rating: patch.rating !== undefined ? patch.rating : current?.rating ?? 0,
    notes: patch.notes !== undefined ? patch.notes : current?.notes ?? '',
    updatedAt: now ?? Date.now()
  }
  db.prepare(
    `INSERT INTO project_meta (abs_path, folder_name, als_files, status, rating, notes, updated_at, last_seen_at)
     VALUES (@absPath, @folderName, @alsFiles, @status, @rating, @notes, @updatedAt, @lastSeen)
     ON CONFLICT(abs_path) DO UPDATE SET
       folder_name = @folderName, als_files = @alsFiles,
       status = @status, rating = @rating, notes = @notes, updated_at = @updatedAt`
  ).run({
    absPath,
    folderName: folderName ?? '',
    alsFiles: JSON.stringify(alsFiles ?? []),
    status: next.status,
    rating: next.rating,
    notes: next.notes,
    updatedAt: next.updatedAt,
    lastSeen: current?.lastSeenAt ?? 0
  })
  return { status: next.status, rating: next.rating, notes: next.notes, updatedAt: next.updatedAt }
}

// Path-stable row found this scan: refresh derived identity + last_seen_at (S5).
export function markSeen(rowId, project, now) {
  const ts = now ?? Date.now()
  db.prepare('UPDATE project_meta SET als_files = ?, folder_name = ?, last_seen_at = ? WHERE id = ?').run(
    JSON.stringify(project.alsFiles ?? []),
    project.folderName ?? '',
    ts,
    rowId
  )
}

// Signature-matched orphan: move identity to the new folder; human metadata untouched (S1/S2/S3).
export function rebindMeta(rowId, project, now) {
  const ts = now ?? Date.now()
  db.prepare(
    'UPDATE project_meta SET abs_path = ?, folder_name = ?, als_files = ?, last_seen_at = ? WHERE id = ?'
  ).run(project.absPath, project.folderName ?? '', JSON.stringify(project.alsFiles ?? []), ts, rowId)
}

// Copy a resolved row's human metadata onto a duplicate folder, with the copy's own
// identity (S4). Fresh id. ON CONFLICT only refreshes derived fields (never clobbers
// existing human metadata) — the duplicate target is normally a brand-new folder.
export function copyMeta(sourceRowId, project, now) {
  const src = db.prepare('SELECT * FROM project_meta WHERE id = ?').get(sourceRowId)
  if (!src) return null
  const ts = now ?? Date.now()
  const info = db
    .prepare(
      `INSERT INTO project_meta (abs_path, folder_name, als_files, status, rating, notes, updated_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(abs_path) DO UPDATE SET
         folder_name = excluded.folder_name, als_files = excluded.als_files, last_seen_at = excluded.last_seen_at`
    )
    .run(
      project.absPath,
      project.folderName ?? '',
      JSON.stringify(project.alsFiles ?? []),
      src.status,
      src.rating,
      src.notes,
      ts,
      ts
    )
  return info.lastInsertRowid
}

// Persist a reconcile() result in one transaction (§6). missing/ambiguous/newp are
// not persisted — they're derived / lazy.
export function persistReconcile(result, now) {
  const ts = now ?? Date.now()
  const tx = db.transaction(() => {
    for (const b of result.bind) markSeen(b.rowId, b.project, ts)
    for (const rb of result.rebind) rebindMeta(rb.rowId, rb.project, ts)
    for (const d of result.duplicate) copyMeta(d.sourceRowId, d.project, ts)
  })
  tx()
}

// Locate "Associate": carry human metadata onto the chosen folder and recompute the
// derived identity. Stashes the prior identity for one level of undo (§5.1).
export function associateMeta(metaId, project, now) {
  const row = db.prepare('SELECT * FROM project_meta WHERE id = ?').get(metaId)
  if (!row) return null
  undoStash.set(metaId, { abs_path: row.abs_path, folder_name: row.folder_name, als_files: row.als_files })
  const ts = now ?? Date.now()
  db.prepare(
    'UPDATE project_meta SET abs_path = ?, folder_name = ?, als_files = ?, last_seen_at = ?, updated_at = ? WHERE id = ?'
  ).run(project.absPath, project.folderName ?? '', JSON.stringify(project.alsFiles ?? []), ts, ts, metaId)
  return getRow(metaId)
}

// Undo a prior associate, restoring the stashed identity (missing again if its old
// folder is still gone).
export function detachMeta(metaId) {
  const prev = undoStash.get(metaId)
  if (!prev) return null
  db.prepare('UPDATE project_meta SET abs_path = ?, folder_name = ?, als_files = ? WHERE id = ?').run(
    prev.abs_path,
    prev.folder_name,
    prev.als_files,
    metaId
  )
  undoStash.delete(metaId)
  return getRow(metaId)
}

export function canDetach(metaId) {
  return undoStash.has(metaId)
}
