# WIP/being-worked-on — the active queue

What is in hand right now.

## Contents

**`app-gap-2.7.0.md`** — the work queue for the app rebuild, generated
2026-10-14 from the 2.7.0 client extraction. For each of the 17 game systems
it lists:
- every place `src/` disagrees with the game, ranked by severity, with a
  citation;
- what the game has that the app lacks;
- what is decided server-side or still unresolved.

Truth lives in `Reference/Game/`. This file only lists the gaps. The rows
were written by the extraction agents and were not independently re-checked.
Confirm a row against its cited lines before acting on it.

Note that 24 files in `src/` cite documents archived on 2026-10-14
(`combat-model.md`, `big-rework-v1-notes.md`, `game-systems.md`,
`combat-audit-2026-07-28.md`, `calibrate-pvp-refs.mjs`). Those archived
documents still describe what that code does, but not what the game does.
The citations go away as each file is rebuilt.

**`github-issues-2026-07-29.md`** — triage of the 10 GitHub issues open on
2026-07-29. Investigated; nothing fixed. The UI issues (#1, #2, #4, #5, #7, #8)
still stand. Re-check the data issues against the extracted catalogues
before trusting this file's proposed patches:
- **#6 and #10:** probably answered. `Reference/Game/sigils.md` gives the real
  spell values, which can be derived from sigil level, and the per-stat caps.
- **#3 (forge tier):** not settled by `sigils.md`.
- **#9 (the missing major glyph):** "Festering Coil" does not appear by that
  name in `mounts-glyphs.md`'s 42-glyph catalogue.

## Retired from this queue on 2026-10-14

- `combat-audit-2026-07-28.md` and its open item, the PVP survivability
  factor's shape. The factor was a stand-in for a fight model we could not see.
  The client ships the real one (`Reference/Game/combat-pvp.md`). Archived.
- `comment-to-docs-migration.md` — finished. Archived.
