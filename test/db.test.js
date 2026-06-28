import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  SCHEMA_VERSION,
  checkSchema,
  initDb,
  resetDb,
  setProjectMeta,
  getAllRows,
  getRow,
  getAllMeta,
  getStatusCounts,
  getOtherLibraries,
  copyMeta,
  rebindMeta,
  markSeen,
  associateMeta,
  detachMeta,
  applyStatusChanges
} from '../src/main/db.js'

// ---- checkSchema (no file needed) -----------------------------------------

describe('checkSchema (§3.2/§3.3)', () => {
  it('VER-1: fresh DB → creates schema, stamps user_version, returns "fresh"', () => {
    const d = new Database(':memory:')
    expect(checkSchema(d)).toBe('fresh')
    expect(d.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(d.prepare("SELECT 1 FROM sqlite_master WHERE name='project_meta'").get()).toBeTruthy()
  })

  it('VER-2 / VER-7: a current DB (and an immediate re-check) → "ok", never "incompatible"', () => {
    const d = new Database(':memory:')
    expect(checkSchema(d)).toBe('fresh')
    expect(checkSchema(d)).toBe('ok') // second pass on the same handle
    expect(checkSchema(d)).toBe('ok')
  })

  it('VER-3: old rel_path schema (user_version 0) → "incompatible"', () => {
    const d = new Database(':memory:')
    d.exec('CREATE TABLE project_meta (rel_path TEXT PRIMARY KEY, status TEXT)')
    expect(d.pragma('user_version', { simple: true })).toBe(0)
    expect(checkSchema(d)).toBe('incompatible')
  })

  it('VER-4: newer DB (user_version > SCHEMA_VERSION) → "incompatible"', () => {
    const d = new Database(':memory:')
    d.exec('CREATE TABLE project_meta (id INTEGER PRIMARY KEY)')
    d.pragma(`user_version = ${SCHEMA_VERSION + 1}`)
    expect(checkSchema(d)).toBe('incompatible')
  })
})

// ---- db helpers (real temp file) ------------------------------------------

let dir
let dbPath
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'songdb-'))
  dbPath = path.join(dir, 'songlist.db')
  expect(initDb(dbPath)).toBe('fresh')
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const als = (...p) => p.map(([stem, size]) => ({ stem, size }))

describe('initDb / resetDb', () => {
  it('VER-8: initDb on a fresh file returns "fresh"; a reboot returns "ok"', () => {
    expect(initDb(dbPath)).toBe('ok') // file already created above
  })

  it('VER-5: resetDb unlinks db + WAL/SHM and recreates empty schema', () => {
    setProjectMeta('/lib/A', 'A', als(['A', 1]), { status: 'Idea' })
    expect(getAllRows()).toHaveLength(1)
    // Plant a stale -wal; resetDb must remove it (a brand-new one may reappear once
    // initDb re-enables WAL mode — what matters is no stale rows survive).
    writeFileSync(dbPath + '-wal', 'STALE')
    expect(resetDb()).toBe('fresh')
    expect(getAllRows()).toEqual([]) // old rows gone, not resurrected from stale WAL
    expect(existsSync(dbPath)).toBe(true)
  })
})

describe('setProjectMeta (§6)', () => {
  it('DB-4: creates a row; ON CONFLICT(abs_path) updates, never duplicates', () => {
    setProjectMeta('/lib/A', 'A', als(['A', 1]), { status: 'Idea', rating: 2 })
    let rows = getAllRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ absPath: '/lib/A', status: 'Idea', rating: 2 })
    setProjectMeta('/lib/A', 'A', als(['A', 1], ['A 2', 9]), { notes: 'hi' })
    rows = getAllRows()
    expect(rows).toHaveLength(1) // still one row
    expect(rows[0]).toMatchObject({ status: 'Idea', rating: 2, notes: 'hi' })
    expect(rows[0].alsFiles).toHaveLength(2) // signature refreshed
  })

  it('DB-5: empty als is stored as [] and refreshes on re-set', () => {
    setProjectMeta('/lib/Empty', 'Empty', [], { status: 'Idea' })
    expect(getAllRows()[0].alsFiles).toEqual([])
    setProjectMeta('/lib/Empty', 'Empty', als(['X', 5]), {})
    expect(getAllRows()[0].alsFiles).toEqual([{ stem: 'X', size: 5 }])
  })
})

