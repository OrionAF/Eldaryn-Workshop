# WIP/being-worked-on — the active queue

What is in hand right now.

## Contents

**`rebuild-plan.md`** — the architecture, persisted model v2 and slice plan for the 2026-10-14
rebuild. Built; kept here until the branch is merged, then it moves to `Reference/Notes/` (the
decision record) or the archive.

**`rebuild-progress.md`** — what was built, wave by wave, the doc findings the port produced, and
what is still open.

**`github-issues-2026-07-29.md`** — triage of the 10 GitHub issues open on
2026-07-29, against the v1 app. The rebuild replaced every component those issues name, so
each issue needs re-checking against the new app before it is fixed or closed (closing them on
GitHub is the user's call). The UI issues (#1, #2, #4, #5, #7, #8)
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
