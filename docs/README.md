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
- A citation: `see combat-model.md §6`.

Comments are not being discouraged — they are being *scoped*. A file header
should orient a reader in a few lines and point at the reference; it should not
be the reference. The 2026-07-28 audit found four separate headers that had
silently become false, each of which had also *suppressed* re-examination
because it read as authoritative.

**Canonical references and what they receive:**

| Document | Owns |
|---|---|
| `Reference/combat-model.md` | Damage, healing, mitigation, survivability, duels, scoring, the gauntlet, the cap pipeline |
| `Reference/data-model.md` | Persisted shape, the three scopes, normalisation, totals aggregation |
| `Reference/Notes/big-rework-v1-notes.md` | Mounts, glyphs, sigils, pets — decisions and data derivations |
| `Reference/Notes/goals-linking-redesign-notes.md` | Goals, linking, the Simulations page |

## Layout

```
docs/
├── Reference/                    current truth
│   ├── combat-model.md           THE canonical combat reference — read first
│   ├── data-model.md             persisted shape, scopes, normalisation, totals
│   ├── Source/                   raw inputs: game screenshots, scrapes, the user's own words
│   └── Notes/                    derived notes, each datestamped and currently accurate
├── WIP/
│   ├── being-worked-on/          the active work queue
│   └── needs-user-input/         blocked on an answer or a measurement from the user
├── Archive/
│   ├── scrapped/                 approaches we abandoned
│   └── outdated-notes/           notes superseded by later work
└── tools/                        run-by-hand scripts behind the numbers above
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

## This folder is version-controlled — but not by the public repo

**`docs/` is not in the public repository.** `Eldaryn-Workshop`'s `.gitignore`
deliberately excludes it, along with `EldarynTracker/`, `CLAUDE.md` and
`CONTEXT.md` — "internal planning/domain notes, kept locally, not published".

Those paths live in a **separate private repo** whose git-dir sits outside the
project, so the two never collide:

```
D:\CodingProjects\
├── .eldaryn-private.git\      <- private repo's git-dir
└── Eldaryn-Workshop\
    ├── .git\                  <- public repo, untouched
    ├── src\                   <- public
    └── docs\, EldarynTracker\, CLAUDE.md, CONTEXT.md   <- private repo
```

Commit with **`edoc`**, which is plain `git` pointed at that repo:

```powershell
edoc status
edoc add docs/
edoc commit -m "..."
edoc push
```

**Editing anything in `docs/` and running `git commit` does nothing** — the
public repo cannot see these files. Use `edoc`, or the change stays only on
this disk.

Two traps, both easy to hit:

- **A brand-new file will not show in `edoc status`** (`showUntrackedFiles=no`
  is set, so the thousands of public-repo files stay out of the way). Add new
  paths explicitly, with `-f` the first time.
- **Never `edoc add -f EldarynTracker`** — `-f` overrides the exclude list and
  would sweep in ~610 MB of gear screenshots.

Full details, including why this exists and what is deliberately left
untracked: `Reference/Notes/private-repo-setup.md`.

> This setup is a direct consequence of `Archive/DATA-LOSS-2026-07-28.md`:
> `docs/` was untracked when a restructure accident destroyed five documents,
> and nothing could recover them.