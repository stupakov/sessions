# Project Identity & Metadata Reconciliation

> Plan for keeping per-project metadata (status / rating / notes) attached to a
> project across **delete, move, duplicate, rename**, and **library-root changes** —
> without ever writing into the read-only music folder. See
> [architecture.md](./architecture.md) and
> [ableton-project-structure.md](./ableton-project-structure.md).
> Status: **implemented** (Phase 1). Last updated: 2026-06-28 (v3.1 — completeness
> pass before implementer hand-off; see §11 changelog). Implementation notes: the
> identity orchestration (`reconcileLibrary`/`locateCandidates`/`associate`/`detach`)
> lives in `src/main/identity.js` (electron-free, so it's unit-testable) and is wired to
> IPC channels by `ipc.js`. Tests run under Electron's Node runtime (see CLAUDE.md).

## 1. Problem

Metadata is currently keyed by `project_meta.rel_path`. The path is the single point
of failure: rename / move change it, delete removes the folder, duplicate is
unhandled. We need a project **identity** that is independent of the path.

The read-only invariant rules out the obvious fix (writing a hidden `.songid` marker
or xattr into the folder). Identity must therefore be **derived** from read-only
observation — a content fingerprint — plus a manual override (Locate) for the cases
no signal can resolve.

### Scenarios to cover

| # | Scenario | Desired outcome |
|---|----------|-----------------|
| S1 | Project folder **deleted** | Keep the row; show it as **missing** (reddish, badge, Locate button). Re-link automatically if it reappears. |
| S2 | Project folder **moved** (within root) | Metadata follows automatically. |
| S3 | Project folder **renamed** | Metadata follows automatically. |
| S4 | Project folder **duplicated** | Metadata is **copied** to the duplicate; the two diverge afterward. |
| S5 | Project **edited in place** (new version saved, a version edited/renamed) | Still the same project — never treated as new. |
| S6 | **Library root changed** | Projects outside the active root are preserved but hidden; projects inside it are shown. Switching back restores the prior view. |
| S7 | **Hard case**: a one-`.als` project moved *and* its sole file changed at the same time | Not auto-recoverable; recoverable by hand via Locate. |
| S8 | **Existing install with an old-schema DB** | App detects the incompatible DB, tells the user it's unsupported, and resets it. **No migration** (pre-release; no real users yet). |

## 2. Identity model

### 2.1 Signature = a *set* of per-file signatures

For each project folder, compute one signature per `.als` file directly in the folder
(Backup/ excluded as today), using **stat only** (no byte reads — works on online-only
Dropbox files):

```
als_files = [ { stem, size }, … ]   // one entry per .als in the folder
```

- `stem` is computed the same way the scanner already does (`scanner/index.js` `stem()`),
  **before** any " Project" handling — it is the raw `.als` filename minus extension.
  Capture-time and match-time must use the identical function (shared helper) so stems
  are comparable. (The folder's " Project" suffix is irrelevant here — we sign the
  *files*, not the folder name.)
- **`size === 0` is treated as UNKNOWN and excluded** from the set. Dropbox / iCloud
  File-Provider placeholders for un-hydrated files can report `st_size` of 0 or a
  placeholder value; admitting them would let many unrelated `.als` collide on size 0.
  An all-zero folder therefore yields an empty signature and can only be matched by path
  or by Locate — deliberately conservative.

Matching two folders is an **intersection**, with a confidence score:

- **exactOverlap** = multiset intersection of `{stem, size}` pairs — `Σ min(countA, countB)`
  over distinct pairs (strongest).
- **sizeOverlap**  = multiset intersection of `size` values ignoring `stem` —
  `Σ min(countA, countB)` over distinct sizes (catches a renamed version file).

Multiset (not set) semantics matter: two `.als` of identical size in one folder is legal,
so a single shared size must not be credited twice. Both counts are defined as multiset
intersections.

A single changed/renamed/added `.als` simply drops out of the set while the rest still
match — so saving an 11th version, or editing one of 10, still matches the other 9.

### 2.2 Path-first, signature-as-fallback

Signatures are only consulted when the **path does not match**. If a folder is still at
its stored location it is the same project regardless of any signature change — this is
what cleanly separates *edited in place* (S5) from *relocated* (S2/S3). This also covers
the single-`.als` in-place edit that a signature alone could not.

### 2.3 Confidence rules (silent vs. dialog)

Silent rebind requires **≥2 overlapping files**, never a single shared file. The single
biggest false-positive risk is a shared **template/first version** (`Untitled.als`,
`Template.als`) that many unrelated projects start from; one shared `.als` is weak
evidence and must be confirmed.

| Outcome | Condition |
|---------|-----------|
| **Silent rebind** | path gone, and a **unique** orphan with `exactOverlap ≥ 2` **or** `sizeOverlap ≥ 2` |
| **Dialog (ambiguous)** | any overlap that isn't strong-and-unique: `exactOverlap == 1`, `sizeOverlap == 1`, or more than one candidate ties at the strong bar |
| **New project** | no overlap (`exactOverlap == 0 && sizeOverlap == 0`) with any orphan |

Optional hardening (Phase 2): maintain a count of how many distinct rows each `stem`
appears in; a `stem` shared across many projects (a template) is down-weighted or ignored
when scoring, so a real multi-version match is still strong while a shared-template match
is not.

### 2.4 Location = absolute path; `missing` is derived

Each row stores the **last-known absolute path**. Whether a row is in scope / present /
missing is computed per scan against the active root **R** — not stored as a flag:

```
in_scope ≡ abs_path under R                  // abs_path is always set (NOT NULL)
present  ≡ folder found during this scan
missing  ≡ in_scope && !present      → reddish + Locate
hidden   ≡ !in_scope                 → preserved, not shown (belongs to another library)
rel_path ≡ relative(R, abs_path)     → for display / renderer matching
```

This makes **S6 a re-evaluation, not a mutation**: changing the root recomputes these
predicates; nothing is deleted or flag-flipped, and switching back restores the view.
There is exactly one row per real folder (keyed by absolute location), so nested/parent
roots never duplicate rows. Every row is created with a real `abs_path` (by a metadata
edit or by reconcile), so `abs_path` is always set; an **out-of-scope** row is simply one
whose `abs_path` sits under a different root than the active one.

## 3. Schema & incompatible-DB reset

### 3.1 Schema

```sql
-- project_meta
id           INTEGER PRIMARY KEY AUTOINCREMENT  -- stable synthetic identity
abs_path     TEXT NOT NULL                       -- last-known absolute folder path
folder_name  TEXT NOT NULL DEFAULT ''            -- last-known folder name (display + tiebreak)
als_files    TEXT NOT NULL DEFAULT '[]'          -- JSON: [{stem,size}, …]
status       TEXT
rating       INTEGER NOT NULL DEFAULT 0
notes        TEXT NOT NULL DEFAULT ''
updated_at   INTEGER NOT NULL DEFAULT 0
last_seen_at INTEGER NOT NULL DEFAULT 0          -- last scan this folder was found present
-- missing / in_scope / rel_path are DERIVED, never stored
```

A **unique index** on `abs_path` (plain, not partial — `abs_path` is `NOT NULL`) enforces
one row per folder and powers the `ON CONFLICT` upsert in `setProjectMeta`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS project_meta_abs_path ON project_meta(abs_path);
```

The **`settings` table** (`db.js:30-33`) is unchanged and is **not** version-gated — keep
its `CREATE TABLE IF NOT EXISTS settings (...)` unconditional in `initDb`, independent of
the schema check below. Only `project_meta` carries the versioned schema.

On creating `project_meta` the app stamps `PRAGMA user_version = 1` (the current
`SCHEMA_VERSION`). This single integer is the compatibility marker — see §3.2.

### 3.2 No migration — detect the old schema and reset

This is pre-release software with **no real users**, so we do **not** migrate the old
`rel_path`-keyed table. Instead, on startup the app detects an incompatible DB and resets
it. This keeps the code tiny and avoids every migration hazard (PK rebuild, foreign-root
`rel_path`, null root, first-scan back-fill).

**Detection is `checkSchema(db)` — the §3.3 generalized function with an empty
`MIGRATIONS` map** (so the `'migrated'` branch never fires in this release). It runs in
`db.js` right after opening the connection and creating the unconditional `settings` table,
**before any `project_meta` query and before anything creates `project_meta`**:

```
SCHEMA_VERSION = 1
v        = PRAGMA user_version
hasTable = SELECT 1 FROM sqlite_master WHERE type='table' AND name='project_meta'
if !hasTable:                       // brand-new DB
    create project_meta + index; PRAGMA user_version = SCHEMA_VERSION;  return 'fresh'
elif v === SCHEMA_VERSION:          // current
    return 'ok'
else:                               // old (v=0) or unknown/newer → no migration path
    return 'incompatible'
```

> **B2 — ordering trap (must implement exactly):** the current `initDb` runs an
> **unconditional** `CREATE TABLE IF NOT EXISTS project_meta (...)` (`db.js:34-41`). That
> line MUST be **removed** — `project_meta` is created **only** inside the `'fresh'` branch
> above. If a brand-new DB has `project_meta` created before `checkSchema` reads
> `sqlite_master`, then `hasTable=true && user_version=0 !== 1` → it would falsely report
> `'incompatible'` and wipe a healthy fresh DB on first run. Nothing may create
> `project_meta` before `checkSchema`. (The `settings` table is fine to create
> unconditionally first — it isn't what `checkSchema` keys on.)

The old schema left `user_version` at its default `0` and has a `project_meta` table, so it
reads as `'incompatible'`. A brand-new empty file has no `project_meta` table → `'fresh'`,
created and stamped → on the next boot `user_version=1` → `'ok'`. Never mistaken for old.

**Boot wiring:** `checkSchema` runs inside `initDb` (`db.js`), which is called from
`main/index.js` during app startup, **before the BrowserWindow is created**. When
`checkSchema` returns `'incompatible'`, `initDb` (or its caller in `main/index.js`) shows a
native blocking dialog via `dialog.showMessageBoxSync` (synchronous, no window needed):

> **Incompatible database.** This pre-release version uses a new data format. Your saved
> data — statuses, ratings, notes, **and your selected library folder / app preferences** —
> can't be read and will be cleared.
> **[Reset Database]  [Quit]**

- **Reset Database** → `resetDb()`: close the connection, `unlink` the whole `songlist.db`
  **and its `-wal` / `-shm` siblings**, then re-run `initDb` from scratch (which now takes
  the `'fresh'` path) and continue. No relaunch needed.
- **Quit** → `app.quit()`; nothing is touched.

Notes:
- **Reset clears `settings` too.** `songlist.db` holds both `project_meta` *and* `settings`
  (root folder, wav/mp3 app prefs, playMode, status list — `db.js:30-33`). Deleting the
  file wipes all of it, so after reset the user must reselect their library root and
  reconfigure. This is accepted for a pre-release reset (keeps the code to a single
  `unlink` + recreate); the dialog copy says so explicitly. (If we later want to preserve
  settings, read them before `unlink` and re-write after recreate — not done now.)
- The DB lives in Electron `userData`, **not** under the music root — deleting it never
  violates the read-only invariant.
- Auto-delete (vs. asking the user to find and remove the folder) is chosen for simplicity
  and a one-click UX; the dialog makes it explicit, so it's not silent data loss.
- `app.getPath('userData')` files are ours to manage; `unlink` of WAL siblings prevents a
  stale `-wal` from re-materializing the dropped table. Close the better-sqlite3 handle
  (`db.close()`) **before** unlinking so the file isn't held open.
- **Factor `checkSchema(db)` and `resetDb()` as standalone, unit-testable functions**
  (VER-*/RO tests call them directly); only the `dialog.showMessageBoxSync` branch in the
  boot path is left untested (native modal).

### 3.3 Versioning mechanism (forward-looking)

`PRAGMA user_version` vs. a single `SCHEMA_VERSION` constant is the **durable version
mechanism** all future schema changes build on — reset is just the v0→v1 policy we picked
because there are no users yet. The shape generalizes:

`checkSchema(db)` **is** this generalized function; §3.2 is the policy it implements with
`MIGRATIONS` empty. The full form:

```
SCHEMA_VERSION = 1               // bump on every schema change
MIGRATIONS = {                   // from-version → fn(db) that upgrades in place
  // 1: (db) => { …add column / backfill…; },   // future: real migration v1→v2
}

checkSchema(db):
  hasTable = project_meta exists in sqlite_master
  if !hasTable:            createFresh(db); user_version = SCHEMA_VERSION;  return 'fresh'
  v = PRAGMA user_version
  if v === SCHEMA_VERSION: return 'ok'
  if v < SCHEMA_VERSION && MIGRATIONS covers v..SCHEMA_VERSION:
        run each migration in a transaction, bump user_version stepwise;   return 'migrated'
  return 'incompatible'    // old (v=0), newer (v>SCHEMA_VERSION), or no migration path
```

So later schema changes are additive: bump `SCHEMA_VERSION`, add a `MIGRATIONS[n]` entry,
and rows survive. The current release ships an **empty** `MIGRATIONS` map, so `'migrated'`
never fires and any `user_version` other than the current one falls through to
`'incompatible'` → the **reset** prompt (§3.2). That includes a **newer** DB opened by an
**older** binary (`v > SCHEMA_VERSION`): we deliberately treat it as incompatible and reset
it rather than risk reading an unknown format — **accepted consequence: downgrading the app
wipes a newer DB's data.** Fine for pre-release. Tests VER-3/VER-4 pin the old-format and
newer-format branches to `'incompatible'`; when a real migration is added it gets its own
`MIG-*` tests then.

## 4. Reconciliation algorithm

A pure, unit-tested function. Inputs are plain data so it can be tested without disk:

```
reconcile(activeRoot, present, rows) -> {
  bind:      [{ rowId, project }],         // path matched: same project in place (S5)
  rebind:    [{ rowId, project }],         // sig matched a unique orphan (S1/S2/S3)
  duplicate: [{ sourceRowId, project }],   // sig matched an already-resolved row: copy metadata (S4)
  missing:   [ rowId ],                    // in-scope row (abs_path under R) with no folder found (S1)
  newp:      [ project ],                  // no overlap: brand-new project
  ambiguous: [{ project, candidates:[{rowId, exactOverlap, sizeOverlap}] }] // → dialog
}
```

- `present`: array of scanned projects `{ absPath, folderName, alsFiles:[{stem,size}] }`
  found under `activeRoot` (from a `findProjects` sweep; `buildProject` is extended to
  attach `absPath` (= its `dir`) and `alsFiles`).
- `rows`: all `project_meta` rows.

Steps (deterministic — `present` and `rows` are pre-sorted by a stable key; see §4.1):

```
inScopeRows = rows where abs_path under activeRoot     // abs_path is always set (NOT NULL)
byPath      = index inScopeRows by abs_path
resolved    = []                                       // rows bound this scan → duplicate sources

// Step A — path-first (S5)
for p in present (stable order):
  if byPath has p.absPath:
    bind(row, p); consume row + p; refresh als_files & last_seen_at
    resolved.push(row)                                 // path-stable rows can be dup sources

orphans = inScopeRows not consumed                      // missing-or-relocated

// Steps B/C/D — signature fallback for remaining present folders
for p in present not consumed (stable order):
  cands  = orphans scored by overlap(p, orphan), keep those with any overlap
  strong = cands with isStrong(overlap)             // exactOverlap>=2 || sizeOverlap>=2
  if strong has exactly one:
    rebind(strong[0], p); consume that orphan; resolved.push(strong[0])   // B (S1/S2/S3)
    // ^ CRITICAL: a rebound row joins `resolved` so a sibling duplicate can source from it
  elif cands is non-empty:
    ambiguous(p, cands)                               // ties, or only weak overlap → dialog
  else:
    src = a row in `resolved` whose sig isStrong-overlaps p
    if src: duplicate(src, p)                         // C (S4) — incl. originals rebound in B
    else:   newp(p)                                   // D

// Step E — leftover in-scope orphans are missing (S1)
missing = orphans never consumed
```

Notes:
- **Duplicate source = any *resolved* row (bound in A or rebound in B)** — not just
  path-stable ones. This is why Step B pushes the rebound row into `resolved`: it fixes the
  move+duplicate-in-one-scan case (REC-19) — the original is rebound in B, then the copy
  finds it as a duplicate source instead of falling to `newp`. Without the `resolved.push`
  in Step B this case silently misclassifies the copy as new. (Order: §4.1 ensures the
  partition is order-independent.)
- **Move vs. duplicate disambiguation** is "did a *unique strong orphan* claim this
  folder first?" If yes → rebind. A second folder with the same sig and no remaining
  orphan → duplicate of the now-resolved row.
- **Nothing is consumed twice**: `consume` removes from both `present` and `orphans`;
  each branch consumes at most the items it names.
- **Every overlapping non-strong case routes to `ambiguous`** (dialog) — metadata is never
  silently dropped to `newp` when there was *any* signature evidence.
- Rows that are **out of scope** (abs_path under another root) are ignored here —
  neither shown nor missing (they're the other-library set; §5.2).

### 4.1 Determinism

`present` is sorted by `absPath`; `orphans`/candidates are sorted by
`(exactOverlap desc, sizeOverlap desc, folder_name asc, id asc)`. The rebind-before-
duplicate rule plus stable ordering makes the `{bind, rebind, duplicate, missing, newp,
ambiguous}` partition a pure function of the input *sets*, independent of scan order
(REC-19 order-independence, REC-20 determinism).

## 5. Surfaces

### 5.1 Missing rows + Locate (manual override)

A **missing** row (in-scope, folder not found) shows in the project list — and, because
the browse UI is per-folder (§6), in a dedicated **Missing** filter/section that is not
tied to a folder — with a reddish background, an "offline / not found" badge, last-known
name/path, and a **Locate…** button.

Locate opens an **in-app folder browser rooted at the active library** (reuse `listDir` —
this enforces the can't-escape-root scope and preserves the read-only invariant; the OS
picker can't be constrained to a subtree). User selects a folder; score
`overlap(selected, row)` and branch:

1. **Target already owned by another row** → block: *"That folder is already tracked as
   'X'."* (Never create two rows for one folder.)
2. **Strong overlap** → *"Looks like a match"* → associate.
3. **Weak / no overlap** → soft warning: *"This folder doesn't look like the same project
   (no shared versions). Associate anyway?"* → allow on confirm (this is the S7 path).

**Associate** = carry the human metadata (status / rating / notes) onto the chosen folder
and **recompute** the derived identity (`abs_path`, `folder_name`, `als_files`), clearing
missing. Human metadata is never silently discarded; only the derived signature is replaced.

- **Server-side scope check:** `associate(metaId, absPath)` is a direct IPC call, so the
  main process re-validates that `absPath` is a real, present project folder **under the
  active root** before writing — it does not rely on the UI having constrained the picker.
- **Undo:** associate stashes the row's prior `{abs_path, als_files, folder_name}` so a
  wrong (forced) association can be reverted ("Detach"), restoring the row to its prior
  identity (missing if its old folder is still gone). One level of undo is enough.

### 5.2 Other libraries (out-of-scope rows)

A muted, collapsible list of rows whose `abs_path` is under a **different** root than the
active one (S6 — projects from another library). They are preserved, never shown as
"missing", and reappear normally when their root is reselected. Optional to surface in
Phase 1 (could start as just a count + "switch library" hint), but the data model keeps
these rows regardless.

## 6. IPC / renderer surface

The browse model stays **Finder-style per-folder** (`fs:list` lists one directory); the
new identity model adds a **global reconcile pass** that runs on launch and on Refresh
(consistent with architecture.md's "manual rescan on launch + Refresh" model). The two are
reconciled as follows:

- `reconcileLibrary()` *(channel `meta:reconcile`)* — runs a full `findProjects(root)`
  sweep + §4 `reconcile`, then **persists**: `bind` → refresh `als_files`/`last_seen_at`;
  `rebind` → update `abs_path`/`folder_name`/`als_files`/`last_seen_at`; `duplicate` →
  `copyMeta(sourceRowId, project)`. `missing` is **derived, not persisted** (it's just
  in-scope rows not seen this sweep). `newp` is **not** persisted (rows stay lazy — created
  on first metadata edit, as today). Returns the sets the per-folder list can't surface:

  ```
  reconcileLibrary() → {
    missing:        [{ id, folderName, absPath, status, rating, notes }],
    ambiguous:      [{ project:{absPath,folderName}, candidates:[{id, exactOverlap, sizeOverlap, folderName}] }],
    otherLibraries: [{ id, folderName, absPath }]      // out-of-scope rows (§5.2)
  }
  ```
  (`getMissing(root)` / `getOtherLibraries(root)` are the underlying `db.js` read helpers;
  `ambiguous` comes straight from `reconcile`'s output.) Cost: one recursive tree walk per
  refresh — a behavior change from today's purely-lazy per-folder model; acceptable for a
  manual-rescan app, revisit if large libraries get slow.
- **Runtime sequencing (launch & Refresh):** the renderer calls `reconcileLibrary()`
  **before** `list(cwd)`, so rebinds/duplicates are persisted first and the subsequent
  `fs:list` reflects them. Flow: launch / `chooseRoot` / Refresh button → `meta:reconcile`
  (persist + collect missing/ambiguous/other) → `fs:list(cwd)` → render. (`App.jsx` Refresh
  and initial-load paths both gain the reconcile call ahead of the existing `list`.)
- `fs:list(relPath)` — unchanged per-folder navigation. `listFolder` now passes the active
  root to `getAllMeta(root)` (today it calls `getAllMeta()` with no arg, `ipc.js:63`) and
  merges by derived `rel_path` for the projects in *this* folder.
- `getAllMeta(activeRoot)` — **changed signature.** Filters to in-scope rows
  (`abs_path` under `activeRoot`), returns a map keyed by derived
  `rel_path = relative(activeRoot, abs_path)`. Out-of-scope rows are excluded (their key
  would contain `../`). Derivation must be exact so per-folder matching still works; the
  unique index on `abs_path` guarantees two in-scope rows can't share a key.
- `meta:set` / `setProjectMeta` — **changed; the filesystem read lives in `ipc.js`, not
  `db.js`** (keep `db.js` synchronous and FS-free). The `meta:set` handler:
  1. resolves `absPath = join(settings.root, relPath)` and `folderName = basename(relPath)`;
  2. reads that folder's current `.als` files via the scanner (`readEntries(absPath)` →
     `alsFilesOf(files)`) — read-only `stat`, same as the scan; a folder with **no `.als`**
     yields `[]` (no crash);
  3. calls `setProjectMeta(absPath, folderName, alsFiles, patch)` *(new signature — was
     `setProjectMeta(relPath, patch)`)*, which upserts `INSERT … ON CONFLICT(abs_path) DO
     UPDATE` (targets the unique index, §3.1), updating `als_files`/`folder_name` too.

  So a freshly-tagged project gets a real signature immediately and is move-safe without
  waiting for the next reconcile. Preload `setProjectMeta(relPath, patch)` and the
  renderer call (`App.jsx:105`) keep passing `relPath` — only the main side resolves it.
- `locateCandidates(metaId)` / `associate(metaId, absPath, { force })` / `detach(metaId)` —
  the Locate flow; `associate` returns `{ ok }` / `{ blocked:'owned-by', byName }` /
  `{ needsConfirm:'weak-match' }`; `detach` undoes a prior associate. **Ambiguous
  resolution reuses `associate(chosenCandidateId, project.absPath, { force:true })`** — when
  the user picks a candidate from the dialog, it's the same bind operation (no separate
  channel).
- `getStatusCounts(activeRoot)` — **decision: count in-scope rows only** (`abs_path` under
  the active root), i.e. what's relevant to the current library. *Not* "present-only":
  "present" is a per-scan predicate not available at count time (this channel,
  `meta:statusCounts` / `App.jsx:44`, runs outside any scan), so in-scope is the
  deterministic, buildable rule. Pass the root (read from settings, or as an arg). (Today it
  takes no arg and counts all rows, `db.js:75`.)

Renderer: reddish row style + "missing" badge + **Locate…** button; a Missing section/
filter and a muted other-libraries list; the Locate dialog reuses the existing
folder-navigation component.

## 7. Module layout

- `src/main/scanner/signature.js` *(new, pure)* — `stemOf(name)`, `alsFilesOf(files)`
  (drops `size===0`), `overlap(a, b)` (multiset exact + size), `isStrong(overlap)`
  (`exactOverlap>=2 || sizeOverlap>=2`). **`stem()` is currently a private const in
  `scanner/index.js:21`** — extract it here as `stemOf` and re-import it into the scanner
  (`pickVersions`/`pickExports` at `index.js:66,78` use it) so capture-time and match-time
  stems are computed by the one shared function.
- `src/main/scanner/reconcile.js` *(new, pure)* — `reconcile(activeRoot, present, rows)`.
- `src/main/scanner/index.js` — `readEntries` also captures `size` (the existing
  `stat(...)` at `index.js:49` already returns it — add it to the pushed file object);
  `buildProject` attaches `absPath` (its `dir`) and `alsFiles` (= `alsFilesOf(files)`).
- `src/main/db.js` — `SCHEMA_VERSION` constant + `checkSchema(db)` (§3.2/§3.3: returns
  `'ok' | 'fresh' | 'incompatible'`; **creates `project_meta` only in the `'fresh'`
  branch** — remove the unconditional `CREATE TABLE project_meta` from `initDb`; keep
  `settings` creation unconditional) and `resetDb()` (`db.close()` → unlink db/-wal/-shm →
  re-`initDb`); revised `getAllMeta(root)`, `setProjectMeta(absPath, folderName, alsFiles,
  patch)` (sync, no FS — ON CONFLICT(abs_path)), `getStatusCounts(root)` (in-scope); new
  `copyMeta(sourceRowId, project)`, `rebindMeta(rowId, project)`, `associateMeta`,
  `detachMeta`, `getMissing(root)`, `getOtherLibraries(root)`.
- `src/main/index.js` (app entry) — `initDb` already runs here; surface
  `checkSchema`'s `'incompatible'` result and show the `dialog.showMessageBoxSync`
  Reset/Quit prompt (§3.2) **before** `createWindow()`. On Reset → `resetDb()` then proceed.
- `src/main/ipc.js` / preload — the surface in §6 (incl. the `meta:set` FS read via
  `readEntries`+`alsFilesOf`, and `meta:reconcile`, `meta:locateCandidates`, `meta:associate`,
  `meta:detach` channels).

## 8. Implementation phases

1. **Phase 1 — identity core (all S1–S8).** size-based `als_files` (drop size 0),
   `SCHEMA_VERSION` check + incompatible-DB reset, path-first `reconcile`, silent rebind
   at the ≥2 bar, copy-on-duplicate, derived missing, root-scoping, missing UI + Locate
   (+ detach undo) + a minimal other-libraries surface. This is the shippable unit.
2. **Phase 2 — robustness.** Optional background `sha1` per `.als` (cached when the file is
   local) to harden against size collisions; template-stem down-weighting (§2.3); fuzzy
   Jaccard ranking (over `.als` + Samples) for the ambiguous/Locate dialog; richer
   other-library management.

---

## 9. Read-only invariant

Confirmed clean and must stay so: signatures use `stat` only (same syscall already used
for mtime, `scanner/index.js:49`); `reconcile` is pure; Locate reuses read-only `listDir`;
`associate` and the incompatible-DB reset write/unlink only inside `userData`. No write/rename/mkdir/utimes/
createWriteStream against the music root anywhere in this feature. RO-1/RO-2 guard it.

---

## 10. Test matrix

All tests use Vitest with real temp dirs (as in `test/scanner.test.js`) for the
disk-touching paths, and plain in-memory data for the pure `reconcile`/`signature`
functions. Target: **every row below is at least one test.**

### 10.1 `signature.js` (pure)

| ID | Case | Expect |
|----|------|--------|
| SIG-1 | `alsFilesOf` ignores non-`.als`, Backup/, Samples/ | only top-level `.als` `{stem,size}` |
| SIG-2 | `overlap` identical sets | `exactOverlap = n`, `sizeOverlap = n` |
| SIG-3 | one file renamed (stem differs, size same) | `exactOverlap = n-1`, `sizeOverlap = n` |
| SIG-4 | one file edited (size differs) | that file drops from both overlaps |
| SIG-5 | extra version added on one side | overlap = the shared subset |
| SIG-6 | disjoint sets | `exactOverlap = 0`, `sizeOverlap = 0` |
| SIG-7 | coincidental shared size, different stems | `exactOverlap = 0`, `sizeOverlap = 1` |
| SIG-8 | `isStrong`: exact≥2 → true; size≥2 → true; exact==1 → false; size==1 → false; 0/0 → false | per §2.3 (≥2 bar) |
| SIG-9 | empty `als_files` on one or both sides | no overlap, not strong (no crash) |
| SIG-10 | duplicate sizes within a folder (two `.als` same size) | multiset: no double credit (`min(countA,countB)`) |
| SIG-11 | **`size===0` files excluded** | dropped from `als_files`; don't contribute overlap (S3 risk) |
| SIG-12 | template collision: single shared `{stem:"Template",size}` only | `exactOverlap==1` → **not** strong → dialog, not silent (S2 risk) |
| SIG-13 | `stemOf` parity | capture-time and match-time stems identical for same filename |

### 10.2 `reconcile.js` (pure) — the scenario core

| ID | Scenario | Setup | Expect |
|----|----------|-------|--------|
| REC-1 | S5 in-place, unchanged | row.abs_path == present.absPath, same sig | `bind`; als_files refreshed |
| REC-2 | S5 new version saved | same path, present has extra `.als` | `bind` (not new); als_files updated |
| REC-3 | S5 single `.als` content changed, same path | same path, sig fully different | `bind` (path-first wins) |
| REC-4 | S3 rename | path gone, exactOverlap≥2 with one orphan | `rebind`; abs_path/folder_name updated |
| REC-5 | S2 move | path gone (new parent), strong overlap one orphan | `rebind` |
| REC-6 | S2/S3 move + add version | path gone, ≥2 old versions overlap | `rebind` |
| REC-7 | S1 restore | orphan was missing last scan, folder reappears with strong overlap | `rebind` |
| REC-8 | S4 duplicate | original present at its path (bound in A) + copy present same sig, no orphan | `duplicate(source)` for the copy |
| REC-9 | S4 duplicate then original deleted | only the copy present, single strong orphan | `rebind` (survivor inherits) — documented |
| REC-10 | S1 delete | in-scope row, no present folder matches | `missing` |
| REC-11 | brand new | present folder overlaps nothing | `newp` |
| REC-12 | ambiguous: two orphans tie strongly | one present, two orphans both exactOverlap≥2 | `ambiguous` with both candidates |
| REC-13 | ambiguous: single-file overlap | present exactOverlap==1 (or sizeOverlap==1) with one orphan | `ambiguous` (not silent rebind) — S2 bar |
| REC-14 | duplicate vs. move precedence | sig matches both a resolved row and an orphan | orphan **rebind** wins; copy (if any) → duplicate |
| REC-15 | out-of-scope rows ignored | row.abs_path under a different root | neither bind/missing/ambiguous |
| REC-16 | two duplicates of one original | original + 2 copies present | one `bind` + two `duplicate(source)` |
| REC-17 | no rows at all | empty `rows` | all present → `newp`, nothing else |
| REC-18 | no present at all | empty `present` | all in-scope rows → `missing` |
| REC-19 | **move + duplicate same scan** | original moved /A→/B AND copy /C, same sig; run with `present` as [/B,/C] **and** [/C,/B] | both orders → exactly one `rebind` + one `duplicate`, **no `newp`** (resolved-set fix; order-independent per §4.1) |
| REC-20 | determinism | same input set, shuffled order, run twice | identical partition (§4.1) |

### 10.3 Root scoping (S6) — pure + db

| ID | Case | Expect |
|----|------|--------|
| ROOT-1 | row under active root, found | present (in_scope, not missing) |
| ROOT-2 | row under active root, not found | missing |
| ROOT-3 | row under a different root | hidden (not present, not missing) → other-libraries |
| ROOT-4 | switch root A→B then B→A | A's rows hidden under B, reappear under A unchanged (no DB mutation) |
| ROOT-5 | nested roots (parent then child) | one row per folder; visible under whichever root contains it; no duplication |
| ROOT-6 | `rel_path` derivation | `relative(activeRoot, abs_path)` correct for present rows |

### 10.4 Locate / associate (§5)

| ID | Case | Expect |
|----|------|--------|
| LOC-1 | strong-overlap target | associate ok; abs_path/folder_name/als_files recomputed; missing cleared; status/rating/notes preserved |
| LOC-2 | weak/no-overlap target, no force | `needsConfirm:'weak-match'`; no change yet |
| LOC-3 | weak/no-overlap target, force=true | associate ok (S7 recovery); human metadata preserved, identity recomputed |
| LOC-4 | target already owned by another row | `blocked:'owned-by'` with that row's name; no change |
| LOC-5 | target outside active root (direct IPC) | rejected server-side before scoring (scope invariant) |
| LOC-6 | candidate ranking | `locateCandidates` returns folders ordered by overlap strength (deterministic) |
| LOC-7 | **detach / undo** | after a forced associate, `detach` restores prior abs_path/als_files (or missing) |

### 10.5 db / schema-version & reset

| ID | Case | Expect |
|----|------|--------|
| VER-1 | fresh DB (no `project_meta` table) | `checkSchema()` → `'fresh'`; creates schema; `user_version == SCHEMA_VERSION` |
| VER-2 | current DB (`user_version == SCHEMA_VERSION`, table present) | `checkSchema()` → `'ok'`; no reset |
| VER-3 | old DB (`user_version == 0`, old `rel_path` table present) | `checkSchema()` → `'incompatible'` (S8) |
| VER-4 | future DB (`user_version` > SCHEMA_VERSION) | `checkSchema()` → `'incompatible'` (don't silently misread a newer format) |
| VER-5 | `resetDb()` | unlinks `songlist.db` + `-wal` + `-shm`; recreates empty schema at current version; old rows gone |
| VER-6 | reset is read-only-safe | only files under `userData` touched; nothing under any music root (RO) |
| VER-7 | **fresh-then-reboot (B2 trap)** | first `checkSchema` on empty file → `'fresh'` (creates+stamps); immediate second `checkSchema` on same db → `'ok'`, **not** `'incompatible'` |
| VER-8 | nothing creates `project_meta` before check | with the unconditional `CREATE TABLE` removed, a fresh DB is never misread as `'incompatible'` |
| DB-1 | `copyMeta` | new row, same status/rating/notes, fresh id, copy's abs_path & als_files |
| DB-2 | `rebindMeta` | abs_path/folder_name/als_files/last_seen_at updated; human metadata untouched |
| DB-3 | `associateMeta` / `detachMeta` | as LOC-1/3/7 at the persistence layer |
| DB-4 | `setProjectMeta(absPath, folderName, alsFiles, patch)` on a **new** project | creates row with those values; `ON CONFLICT(abs_path)` **updates** (not duplicates) on re-set |
| DB-5 | `setProjectMeta` als_files capture edge cases | folder with **no `.als`** → `als_files == '[]'` (no crash); re-set after the folder's `.als` set changed → `als_files` refreshed |
| DB-6 | `getAllMeta(root)` scope | excludes out-of-scope rows; no two in-scope rows collide on derived rel_path |
| DB-7 | `getStatusCounts(root)` scope | counts **in-scope** rows (abs_path under root); out-of-scope excluded |
| DB-8 | `applyStatusChanges` | status rename/delete still propagates across all rows |

### 10.6 Read-only invariant (regression guard)

| ID | Case | Expect |
|----|------|--------|
| RO-1 | full reconcile + locate + associate + DB reset over a temp library | snapshot of music-folder mtimes/inodes/entries **unchanged** before vs. after |
| RO-2 | static grep guard | no `writeFile|mkdir|rename|unlink|createWriteStream|utimes|chmod` introduced under `src/main/` targeting music paths (extend the CLAUDE.md self-check) |

### 10.7 Integration (real temp dirs, end-to-end through `reconcileLibrary`)

| ID | Flow | Expect |
|----|------|--------|
| INT-1 | create project → set meta → rename folder → reconcile | meta follows (S3) |
| INT-2 | move folder to a different subfolder → reconcile | meta follows (S2) |
| INT-3 | duplicate folder → reconcile | both carry meta, then edit one → they diverge (S4) |
| INT-4 | delete folder → reconcile → row missing → recreate → reconcile | missing then auto-restored (S1) |
| INT-5 | delete folder → Locate to a renamed/divergent folder (force) → then detach | associate recovers (S7), detach reverts (LOC-7) |
| INT-6 | switch root away and back | hidden then restored (S6) |
| INT-7 | save a new `.als` version in place → reconcile | not treated as new (S5) |
| INT-8 | **old-DB sim**: seed an old-schema `rel_path` DB → boot | `checkSchema` → incompatible; on Reset, DB wiped + recreated; app runs clean (S8) |

---

## 11. Changelog

- **v3.1 (2026-06-28):** Completeness pass before implementer hand-off. Fixed the §4
  `resolved`-set bug (Step B now pushes the rebound row → REC-19 move+duplicate works);
  pinned the fresh-DB boot ordering (`project_meta` created only in `checkSchema`'s
  `'fresh'` branch, unconditional `CREATE TABLE` removed → no first-run false-incompatible,
  VER-7/8); called out that reset also clears `settings` (root/app prefs) and that
  `settings` stays unconditional; specified `setProjectMeta(absPath, folderName, alsFiles,
  patch)` with the FS read in `ipc.js` (not `db.js`); changed `getStatusCounts` decision to
  **in-scope** (not "present", which isn't knowable at count time); gave `reconcileLibrary`
  /`getMissing`/`getOtherLibraries` concrete channels + return shapes; specified launch/
  Refresh sequencing (reconcile before list) and ambiguous-resolution reuse of `associate`;
  unified §3.2/§3.3 on one `checkSchema`; noted `stem()` extraction; flagged downgrade-
  wipes-newer-data as accepted. Consistency: dropped "partial" index wording, stale "A'"
  and "non-null abs_path" phrasing; fixed a line citation. Tests: VER-7/8, DB-5 als capture
  edges, DB-7 in-scope.
- **v3 (2026-06-28):** Dropped migration entirely (pre-release, no real users). Old
  `rel_path`-schema DBs are now **detected and reset** via a native Reset/Quit dialog
  (§3.2) rather than migrated. Removed the `legacy_rel_path` column, the first-scan
  re-location step (old Step A'), and the `abs_path == NULL` legacy state — `abs_path` is
  now always set (`NOT NULL`) with a unique index. Kept and generalized the
  `user_version` / `SCHEMA_VERSION` **versioning mechanism** as the forward-looking hook for
  real migrations later (§3.3). "Previously tracked" → "other libraries" (out-of-scope
  rows only). Tests: replaced `MIG-*` with `VER-*` + reset cases; dropped REC-21/22/23,
  ROOT-7, LOC-8; INT-8 now an old-DB-reset sim.
- **v2 (2026-06-28):** Reworked after design review. Added: `user_version`-gated,
  idempotent, transactional migration that stores `legacy_rel_path` and leaves `abs_path`
  NULL (no `join(null/foreignRoot, …)`); first-scan legacy re-location (§3.3, Step A');
  raised silent-rebind bar to **≥2** overlapping files (template false-positive); `size===0`
  exclusion; multiset overlap definitions; `setProjectMeta` signature-capture +
  `ON CONFLICT(abs_path)`; `getAllMeta(root)` scope-filtered signature; `getStatusCounts`
  present-in-scope decision; per-folder-UI vs. global-reconcile reconciliation + Missing /
  Previously-tracked surfaces; Locate server-side scope check + detach/undo; duplicate
  source includes rebound rows (fixes move+duplicate, REC-19); determinism spec (§4.1).
  New scenario S8 (upgrade) and tests SIG-11..13, REC-19/21/22/23, ROOT-7, LOC-7/8,
  MIG-*, DB-5/6/7, INT-8/9.
- **v1:** initial plan.
