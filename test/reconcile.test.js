import { describe, it, expect } from 'vitest'
import { reconcile } from '../src/main/scanner/reconcile.js'

// ---- builders -------------------------------------------------------------
const sig = (...pairs) => pairs.map(([stem, size]) => ({ stem, size }))
const row = (id, absPath, alsFiles, folderName) => ({
  id,
  absPath,
  folderName: folderName ?? absPath.split('/').pop(),
  alsFiles
})
const present = (absPath, alsFiles, folderName) => ({
  absPath,
  folderName: folderName ?? absPath.split('/').pop(),
  alsFiles
})

const ROOT = '/lib'
const OG = sig(['Take', 100], ['Take 2', 200]) // a strong 2-file signature

// Normalize a reconcile result to a comparable summary (ids + absPaths only).
function summary(r) {
  return {
    bind: r.bind.map((b) => [b.rowId, b.project.absPath]).sort(),
    rebind: r.rebind.map((b) => [b.rowId, b.project.absPath]).sort(),
    duplicate: r.duplicate.map((d) => [d.sourceRowId, d.project.absPath]).sort(),
    missing: [...r.missing].sort(),
    newp: r.newp.map((p) => p.absPath).sort(),
    ambiguous: r.ambiguous.map((a) => [a.project.absPath, a.candidates.map((c) => c.rowId).sort()]).sort()
  }
}

describe('reconcile — path-first (S5)', () => {
  it('REC-1: in-place unchanged → bind', () => {
    const r = reconcile(ROOT, [present('/lib/A', OG)], [row(1, '/lib/A', OG)])
    expect(r.bind).toEqual([{ rowId: 1, project: expect.objectContaining({ absPath: '/lib/A' }) }])
    expect(r.rebind).toEqual([])
    expect(r.missing).toEqual([])
  })

  it('REC-2: new version saved at same path → bind (not new)', () => {
    const grown = sig(['Take', 100], ['Take 2', 200], ['Take 3', 300])
    const r = reconcile(ROOT, [present('/lib/A', grown)], [row(1, '/lib/A', OG)])
    expect(r.bind.map((b) => b.rowId)).toEqual([1])
    expect(r.newp).toEqual([])
  })

  it('REC-3: single .als content changed, same path → bind (path-first wins over sig)', () => {
    const r = reconcile(ROOT, [present('/lib/A', sig(['Different', 9]))], [row(1, '/lib/A', sig(['Orig', 5]))])
    expect(r.bind.map((b) => b.rowId)).toEqual([1])
    expect(r.missing).toEqual([])
  })
})

describe('reconcile — signature rebind (S1/S2/S3)', () => {
  it('REC-4: rename → rebind', () => {
    const r = reconcile(ROOT, [present('/lib/Renamed', OG)], [row(1, '/lib/Orig', OG)])
    expect(r.rebind).toEqual([{ rowId: 1, project: expect.objectContaining({ absPath: '/lib/Renamed' }) }])
    expect(r.bind).toEqual([])
  })

  it('REC-5: move to a new parent → rebind', () => {
    const r = reconcile(ROOT, [present('/lib/sub/A', OG)], [row(1, '/lib/A', OG)])
    expect(r.rebind.map((b) => b.rowId)).toEqual([1])
  })

  it('REC-6: move + add a version → rebind (≥2 old versions still overlap)', () => {
    const grown = sig(['Take', 100], ['Take 2', 200], ['Take 3', 300])
    const r = reconcile(ROOT, [present('/lib/Moved', grown)], [row(1, '/lib/Orig', OG)])
    expect(r.rebind.map((b) => b.rowId)).toEqual([1])
  })

  it('REC-7: restore — a previously-missing orphan reappears with strong overlap → rebind', () => {
    // Same as a rename: the row exists, its old path isn't present, the folder reappears.
    const r = reconcile(ROOT, [present('/lib/Back', OG)], [row(1, '/lib/Gone', OG)])
    expect(r.rebind.map((b) => b.rowId)).toEqual([1])
    expect(r.missing).toEqual([])
  })
})

describe('reconcile — duplicate (S4)', () => {
  it('REC-8: original at its path + a copy same sig → bind + duplicate(source)', () => {
    const r = reconcile(
      ROOT,
      [present('/lib/Orig', OG), present('/lib/Copy', OG)],
      [row(1, '/lib/Orig', OG)]
    )
    expect(r.bind.map((b) => b.rowId)).toEqual([1])
    expect(r.duplicate).toEqual([{ sourceRowId: 1, project: expect.objectContaining({ absPath: '/lib/Copy' }) }])
    expect(r.newp).toEqual([])
  })

  it('REC-9: duplicate then original deleted → survivor rebinds', () => {
    const r = reconcile(ROOT, [present('/lib/Copy', OG)], [row(1, '/lib/Orig', OG)])
    expect(r.rebind.map((b) => b.rowId)).toEqual([1])
    expect(r.duplicate).toEqual([])
  })

  it('REC-16: two duplicates of one original → one bind + two duplicate(source)', () => {
    const r = reconcile(
      ROOT,
      [present('/lib/Orig', OG), present('/lib/Copy1', OG), present('/lib/Copy2', OG)],
      [row(1, '/lib/Orig', OG)]
    )
    expect(r.bind.map((b) => b.rowId)).toEqual([1])
    expect(r.duplicate.map((d) => d.sourceRowId)).toEqual([1, 1])
    expect(r.duplicate.map((d) => d.project.absPath).sort()).toEqual(['/lib/Copy1', '/lib/Copy2'])
  })
})

