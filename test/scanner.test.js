import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, utimes, rm } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import {
  findProjects,
  listDir,
  pickVersions,
  pickExports,
  buildProject,
  parseAbletonVersion,
  readAlsVersion
} from '../src/main/scanner/index.js'

let root

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'songs-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

// Create a file with a specific mtime (seconds since epoch) for deterministic ordering.
async function touch(filePath, mtimeSec) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, '')
  if (mtimeSec != null) await utimes(filePath, mtimeSec, mtimeSec)
}

describe('pickVersions', () => {
  it('returns .als files newest-first with stems', () => {
    const files = [
      { name: 'Song.als', path: '/p/Song.als', mtimeMs: 100 },
      { name: 'Song 2.als', path: '/p/Song 2.als', mtimeMs: 300 },
      { name: 'Song 3.als', path: '/p/Song 3.als', mtimeMs: 200 },
      { name: 'notes.txt', path: '/p/notes.txt', mtimeMs: 999 }
    ]
    const v = pickVersions(files)
    expect(v.map((x) => x.name)).toEqual(['Song 2.als', 'Song 3.als', 'Song.als'])
    expect(v[0].stem).toBe('Song 2')
  })
})

describe('pickExports', () => {
  const stems = ['Song', 'Song 2', 'Song 3']

  it('prefers wav over mp3 for the default', () => {
    const files = [
      { name: 'Song.wav', path: '/p/Song.wav', mtimeMs: 100 },
      { name: 'Song.mp3', path: '/p/Song.mp3', mtimeMs: 500 }
    ]
    const { default: def, all } = pickExports(files, stems)
    expect(def.name).toBe('Song.wav')
    expect(all).toHaveLength(2)
  })

  it('falls back to mp3 when no wav exists', () => {
    const files = [{ name: 'Song.mp3', path: '/p/Song.mp3', mtimeMs: 100 }]
    expect(pickExports(files, stems).default.name).toBe('Song.mp3')
  })

  it('returns null default when no exports', () => {
    const files = [{ name: 'Song.als', path: '/p/Song.als', mtimeMs: 100 }]
    expect(pickExports(files, stems).default).toBeNull()
  })

  it('uses newest wav as default', () => {
    const files = [
      { name: 'Song.wav', path: '/p/Song.wav', mtimeMs: 100 },
      { name: 'Song 3.wav', path: '/p/Song 3.wav', mtimeMs: 400 }
    ]
    expect(pickExports(files, stems).default.name).toBe('Song 3.wav')
  })

  it('excludes audio whose stem does not match a version/project', () => {
    const files = [
      { name: 'Song stems.wav', path: '/p/Song stems.wav', mtimeMs: 100 },
      { name: 'random.wav', path: '/p/random.wav', mtimeMs: 200 }
    ]
    const { default: def, all } = pickExports(files, stems)
    expect(def).toBeNull()
    expect(all).toHaveLength(0)
  })

  it('is case-insensitive on extension', () => {
    const files = [{ name: 'Song.WAV', path: '/p/Song.WAV', mtimeMs: 100 }]
    expect(pickExports(files, stems).default.name).toBe('Song.WAV')
  })

  it('lists all exports newest-first across formats, but defaults to newest wav', () => {
    const files = [
      { name: 'Song.wav', path: '/p/Song.wav', mtimeMs: 100 },
      { name: 'Song 2.mp3', path: '/p/Song 2.mp3', mtimeMs: 400 },
      { name: 'Song 3.wav', path: '/p/Song 3.wav', mtimeMs: 300 },
      { name: 'Song 2.wav', path: '/p/Song 2.wav', mtimeMs: 200 }
    ]
    const { default: def, all } = pickExports(files, stems)
    expect(all.map((f) => f.name)).toEqual(['Song 2.mp3', 'Song 3.wav', 'Song 2.wav', 'Song.wav'])
    expect(def.name).toBe('Song 3.wav') // newest wav, not the newer mp3
  })
})