describe('scope-aware reads (§6)', () => {
  beforeEach(() => {
    setProjectMeta('/lib/A', 'A', als(['A', 1]), { status: 'Idea' })
    setProjectMeta('/lib/sub/B', 'B', als(['B', 2]), { status: 'Mixing' })
    setProjectMeta('/other/C', 'C', als(['C', 3]), { status: 'Idea' })
  })

  it('DB-6 / ROOT-6: getAllMeta(root) keys in-scope rows by derived rel_path, excludes out-of-scope', () => {
    const m = getAllMeta('/lib')
    expect(Object.keys(m).sort()).toEqual(['A', 'sub/B'])
    expect(m['A'].status).toBe('Idea')
    expect(m['sub/B'].status).toBe('Mixing')
  })

  it('DB-7: getStatusCounts(root) counts in-scope rows only', () => {
    expect(getStatusCounts('/lib')).toEqual({ Idea: 1, Mixing: 1 })
    expect(getStatusCounts('/other')).toEqual({ Idea: 1 })
  })

  it('ROOT-3: getOtherLibraries(root) returns out-of-scope rows', () => {
    const other = getOtherLibraries('/lib')
    expect(other.map((o) => o.absPath)).toEqual(['/other/C'])
  })

  it('ROOT-4: switching root A↔B is pure re-evaluation (no DB mutation)', () => {
    const before = getAllRows()
    const a = getAllMeta('/lib')
    const b = getAllMeta('/other')
    const a2 = getAllMeta('/lib')
    expect(Object.keys(a)).toEqual(Object.keys(a2)) // A unchanged after viewing B
    expect(Object.keys(b)).toEqual(['C'])
    expect(getAllRows()).toEqual(before) // nothing written
  })

  it('ROOT-5: nested roots — one row per folder, visible under whichever root contains it', () => {
    // /lib/sub/B is visible under both /lib and /lib/sub, but is one row.
    expect(getAllMeta('/lib')['sub/B']).toBeTruthy()
    expect(getAllMeta('/lib/sub')['B']).toBeTruthy()
    expect(getAllRows().filter((r) => r.absPath === '/lib/sub/B')).toHaveLength(1)
  })
})

describe('rebind / copy / markSeen / associate / detach', () => {
  it('DB-2: rebindMeta moves identity, leaves human metadata untouched', () => {
    setProjectMeta('/lib/Old', 'Old', als(['A', 1], ['A 2', 2]), { status: 'Mixing', rating: 4, notes: 'keep' })
    const id = getAllRows()[0].id
    rebindMeta(id, { absPath: '/lib/New', folderName: 'New', alsFiles: als(['A', 1], ['A 2', 2]) })
    const r = getRow(id)
    expect(r).toMatchObject({ absPath: '/lib/New', folderName: 'New', status: 'Mixing', rating: 4, notes: 'keep' })
    expect(r.lastSeenAt).toBeGreaterThan(0)
  })

  it('DB-1: copyMeta makes a new row with same human metadata, the copy\'s identity, fresh id', () => {
    setProjectMeta('/lib/Orig', 'Orig', als(['A', 1]), { status: 'Idea', rating: 3, notes: 'n' })
    const srcId = getAllRows()[0].id
    const newId = copyMeta(srcId, { absPath: '/lib/Copy', folderName: 'Copy', alsFiles: als(['A', 1]) })
    expect(newId).not.toBe(srcId)
    const copy = getRow(Number(newId))
    expect(copy).toMatchObject({ absPath: '/lib/Copy', status: 'Idea', rating: 3, notes: 'n' })
    expect(getAllRows()).toHaveLength(2)
  })

  it('markSeen refreshes signature + last_seen without touching human metadata', () => {
    setProjectMeta('/lib/A', 'A', als(['A', 1]), { status: 'Idea' })
    const id = getAllRows()[0].id
    markSeen(id, { absPath: '/lib/A', folderName: 'A', alsFiles: als(['A', 1], ['A 2', 2]) })
    const r = getRow(id)
    expect(r.alsFiles).toHaveLength(2)
    expect(r.status).toBe('Idea')
    expect(r.lastSeenAt).toBeGreaterThan(0)
  })

  it('DB-3 / LOC-7: associateMeta then detachMeta restores prior identity', () => {
    setProjectMeta('/lib/Gone', 'Gone', als(['A', 1]), { status: 'Mixing', rating: 5, notes: 'precious' })
    const id = getAllRows()[0].id
    associateMeta(id, { absPath: '/lib/Forced', folderName: 'Forced', alsFiles: als(['Z', 99]) })
    let r = getRow(id)
    expect(r).toMatchObject({ absPath: '/lib/Forced', status: 'Mixing', rating: 5, notes: 'precious' })
    detachMeta(id)
    r = getRow(id)
    expect(r).toMatchObject({ absPath: '/lib/Gone', folderName: 'Gone' })
    expect(r.alsFiles).toEqual([{ stem: 'A', size: 1 }])
  })
})

describe('applyStatusChanges (DB-8)', () => {
  it('renames and deletes statuses across all rows', () => {
    setProjectMeta('/lib/A', 'A', als(['A', 1]), { status: 'Idea' })
    setProjectMeta('/lib/B', 'B', als(['B', 2]), { status: 'Idea' })
    setProjectMeta('/lib/C', 'C', als(['C', 3]), { status: 'Mixing' })
    applyStatusChanges({ renames: { Idea: 'Sketch' }, deletions: ['Mixing'] })
    const byPath = Object.fromEntries(getAllRows().map((r) => [r.absPath, r.status]))
    expect(byPath['/lib/A']).toBe('Sketch')
    expect(byPath['/lib/B']).toBe('Sketch')
    expect(byPath['/lib/C']).toBe(null)
  })
})
