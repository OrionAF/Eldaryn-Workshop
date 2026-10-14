# Rebuild progress log

> **Status:** in progress · **Plan:** `rebuild-plan.md` · **Branch:** `claude/sweet-cannon-klhjs3`

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
