# Archive — dead documents

Everything in here is **dead**. It is kept for the record, not for reference.

## Rules

- **Never cite a number, formula or claim from this folder** in a design
  decision, a code comment, a test, or an answer to the user. If a value in
  here is still true, it is also in a live document — cite that one.
- Nothing in `src/` may import or reference anything described here.
- **Do not "fix" or update these files.** They are snapshots of what was
  believed when they were retired. Correcting them defeats the point.

## Two kinds of dead

**`scrapped/`** — approaches we abandoned. The work was not superseded by
something better; we decided the whole line was a mistake. Each file explains
why, because that reasoning is usually the valuable part.

**`outdated-notes/`** — notes that were correct and got overtaken. Feature A
was documented, feature B replaced it, so A's note came here. These read as
accurate history of a state the app has moved past.

The distinction matters when you find one: a scrapped document may be *wrong*;
an outdated one is usually *right about a past that no longer exists*.

## Incident record

`DATA-LOSS-2026-07-28.md` records files destroyed during the docs restructure
on that date, what was recoverable, and what was not. Two placeholder files
(`outdated-notes/LOST-*.md`) stand in for documents that are gone entirely, so
the gaps stay visible instead of quietly vanishing.

Live game documentation: `../Reference/Game/` (read from the 2.7.0 client).
The July 2026 combat model and its audit are archived here as
`outdated-notes/combat-model.md` and `outdated-notes/combat-audit-2026-07-28.md`.
