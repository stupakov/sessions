# Ableton Live Project Structure — Research Notes

> Reference knowledge for how Ableton organizes projects on disk. This drives the
> app's scanning, version-detection, and export-matching logic. Last updated:
> 2026-06-19. Sources listed at the bottom.
>
> ✅ **Verified against the real library** (~198 projects) — see
> [ableton-folder-survey.md](./ableton-folder-survey.md). Notable confirmations:
> project folders are named `"<name> Project"` (the suffix is stripped for display),
> versioning is highly varied (so "latest" = most-recently-modified `.als`, not the
> highest number), and convention-following exports match a version stem exactly.

## TL;DR for this app

- A **Project is a folder**. The project/song file inside it is a **`.als`**
  ("Ableton Live Set", gzipped XML). It is **not** `.alp` — that's a distributable
  *Live Pack*.
- A project folder typically contains: one or more **`.als`** files at its root,
  plus the subfolders **`Ableton Project Info/`**, **`Samples/`**, and (once Live
  has auto-saved) **`Backup/`**.
- **Versions** you save by hand (`Song.als`, `Song 2.als`, …) sit at the **root**
  of the project folder. Live's *own* timestamped auto-saves go in **`Backup/`** —
  we ignore `Backup/`.
- **Exports** (`.wav` / `.mp3`) are not created by Live automatically; the user
  exports them, and by this user's convention they land in the **project folder
  root** with the **same base name** as the Set. Other audio (samples, stems,
  collected media) lives in **`Samples/`** or other subfolders and must be excluded.

## Project folder anatomy

```
Song Project/                    ← the "project" (one row in our UI)
├── Song.als                     ← a Live Set (version 1)
├── Song 2.als                   ← a hand-saved version (root level)
├── Song 3.als                   ← latest hand-saved version
├── Song.wav                     ← export of a version (root level)  ← PLAYABLE
├── Song 3.wav                   ← export of latest version          ← PLAYABLE
├── Song 3.mp3                   ← mp3 export (root level)            ← PLAYABLE (fallback)
├── Ableton Project Info/        ← project metadata (auto-created)
│   └── Project9_5.cfg, ...
├── Samples/                     ← project media — NOT exports
│   ├── Imported/                ← samples dragged/imported into the Set
│   ├── Processed/               ← warped/processed/frozen/flattened audio
│   │   └── Crop, Freeze, Consolidate, Resample, ...
│   └── Recorded/                ← audio recorded into the Set
├── Backup/                      ← Live's automatic timestamped .als saves — IGNORE
│   └── Song [2026-06-19 143000].als
└── *.asd                        ← per-sample analysis sidecars (warp/tempo cache)
```

Notes:
- The project folder gets its **name from the Set you first saved into it**.
- A `.als` only **references** audio by path; it does **not** embed audio. That's
  why `Samples/` and `.asd` files exist.
- `Samples/Recorded/` and `Samples/Processed/` are written by Live automatically;
  `Samples/Imported/` is populated when you import or run **Collect All and Save**.

## Live-specific file extensions

