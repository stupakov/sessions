# Ableton Song Manager

A personal macOS desktop app that indexes a folder of Ableton Live projects
**read-only**, lists them in a sortable table, tracks per-song metadata (status,
star rating, notes), and provides smart shortcuts to open Ableton project versions
and play exported WAV/MP3 files.

> Single-user, local-only. The app **never writes** to your Ableton projects folder —
> it only observes it. All app data (SQLite db + settings) lives in the OS app-data
> directory (`~/Library/Application Support/ableton-song-manager`).

## Features

- Scans a chosen folder and lists every Ableton **project** (a folder containing
  `.als` files), whether at the top level or nested in subfolders.
- Sortable table: **Name · Status · Rating · Modified**, plus Open and Play actions.
- **Open** split-button: opens the latest `.als` (labeled with its filename); the
  dropdown lists every version, newest first.
- **Play** split-button: opens the latest export (WAV preferred, MP3 fallback);
  dropdown lists all exports; disabled when a project has none.
- Per-song **status**, 1–5 **star rating**, and **notes** (stored in SQLite).
- Settings: choose the projects folder, set the app used to open WAV and MP3
  independently, and edit the status list.

See [`docs/`](./docs) for the design and the Ableton-folder research.

## Requirements

- **macOS**
- **Node.js 22 LTS** (includes npm 10). The exact pinned version lives in
  [`.tool-versions`](./.tool-versions) (asdf) and [`.nvmrc`](./.nvmrc) (nvm/fnm), and
  `package.json` `engines` enforces it. Node 22 ships prebuilt `better-sqlite3`
  binaries, so install just works.
  - ⚠️ **Don't build with a too-new Node (23+, e.g. 26).** Two things break: (1) the
    native SQLite module can't compile against newer V8 headers from source, and
    (2) npm 11 added an `allow-scripts` gate that silently skips the native rebuild.
    The repo's `.npmrc` sets `engine-strict=true`, so a wrong toolchain now **fails
    immediately** with a clear `EBADENGINE` message instead of a cryptic gyp crash.
  - **Get the pinned Node automatically:**
    - asdf: `asdf install` (reads `.tool-versions`)
    - nvm: `nvm install` then `nvm use` (reads `.nvmrc`)
    - fnm: `fnm use --install-if-missing`
    If you use asdf, make sure its shims win in your `PATH` (e.g. don't keep a
    Homebrew `node` linked that shadows them — `brew unlink node`).

## Install on a Mac (from a copy of this repo)

Do this on each machine — it builds the app for that machine's architecture
(works on both Apple Silicon and Intel).

```bash
cd ableton-song-manager      # the copied/cloned repo

asdf install                 # or: nvm install && nvm use  — get the pinned Node 22
npm install                  # installs deps; rebuilds SQLite for Electron
npm run install:mac          # builds Sessions.app and installs it to /Applications
```

Then launch **Sessions** from /Applications or Spotlight. On the very first launch
macOS may warn it's from an unidentified developer (the app is built locally and
unsigned) — right-click the app → **Open** once to allow it.

Notes for a fresh machine:
- Requires the **pinned Node 22 LTS** (see Requirements above). Don't copy
  `node_modules` between machines — run `npm install` fresh so the native SQLite
  module is built for that machine. If you copied it by accident:
  `rm -rf node_modules && npm install`.
- If `npm install` errors with `EBADENGINE`, your Node/npm doesn't match the pin —
  run `asdf install` / `nvm use` first (see Requirements).
- As a last resort (e.g. no prebuilt SQLite binary for your platform), `npm run setup`
  installs deps without scripts and rebuilds SQLite against Electron's Node, then
  re-run `npm run install:mac`.
- Your data (DB + settings) lives in `~/Library/Application Support/ableton-song-manager`
  on each machine; it is **per-machine** and not synced.

### Updating the installed app after code changes

```bash
git pull            # (or copy the updated repo)
npm run install:mac # rebuild + reinstall to /Applications
```

### Development

```bash
npm run dev          # hot-reload dev build
```

In dev the menu bar / dock say **"Electron"** and the About box shows the Electron
icon — that's unavoidable because the running process is Electron's own bundle. Only
the packaged app (installed via `npm run install:mac`) shows the **Sessions** name
and icon. Use the installed app for real use; `npm run dev` for iterating.

### Other commands

```bash
npm test             # run the scanner unit tests (Vitest)
npm run build        # bundle main+preload+renderer into ./out (no packaging)
npm run pack:mac     # build Sessions.app into ./dist (no install, no .dmg)
npm run dist         # build a distributable .dmg in ./dist
```

## How it identifies projects, versions, and exports

See [docs/ableton-project-structure.md](./docs/ableton-project-structure.md) for the
Ableton on-disk conventions this is derived from.

- **Project** = a folder directly containing ≥1 `.als`. `Backup/`, `Samples/`,
  `Ableton Project Info/`, and dot-folders are skipped. Folder names ending in
  `" Project"` are shown without the suffix.
- **Versions** = the `.als` files at the project root; "latest" is the
  most-recently-modified one (robust to any numbering scheme).
- **Exports** = `.wav`/`.mp3` directly in the project root whose name matches the
  project or a version (e.g. `Song-3.als` → `Song-3.wav`). WAV preferred over MP3.
  Audio inside `Samples/` or other subfolders is never treated as an export.

## Stack

Electron · React + Vite (electron-vite) · Tailwind CSS · Radix UI · SQLite
(better-sqlite3) · Vitest. See [docs/architecture.md](./docs/architecture.md).

## Project layout

```
src/main/      main process: scanner (pure, unit-tested), SQLite, IPC
src/preload/   contextBridge API exposed to the renderer
src/renderer/  React UI (table, split-buttons, dialogs)
test/          scanner unit tests
docs/          research + architecture notes
```
