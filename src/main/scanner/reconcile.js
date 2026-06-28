import { overlap, isStrong, relUnder } from './signature.js'

// Pure reconciliation. See docs/project-identity-and-reconciliation.md §4.
// No disk access: inputs are plain data so it is fully unit-testable.
//
// reconcile(activeRoot, present, rows) -> {
//   bind:      [{ rowId, project }],        // path matched: same project in place (S5)
//   rebind:    [{ rowId, project }],        // sig matched a unique orphan (S1/S2/S3)
//   duplicate: [{ sourceRowId, project }],  // sig matched a resolved row: copy metadata (S4)
//   missing:   [ rowId ],                   // in-scope row, no folder found (S1)
//   newp:      [ project ],                 // no overlap: brand-new project
//   ambiguous: [{ project, candidates:[{ rowId, exactOverlap, sizeOverlap }] }]
// }
//
// `present`: scanned projects { absPath, folderName, alsFiles:[{stem,size}] } under activeRoot.
// `rows`:    project_meta rows mapped to { id, absPath, folderName, alsFiles }.

// Candidate sort: strongest first, then a stable tiebreak (§4.1).
function byStrength(a, b) {
  if (b.o.exactOverlap !== a.o.exactOverlap) return b.o.exactOverlap - a.o.exactOverlap
  if (b.o.sizeOverlap !== a.o.sizeOverlap) return b.o.sizeOverlap - a.o.sizeOverlap
  const fa = a.row.folderName || ''
  const fb = b.row.folderName || ''
  if (fa !== fb) return fa < fb ? -1 : 1
  return (a.row.id ?? 0) - (b.row.id ?? 0)
}

export function reconcile(activeRoot, present, rows) {
  // Deterministic input order regardless of scan order (§4.1).
  const presentSorted = [...present].sort((a, b) => (a.absPath < b.absPath ? -1 : a.absPath > b.absPath ? 1 : 0))

  const inScopeRows = rows.filter((r) => relUnder(activeRoot, r.absPath) !== null)
  const byPath = new Map(inScopeRows.map((r) => [r.absPath, r]))

  const result = { bind: [], rebind: [], duplicate: [], missing: [], newp: [], ambiguous: [] }
  const consumedPresent = new Set() // absPath
  const consumedOrphan = new Set() // row id
  const resolved = [] // rows bound (A) or rebound (B) — eligible duplicate sources

  // Step A — path-first (S5): a row still at its stored path is the same project,
  // regardless of any signature change. This separates "edited in place" from "moved".
  for (const p of presentSorted) {
    const row = byPath.get(p.absPath)
    if (row) {
      result.bind.push({ rowId: row.id, project: p })
      consumedPresent.add(p.absPath)
      consumedOrphan.add(row.id)
      resolved.push(row)
    }
  }

  const orphans = inScopeRows.filter((r) => !consumedOrphan.has(r.id))

  // Steps B/C/D — signature fallback for the remaining present folders.
  for (const p of presentSorted) {
    if (consumedPresent.has(p.absPath)) continue

    const cands = orphans
      .filter((o) => !consumedOrphan.has(o.id))
      .map((row) => ({ row, o: overlap(p.alsFiles, row.alsFiles) }))
      .filter((c) => c.o.exactOverlap > 0 || c.o.sizeOverlap > 0)
      .sort(byStrength)
    const strong = cands.filter((c) => isStrong(c.o))

    if (strong.length === 1) {
      // B (S1/S2/S3): unique strong orphan claims this folder.
      const c = strong[0]
      result.rebind.push({ rowId: c.row.id, project: p })
      consumedPresent.add(p.absPath)
      consumedOrphan.add(c.row.id)
      // CRITICAL: a rebound row joins `resolved` so a sibling duplicate can source
      // from it (move+duplicate in one scan, REC-19).
      resolved.push(c.row)
    } else if (cands.length > 0) {
      // Ties at the strong bar, or only weak overlap -> dialog. Never silently dropped.
      result.ambiguous.push({
        project: p,
        candidates: cands.map((c) => ({
          rowId: c.row.id,
          exactOverlap: c.o.exactOverlap,
          sizeOverlap: c.o.sizeOverlap
        }))
      })
      consumedPresent.add(p.absPath)
    } else {
      // C (S4) / D: no orphan overlap. Maybe a duplicate of an already-resolved row.
      const src = resolved
        .map((row) => ({ row, o: overlap(p.alsFiles, row.alsFiles) }))
        .filter((x) => isStrong(x.o))
        .sort(byStrength)[0]
      if (src) result.duplicate.push({ sourceRowId: src.row.id, project: p })
      else result.newp.push(p)
      consumedPresent.add(p.absPath)
    }
  }

  // Step E — leftover in-scope orphans are missing (S1).
  result.missing = orphans.filter((o) => !consumedOrphan.has(o.id)).map((o) => o.id)

  return result
}
