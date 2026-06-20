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
- **Node.js 20 LTS or 22 LTS** (includes npm). These have prebuilt `better-sqlite3`
  binaries, so install just works.
  - ⚠️ Very new Node (e.g. 25+) can't compile the native SQLite module from source.
    If you're on such a version, use `npm run setup` (below) — it builds the module
    against Electron's bundled Node instead, sidestepping the issue. (Switching to an
    LTS via `nvm` is the simpler fix.)

## Install on a Mac (from a copy of this repo)

Do this on each machine — it builds the app for that machine's architecture
(works on both Apple Silicon and Intel).

```bash
cd ableton-song-manager      # the copied/cloned repo

npm install                  # installs deps; rebuilds SQLite for Electron
npm run install:mac          # builds Sessions.app and installs it to /Applications
```

Then launch **Sessions** from /Applications or Spotlight. On the very first launch
macOS may warn it's from an unidentified developer (the app is built locally and
unsigned) — right-click the app → **Open** once to allow it.

Notes for a fresh machine:
- Requires **Node.js 20 LTS or 22 LTS** (see Requirements above). Don't copy
  `node_modules` between machines — run `npm install` fresh so the native SQLite
  module is built for that machine. If you copied it by accident:
  `rm -rf node_modules && npm install`.
- If `npm install` fails building the native SQLite module (only on very new Node),
  use `npm run setup` instead, then re-run `npm run install:mac`.
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

Derived from real-folder research — see
[docs/ableton-project-structure.md](./docs/ableton-project-structure.md) and
[docs/ableton-folder-survey.md](./docs/ableton-folder-survey.md).

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
