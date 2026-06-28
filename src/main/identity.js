import path from 'node:path'
import { findProjects, readEntries } from './scanner/index.js'
import { alsFilesOf, overlap, isStrong, relUnder } from './scanner/signature.js'
import { reconcile } from './scanner/reconcile.js'
import {
  getSettings,
  getAllRows,
  getRow,
  getRowDetails,
  getOtherLibraries,
  persistReconcile,
  associateMeta,
  detachMeta
} from './db.js'

// Identity orchestration (docs §5/§6). Kept free of any `electron` import so it is
// unit-testable under Vitest/node; ipc.js wires these to channels. All filesystem
// reads here are stat/readdir only (read-only invariant, §9).

// Map a scanned project to the lean { absPath, folderName, alsFiles } shape the
// reconcile/identity layer works with.
const toPresent = (p) => ({ absPath: p.absPath, folderName: p.folderName, alsFiles: p.alsFiles })

const byOverlap = (ao, bo) => {
  if (bo.exactOverlap !== ao.exactOverlap) return bo.exactOverlap - ao.exactOverlap
  return bo.sizeOverlap - ao.sizeOverlap
}

/**
 * Full identity reconcile pass: findProjects sweep + §4 reconcile, then persist
 * bind/rebind/duplicate. Returns the sets the per-folder list can't surface
 * (missing / ambiguous / otherLibraries). Runs on launch and on Refresh.
 */
export async function reconcileLibrary() {
  const root = getSettings().root
  if (!root) return { missing: [], ambiguous: [], otherLibraries: [] }
  const found = await findProjects(root)
  const present = found.map(toPresent)
  const rows = getAllRows()
  const result = reconcile(root, present, rows)
  persistReconcile(result)

  const nameById = new Map(rows.map((r) => [r.id, r.folderName]))
  const ambiguous = result.ambiguous.map((a) => ({
    project: { absPath: a.project.absPath, folderName: a.project.folderName },
    candidates: a.candidates.map((c) => ({
      id: c.rowId,
      folderName: nameById.get(c.rowId) ?? '',
      exactOverlap: c.exactOverlap,
      sizeOverlap: c.sizeOverlap
    }))
  }))
  return {
    missing: getRowDetails(result.missing),
    ambiguous,
    otherLibraries: getOtherLibraries(root)
  }
}

// Is `absPath` a real, present project folder (directly contains a .als)?
async function readProjectAt(absPath) {
  const { files } = await readEntries(absPath)
  const isProject = files.some((f) => path.extname(f.name).toLowerCase() === '.als')
  if (!isProject) return null
  return { absPath, folderName: path.basename(absPath), alsFiles: alsFilesOf(files) }
}

// Locate (§5.1): rank present project folders under the root by overlap with the
// missing row's signature. Deterministic order (strongest first, then folder name).
export async function locateCandidates(metaId) {
  const root = getSettings().root
  const row = getRow(metaId)
  if (!root || !row) return []
  const found = await findProjects(root)
  return found
    .map((p) => ({ project: toPresent(p), o: overlap(p.alsFiles, row.alsFiles) }))
    .sort((a, b) => {
      const s = byOverlap(a.o, b.o)
      if (s !== 0) return s
      return a.project.folderName < b.project.folderName ? -1 : a.project.folderName > b.project.folderName ? 1 : 0
    })
    .map((x) => ({
      absPath: x.project.absPath,
      folderName: x.project.folderName,
      exactOverlap: x.o.exactOverlap,
      sizeOverlap: x.o.sizeOverlap,
      strong: isStrong(x.o)
    }))
}

/**
 * Associate a missing row with a chosen folder (§5.1). Server-side re-validates
 * scope + that the target is a real present project under the active root (never
 * trusts the UI). Branches: out-of-scope / not-a-project / owned-by / weak-match
 * (needs force) / ok.
 */
export async function associate(metaId, absPath, { force = false } = {}) {
  const root = getSettings().root
  if (!root || relUnder(root, absPath) === null) return { error: 'out-of-scope' }
  const project = await readProjectAt(absPath)
  if (!project) return { error: 'not-a-project' }

  // Never create two rows for one folder.
  const owner = getAllRows().find((r) => r.absPath === absPath)
  if (owner && owner.id !== metaId) return { blocked: 'owned-by', byName: owner.folderName }

  const row = getRow(metaId)
  if (!row) return { error: 'no-row' }
  const o = overlap(project.alsFiles, row.alsFiles)
  if (!isStrong(o) && !force) return { needsConfirm: 'weak-match' }

  associateMeta(metaId, project)
  return { ok: true }
}

export function detach(metaId) {
  const row = detachMeta(metaId)
  return row ? { ok: true } : { error: 'nothing-to-undo' }
}