describe('reconcile — missing / new', () => {
  it('REC-10: in-scope row, nothing matches → missing', () => {
    const r = reconcile(ROOT, [present('/lib/Other', sig(['Z', 1], ['Z 2', 2]))], [row(1, '/lib/Gone', OG)])
    expect(r.missing).toEqual([1])
  })

  it('REC-11: present overlaps nothing → newp', () => {
    const r = reconcile(ROOT, [present('/lib/New', sig(['N', 1]))], [])
    expect(r.newp.map((p) => p.absPath)).toEqual(['/lib/New'])
  })

  it('REC-17: no rows at all → everything new', () => {
    const r = reconcile(ROOT, [present('/lib/A', OG), present('/lib/B', sig(['B', 9]))], [])
    expect(r.newp.map((p) => p.absPath).sort()).toEqual(['/lib/A', '/lib/B'])
    expect(r.missing).toEqual([])
  })

  it('REC-18: no present at all → all in-scope rows missing', () => {
    const r = reconcile(ROOT, [], [row(1, '/lib/A', OG), row(2, '/lib/B', OG)])
    expect(r.missing.sort()).toEqual([1, 2])
  })
})

describe('reconcile — ambiguous', () => {
  it('REC-12: two orphans tie strongly → ambiguous with both candidates', () => {
    const r = reconcile(ROOT, [present('/lib/P', OG)], [row(1, '/lib/G1', OG), row(2, '/lib/G2', OG)])
    expect(r.rebind).toEqual([])
    expect(r.ambiguous).toHaveLength(1)
    expect(r.ambiguous[0].candidates.map((c) => c.rowId).sort()).toEqual([1, 2])
  })

  it('REC-13: single-file overlap → ambiguous (not a silent rebind)', () => {
    const r = reconcile(
      ROOT,
      [present('/lib/P', sig(['Shared', 50], ['MineOnly', 7]))],
      [row(1, '/lib/G', sig(['Shared', 50], ['TheirsOnly', 8]))]
    )
    expect(r.rebind).toEqual([])
    expect(r.ambiguous).toHaveLength(1)
    expect(r.ambiguous[0].candidates[0]).toMatchObject({ rowId: 1, exactOverlap: 1, sizeOverlap: 1 })
  })
})

describe('reconcile — precedence, scope, determinism', () => {
  it('REC-14: orphan rebind wins over duplicate; extra copy → duplicate', () => {
    const r = reconcile(
      ROOT,
      [present('/lib/R', OG), present('/lib/New', OG), present('/lib/New2', OG)],
      [row(1, '/lib/R', OG), row(2, '/lib/Gone', OG)]
    )
    expect(r.bind.map((b) => b.rowId)).toEqual([1])
    expect(r.rebind.map((b) => b.rowId)).toEqual([2]) // the orphan claimed a folder
    expect(r.duplicate).toHaveLength(1)
    expect(r.newp).toEqual([])
  })

  it('REC-15: out-of-scope rows are ignored entirely', () => {
    const r = reconcile(ROOT, [], [row(1, '/elsewhere/A', OG)])
    expect(r.missing).toEqual([])
    expect(r.bind).toEqual([])
    expect(r.ambiguous).toEqual([])
  })

  it('REC-19: move + duplicate in one scan → 1 rebind + 1 duplicate, no newp (order-independent)', () => {
    const rows = [row(1, '/lib/A', OG)]
    const a = reconcile(ROOT, [present('/lib/B', OG), present('/lib/C', OG)], rows)
    const b = reconcile(ROOT, [present('/lib/C', OG), present('/lib/B', OG)], rows)
    for (const r of [a, b]) {
      expect(r.rebind).toHaveLength(1)
      expect(r.duplicate).toHaveLength(1)
      expect(r.newp).toEqual([])
    }
    expect(summary(a)).toEqual(summary(b))
  })

  it('REC-20: determinism — shuffled input yields identical partition', () => {
    const rows = [row(1, '/lib/A', OG), row(2, '/lib/Gone', OG), row(3, '/lib/X', sig(['X', 1], ['X 2', 2]))]
    const p = [
      present('/lib/A', OG), // binds row 1
      present('/lib/Moved', OG), // rebinds row 2 (orphan)
      present('/lib/Copy', OG), // duplicate from a resolved row
      present('/lib/Brand', sig(['New', 9])) // newp
    ]
    const a = reconcile(ROOT, p, rows)
    const b = reconcile(ROOT, [...p].reverse(), [...rows].reverse())
    expect(summary(a)).toEqual(summary(b))
  })
})