| Ext | What it is | Relevant here? |
|-----|------------|----------------|
| **`.als`** | **Ableton Live Set** — the project/song file (also used for templates). Gzipped XML. | **Yes — this defines a project and its versions.** |
| `.alp` | Ableton **Live Pack** — self-installing/compressed bundle of a project + content. | No (not what the user saves as versions). |
| `.asd` | **Analysis file** — warp markers, tempo, transient/loop data for a sample. Sits next to the audio it analyzes, same name + `.asd`. | Exclude (sidecar, not an export). |
| `.alc` | **Live Clip** — a saved clip (references audio, doesn't embed it). | No. |
| `.adg` | **Device/Rack group preset** (instrument/drum/effect racks). | No. |
| `.adv` | **Device preset** (single instrument/effect). | No. |
| `.agr` | **Groove file** — timing/feel. | No. |
| `.ams` | **Meta Sound** — Operator additive waveform. | No. |
| `.amxd` | **Max for Live device**. | No. |
| `.ask` | **Skin** — UI color scheme. | No. |

Audio container formats Live reads/writes: **WAV, AIFF, MP3, AAC, Ogg Vorbis,
FLAC**. For exports this user uses **WAV** and **MP3**.

## The `Backup` folder (why we skip it)

When you save a Set, Live also writes a **timestamped copy into `Backup/`** inside
the project folder (e.g. `Song [2026-06-19 143000].als`). These are automatic
recovery points, separate from the versions a user deliberately saves at the
project root. **Our scanner must exclude `Backup/`** so only intentional versions
appear in the Open dropdown.

## Versioning convention (this user)

The user saves successive versions by **Save As** within the same project folder,
appending a number: `Song.als`, `Song 2.als`, `Song 3.als`, … (Ableton's own
"Save a Copy"/manual numbering — producers commonly accumulate dozens).

**Design decision:** "latest" = **most-recently-modified `.als` at the project
root** (mtime), not the highest number. This is robust to non-standard naming and
matches the user's stated preference. The Open button is labeled with that file's
name; the dropdown lists all root-level `.als` files (excluding `Backup/`),
newest first.

## Export matching rules (this app)

A file is treated as a **playable export** of a project iff **all** hold:

1. It is directly in the **project folder root** (not in any subfolder — this
   excludes `Samples/**`, stems exported to subfolders, and collected media).
2. Its extension is **`.wav`** or **`.mp3`** (case-insensitive).
3. Its **stem** (filename without extension) equals the **project base name** or
   the stem of one of the project's `.als` versions
   (e.g. project `Song` → matches `Song.wav`, `Song 3.wav`, `Song 3.mp3`).

Default-to-open selection:
- Prefer **WAV**; fall back to **MP3** only if no WAV export exists.
- Within the chosen format, default to the **most-recently-modified** file; the
  dropdown lists every matching export.
- If **no** matching export exists, the **Play button is disabled**.

This deliberately avoids picking up:
- Stems / multitrack exports saved into subfolders.
- Samples and "Collect All and Save" media under `Samples/`.
- Unrelated audio whose name doesn't match the project/version base name.

> Known edge case: exports named differently from the Set (e.g. `Song master.wav`)
> won't match. The user's stated convention is same-name exports, so we match
> exactly on stem to stay safe. Revisit if false negatives show up.

## Project-detection rule (this app)

A directory is a **project** iff it **directly contains ≥1 `.als` file** (at its
own root). The scanner walks the chosen root recursively and skips: `Backup/`,
`Ableton Project Info/`, `Samples/`, and dot-folders. This naturally handles both
of the user's layouts — projects directly inside the `songs/` root **and** projects
nested one or more levels deep — with **one row per project folder**.

## Non-destructive guarantee

The app **only reads** the music folder (`readdir`/`stat`) and **launches files**
(`shell.openPath`). It never writes, creates, renames, or deletes anything inside
the scanned folder. All app state lives in Electron's `userData` directory.

## Sources

- [Ableton Reference Manual — Managing Files and Sets](https://www.ableton.com/en/manual/managing-files-and-sets/)
- [Ableton Help — Saving Projects](https://help.ableton.com/hc/en-us/articles/115000915804-Saving-Projects)
- [Ableton Help — Live-specific file types](https://help.ableton.com/hc/en-us/articles/209769625-Live-specific-file-types)
- [Ableton Help — Managing Audio Clips and Samples](https://help.ableton.com/hc/en-us/articles/5068208334226-Managing-Audio-Clips-and-Samples)
- [Sonic Bloom — The Guide to Ableton Live File Formats](https://sonicbloom.net/the-guide-to-ableton-live-file-formats/)
- [Sonic Bloom — Save Ableton Live Projects the Right Way](https://sonicbloom.net/save-ableton-live-projects-the-right-way/)
- [Ibekso — Ableton file types](https://medium.com/@ibekso/ableton-file-types-da7770f6b105)
- [Ibekso — What are ASD files?](https://medium.com/@ibekso/what-are-asd-files-4e0b9e9bcc5)
