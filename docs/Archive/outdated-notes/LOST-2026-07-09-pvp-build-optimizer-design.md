# LOST — PVP build optimizer design spec (2026-07-09)

> **⚠️ THIS FILE IS A PLACEHOLDER. The document it names no longer exists.**
> Destroyed 2026-07-28; see `../DATA-LOSS-2026-07-28.md`. Not recoverable.

## What it was

`2026-07-09-pvp-build-optimizer-design.md`, 4.6 KB — the design spec written
before the PVP build optimizer was implemented. It described:

- `createPvpWinObjective({ character, opponent, healthMultiplier,
  durationSeconds, iterations = 150, seed = 1 })` returning
  `(candidateCharacter, candidatePreset) => score`, and what
  `pvpSimulation.js` deliberately does *not* depend on.
- A new section on `src/components/PvpScreen.svelte` below the simulation
  results, modeled on SimulationScreen's optimizer section: using the
  currently selected preset, opponent, and health multiplier / duration
  settings already on the screen; a Run button disabled while a sim or
  optimization is running; a progress line from `onProgress`
  (`phase · evals`).

*(The above is everything quoted from it during the combat audit. The rest of
the spec is gone.)*

## Why the loss is minor

The feature it specified **shipped**, so the implementation is the current
truth: `pvpOptimizer.js`, `optimizerObjectives.js`, and `PvpScreen.svelte`.
The spec was already partly stale — it described the health multiplier as a
user-picked screen setting, which the July 2026 8× HP patch turned into a
constant.

Nothing depends on this document. It is recorded here so the gap is visible
rather than silently absent.
