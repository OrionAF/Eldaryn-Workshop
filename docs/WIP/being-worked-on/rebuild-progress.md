# Rebuild progress log

> **Status:** built 2026-10-14 (all slices except optional F5) — not merged to `main` · **Plan:** `rebuild-plan.md` · **Branch:** `claude/sweet-cannon-klhjs3`

How the build runs: each wave's slices run in parallel, one agent per slice in its own git
worktree. The orchestrator cherry-picks each slice's commit, runs `npm test` and `npm run build`
on the merged tip, and pushes only when both are green.

## Waves

| Wave | Slice | Status | Commit | Notes |
|---|---|---|---|---|
| 1 | S00 Branch CI | merged | `325f93c` | `.github/workflows/ci.yml` runs on every non-main push |
| 1 | S01 Retire invented screens | merged | `d9b53dc` | 14 placeholder screens; 11 old screen tests quarantined as `*.legacy-test.js`; the EldarynTracker CSV tests are deleted |
| 1 | D1 Data sync + core catalogues | merged | `c964a2b` | `npm run sync:data`, `src/data/game/`, `game/{stats,classes}.js` |
| 1 | E0 RNG + types | merged | `f8daa3c` | `engine/rng.js`, `engine/types.js` |
| — | Vitest excludes `.claude/**` | merged | `2d12e4e` | agent worktrees live inside the checkout |
| 2 | D2 Catalogues: gear, stones, drops, talents, relics, skills | merged | `rebuild/D2` | new `Game/data/skills.json` (14 skills, checked against the decompile) |
| 2 | D3 Catalogues: sigils, mounts-glyphs, pets, fortress, transcendence, content | merged | `rebuild/D3` | `transcendence.json` costs about 25.6 KB gzip once something imports it |
| 2 | D4 New extractions: awakening, world boss | merged | `rebuild/D4` | new `Game/data/{awakening,world-boss}.json` |
| 2 | E1 Soft caps, ceilings, PVP rating | merged | `rebuild/E1` | `engine/core/caps.js` |
| 2 | M1 Model v2 + store facade + storage v2 | merged | `rebuild/M1` | `model/*`, `store/*`, key `eldaryn_optimiser_state_v2`; v1 key read once, never written |
| — | Four-class pickers and avatars | merged | | shell still compared `'Warrior'`/`'Sentinel'` after M1 moved to the class enum |
| 3 | B2 Talents · B3 Pets · B4 Mounts + glyphs · B6b Character · B7 Transcendence | merged | | domain screens; 75 files / 765 tests after |
| 3 | E3 Stat pipeline · E2a/E2b Sources · B1 Gear + stones · B6a Relics + Awakening | merged | | one test conflict in `model/index.test.js` resolved (both sides kept); 93 / 930 after |
| 3 | E4 Combat primitives · E2c Sigil sources + fortress · E5a Debuffs/stacks/glyph mods · E5c Minions · E6a PVE enemies | merged | | 106 / 1162 after |
| 3 | B5 Sigils | merged | | test conflict in `rosterStore.test.js` resolved (relic + sigil assertions both kept); 110 / 1204 after |
| 4 | C1a Build layer · C1b Presets hub + sheet entry + validation | merged | | `build/*`; golden totals per class; Presets screen with sheet entry, per-stat diff and "absorb into base"; 116 / 1268 after |
| 4 | E5b Spells (Opus) · E6b PVE tick · E7a/E7b/E7c PVP hit, spells, reactions | merged | | 122 / 1499 after |
| 4 | R1a/R1b Doc reconciliation | merged | | 91 slice findings checked against the decompile; confirmed ones folded into `Reference/Game` |
| 4 | E6c PVE fight driver · E7d PVP resolver (Opus) · E8 Metrics + worker · E9 Server-log replay check | merged | | engine complete; 127 / 1630 after |
| 5 | F3 PVP duel · F4 Oblivion hero | merged | | Duel screen (win rate N=400 with Wilson CI, traced timeline, swap sides, `/arena/fight` replay check); Oblivion screen (realm toggle, Oblivion Power, floor table with win % and max floor at ≥90%) |
| — | PVP resolver reads `formKind` | merged | `7dcdb6f` | build layer emits `formKind`; the resolver read only `form`, so Druid forms were dropped for direct callers (found by F3) |
| 5 | F2a PVE optimiser engine · F2b Optimiser UI · F1 Drop Check | merged | | tiered search (closed-form screen → N=16 → N=64 finalists, common random numbers); Drop Check verdict per equipment set with CIs; three trivial conflicts in `tasks/tasks.test.js` resolved; 146 / 1848 after |
| 6 | X1 Cleanup + docs · R2 Doc reconciliation (late findings) | merged | | legacy lib, components and quarantined tests deleted; `data-model.md` and `CLAUDE.md` rewritten for v2; 115 / 1413 after |
| 6 | Browser smoke test + fixes | merged | | 4 classes × 14 screens × desktop/390 px, main flows exercised; zero console errors; 2 major (mobile overflow) and 3 minor defects fixed, plus number-format consistency and the optimiser's DPS-vs-finite-HP tie |
| — | Wilson interval clamp | merged | `b799a87` | float error put a bound past p at k = 0 / k = n; regression test added |

