# Reference — current truth

Everything in here is believed accurate **right now**. If you find something
that isn't, fix it or archive it in the same change. Do not leave it.

## Two kinds of truth, kept apart

**`Game/` — what the game does.** Mechanics, formulas, caps and catalogues,
read from the decompiled 2.7.0 client, with a provenance tag and a line
citation on every number. This is the source of truth for game facts. Where an
app document, a code comment or a test disagrees with `Game/`, `Game/` wins
and the other one is the bug. Start at `Game/README.md`.

**`data-model.md`, `simulation.md`, `ui/` and `Notes/` — what the app does.** The app's persisted (v2)
shape, its scopes and normalisation, how it measures builds (statistics, search, result shape),
and the records of its design decisions. Since the 2026-10-14 rebuild the app's
engine is a port of the client, so app code cites `Game/` for every game fact; a Notes file is
accurate about the app and is never evidence about the game.

**`Source/` — raw inputs.** Screenshots, scrapes and the user's own answers.
Source material is never archived; it is the record of what the game showed
on a given date. The 2.7.0 client extract outranks every capture in it.

## Rules

- **Game facts go in `Game/`, nowhere else.** A comment or app note that needs
  one cites it (`see Game/combat-pvp.md §4`) instead of restating it.
- **Only [CODE] and [DERIVED] values may be stated to the user as game facts.**
  [SERVER] and [UNRESOLVED] are unknowns, and must be said to be.
- **When the game updates,** re-extract the affected `Game/` documents (see
  `Game/README.md`). The old version's numbers live in git history.
- **When later work makes a Notes file wrong,** archive it in the same change
  (see `Notes/README.md`).
