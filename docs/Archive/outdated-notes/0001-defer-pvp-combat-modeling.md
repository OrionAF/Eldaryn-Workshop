# ADR 0001 — Defer PVP combat modeling (SUPERSEDED)

> **⚠️ PARTIAL RECONSTRUCTION.** The original was destroyed on 2026-07-28
> (see `../DATA-LOSS-2026-07-28.md`). Rebuilt from fragments quoted during the
> combat audit; the decision and its context are preserved, the full rationale
> is not.

**Status: SUPERSEDED (2026-07-28).** Current truth:
`Reference/combat-model.md`.

## Original decision (2026-07-01)

The Phase 0 UI grilling session surfaced a full PVP damage formula
(rating-based PVP Attack/Defense with a diminishing-returns conversion to
effect %, chained with DMG Reduction) plus several defensive stats — Block,
Miss, Blind, Penetration, Paralyze Chance — that did not exist in the original
handoff's PVE-only scope.

The decision: add all of these to `OffensiveStats` (`src/lib/dps.js`,
`constants.js`'s `STAT_FIELDS`) and carry them through gear-swap math for
**display and tracking only**, deferring any actual combat modelling to a
future PVP phase.

## Why it is superseded

Every phase since reversed it. Those stats now drive:

- `pvpSimulation.js` — the full two-sided duel engine
- `tankObjective.js` — effective HP and sustain
- `pvpGoalObjective.js` — all three PVP goal factors
- `pvpGauntlet.js` / `pvpArchetypes.js` — duel validation

Kept as the historical record of *why* the fields were added early. The "carry
but do not compute" stance it documents has been false for a long time, and
the stale claim survived in `dps.js`'s header until the 2026-07-28 audit
caught it.