describe('buildProject', () => {
  it('assembles versions, exports, name and modified date', () => {
    const dir = '/music/Song Project'
    const files = [
      { name: 'Song.als', path: dir + '/Song.als', mtimeMs: 100 },
      { name: 'Song 2.als', path: dir + '/Song 2.als', mtimeMs: 300 },
      { name: 'Song 2.wav', path: dir + '/Song 2.wav', mtimeMs: 350 }
    ]
    const p = buildProject(dir, '/music', files)
    expect(p.name).toBe('Song') // " Project" stripped for display
    expect(p.folderName).toBe('Song Project')
    expect(p.relPath).toBe('Song Project') // relPath keeps the real folder name
    expect(p.latestVersion.name).toBe('Song 2.als')
    expect(p.modifiedMs).toBe(300)
    expect(p.exports.default.name).toBe('Song 2.wav')
  })

  it('matches a per-version export by stem (dated-name case)', () => {
    const dir = '/music/2024-03-17-demo Project'
    const files = [
      { name: '2024-03-17-demo.als', path: dir + '/2024-03-17-demo.als', mtimeMs: 100 },
      { name: '2024-03-17-demo-3.als', path: dir + '/2024-03-17-demo-3.als', mtimeMs: 300 },
      { name: '2024-03-17-demo-3.wav', path: dir + '/2024-03-17-demo-3.wav', mtimeMs: 320 },
      { name: '2024-03-17-demo-3.mp3', path: dir + '/2024-03-17-demo-3.mp3', mtimeMs: 310 }
    ]
    const p = buildProject(dir, '/music', files)
    expect(p.name).toBe('2024-03-17-demo')
    expect(p.latestVersion.name).toBe('2024-03-17-demo-3.als')
    expect(p.exports.default.name).toBe('2024-03-17-demo-3.wav') // wav preferred
    expect(p.exports.all).toHaveLength(2)
  })

  it('ignores artist-prefixed exports that do not match a stem', () => {
    const dir = '/music/Song Project'
    const files = [
      { name: 'Song.als', path: dir + '/Song.als', mtimeMs: 100 },
      { name: 'Some Artist - Song - 17.mp3', path: dir + '/Some Artist - Song - 17.mp3', mtimeMs: 200 }
    ]
    const p = buildProject(dir, '/music', files)
    expect(p.exports.default).toBeNull()
  })

  it('matches exports against the folder name too', () => {
    const dir = '/music/MyTrack'
    const files = [
      { name: 'a.als', path: dir + '/a.als', mtimeMs: 100 },
      { name: 'MyTrack.wav', path: dir + '/MyTrack.wav', mtimeMs: 200 }
    ]
    const p = buildProject(dir, '/music', files)
    expect(p.exports.default.name).toBe('MyTrack.wav')
  })
})

describe('findProjects (filesystem)', () => {
  it('detects top-level and nested project folders, one row each', async () => {
    await touch(path.join(root, 'Direct Song', 'Direct Song.als'))
    await touch(path.join(root, 'House', 'Nested Song', 'Nested Song.als'))
    await touch(path.join(root, 'House', 'Deep', 'Deeper', 'Buried.als'))

    const projects = await findProjects(root)
    // Project name is the folder name, not the .als stem ("Deeper" holds "Buried.als").
    expect(projects.map((p) => p.name)).toEqual(['Deeper', 'Direct Song', 'Nested Song'])
  })

  it('does not descend into a project folder (ignores Backup .als)', async () => {
    const proj = path.join(root, 'Song')
    await touch(path.join(proj, 'Song.als'))
    await touch(path.join(proj, 'Backup', 'Song [2026-01-01 100000].als'))

    const projects = await findProjects(root)
    expect(projects).toHaveLength(1)
    expect(projects[0].versions).toHaveLength(1)
    expect(projects[0].versions[0].name).toBe('Song.als')
  })

  it('ignores wav/mp3 inside Samples and other subfolders', async () => {
    const proj = path.join(root, 'Song')
    await touch(path.join(proj, 'Song.als'))
    await touch(path.join(proj, 'Samples', 'Imported', 'loop.wav'))
    await touch(path.join(proj, 'Samples', 'Recorded', 'Song.wav')) // same name but in subfolder
    await touch(path.join(proj, 'Stems', 'Song.wav'))

    const projects = await findProjects(root)
    expect(projects[0].exports.default).toBeNull()
  })

  it('picks the newest .als as latest version / modified date', async () => {
    const proj = path.join(root, 'Song')
    await touch(path.join(proj, 'Song.als'), 1000)
    await touch(path.join(proj, 'Song 2.als'), 3000)
    await touch(path.join(proj, 'Song 3.als'), 2000)

    const projects = await findProjects(root)
    expect(projects[0].latestVersion.name).toBe('Song 2.als')
    expect(projects[0].modifiedMs).toBe(3000 * 1000)
  })

  it('finds root-level export matching the project and prefers wav', async () => {
    const proj = path.join(root, 'Song')
    await touch(path.join(proj, 'Song.als'), 1000)
    await touch(path.join(proj, 'Song.wav'), 1100)
    await touch(path.join(proj, 'Song.mp3'), 1200)

    const projects = await findProjects(root)
    expect(projects[0].exports.default.name).toBe('Song.wav')
    expect(projects[0].exports.all).toHaveLength(2)
  })

  it('a folder with only a Backup folder of .als is not a project', async () => {
    await touch(path.join(root, 'Weird', 'Backup', 'Old.als'))
    const projects = await findProjects(root)
    expect(projects).toHaveLength(0)
  })
})

