> **Status:** Superseded 2026-10-14 · **Superseded by:** the rebuilt optimiser/search (`src/lib/search/`; relics are a toggle in the search space).
> Describes the pre-rebuild app (v1 model, `src/lib/*Data.js`, legacy components). True on its date, not since.
> **Covers:** the Relic Suggester — "if I invested N relic levels anywhere,
> which pays off most?" The feature has shipped (`relicSuggester.js`,
> `RelicSuggesterPanel.svelte`).
>
> ⚠ Known gaps in the *shipped behaviour*, not in this spec — audit F21/F22:
> `perRelic.gain` bundles the forced swap-out of your weakest equipped relic
> into the number, and under a Monte Carlo objective it carries no error bar.
> See `WIP/being-worked-on/combat-audit-2026-07-28.md`.

# Relic Suggester — Design

**Date:** 2026-07-18
**Status:** Approved

## Problem

The build optimizer only searches relics the character has already unlocked
(`character.relicLevels[id] > 0`), so it can never tell the player which
*locked* relic is worth unlocking, or whether leveling an owned relic would
beat the current setup. Players spend Relic Medals blind.

## Feature summary

A **Relic Suggester** action on both optimizer panels (Simulation/PVE and
PVP screens). The user enters a number of levels **N**; one click answers:
*"if I invested N levels into any relic — including unlocking ones I don't
own — which investment pays off most?"*

Semantics of N (decided): **+N per relic, independently, simulated
simultaneously** — every locked relic is simulated at level N and every
unlocked relic at `current + N`, all clamped to the relic's `maxLevel`.
N is not a shared budget spread across relics.

The rest of the build (gear, talents, pet, mounts, awakening,
transcendence, sigils, …) stays fixed. Scoring uses the same objective as
the host screen's optimizer (PVE Monte Carlo sim or PVP duel win-rate), so
suggestions cannot disagree with the optimizer's own rankings.

## Engine

New `suggestRelics()` in `src/lib/optimizer.js`, a thin wrapper over the
existing `optimize()`:

1. **Boosted world.** JSON-clone the character; for every relic def of the
   class (`RELICS_BY_CLASS[character.class]`) set
   `relicLevels[id] = min((current || 0) + N, def.maxLevel)`.
2. **Best board.** Call `optimize()` on the boosted character with
   `searchDimensions: { relics: true }` only. The existing exhaustive
   subset enumeration (≤ `PRESET_RELIC_CAP` = 4) now sees the full class
   pool (14 relics ⇒ ~1,471 subsets) because nothing is level 0 in the
   boosted world. Memoization, abort (`signal`), and progress reporting
   are reused as-is.
3. **Ranked per-relic list.** A second pass: for each relic of the class,
   score the current build with *only that one relic* boosted (locked →
   level N, unlocked → `current + N`, clamped). If the relic is not
   equipped and the preset already has `PRESET_RELIC_CAP` relics equipped,
   it replaces the weakest currently equipped relic (the equipped relic
   whose removal loses the least score); otherwise it is simply added.
   One objective eval per relic (~14 evals total).
4. **Result shape.**

   ```js
   {
     baseline,           // current build scored under the same objective
     best,               // best boosted board (score + candidate)
     changes: [          // per-relic action steps for the best board
       { kind: 'unlock',  id, name, tier, toLevel }        // 0 -> N
       { kind: 'upgrade', id, name, tier, fromLevel, toLevel } // +N
       { kind: 'equip' | 'unequip', id, name, tier }       // board change only
     ],
     perRelic: [         // ranked list, sorted by gain desc
       { id, name, tier, fromLevel, toLevel, isUnlock, atMax, gain }
     ],
     aborted,            // true if cancelled; carries best-so-far
   }
   ```

   A relic already at `maxLevel` is reported with `atMax: true` and never
   shown as a fake upgrade.

## Plumbing

The worker request gains a `mode` field:

- `mode: 'optimize'` (default) — today's behavior, unchanged.
- `mode: 'suggest-relics'` with `relicLevelBoost: N` — routes to
  `suggestRelics()`.

Both `optimizerWorker.js` and the no-Worker inline fallback in
`optimizerClient.js` branch on `mode`. Requests remain plain JSON across
the worker boundary (JSON-clone in the client detaches Svelte `$state`
proxies, as today).

## UI

On each optimizer panel (SimulationScreen.svelte, PvpScreen.svelte), under
the existing optimizer controls:

- Numeric **"Relic levels to simulate"** input (same style/parsing as the
  Ichor field, `parseFlat`, min 0).
- **"Suggest relics"** button (`.btn-ghost`). Disabled while N ≤ 0 or
  non-numeric, or while a run is in flight. Cancel works like the
  optimizer's cancel (worker soft-abort, best-so-far).
- While running: the existing progress affordance.
- Results render in a new compact card component (shared by both screens):
  - **Header:** best-board delta ("+8.4% DPS if you invest") with the
    unlock/upgrade steps and the final equip set.
  - **Body:** ranked per-relic table — name, tier badge
    (Bronze/Silver/Gold), "Unlock → lv 2" or "lv 5 → 7" or "already max",
    individual gain. Numeric cells use `--font-data` tabular monospace per
    app.css conventions; positive deltas green.
- **Informational only** — no "apply" button. The app cannot grant levels
  the player hasn't earned; leveling stays a manual edit on the Relics
  screen.

## Edge cases

- N ≤ 0 / non-numeric: button disabled, no run.
- All relics at max: per-relic rows show `atMax` with gain 0; the best
  board may still suggest equip-only changes, surfaced as such.
- Class with no relic data: suggester hidden/disabled.
- Inputs (`character`, `preset`) are never mutated; all boosting happens
  on clones.

## Testing

- Engine tests (in `optimizer.test.js`, or `relicSuggester.test.js` if it
  grows): boost clamps at `maxLevel`; locked relic surfaces as
  `kind: 'unlock'` at level N; best equip set never exceeds
  `PRESET_RELIC_CAP`; per-relic list covers every class relic and is
  sorted by gain; baseline unchanged when N boosts nothing (all at max);
  input character/preset not mutated; abort returns best-so-far.
- Component tests: input gating (disabled at N ≤ 0 / while running),
  result card renders unlock vs upgrade vs at-max rows, both screens wire
  their own objective spec.

## Out of scope

- Modeling Relic Medal costs (per-tier level pricing) — the app already
  deliberately doesn't track that currency.
- A shared "N levels total, spread anywhere" budget mode.
- Auto-applying suggested levels to the character.
