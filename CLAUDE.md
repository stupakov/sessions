# CLAUDE.md — Ableton Song Manager

Project guidance for AI assistants working in this repo. See `docs/` for the full
design and Ableton-folder research.

## ⛔️ CRITICAL INVARIANT: the Ableton projects folder is READ-ONLY

The app indexes a user-chosen folder of Ableton Live projects (e.g.
`~/Music/AbletonProjects`). **This folder, and everything inside it, must
NEVER be modified by this app — ever.** No creating, writing, appending, renaming,
moving, deleting, or changing permissions/timestamps of any file or directory under
the music root. The app only:

- **reads** directory entries and file metadata (`readdir`, `stat`),
- **reads** the first bytes of `.als` files to detect the Ableton version
  (`createReadStream` + gunzip, read-only),
- **launches** files in other apps (`shell.openPath`, `open -a`, `shell.showItemInFolder`).

All app state (settings + per-project metadata) lives in SQLite under Electron's
`userData` directory — never beside the projects.

When changing main-process code, preserve this invariant. Do not introduce
`writeFile`/`mkdir`/`unlink`/`rename`/`createWriteStream`/`utimes`/`chmod` (or shell
commands like `mv`, `rm`, `cp`, `touch`) that target paths under the music root.
A quick self-check before committing main-process changes:

```
grep -rnE "writeFile|appendFile|mkdir|rmdir|unlink|rename|rm\(|copyFile|chmod|utimes|truncate|createWriteStream|symlink" src/main/
```

The only legitimate "writes" are SQL statements against the app's own SQLite DB, plus
the single `unlinkSync(dbPath…)` in `db.js` `resetDb()` that deletes the app's own DB
(and its `-wal`/`-shm`) under `userData` when an incompatible schema is detected — never
a music path. The `RO-2` test (`test/identity-integration.test.js`) enforces exactly this
allowlist against `src/main/`.

## Architecture (quick map)

- `src/main/scanner/` — pure, unit-tested filesystem logic: `listDir` (Finder-style
  per-folder navigation), project/version/export detection, `readAlsVersion`.
- `src/main/db.js` — SQLite (better-sqlite3): settings + `project_meta`.
- `src/main/ipc.js` / `src/preload/index.js` — the IPC bridge (`window.api`).
- `src/renderer/` — React + Tailwind UI (table, split-buttons, dialogs, debug console).
- `test/` — Vitest tests for the scanner. Run `npm test`.

## Gotchas

- **Preload must be emitted as `.cjs`** (package is `"type": "module"`), else
  `window.api` is undefined and all IPC silently fails.
- **`better-sqlite3`** is native; if `npm install` fails to build it (very new Node),
  use `npm run setup`. See README.
- **Tests run under Electron's Node runtime**, not the system Node: `npm test` launches
  Vitest inside Electron via `scripts/run-tests.mjs` (resolves the Electron binary + the
  Vitest CLI from `node_modules` and runs them with `ELECTRON_RUN_AS_NODE=1`). This is the
  app's *actual* runtime. `better-sqlite3` is compiled for Electron's module ABI (132, via
  `electron-rebuild`) — an Electron-specific ABI that matches **no** standalone Node release
  (Node 20=115, 22=127, 24=137), so a plain `vitest run` on the system Node can't load the
  same native binary the app ships. The runner forwards args (`npm test -- <files>`) and
  propagates the exit code. The pure scanner/signature/reconcile tests don't touch SQLite
  and would pass under any Node.

## Conventions

- Keep scanner logic pure and covered by tests; see
  `docs/ableton-project-structure.md` for the Ableton conventions to verify against.
- Run `npm test` before committing changes to the scanner.
- Status colors are index-based (`src/renderer/lib/statusColors.js`) so they stay
  stable across renames and follow the user's status ordering.
