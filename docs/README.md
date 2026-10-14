# docs — how this folder works

Three folders of documents, and the difference between them is **how much you
should trust what is inside**.

| Folder | Contains | Trust |
|---|---|---|
| **`Reference/`** | Current truth. The canonical model, the raw sources it was built from, and notes that are still accurate. | Cite freely |
| **`WIP/`** | Live work: open findings, and questions waiting on the user. | In flight — read the status |
| **`Archive/`** | Dead documents. Abandoned approaches and superseded notes. | **Never cite** |

Plus one folder that is not documents at all:

| Folder | Contains | Trust |
|---|---|---|
| **`tools/`** | Runnable analysis scripts that produce the numbers the documents cite. | Re-run it — that is the point |

`tools/` is here rather than in the published tree because a script whose whole
job is to generate evidence for a document belongs beside that document. It is
also the only thing in `docs/` that can go stale *silently*: prose that stops
being true is at least still readable, but a script that stops running takes a
document's ability to be re-verified with it.

## The one rule that matters

**A document in `Reference/Notes/` must be true right now.** The moment later
work makes it wrong — not merely incomplete, but *wrong* — it moves to
`Archive/outdated-notes/` and stops being something anyone can accidentally
believe.

This is not tidiness. The 2026-07-28 combat audit found that the most expensive
errors in this project all had the same shape: a comment or document that was
accurate when written, quietly became false, and then suppressed inspection
because it looked authoritative. A stale document is worse than a missing one.

So when you finish a piece of work, ask: *did this make any existing note
wrong?* If yes, archive that note in the same change.

## Where truth lives: docs, not comments

**A fact lives in exactly one place.** If it is in a document, the code cites
the document. If it is local to one function, it stays in that function's
comment and no document repeats it. Duplication is what rots — two copies drift,
and the one you happen to read is the one you believe.

Truth belongs in **`Reference/`** when it is:

- **Game truth** — mechanics, formulas, caps, anything with a provenance tag.
- **Cross-cutting** — any contract more than one file depends on. The test:
  *would this comment need to change if a different file changed?* If yes, it is
  not a comment, it is documentation.
- **A decision record** — why it is this way, what was rejected, what it cost.
- **Shape** — persisted structures, invariants, scope rules.

It stays a **code comment** when it is:

- Why *this* function does *this* non-obvious thing.
- A local invariant or gotcha, stated where it actually bites.
- An algorithm step that is not apparent from the code itself.
- A citation: `see Game/combat-pvp.md §4`.

Comments are not being discouraged — they are being *scoped*. A file header
should orient a reader in a few lines and point at the reference; it should not
be the reference. The 2026-07-28 audit found four separate headers that had
silently become false, each of which had also *suppressed* re-examination
because it read as authoritative.

**Canonical references and what they receive:**

| Document | Owns |
|---|---|
| `Reference/Game/*.md` | Every game fact: stats, caps, combat (PVE and PVP), gear, drops and every progression system, read from the 2.7.0 client. Index: `Reference/Game/README.md` |
| `Reference/data-model.md` | The app's persisted shape, the three scopes, normalisation, totals aggregation |
| `Reference/Notes/goals-linking-redesign-notes.md` | The app's goals, linking and Simulations page (a decision record from before 2.7.0) |

## Layout

```
docs/
├── Extracted game data/          the 2.7.0 client extract (split zip) — the primary source
├── Reference/                    current truth
│   ├── Game/                     THE game reference, one document per system — read first
│   │   └── data/                 machine-readable catalogues the app consumes
│   ├── data-model.md             the app's persisted shape, scopes, normalisation, totals
│   ├── Source/                   raw inputs: game screenshots, scrapes, the user's own words
│   └── Notes/                    app decision records, each datestamped and currently accurate
├── WIP/
│   ├── being-worked-on/          the active work queue (app-gap-2.7.0.md)
│   └── needs-user-input/         blocked on an answer only the user can give
├── Archive/
│   ├── scrapped/                 approaches we abandoned
│   └── outdated-notes/           notes superseded by later work
└── tools/                        scripts that rebuild the module index the Game docs cite
```

Each folder has its own README explaining what belongs in it and what does not.

## Related documents outside this folder

- `CLAUDE.md` (repo root) — working instructions; points here for combat truth.
- `EldarynTracker/eldaryn_gear_optimiser_handoff.md` — the original domain
  spec. It is a primary **Source** document but lives with the Python project
  it belongs to; it is referenced, not moved.
- `EldarynTracker/combat_power_observations.csv` — 124 observed game profiles.
  Raw data, still valid; the derivation built on it is retired
  (`Archive/scrapped/`).

## Version control

Since 2026-10-14, `docs/`, `CLAUDE.md` and `CONTEXT.md` live in the main
repository, `github.com/OrionAF/Eldaryn-Workshop`, which is now private. Commit
them with plain `git`, like the code. The separate `edoc` repo from July 2026
is retired; its setup note is `Archive/outdated-notes/private-repo-setup.md`.

`EldarynTracker/` (the old Python tools and about 610 MB of screenshots) is still
excluded by `.gitignore` and is not in the repository. Two tests,
`src/lib/glyphsData.test.js` and `sigilsData.test.js`, read CSVs from it.
They fail on a fresh checkout, including the GitHub Pages deploy.

> `docs/` is under version control because of `Archive/DATA-LOSS-2026-07-28.md`:
> it was untracked when a restructure accident destroyed five documents, and
> nothing could recover them.