describe('listDir (navigation)', () => {
  it('separates projects from navigable folders, both alphabetical', async () => {
    await touch(path.join(root, 'Direct Song Project', 'Direct Song.als'))
    await touch(path.join(root, '_ABLETON_12', 'Nested Project', 'Nested.als'))
    await mkdir(path.join(root, 'Collab', 'sub'), { recursive: true })

    const { folders, projects } = await listDir(root, '')
    expect(folders.map((f) => f.name)).toEqual(['_ABLETON_12', 'Collab'])
    expect(projects.map((p) => p.name)).toEqual(['Direct Song'])
  })

  it('lists the contents of a navigated subfolder', async () => {
    await touch(path.join(root, '_ABLETON_12', 'Nested Project', 'Nested.als'))
    const { folders, projects } = await listDir(root, '_ABLETON_12')
    expect(folders).toHaveLength(0)
    expect(projects.map((p) => p.name)).toEqual(['Nested'])
    expect(projects[0].relPath).toBe(path.join('_ABLETON_12', 'Nested Project'))
  })

  it('reports immediate child count for folders', async () => {
    await touch(path.join(root, 'Genre', 'A Project', 'A.als'))
    await touch(path.join(root, 'Genre', 'B Project', 'B.als'))
    const { folders } = await listDir(root, '')
    expect(folders[0].childCount).toBe(2)
  })
})

describe('parseAbletonVersion', () => {
  it('parses the Creator attribute', () => {
    const tag = '<Ableton MajorVersion="5" MinorVersion="11.0_11300" Creator="Ableton Live 11.3.12" Revision="x">'
    expect(parseAbletonVersion(tag)).toEqual({ major: 11, full: '11.3.12' })
  })
  it('parses Live 12', () => {
    expect(parseAbletonVersion('<Ableton Creator="Ableton Live 12.1">').major).toBe(12)
  })
  it('falls back to MinorVersion when no Creator', () => {
    expect(parseAbletonVersion('<Ableton MinorVersion="10.0_10100">')).toEqual({ major: 10, full: '10' })
  })
  it('returns null when nothing matches', () => {
    expect(parseAbletonVersion('<nope>')).toBeNull()
  })
})

describe('readAlsVersion (gzip)', () => {
  it('reads version from a gzipped .als header', async () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<Ableton MajorVersion="5" MinorVersion="11.0_11300" Creator="Ableton Live 11.3.12" Revision="x">\n<LiveSet>'
    const p = path.join(root, 'song.als')
    await writeFile(p, gzipSync(Buffer.from(xml)))
    expect(await readAlsVersion(p)).toEqual({ major: 11, full: '11.3.12' })
  })

  it('returns null for a non-gzip file', async () => {
    const p = path.join(root, 'bad.als')
    await writeFile(p, 'not gzip at all')
    expect(await readAlsVersion(p)).toBeNull()
  })
})
