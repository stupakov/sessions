import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rename, rm, cp, readdir, stat } from 'node:fs/promises'
import { readFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { readEntries } from '../src/main/scanner/index.js'
import { alsFilesOf } from '../src/main/scanner/signature.js'
import { initDb, resetDb, setSettings, setProjectMeta, getAllRows, getRow } from '../src/main/db.js'
import { reconcileLibrary, locateCandidates, associate, detach } from '../src/main/identity.js'

let dir // tmp container
let lib // music root (read-only by the app)
let dbPath

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'songint-'))
  lib = path.join(dir, 'Library')
  dbPath = path.join(dir, 'songlist.db')
  await mkdir(lib, { recursive: true })
  initDb(dbPath)
  setSettings({ root: lib })
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

// Create a project folder with .als files of given byte length (size = signature).
async function makeProject(relFolder, files) {
  const abs = path.join(lib, relFolder)
  await mkdir(abs, { recursive: true })
  for (const [name, size] of files) await writeFile(path.join(abs, name), 'x'.repeat(size))
  return abs
}

// Tag a project the way the app's meta:set does (read folder → upsert by abs_path).
async function tag(abs, patch) {
  const { files } = await readEntries(abs)
  return setProjectMeta(abs, path.basename(abs), alsFilesOf(files), patch)
}

const STRONG = [
  ['Take.als', 100],
  ['Take 2.als', 200]
]

describe('integration — metadata follows the project', () => {
  it('INT-1: rename folder → meta follows (S3)', async () => {
    const abs = await makeProject('Song Project', STRONG)
    await tag(abs, { status: 'Mixing', rating: 4 })
    const id = getAllRows()[0].id

    await rename(abs, path.join(lib, 'Renamed Project'))
    await reconcileLibrary()

    const r = getRow(id)
    expect(r.absPath).toBe(path.join(lib, 'Renamed Project'))
    expect(r).toMatchObject({ status: 'Mixing', rating: 4 })
  })

  it('INT-2: move folder to a subfolder → meta follows (S2)', async () => {
    const abs = await makeProject('Song Project', STRONG)
    await tag(abs, { status: 'Idea' })
    const id = getAllRows()[0].id

    await mkdir(path.join(lib, 'sub'))
    await rename(abs, path.join(lib, 'sub', 'Song Project'))
    await reconcileLibrary()

    expect(getRow(id).absPath).toBe(path.join(lib, 'sub', 'Song Project'))
    expect(getRow(id).status).toBe('Idea')
  })

  it('INT-3: duplicate → both carry meta, then editing one diverges (S4)', async () => {
    const abs = await makeProject('Song Project', STRONG)
    await tag(abs, { status: 'Idea', rating: 3 })

    const copyAbs = path.join(lib, 'Song Copy Project')
    await cp(abs, copyAbs, { recursive: true })
    await reconcileLibrary()

    const rows = getAllRows()
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.status === 'Idea' && r.rating === 3)).toBe(true)

    // Edit the copy → they diverge.
    await tag(copyAbs, { status: 'Released' })
    const byPath = Object.fromEntries(getAllRows().map((r) => [r.absPath, r.status]))
    expect(byPath[abs]).toBe('Idea')
    expect(byPath[copyAbs]).toBe('Released')
  })

  it('INT-4: delete → missing → recreate → auto-restored (S1)', async () => {
    const abs = await makeProject('Song Project', STRONG)
    await tag(abs, { status: 'Mixing' })
    const id = getAllRows()[0].id

    await rm(abs, { recursive: true })
    let res = await reconcileLibrary()
    expect(res.missing.map((m) => m.id)).toContain(id)

    await makeProject('Song Project', STRONG) // same path + sig
    res = await reconcileLibrary()
    expect(res.missing).toEqual([])
    expect(getRow(id).status).toBe('Mixing')
  })

  it('INT-7: save a new .als version in place → not treated as new (S5)', async () => {
    const abs = await makeProject('Song Project', STRONG)
    await tag(abs, { status: 'Idea' })
    const id = getAllRows()[0].id

    await writeFile(path.join(abs, 'Take 3.als'), 'x'.repeat(300))
    await reconcileLibrary()

    expect(getAllRows()).toHaveLength(1) // not a new project
    expect(getRow(id).alsFiles).toHaveLength(3) // signature refreshed
  })

  it('INT-6: switch root away and back → hidden then restored (S6)', async () => {
    const abs = await makeProject('Song Project', STRONG)
    await tag(abs, { status: 'Idea' })
    const id = getAllRows()[0].id

    const otherLib = path.join(dir, 'OtherLibrary')
    await mkdir(otherLib)
    setSettings({ root: otherLib })
    let res = await reconcileLibrary()
    expect(res.missing).toEqual([]) // not missing — just out of scope
    expect(res.otherLibraries.map((o) => o.id)).toContain(id)

    setSettings({ root: lib })
    res = await reconcileLibrary()
    expect(res.otherLibraries).toEqual([])
    expect(getRow(id).status).toBe('Idea') // unchanged through the round trip
  })
})

