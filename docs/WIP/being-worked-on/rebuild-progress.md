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

After wave 1: 50 test files, 612 tests, build green.

| 2 | D2 Catalogues: gear, stones, drops, talents, relics, skills | merged | `rebuild/D2` | new `Game/data/skills.json` (14 skills, checked against the decompile) |
| 2 | D3 Catalogues: sigils, mounts-glyphs, pets, fortress, transcendence, content | merged | `rebuild/D3` | `transcendence.json` costs about 25.6 KB gzip once something imports it |
| 2 | D4 New extractions: awakening, world boss | merged | `rebuild/D4` | new `Game/data/{awakening,world-boss}.json` |
| 2 | E1 Soft caps, ceilings, PVP rating | merged | `rebuild/E1` | `engine/core/caps.js` |
| 2 | M1 Model v2 + store facade + storage v2 | merged | `rebuild/M1` | `model/*`, `store/*`, key `eldaryn_optimiser_state_v2`; v1 key read once, never written |
| — | Four-class pickers and avatars | merged | | shell still compared `'Warrior'`/`'Sentinel'` after M1 moved to the class enum |

After wave 2: 62 test files, 662 tests, build green.

## Findings to fold back into docs

Things the slices found that contradict or extend a `Reference/Game` doc. Each is resolved in the
owning doc once confirmed.

- **`mounts-glyphs.json` `_note`** says Mystic has 9 Mage and 8 Druid major glyphs. The entries
  themselves tag 10 MYSTIC_MAGE and 7 MYSTIC_DRUID (total 17 either way). Check the decompile's
  `requiredSpec` assignments and correct whichever is wrong. (D3)
- **`awakening.md` §3** says every value rounds to 1 decimal. The code rounds `attackSpeedFlat` with
  `toFixed(2)`. Harmless today: no bundle has attack speed. (D4)
- **`pve-content.md` §7** describes the World Boss affinity as a plain hash pick. It is a chained
  no-repeat walk, `idx(c) = (idx(c-1) + 1 + hashInt(c) % 2) % 3`, now encoded in
  `world-boss.json` `affinityCycle.rule` (L1152886-1152985). (D4)
- **`gear.json` `slotOrder`** starts with WEAPON, while `gear.md` §1 says the slot order starts with
  HEAD. Unused so far; check before any UI depends on it. (D2)

## Left for X1 (cleanup)

- `SettingsPanel.svelte` still shows "Reset initial linking simulations"; M1 kept a no-op
  `resetLinkingSim` so it doesn't throw. Remove both.
- M1 quarantined `src/lib/rosterStore.legacy-test.js` with the other legacy tests.

- Unrouted legacy components still import deleted ones: `PresetEditor.svelte` imports
  `GoalSliders`, and `RunHistoryPanel.svelte` imports `GoalTimelineChart`. Nothing routed reaches
  them; X1 deletes both.
