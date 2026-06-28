import { describe, it, expect } from 'vitest'
import { stemOf, alsFilesOf, overlap, isStrong, relUnder, isUnder } from '../src/main/scanner/signature.js'

// Helper: a readEntries-style file record.
const f = (name, size) => ({ name, size })

describe('alsFilesOf', () => {
  it('SIG-1: keeps only .als {stem,size}, ignores non-.als (and never sees Backup/Samples)', () => {
    const files = [
      f('Song.als', 100),
      f('Song 2.als', 200),
      f('Song.wav', 999),
      f('notes.txt', 5)
    ]
    expect(alsFilesOf(files)).toEqual([
      { stem: 'Song', size: 100 },
      { stem: 'Song 2', size: 200 }
    ])
  })

  it('SIG-11: excludes size===0 (and missing/undefined) files', () => {
    const files = [f('A.als', 0), f('B.als', undefined), f('C.als', 50)]
    expect(alsFilesOf(files)).toEqual([{ stem: 'C', size: 50 }])
  })

  it('SIG-13: stemOf parity — capture and match compute the same stem', () => {
    for (const name of ['Song.als', 'My Track 12.als', 'a.b.c.als', 'No Ext']) {
      // alsFilesOf uses stemOf internally; both must agree.
      const expected = stemOf(name)
      const got = alsFilesOf([f(name, 1)])[0]?.stem
      if (name.toLowerCase().endsWith('.als')) expect(got).toBe(expected)
    }
    expect(stemOf('Song.als')).toBe('Song')
    expect(stemOf('a.b.als')).toBe('a.b')
  })
})

describe('overlap', () => {
  const A = [{ stem: 'S', size: 1 }, { stem: 'S 2', size: 2 }, { stem: 'S 3', size: 3 }]

  it('SIG-2: identical sets', () => {
    expect(overlap(A, A)).toEqual({ exactOverlap: 3, sizeOverlap: 3 })
  })

  it('SIG-3: one renamed (stem differs, size same)', () => {
    const B = [{ stem: 'S', size: 1 }, { stem: 'RENAMED', size: 2 }, { stem: 'S 3', size: 3 }]
    expect(overlap(A, B)).toEqual({ exactOverlap: 2, sizeOverlap: 3 })
  })

  it('SIG-4: one edited (size differs) drops from both overlaps', () => {
    const B = [{ stem: 'S', size: 1 }, { stem: 'S 2', size: 999 }, { stem: 'S 3', size: 3 }]
    expect(overlap(A, B)).toEqual({ exactOverlap: 2, sizeOverlap: 2 })
  })

  it('SIG-5: extra version added on one side → overlap is the shared subset', () => {
    const B = [...A, { stem: 'S 4', size: 4 }]
    expect(overlap(A, B)).toEqual({ exactOverlap: 3, sizeOverlap: 3 })
  })

  it('SIG-6: disjoint sets', () => {
    const B = [{ stem: 'X', size: 10 }, { stem: 'Y', size: 20 }]
    expect(overlap(A, B)).toEqual({ exactOverlap: 0, sizeOverlap: 0 })
  })

  it('SIG-7: coincidental shared size, different stems', () => {
    const A1 = [{ stem: 'Alpha', size: 42 }]
    const B1 = [{ stem: 'Beta', size: 42 }]
    expect(overlap(A1, B1)).toEqual({ exactOverlap: 0, sizeOverlap: 1 })
  })

  it('SIG-9: empty sets on one/both sides → no overlap, no crash', () => {
    expect(overlap([], A)).toEqual({ exactOverlap: 0, sizeOverlap: 0 })
    expect(overlap([], [])).toEqual({ exactOverlap: 0, sizeOverlap: 0 })
  })

  it('SIG-10: duplicate sizes within a folder are not double-credited (multiset)', () => {
    const A1 = [{ stem: 'X', size: 5 }, { stem: 'Y', size: 5 }]
    const B1 = [{ stem: 'Z', size: 5 }]
    expect(overlap(A1, B1)).toEqual({ exactOverlap: 0, sizeOverlap: 1 })
    // both with two size-5 files → min(2,2) = 2
    const B2 = [{ stem: 'Z', size: 5 }, { stem: 'W', size: 5 }]
    expect(overlap(A1, B2).sizeOverlap).toBe(2)
  })

  it('SIG-12: single shared template file → exactOverlap==1 (not strong)', () => {
    const A1 = [{ stem: 'Template', size: 8 }, { stem: 'Mine 2', size: 100 }]
    const B1 = [{ stem: 'Template', size: 8 }, { stem: 'Theirs 2', size: 200 }]
    const o = overlap(A1, B1)
    expect(o.exactOverlap).toBe(1)
    expect(o.sizeOverlap).toBe(1)
    expect(isStrong(o)).toBe(false)
  })
})

describe('isStrong', () => {
  it('SIG-8: ≥2 bar on exact OR size', () => {
    expect(isStrong({ exactOverlap: 2, sizeOverlap: 0 })).toBe(true)
    expect(isStrong({ exactOverlap: 0, sizeOverlap: 2 })).toBe(true)
    expect(isStrong({ exactOverlap: 1, sizeOverlap: 1 })).toBe(false)
    expect(isStrong({ exactOverlap: 1, sizeOverlap: 0 })).toBe(false)
    expect(isStrong({ exactOverlap: 0, sizeOverlap: 1 })).toBe(false)
    expect(isStrong({ exactOverlap: 0, sizeOverlap: 0 })).toBe(false)
  })
})

describe('relUnder / isUnder', () => {
  it('derives rel_path under root and rejects out-of-scope', () => {
    expect(relUnder('/lib', '/lib/A')).toBe('A')
    expect(relUnder('/lib', '/lib/sub/A')).toBe('sub/A')
    expect(relUnder('/lib', '/lib')).toBe('')
    expect(relUnder('/lib', '/other/A')).toBe(null)
    expect(isUnder('/lib', '/lib/A')).toBe(true)
    expect(isUnder('/lib', '/other/A')).toBe(false)
  })
})