describe('integration — Locate / associate (§5)', () => {
  it('LOC-1/6: strong-overlap target associates cleanly (metadata preserved, identity recomputed)', async () => {
    const abs = await makeProject('Song Project', STRONG)
    await tag(abs, { status: 'Mixing', rating: 5, notes: 'keep' })
    const id = getAllRows()[0].id

    // Manually rename without reconciling first, so the row is "missing" and the user
    // drives Locate. (A reconcile would auto-rebind this strong match; here we exercise
    // the explicit Locate path.)
    const renamed = path.join(lib, 'Renamed Project')
    await rename(abs, renamed)

    const cands = await locateCandidates(id)
    expect(cands[0]).toMatchObject({ absPath: renamed, strong: true }) // strongest first (LOC-6)

    const res = await associate(id, renamed, { force: false })
    expect(res).toEqual({ ok: true }) // strong → no confirm needed (LOC-1)
    expect(getRow(id)).toMatchObject({ absPath: renamed, status: 'Mixing', rating: 5, notes: 'keep' })
  })

  it('INT-5 / LOC-2/3/7: delete → Locate (force weak) → detach reverts (S7)', async () => {
    const abs = await makeProject('Song Project', STRONG)
    await tag(abs, { status: 'Mixing', rating: 5, notes: 'precious' })
    const id = getAllRows()[0].id

    await rm(abs, { recursive: true })
    let res = await reconcileLibrary()
    expect(res.missing.map((m) => m.id)).toContain(id)

    // A divergent folder with no shared versions (S7).
    const diff = await makeProject('Different Project', [
      ['Other.als', 11],
      ['Other 2.als', 22]
    ])

    const cands = await locateCandidates(id)
    expect(cands.some((c) => c.absPath === diff)).toBe(true) // listed even though weak

    const weak = await associate(id, diff, { force: false })
    expect(weak).toEqual({ needsConfirm: 'weak-match' }) // LOC-2

    const forced = await associate(id, diff, { force: true })
    expect(forced).toEqual({ ok: true }) // LOC-3
    expect(getRow(id)).toMatchObject({ absPath: diff, status: 'Mixing', notes: 'precious' })

    detach(id) // LOC-7
    expect(getRow(id).absPath).toBe(abs) // back to the (now-missing) original path
  })

  it('LOC-4: target already owned by another row → blocked', async () => {
    const a = await makeProject('A Project', STRONG)
    const b = await makeProject('B Project', [
      ['Bx.als', 7],
      ['Bx 2.als', 8]
    ])
    await tag(a, { status: 'Idea' })
    await tag(b, { status: 'Idea' })
    const idA = getAllRows().find((r) => r.absPath === a).id
    const res = await associate(idA, b, { force: true })
    expect(res).toMatchObject({ blocked: 'owned-by' })
  })

  it('LOC-5: target outside the active root is rejected server-side', async () => {
    const a = await makeProject('A Project', STRONG)
    await tag(a, { status: 'Idea' })
    const id = getAllRows()[0].id
    const outside = path.join(dir, 'OutsideProject')
    await mkdir(outside)
    await writeFile(path.join(outside, 'X.als'), 'x'.repeat(10))
    const res = await associate(id, outside, { force: true })
    expect(res).toEqual({ error: 'out-of-scope' })
  })
})

describe('integration — incompatible DB reset (S8 / INT-8)', () => {
  it('detects an old-schema DB, resets, and runs clean', async () => {
    const oldPath = path.join(dir, 'old.db')
    const old = new Database(oldPath)
    old.exec('CREATE TABLE project_meta (rel_path TEXT PRIMARY KEY, status TEXT)')
    old.prepare('INSERT INTO project_meta (rel_path, status) VALUES (?, ?)').run('Song Project', 'Idea')
    old.close()

    expect(initDb(oldPath)).toBe('incompatible')
    expect(resetDb()).toBe('fresh')
    expect(getAllRows()).toEqual([])
    // Clean afterwards:
    setProjectMeta('/lib/A', 'A', [{ stem: 'A', size: 1 }], { status: 'Idea' })
    expect(getAllRows()).toHaveLength(1)
  })
})

describe('read-only invariant (RO)', () => {
  // Snapshot every entry under the music root: relpath → {mtimeMs, ino, size}.
  async function snapshot(root) {
    const out = {}
    async function walk(d) {
      for (const e of await readdir(d, { withFileTypes: true })) {
        const full = path.join(d, e.name)
        const st = await stat(full)
        out[path.relative(root, full)] = { mtimeMs: st.mtimeMs, ino: st.ino, size: st.size, dir: e.isDirectory() }
        if (e.isDirectory()) await walk(full)
      }
    }
    await walk(root)
    return out
  }

  it('RO-1: reconcile + locate + associate + reset never mutate the music folder', async () => {
    const abs = await makeProject('Song Project', STRONG)
    await makeProject('Other Project', [
      ['O.als', 5],
      ['O 2.als', 6]
    ])
    await tag(abs, { status: 'Idea' })
    const id = getAllRows()[0].id

    const before = await snapshot(lib)

    await reconcileLibrary()
    await locateCandidates(id)
    await associate(id, abs, { force: true }) // associate onto the present folder
    detach(id)
    resetDb()

    const after = await snapshot(lib)
    expect(after).toEqual(before)
  })

  it('RO-2: src/main introduces no filesystem writes against music paths', () => {
    // Match actual FS-mutating *call sites* (op directly followed by `(`), so comments
    // and SQL identifiers like `renameStmt.run(` are not false positives. Extends the
    // CLAUDE.md self-check.
    const WRITE_OPS =
      /\b(writeFile|writeFileSync|appendFile|mkdir|mkdirSync|rmdir|unlink|unlinkSync|rename|renameSync|rm|copyFile|chmod|utimes|truncate|createWriteStream|symlink)\s*\(/
    const files = []
    function collect(d) {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name)
        if (e.isDirectory()) collect(full)
        else if (e.name.endsWith('.js')) files.push(full)
      }
    }
    collect(path.resolve('src/main'))

    const offenders = []
    for (const f of files) {
      const rel = path.relative(process.cwd(), f)
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, '') // drop line comments
          if (!WRITE_OPS.test(code)) return
          // The ONLY allowed write is resetDb()'s unlink of the userData DB file.
          const allowed = rel.endsWith('main/db.js') && code.includes('unlinkSync(dbPath')
          if (!allowed) offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
        })
    }
    expect(offenders).toEqual([])
  })
})
