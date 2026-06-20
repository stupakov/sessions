# Architecture & Decisions

> Living document for the design of the Ableton Song Manager. Update as the project
> evolves. Last updated: 2026-06-19.

## What this app is

A personal (single-user) macOS desktop app that **indexes a folder of Ableton
projects read-only**, shows them in a sortable table, lets the user keep metadata
(status, star rating, notes) per project, and provides smart **Open** (Ableton
versions) and **Play** (WAV/MP3 exports) split-buttons. See
[ableton-project-structure.md](./ableton-project-structure.md) for the domain rules.

## Chosen stack

| Concern | Choice | Why |
|---------|--------|-----|
| Desktop shell | **Electron** | Pure JS, standard macOS path, no native toolchain. |
| Build/dev | **electron-vite** | Clean main/preload/renderer split + HMR. |
| UI | **React + Vite** | Mainstream, easy to test. |
| Styling | **Tailwind CSS + shadcn/ui** | Elegant defaults, customizable; ships Table, Dialog, split-button (DropdownMenu) primitives. |
| Storage | **SQLite via better-sqlite3** | Synchronous, robust, clean sorting; lives in `userData`. |
| Tests | **Vitest + Testing Library** | Fast; core logic is plain functions. |
| Packaging | **electron-builder** | Local `.app` when wanted. |
| Folder refresh | **Manual rescan** (on launch + Refresh button) | Simple, predictable, snappy. |

## Process split

- **Main (Node):** all disk access + business logic + SQLite + IPC handlers.
- **Preload:** `contextBridge` exposes a typed, minimal API. `nodeIntegration` off,
  `contextIsolation` on.
- **Renderer (React):** UI only; talks to main via the exposed API.

## Non-destructive guarantee

The music folder is touched only by read APIs (`fs.readdir`, `fs.stat`) and
`shell.openPath`. There is **no write path** to it anywhere in the code. App state
(SQLite db, settings) lives in Electron `userData`. This is an invariant — verify it
stays true on every change.

## Storage location & upgrade safety

All app state lives in **`app.getPath('userData')`**, which on macOS is
`~/Library/Application Support/ableton-song-manager/` — the canonical place for
per-app data. It contains `songlist.db` (+ `-wal`/`-shm` WAL sidecars).

This directory lives **outside** the `.app` bundle, so it **survives app upgrades
and re-installs** (replacing/reinstalling the `.app` never touches it). Data is only
lost if the user deletes that folder or the app's *name* changes.

To keep the location stable, `main/index.js` sets the display name with
`app.setName('Sessions')` but then **explicitly pins** the data dir with
`app.setPath('userData', join(app.getPath('appData'), 'ableton-song-manager'))`.
The explicit `setPath` overrides any name-derived default, so the display name can
change (and packaged `productName` can differ from dev) without ever moving the
DB/config. Dev and packaged share one stable DB forever.

A **single-instance lock** (`app.requestSingleInstanceLock()`) prevents two app
instances from opening the same DB and clobbering each other's settings.

The current **app version** (`app.getVersion()`, from `package.json`) is written to
the `appVersion` setting on every startup, so the config records which version last
wrote it (useful for future migrations) and the UI can display it.

## Data model (SQLite, `userData/songlist.db`)

```
settings      key TEXT PRIMARY KEY, value TEXT     -- root folder, per-type open apps, statuses JSON
project_meta  rel_path TEXT PRIMARY KEY,           -- path relative to root = stable key
              status TEXT,                         -- one of the configurable statuses
              rating INTEGER,                      -- 0–5 (0 = unset)
              notes TEXT,
              updated_at INTEGER
```

Disk-derived data (versions, exports, modified dates) is **computed live** each scan
and merged with `project_meta` by `rel_path`; never persisted, so it can't go stale.
Renaming/moving a project folder orphans its metadata (acceptable for single user).

## Core logic (pure, unit-tested) — `src/main/scanner/`

