import path from 'node:path'

// Pure project-identity helpers. See docs/project-identity-and-reconciliation.md §2/§7.
// Everything here is stat-only data (no byte reads) so it works on online-only
// Dropbox files and never touches the read-only music folder.

/**
 * A file's stem = its name minus the extension, computed identically at capture
 * time (the scanner) and match time (reconcile) so stems are comparable. This is
 * the raw `.als` filename with no " Project" handling — we sign the *files*, not
 * the folder. Extracted here so there is one shared implementation (§7).
 */
export const stemOf = (name) => name.slice(0, name.length - path.extname(name).length)

/**
 * Build the per-folder signature: one `{stem, size}` per `.als` directly in the
 * folder. `files` is a readEntries()-style list of `{name, size}`. Backup/ and
 * Samples/ never appear because readEntries does not descend into them.
 *
 * `size === 0` (or missing) is treated as UNKNOWN and excluded — Dropbox/iCloud
 * placeholders for un-hydrated files can report 0, and admitting them would let
 * many unrelated `.als` collide on size 0 (§2.1).
 */
export function alsFilesOf(files) {
  const out = []
  for (const f of files) {
    if (path.extname(f.name).toLowerCase() !== '.als') continue
    const size = f.size
    if (!size) continue // 0 / undefined / null = UNKNOWN -> exclude
    out.push({ stem: stemOf(f.name), size })
  }
  return out
}

// Multiset counts keyed by `keyFn`.
function counts(items, keyFn) {
  const m = new Map()
  for (const it of items) {
    const k = keyFn(it)
    m.set(k, (m.get(k) || 0) + 1)
  }
  return m
}

// Multiset intersection size: sum over distinct keys of min(countA, countB).
function intersect(ca, cb) {
  let total = 0
  for (const [k, na] of ca) {
    const nb = cb.get(k)
    if (nb) total += Math.min(na, nb)
  }
  return total
}

const NUL = '\u0000' // separator that cannot occur in a filename stem

/**
 * Score two signatures (§2.1):
 *  - exactOverlap = multiset intersection of `{stem,size}` pairs (strongest)
 *  - sizeOverlap  = multiset intersection of `size` values, ignoring stem
 *    (catches a renamed version file)
 * Multiset (not set) semantics so two `.als` of identical size aren't double-credited.
 */
export function overlap(a, b) {
  const exactKey = (f) => f.stem + NUL + f.size
  const sizeKey = (f) => String(f.size)
  return {
    exactOverlap: intersect(counts(a, exactKey), counts(b, exactKey)),
    sizeOverlap: intersect(counts(a, sizeKey), counts(b, sizeKey))
  }
}

// Silent-rebind bar (§2.3): never a single shared file — a shared template/first
// version is too weak. >=2 overlapping files (exact or size) required.
export const isStrong = (o) => o.exactOverlap >= 2 || o.sizeOverlap >= 2

/**
 * Relative path of `absPath` under `root`, or null if it is not under `root`.
 * '' means absPath equals root. Shared by db.js (scope filtering / rel_path
 * derivation) and reconcile.js so scoping is computed one way (§2.4).
 */
export function relUnder(root, absPath) {
  if (!root || !absPath) return null
  const rel = path.relative(root, absPath)
  if (rel === '') return ''
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel
}

export const isUnder = (root, absPath) => relUnder(root, absPath) !== null
