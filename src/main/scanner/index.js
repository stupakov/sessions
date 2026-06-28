import { readdir, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import path from 'node:path'
import { stemOf, alsFilesOf } from './signature.js'

// Subfolders inside a project that must never be treated as projects or scanned
// for versions/exports. See docs/ableton-project-structure.md.
export const IGNORED_DIRS = new Set([
  'Backup', // Live's automatic timestamped .als saves — not user versions
  'Ableton Project Info',
  'Samples' // project media (Imported/Processed/Recorded) — not exports
])

export const ALS_EXT = '.als'
export const EXPORT_EXTS = ['.wav', '.mp3']
// The only file types we care about. Everything else (.asd sidecars, .aif samples,
// .amxd, .DS_Store, …) is skipped so we never stat the thousands of irrelevant
// files in real libraries. See docs/ableton-project-structure.md.
const RELEVANT_EXTS = new Set([ALS_EXT, ...EXPORT_EXTS])

// Stem comes from the shared signature helper so capture-time and match-time
// stems are computed by one function (see signature.js / docs §7).
const stem = stemOf
const lowerExt = (name) => path.extname(name).toLowerCase()
const isIgnoredDir = (name) => IGNORED_DIRS.has(name) || name.startsWith('.')

// Ableton names every project folder "<name> Project"; the .als files inside drop
// that suffix. Strip it for display and export matching.
export const stripProjectSuffix = (name) => name.replace(/ Project$/, '')

/**
 * Read a directory's immediate entries: only .als/.wav/.mp3 files (with mtime and
 * size), plus the list of subdirectories. Unreadable dirs yield empty lists.
 * READ-ONLY (stat only). `size` powers the project signature (see signature.js).
 */
export async function readEntries(dir) {
  let dirents
  try {
    dirents = await readdir(dir, { withFileTypes: true })
  } catch {
    return { files: [], dirs: [] }
  }
  const files = []
  const dirs = []
  for (const d of dirents) {
    if (d.isDirectory()) {
      dirs.push(d.name)
    } else if (d.isFile() && RELEVANT_EXTS.has(lowerExt(d.name))) {
      const full = path.join(dir, d.name)
      let mtimeMs = 0
      let size = 0
      try {
        const st = await stat(full)
        mtimeMs = st.mtimeMs
        size = st.size
      } catch {
        continue
      }
      files.push({ name: d.name, path: full, mtimeMs, size })
    }
  }
  return { files, dirs }
}

/**
 * Versions = .als files directly in the project folder (Backup/ excluded by
 * virtue of only reading this folder's own files), newest-modified first.
 */
export function pickVersions(files) {
  return files
    .filter((f) => lowerExt(f.name) === ALS_EXT)
    .map((f) => ({ name: f.name, path: f.path, mtimeMs: f.mtimeMs, stem: stem(f.name) }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/**
 * Exports = .wav/.mp3 files directly in the project folder whose stem matches the
 * project base name or a version stem. WAV preferred, MP3 fallback. Newest first.
 * Returns { default, all } where `default` is null when there are no exports.
 */
export function pickExports(files, allowedStems) {
  const allowed = new Set(allowedStems)
  const matched = files
    .filter((f) => EXPORT_EXTS.includes(lowerExt(f.name)) && allowed.has(stem(f.name)))
    .map((f) => ({
      name: f.name,
      path: f.path,
      mtimeMs: f.mtimeMs,
      ext: lowerExt(f.name).slice(1) // 'wav' | 'mp3'
    }))

  const byNewest = (a, b) => b.mtimeMs - a.mtimeMs
  // Default still prefers the newest WAV (falling back to newest MP3)...
  const def = matched.filter((f) => f.ext === 'wav').sort(byNewest)[0] ??
    matched.filter((f) => f.ext === 'mp3').sort(byNewest)[0] ??
    null
  // ...but the dropdown lists every export strictly newest → oldest.
  const all = matched.sort(byNewest)
  return { default: def, all }
}

/**
 * Build the data for one project folder given its already-read entries.
 */
export function buildProject(dir, root, files) {
  const folderName = path.basename(dir)
  const name = stripProjectSuffix(folderName)
  const versions = pickVersions(files)
  // Match exports against the folder name, its " Project"-stripped form, and every
  // version stem — this covers `<name>.wav` and per-version `<name>-3.wav`.
  const allowedStems = [folderName, name, ...versions.map((v) => v.stem)]
  const exports = pickExports(files, allowedStems)
  const latest = versions[0] ?? null
  return {
    relPath: path.relative(root, dir) || folderName,
    dir,
    absPath: dir, // last-known absolute path = identity key (docs §2.4)
    name,
    folderName,
    versions,
    latestVersion: latest,
    modifiedMs: latest ? latest.mtimeMs : 0,
    exports,
    alsFiles: alsFilesOf(files) // per-file signature {stem,size} (docs §2.1)
  }
}

// Parse the Ableton version out of the first chunk of a decompressed .als. The
// root tag looks like: <Ableton MajorVersion="5" MinorVersion="11.0_11300"
// Creator="Ableton Live 11.3.12" ...>. `Creator` is the human app version; the
// MinorVersion prefix is a reliable fallback. MajorVersion is the file schema, not
// the app, so it is NOT used.
export function parseAbletonVersion(head) {
  let m = head.match(/Creator="Ableton Live ([0-9]+)((?:\.[0-9]+)*)/)
  if (m) return { major: Number(m[1]), full: m[1] + (m[2] || '') }
  m = head.match(/MinorVersion="([0-9]+)\./)
  if (m) return { major: Number(m[1]), full: m[1] }
  return null
}

// Extract the complete root opening tag <Ableton ...> from accumulated text, or
// null if it isn't fully present yet. This is the deterministic stop condition:
// the version attributes always live inside this one tag.
function extractAbletonTag(data) {
  const open = data.indexOf('<Ableton')
  if (open === -1) return null
  const close = data.indexOf('>', open)
  if (close === -1) return null
  return data.slice(open, close + 1)
}

/**
 * Read the Ableton version a .als was saved with. Decompresses only until the root
 * <Ableton ...> opening tag is fully read, then stops — deterministic, not a fixed
 * byte budget. READ-ONLY. Resolves null on error or timeout (e.g. an online-only
 * Dropbox file that can't be hydrated quickly). `safetyCapBytes` only guards against
 * a malformed/non-Ableton file that never produces the tag.
 */
export function readAlsVersion(filePath, { timeoutMs = 1500, safetyCapBytes = 65536 } = {}) {
  return new Promise((resolve) => {
    let data = ''
    let settled = false
    const stream = createReadStream(filePath)
    const gunzip = createGunzip()
    const finish = (val) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stream.destroy()
      gunzip.destroy()
      resolve(val)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    stream.on('error', () => finish(null))
    gunzip.on('error', () => finish(null))
    gunzip.on('data', (chunk) => {
      data += chunk.toString('latin1')
      const tag = extractAbletonTag(data)
      if (tag) finish(parseAbletonVersion(tag))
      else if (data.length >= safetyCapBytes) finish(null)
    })
    gunzip.on('end', () => finish(parseAbletonVersion(extractAbletonTag(data) || '')))
    stream.pipe(gunzip)
  })
}

/**
 * List a single directory for Finder-style navigation. Returns its immediate
 * subfolders split into `projects` (folders that directly contain a .als) and
 * `folders` (everything else — navigable). Does not recurse. `relPath` is the path
 * of the directory being listed, relative to `root` ('' = root).
 */
export async function listDir(root, relPath = '') {
  const absDir = path.join(root, relPath)
  const { dirs } = await readEntries(absDir)
  const folders = []
  const projects = []
  for (const sub of dirs) {
    if (isIgnoredDir(sub)) continue
    const subAbs = path.join(absDir, sub)
    const entries = await readEntries(subAbs)
    const isProject = entries.files.some((f) => lowerExt(f.name) === ALS_EXT)
    if (isProject) {
      projects.push(buildProject(subAbs, root, entries.files))
    } else {
      let mtimeMs = 0
      try {
        mtimeMs = (await stat(subAbs)).mtimeMs
      } catch {
        /* ignore */
      }
      const childCount = entries.dirs.filter((d) => !isIgnoredDir(d)).length
      folders.push({
        kind: 'folder',
        name: sub,
        relPath: path.relative(root, subAbs),
        mtimeMs,
        childCount
      })
    }
  }
  // Detect the Ableton version for each project's latest .als (the one on the Open
  // button). Done in parallel; read-only and resilient.
  await Promise.all(
    projects.map(async (p) => {
      if (p.latestVersion) p.ableton = await readAlsVersion(p.latestVersion.path)
    })
  )

  folders.sort((a, b) => a.name.localeCompare(b.name))
  projects.sort((a, b) => a.name.localeCompare(b.name))
  return { relPath, folders, projects }
}

/**
 * Walk `root` recursively and return one entry per project folder. A folder is a
 * project iff it directly contains at least one .als file. Project folders are not
 * descended into (their subfolders are Samples/Backup/etc.).
 */
export async function findProjects(root) {
  const results = []

  async function walk(dir) {
    const { files, dirs } = await readEntries(dir)
    const hasAls = files.some((f) => lowerExt(f.name) === ALS_EXT)
    if (hasAls) {
      results.push(buildProject(dir, root, files))
      return // do not descend into a project folder
    }
    for (const sub of dirs) {
      if (isIgnoredDir(sub)) continue
      await walk(path.join(dir, sub))
    }
  }

  await walk(root)
  results.sort((a, b) => a.name.localeCompare(b.name))
  return results
}
