import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

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
// files in real libraries. See docs/ableton-folder-survey.md.
const RELEVANT_EXTS = new Set([ALS_EXT, ...EXPORT_EXTS])

const stem = (name) => name.slice(0, name.length - path.extname(name).length)
const lowerExt = (name) => path.extname(name).toLowerCase()
const isIgnoredDir = (name) => IGNORED_DIRS.has(name) || name.startsWith('.')

// Ableton names every project folder "<name> Project"; the .als files inside drop
// that suffix. Strip it for display and export matching.
export const stripProjectSuffix = (name) => name.replace(/ Project$/, '')

/**
 * Read a directory's immediate entries: only .als/.wav/.mp3 files (with mtime),
 * plus the list of subdirectories. Unreadable dirs yield empty lists.
 */
async function readEntries(dir) {
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
      try {
        mtimeMs = (await stat(full)).mtimeMs
      } catch {
        continue
      }
      files.push({ name: d.name, path: full, mtimeMs })
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
  const wav = matched.filter((f) => f.ext === 'wav').sort(byNewest)
  const mp3 = matched.filter((f) => f.ext === 'mp3').sort(byNewest)
  const all = [...wav, ...mp3]
  const def = wav[0] ?? mp3[0] ?? null
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
    name,
    folderName,
    versions,
    latestVersion: latest,
    modifiedMs: latest ? latest.mtimeMs : 0,
    exports
  }
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
