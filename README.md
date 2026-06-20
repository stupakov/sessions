# Ableton Song Manager

A personal macOS desktop app that indexes a folder of Ableton Live projects
**read-only**, lists them in a sortable table, tracks per-song metadata (status,
star rating, notes), and provides smart shortcuts to open Ableton project versions
and play exported WAV/MP3 files.

> Single-user, local-only. The app **never writes** to your Ableton projects folder —
> it only observes it. All app data lives in the OS app-data directory.

## Status

Early development. Design is documented in [`docs/`](./docs); implementation is
proceeding by milestone (see [docs/architecture.md](./docs/architecture.md)).

## Stack

Electron · React + Vite · Tailwind CSS + shadcn/ui · SQLite (better-sqlite3) ·
Vitest. See [docs/architecture.md](./docs/architecture.md).

## Documentation

- [docs/ableton-project-structure.md](./docs/ableton-project-structure.md) — Ableton
  on-disk conventions and the rules this app derives from them.
- [docs/architecture.md](./docs/architecture.md) — stack, data model, design, milestones.