Test counts on the merged tip: 50 files / 612 tests after wave 1; 62 / 662 after wave 2.

From wave 3 on, slices run through a dependency-driven scheduler: a slice starts as soon as its
dependencies finish, merging their `rebuild/<id>` branches into its worktree. Three schedulers run
side by side (engine chain + Sigils; sources, pipeline, gear, relics, awakening; the other domain
screens). Slice branches are merged into the rebuild branch with real merges.

## Doc findings

The slices reported 91 places where a `Reference/Game` doc was wrong, incomplete or stale. Two
reconciliation agents (R1a: stats, combat, classes; R1b: progression and content) checked each one
against the decompile and folded the confirmed ones into the docs and `data/*.json`. The notable
corrections:

- **Chrono Flux** recharge factor is 3, not 50, and the per-event conduit weights are now known
  (`sigils.md` §9).
- **Oblivion dungeon floors**: 14 instability values were off by one (JavaScript's `Math.round`
  rounds .5 up); fixed in `pve-content.json` (`pve-content.md` §11).
- **Gear slot order** is HEAD first (`EQUIPMENT_SLOT_ORDER`, L1174041-1174077); `gear.json` was
  WEAPON first. The Ascension item-level caps are now in `gear.json`.
- **Mystic major glyphs** split 10 Mage / 7 Druid.
- **In PVE, damage and debuff spells ignore their activation conditions**; only PVP checks them
  (`combat-pve.md` §10).
- **Spell damage's `k`** is the spell-resist factor (`combat-pve.md` §10.2).
- **Silence has no effect in PVE** (`combat-pve.md` §8.3).
- Unit fixes: pet and stone Attack Speed / Crit Damage values are multiplier deltas.

Still to reconcile (reported by E6c, E7d and E9 after R1 ran; folded in at the end): the PVE tick
order of heal-budget refill vs Oblivion pulse, the shared engine's offensive-condition flag, the
shield mitigation source, the unclamped Chrono Flux transform heal, the PVP opening clock with
minions, unclamped `*HpAfter` on regen/summon/time-up rows, and which HP the `*HpAfter` fields
carry after a swing.

Still open (marked [UNRESOLVED] in the docs): whether an Ancient sigil takes a generic slot (the app
gives it its own), which accumulator a relic's HP_PERCENT feeds, and how form-conditional Druid
sigils pick their condition family.

## Left for X1 (cleanup)

- `SettingsPanel.svelte` still shows "Reset initial linking simulations"; M1 kept a no-op
  `resetLinkingSim` so it doesn't throw. Remove both.
- M1 quarantined `src/lib/rosterStore.legacy-test.js` with the other legacy tests.

- Unrouted legacy components still import deleted ones: `PresetEditor.svelte` imports
  `GoalSliders`, and `RunHistoryPanel.svelte` imports `GoalTimelineChart`. Nothing routed reaches
  them; X1 deletes both.

## Final state (2026-10-14, ~07:15 UTC)

- 118 test files, 1421 tests, `npm run build` and the Pages build (`BASE_PATH=/Eldaryn-Workshop/`)
  green; GitHub CI green on the branch.
- Everything is on `claude/sweet-cannon-klhjs3`. Nothing is merged to `main` or deployed.

## What is next (needs the user)

- **Check the app against the game.** Enter your in-game stat sheet on a preset (Presets screen).
  The diff shows, per stat, whether the computed stats explain the sheet. Unexplained gaps are the
  first thing to look at: per-class base stats and the relic contribution are server-side
  ([SERVER] in `Game/stats.md`), so the base defaults to the client's `baseStats` until you
  "absorb" the gap.
- **A real `/arena/fight` response** would let the Duel screen's replay check confirm that the
  ported resolver matches the server (today that match is an inference).
- **Questions** in `../needs-user-input/rebuild-questions.md`: publishing the catalogues, the
  optional PVP objective in the optimiser (F5), and Pages on a private repo.
- **Merging** the branch to `main` (which deploys) is your call.

## Still open (engineering)

- Crusade role readiness (module 6044) is not extracted.
- Oblivion options that `simulateFight` builds but never reads are listed in
  `Game/pve-content.md` as [UNRESOLVED].
- The 10 GitHub issues from July (`github-issues-2026-07-29.md`) need re-checking against the
  rebuilt app.