- `findProjects(root)` — recursive walk; a dir with ≥1 root-level `.als` is a project;
  skips `Backup/`, `Ableton Project Info/`, `Samples/`, dot-folders.
- `getVersions(projectDir)` — root-level `.als` (excl. `Backup/`), sorted by mtime desc.
- `getExports(projectDir, versionStems)` — root-level `.wav`/`.mp3` whose stem matches
  the project/version stems; WAV-preferred, MP3-fallback; sorted by mtime desc.
- `buildProjectRow(...)` — assembles name, modified date, versions, exports + merged meta.

See export/version/detection rules in
[ableton-project-structure.md](./ableton-project-structure.md).

## IPC surface (preload-exposed)

`selectRootFolder()`, `getProjects()`, `getSettings()`/`setSettings()`,
`getProjectMeta(relPath)`/`setProjectMeta(relPath, patch)`, `openPath(absPath)`,
`openWith(absPath, appPath)`. `.als` opens with system default (Ableton); `.wav`/`.mp3`
use the per-type configured app, falling back to system default.

## UI

- **Top bar:** root folder, **Refresh**, **Settings**.
- **Table** (sortable): Name, Status, Rating (★), Modified, Open, Play.
  - **Open** split-button: click → latest `.als`; label = latest version filename;
    dropdown = all versions.
  - **Play** split-button: click → default export (WAV-preferred); dropdown = all
    exports; disabled when none.
  - Row click / edit → metadata dialog.
- **Metadata dialog:** Status (select), Rating (stars), Notes (textarea).
- **Settings dialog:** root folder; per-type open apps for `.wav` and `.mp3`;
  editable status list (defaults: Idea, Loops, Arrangement, Mixing, Mastering,
  Completed, Released).

## Proposed layout

```
song-list/
  docs/                          # this folder — research + design notes
  package.json
  electron.vite.config.js
  src/main/      index.js  ipc.js  db.js  scanner/*.js
  src/preload/   index.js
  src/renderer/  App.jsx  components/*  lib/*
  test/          scanner.test.js  fixtures/
  vitest.config.js
```

## Build milestones

1. Scaffold electron-vite + Tailwind/shadcn; window opens.
2. Scanner core + unit tests against fixture trees.
3. SQLite layer + IPC wiring.
4. Folder picker + sortable table on real data + Refresh.
5. Open split-button (versions).
6. Play split-button (exports, WAV/MP3 logic, disabled states).
7. Metadata dialog persisted.
8. Settings dialog (root, per-type apps, status list).
9. Polish + packaged `.app`.

## Debug Console

An in-app log panel (toolbar **Debug** button or **⌘`**) shows a unified stream of
renderer and main-process logs. Implementation: `src/renderer/lib/logger.js` is a
small log bus; `src/main/logger.js` (`mlog`) prints to stdout and broadcasts each
entry over the `debug:log` IPC channel, which the preload forwards via
`onDebugLog`. The renderer also captures `window.onerror` /
`unhandledrejection`, so silent failures surface here. IPC handlers are wrapped
(`ipc.js#handle`) to log and re-throw errors.

## Gotchas (learned the hard way)

- **Preload must be CommonJS `.cjs`.** The package is `"type": "module"`, so a
  `.js` preload is parsed as ESM and its `require(...)` throws at load — the preload
  silently fails and `window.api` is `undefined`, making every IPC-backed control
  do nothing. Fix: emit preload as `index.cjs` (electron-vite `entryFileNames`) and
  point `webPreferences.preload` at it.
- **Native `better-sqlite3` won't compile against bleeding-edge system Node** (e.g.
  Node 25). Install with `npm run setup` so it's built against Electron's Node ABI
  instead. See README.

## Open questions / future ideas

- Live file-watching instead of manual refresh.
- Following metadata across renames (e.g. fuzzy/path-history matching).
- Reading tempo/key from `.als` XML (it's gzipped XML) to show extra columns.
