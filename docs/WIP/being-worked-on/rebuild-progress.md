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
- **`stats.md` §3.2 step 7** says `rawX = round(raw)`; the code emits `parseFloat(raw.toFixed(1))`
  (`toFixed(2)` for Attack Speed and Crit Damage), L1217495-1217870. (E3)
- **`stats.md` §4.2 / `stats.json`** give Minion Attack Speed soft/hard caps 2/4, but
  `calculateTotalStats` never applies them (L1217458-1217464, `toFixed(2)` only). Treated as
  uncapped. (E3)
- **`stats.md` §3.2 step 4** omits that the same block picks the Disruption effect: SILENCE by
  default, STAGGER for Mystic Bear, FEAR for Mystic Wolf and Necromancer (L1216943-1216988,
  L1217116-1217133). (E3)
- **`sigils.json` form spells** rename the client's `passiveEffects` to `effects` and drop
  `spellType` (client object L1070195-1070262). The pipeline accepts both. (E3)
- **`mounts-glyphs.json` `perRarity` keys** are lower-case (`cooldownseconds`, `damagepercent`, ...)
  while `mounts-glyphs.md` §10/§14 name them camelCase. Code must read the lower-case keys; align
  the doc or the JSON. (B4)
- **`transcendence.md` §2/§0**: the v1 transcription has 25 rows and no core cell; v1 `(c,r)` maps
  to v2 `(c-14, r-26)`. All 271 cells are reachable and the full board costs 13285 Ichor, as §6
  says. (B7)
- **`gear.md` §1/§6**: the base-realm Ascension item-level caps (100/130/160/190/240) are only in
  prose, not in `gear.json`. (B1)
- **`relics.md` §8**: the v1 Sentinel id rename must apply only to v1 *Sentinel* characters; the old
  Warrior ids are still valid Warrior relics. (B6a)
- **`sigils.md` §1** still says the app models only Warrior and Sentinel (stale). §2 leaves open
  whether an Ancient takes a generic slot; the app gives it its own slot. §7: a Druid
  form-conditional sigil can change condition family by form (Withering Brand: buff in Bear,
  debuff in Wolf). (B5)
- **`gear.json` `slotOrder`** starts with WEAPON, while `gear.md` §1 says the slot order starts with
  HEAD. Unused so far; check before any UI depends on it. (D2)

## Left for X1 (cleanup)

- `SettingsPanel.svelte` still shows "Reset initial linking simulations"; M1 kept a no-op
  `resetLinkingSim` so it doesn't throw. Remove both.
- M1 quarantined `src/lib/rosterStore.legacy-test.js` with the other legacy tests.

- Unrouted legacy components still import deleted ones: `PresetEditor.svelte` imports
  `GoalSliders`, and `RunHistoryPanel.svelte` imports `GoalTimelineChart`. Nothing routed reaches
  them; X1 deletes both.
