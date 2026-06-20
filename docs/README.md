# Documentation

Project notes and accumulated knowledge for the Ableton Song Manager. Add to these
as the project evolves — research, design decisions, gotchas, conventions.

## Contents

- [ableton-project-structure.md](./ableton-project-structure.md) — how Ableton
  organizes projects on disk (file types, folder layout, versions, exports) and the
  exact rules this app uses for project detection, version selection, and export
  matching.
- [ableton-folder-survey.md](./ableton-folder-survey.md) — read-only survey of the
  real library that verified those rules against ~198 actual projects, plus the code
  changes it prompted and the accepted edge cases.
- [architecture.md](./architecture.md) — chosen stack, data model, core logic, IPC
  surface, UI, layout, milestones, and open questions.

## Conventions

- Keep each doc focused; link between them rather than duplicating.
- When a design decision changes, update the relevant doc and note the date.
- Drop new research (e.g. parsing `.als` XML, OS integration quirks) here as its own
  file and link it from this index.
