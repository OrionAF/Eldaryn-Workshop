# Rebuild plan: Eldaryn Gear Optimiser on the 2.7.0 client reference

> **Status:** in progress — approved by the user 2026-10-14, building on `claude/sweet-cannon-klhjs3` · **Written:** 2026-10-14
> **Truth lives in:** `docs/Reference/Game/*.md` + `data/*.json` (game facts), this file (the rebuild's
> architecture, model and slice plan). Gap queue: `app-gap-2.7.0.md`.

Decisions taken by the user on 2026-10-14: **rebuild the core and keep the shell**. All 4 classes and
8 specs. Four features: (1) Gear swap / Drop Check, (2) PVE build optimiser, (3) PVP duel simulation
on the ported client resolver, (4) the Oblivion hero. The invented PVP scoring, archetypes, gauntlet,
calibration, goals and linking are dropped. Slices are sized for Sonnet agents, and each slice owns its
files.

---

## 1. Goals and non-goals

**Goals**
- Port the client's own stat pipeline (`calculateTotalStats`, module 4297) and combat engines (the
  shared PVE engine in modules 3958-3969 and `simulateArenaPvP` in module 5399). Inject the RNG so
  runs are deterministic.
- Drive every catalogue from `docs/Reference/Game/data/*.json` instead of hand-written tables.
- Store the persisted model as v2, in the client's own state shapes. Migrate v1 saves best-effort and
  never delete them.
- Make the in-game stat sheet a first-class input, and show how far the computed stats are from it,
  per stat.
- Keep the Svelte 5 shell: `App`, `Sidebar`, `Modal`, `Slider`, `ConfirmButton`, `Chip`,
  `StarRating`, `SettingsPanel`, `WelcomeScreen`, `DuelTimeline`, the transcendence grid UI, the
  `persist()` discipline, `storage.js` and the optimiser worker pattern.

**Non-goals (for now)**
- Reproducing anything marked [SERVER] exactly: final `computedStats`, item, pet, mount and stone
  rolls, and the outcomes of server-run fights.
- Crusade, Celestial Trial, Arcane Quarry, Clan War and village raids. Their tables are not in
  `Game/data` and module 6044 is unextracted.
- Economy simulation: gem costs, drop farming and egg odds. These stay as catalogue display only.
- Combat Power. It is a progression score, not a combat metric (`stats.md` §8).
- Any invented model. If the client does not contain it, the app does not score with it.

---

## 2. Target architecture

### 2.1 Layers (lower layers never import upper layers)

```
L0 data      src/data/game/*.json            synced copy of docs/Reference/Game/data (+3 new files)
L1 catalogue src/lib/game/*.js               thin typed accessors, no game logic
L2 engine    src/lib/engine/                 the client port; pure; takes rng(); no store or model imports
               rng.js types.js
               core/      caps, entity, buffs, shield, rolls, debuffs, stacks, glyphMods,
                          chronoFlux, spells, spellConfig, minions
               sources/   talents awakening transcendence pet mount stones relic
                          sigilScale sigilPassive fortress
               pipeline/  totals (calculateTotalStats), sheet, sheetDiff, anchoredDelta
               pve/       tick fight enemies
               pvp/       resolver replayCheck
               metrics.js
L3 model     src/lib/model/   v2 shape, normalise, v1 migration (one file per domain); pure, imports L1 only
L4 build     src/lib/build/                  persisted Character + preset -> engine inputs; residuals
L5 features  src/lib/features/  swap.js duel.js oblivionDungeon.js
             src/lib/search/    search.js candidates.js objectives.js
             src/lib/tasks/     one file per worker mode (optimize, duel, dropCheck, oblivionFloors)
             optimizerWorker.js optimizerClient.js   (kept; dispatch through tasks/)
L6 state     src/lib/store/   mutators (one file per domain) + rosterStore.svelte.js facade
             storage.js       key eldaryn_optimiser_state_v2
L7 UI        src/components/screens/<Name>Screen.svelte    one per nav item
             src/components/<domain>/*.svelte              screen subcomponents
             shared: Modal Slider ConfirmButton Chip StarRating DuelTimeline SettingsPanel ...
```

The pure model sits below build because build reads model shapes; the reactive store sits above
features because it calls them. Every import points down. Catalogue accessors (L1) are synchronous:
no layer awaits game data (see D3).

### 2.2 Data flow

```
user input -> store mutator -> normaliseCharacter -> persist()
                     |
Character + presetId + realm
   -> build/presetInputs.js -> engine/sources/* -> pipeline/totals.calculateTotalStats -> computed
   -> build/stats.js picks the effective sheet:
        user sheet (tier 2) if entered, else computed + carried residual (tier 1)
   -> build/fighter.js -> Fighter {stats, class, spec, sigils, utility, ancient, conditions,
                                   glyphMods, altarTier}
   -> engine/pve/fight.js | engine/pvp/resolver.js   (through engine/metrics.js)
   -> features (swap / search / duel / oblivionDungeon) -> tasks/* in the worker -> screens
```

### 2.3 Stable engine API (code the UI against these names)

```js
// pipeline
calculateTotalStats(base, equipment, talents, pet, sigils, stones, awakening, a7, fortress,
                    transcendence, mounts, {playerClass, formConfig, activeSpec}) -> ComputedStats
diffSheet(computed, sheet) -> [{key, computed, sheet, delta, withinTolerance}]
anchoredDelta(sheet, rawDelta, ctx) -> ComputedStats          // §4
// build
computePresetStats(character, presetId, {realm}) -> {effective, computed, sheet, residual, source}
buildFighter(character, presetId, {realm}) -> Fighter
// engines (pure, rng injected, options.log=false gives the event-free mode)
simulatePve({fighter, enemy, dtMs, maxMs, opening, oblivion, rng, log}) -> PveResult
simulateArenaPvP(...14 positional args, verbatim port)         // plus runDuel({attacker, defender, rng, log})
// metrics
dpsVsDummy(fighter, {seconds=60, n=32, seed})   ttkVs(fighter, enemy, {n=64, seed})
survival(fighter, enemy, {seconds, n=200, seed}) pvpWinRate(a, b, {n=400, seed})
   -> {mean | p, lo, hi, n, ...}
```

`ComputedStats` uses the `computedKey` names in `stats.json` (`totalAttack`, `totalHp`,
`totalAttackSpeed`, ..., `raw*`). Engine inputs use the client's names. `engine/types.js` holds the
JSDoc typedefs for them and is the contract between the parallel slices.

### 2.4 Existing modules: keep, rewrite or delete

| Verdict | Modules |
|---|---|
| **Keep** | `storage.js` (key bumped), `format.js` (rekeyed in C1b), `assets.js` (split per domain in M1), `optimizerClient.js` and `optimizerWorker.js` (re-pointed in E8), `transcendence.js` (graph logic; B7 verifies topology), the shared components listed in §1 |
| **Rewrite** (replacement lives in a new location; the old file is deleted in X1) | `model.js` → `model/*`; `rosterStore.svelte.js` → facade + `store/*`; `constants.js`, `*Data.js` → `game/*`; `statCaps.js` → `engine/core/caps.js`; `totals.js` → `engine/pipeline/totals.js` + `build/`; `dps.js`, `simulation.js` → `engine/pve/*` + `metrics.js`; `sigilEffects.js` → `engine/core/spells.js` etc.; `optimizer.js` → `search/*` (salvage the generic beam and subset code); `optimizerObjectives.js`, `relicSuggester.js` → `search/objectives.js`; `dropGoals.js` → `features/swap.js`; `buildConfig.js` → `build/describe.js` |
| **Delete in S01** (components only) | `PvpScreen`, `GauntletResultPanel`, `DashboardSetupCard`, `LinkingReportCard`, `GoalSliders`, `GoalTimelineChart`, `SimulationsDashboard`, `SimulationsScreen` and their tests. Also delete `glyphsData.test.js` and `sigilsData.test.js`, which read the gitignored `EldarynTracker/*.csv` |
| **Delete in X1** (lib) | `pvpSimulation`, `pvpOptimizer`, `pvpGoalObjective`, `pvpArchetypes`, `pvpGauntlet`, `pvpCalibrationField`, `pvpRankAgreement`, `tankObjective`, `linkingSimulation`, `linkingSetup`, `talentLean`, `statWeights`, plus every "rewrite" original above, and their tests, including `pvpModelContract.test.js`. Old modules that are still live (`model.js`, `optimizer.js`, `dps.js`, `simulation.js`, `dropGoals.js`, `constants.js`, ...) import them, so they are deleted together, and they stay green meanwhile because they are pure |

### 2.5 Navigation (final, fixed in S01)

The nav order is: Character, Presets, Drop Check, Gear, Talents, Sigils, Pets, Mounts, Relics,
Awakening, Transcendence, Optimiser, Duel, Oblivion.
- Mobile has four direct slots: Presets, Drop Check, Optimiser and Duel. Everything else goes under
  More.
- Oblivion is hidden unless `character.oblivion.unlocked`. S01 implements this as the pure
  `src/components/navVisibility.js` (`character?.oblivion?.unlocked === true`), so it is false on
  the v1 store and becomes live once M1 lands. The unlock toggle lives on the Character screen
  (B6b, mutator `setOblivionUnlocked` from M1), because the Oblivion screen is unreachable while
  hidden.
- "Simulations" is gone.
- New screens need `--nav-<id>` colour triples, which S01 adds.

---

## 3. Persisted model v2

**Rules**
- Field names and enum values follow the client state (`PlayerClass` `WARRIOR`..., spec keys
  `WARRIOR_TANK`..., `SecondaryStatType` enum names, species ids from the JSON). That keeps the
  `build/` adapters close to identity.
- Static data stays code. Only ids, levels, allocations and user-entered rolls are saved.
- Normalisation drops any reference that no longer resolves against `src/data/game`.
- Storage is the key `eldaryn_optimiser_state_v2`, with `schemaVersion: 2`. The v1 key is read once
  for migration and is **never deleted or overwritten**. Import accepts both v1 and v2 JSON.

```
Roster    = { schemaVersion: 2, characters: Character[], currentId }

Character = {
  id, name,
  class: 'WARRIOR'|'SENTINEL'|'MYSTIC'|'NECROMANCER',                    [M1]
  level: 1..100,                                                         [M1]
  baseResidual: {attack:10, hp:100, attackSpeed:1, critChance:0, critDamage:1.5}   [M1] tier-1 base, §4
  skills: Record<skillId, level>, attunementBans: SecondaryStatType[]    [B6b] skills.md §1-§5
  fortress: { owned: ('TOP'|'BOTTOM'|'CORE')[] }                         [B6b] character-wide (clan state)
  equipment: { set1: Equip, set2: Equip, oblivion: Equip }               [B1]
     Equip = { items: Record<Slot, Item|null>,                           base: 9 slots; oblivion: 12
               enchantSlots: Record<BaseSlot, stoneId|null> }            9 sockets per set
     Item  = { rarity, itemLevel|null, quality|null,
               primaryStats: {attack, hp},
               secondaryStats: [{type, value}],                          class-gated (game/classes.available)
               conduit: {type:'FLAME'|'EARTHEN'|'DARK', value} | null }
  enchantStones: Stone[], oblivionEnchantStones: Stone[]                 [B1] separate pools, as in the client
     Stone = { id, type, quality, amplifyLevel: 0..10, oblivionLevel: 1..5|null,
               stats: [{type, value}] }                                  value = rolled, pre-amplify
  talentSets: [TalentSet, TalentSet]                                     [B2] dual talents
     TalentSet = { spec: SpecKey|null, allocation: Record<talentId, rank> }
  pets: { altar: {level: 1..50, tier: 1..8},                             [B3]
          owned: [{id, species, rarity, secondaries: [{type, value}]}] }   value = base roll; altar scaling applied in engine
  mounts: [{ id, species, rarity, baseHp, baseAtk, level: 1..5,          [B4]
             glyphs: {minor: [id|null ×3], major: [id|null ×2], mythic: [id|null ×1]} }]
  glyphs: [{ id, glyphType, rarity, sealed, secondary: {stat, quality}|null }]   [B4]
  sigils: { altarTier, owned: Record<species, {level}> }                 [B5]
  relics: Record<relicId, level>                                         [B6a]
  awakening: { path: 'SHADOW'|'RADIANT'|null, level: 0..15 }             [B6a]
  transcendence: { presets: [{id, name, allocatedNodeIds: string[]}],    [B7] max 4; 'default' always exists
                   activePresetId }
  oblivion: { unlocked: bool, level: 0..100, activeRealm: 'base'|'oblivion',   [M1 shape, F4 UI]
              sheet: Sheet|null }
  presets: Preset[] (2..8), activePresetId                               [M1]
     Preset = { id, name, equipmentSet: 1|2, talentSet: 0|1, petId|null, mountId|null,
                relicIds: string[] (≤4), sigilSpecies: string[] (≤3),
                utilitySigilSpecies|null, ancientSigilSpecies|null,
                sigilConditions: Record<species, conditionId>, transcendencePresetId|null,
                sheet: Sheet|null }
     Sheet  = { values: Partial<ComputedStats>, enteredAt }              tier-2 input, §4
  drop: { realm, slot, item: Item } | null                               [F1]
  opponents: [{ id, name, class, spec, sheet: Sheet,                     [F3]
                sigils: [{species, level}], utility|null, ancient|null,
                conditions, majorGlyphs: [{glyphType, rarity}], altarTier }]
  runs: OptimiserRun[] (byte-budgeted, as today's compactRunHistory)    [F2a]
}
```

**Scopes**
- **Character-wide:** level, base residual, skills, fortress, both equipment sets and the Oblivion
  set, stone pools, talent sets, the pet collection and altar, mounts, glyph inventory, sigil
  ownership and altar, relic levels, awakening, transcendence presets, Oblivion state, opponents and
  runs.
- **Per-preset:** which equipment set, talent set, pet, mount, relics, sigils (generic, utility and
  Ancient, plus conditions) and transcendence preset; and the user sheet.
- **Per-mount:** glyph sockets.
- **Oblivion realm:** one loadout (`equipment.oblivion` + `oblivionEnchantStones`). The rest of the
  active preset carries over (`pve-content.md` §9).
- **Deliberate scope change:** fortress moves from per-preset to character-wide. It is clan state in
  the game (`clan-fortress.md`), not a preset choice.

**Normalisation layout.** `model/index.js` (`normaliseRoster`, `newRoster`, the v1 dispatcher) calls,
for each domain file `model/<d>.js`, these four functions: `default<D>()`,
`normalise<D>(raw, ctx)`, `migrate<D>FromV1(v1Character)` and `reconcile<D>(character)`.
- `ctx` = `{class, spec}`, used for gating.
- `reconcile` handles cross-references: `preset.petId` must exist in `pets.owned`; a socketed glyph
  must exist and be unsealed; `enchantSlots` stone ids must exist in the right pool.
- M1 creates every domain file as a stub, so the domain slices never edit `model/index.js`.
- Dominion is not persisted. It is derived by `calculateTotalStats` as `totalDominion` from
  `talents.dominionFlat + transcendence.dominionFlat + 1` (`stats.md` §3.5), both of which are
  persisted allocations.

**v1 migration contract (cross-domain references).** Preset references are remapped in one final
pass, so no domain slice touches `model/presets.js`:
1. `migrate<D>FromV1(v1Character)` returns `{value, idMap}`. `idMap` is `Record<v1Id, v2Ref>` for
   the domains that presets reference: `pets` (v1 pet id → owned pet id), `mounts` (v1 mount id →
   owned mount id), `relics` (v1 relic id → relicId, via `sentinelMigration`), `sigils` (v1 sigil
   id → species) and `transcendence` (→ `'default'`). Other domains return `idMap: {}`.
2. `model/index.js` (M1) runs every domain migration first and collects `idMaps`.
3. It then calls `migratePresetsFromV1(v1Character, idMaps)` (`model/presets.js`, M1) as the last
   step. Unmapped ids become `null`/dropped, and `reconcile` runs afterwards.
4. The M1 stubs return `{value: default<D>(), idMap: {}}`, so until a domain slice lands its preset
   references migrate to `null`. Each domain slice's acceptance includes a test, through
   `model/index.js`, that a v1 preset referencing one of its objects still references it after
   migration.
5. Fortress (B6b): `migrateFortressFromV1` takes the `fortressBuffs` of the v1 preset at
   `activePresetId` (falling back to the first preset). The other presets' fortress buffs are
   dropped (the v1 key keeps them).

**v1 migration (best effort, each row owned by its domain slice; preset references follow the contract above)**

| v1 | v2 | Notes |
|---|---|---|
| `class` `'Warrior'`/`'Sentinel'` | `WARRIOR`/`SENTINEL` | level defaults to 100 |
| `talentSets[].spec` arms/protection/marksmanship/disruption | `WARRIOR_DPS`/`WARRIOR_TANK`/`SENTINEL_MARKSMANSHIP`/`SENTINEL_DISRUPTION` | talents matched by name against `talents.json`; unmatched ones dropped |
| `loadouts[0..1].gear` stat blocks | `equipment.set1/set2.items`, old stat keys → `SecondaryStatType` | rarity, ilvl and quality null |
| `socketedStones`, `stoneInventory` | `enchantSlots`, `enchantStones` | `amplifyLevel` 0 |
| pets with `companionId` + `petAltar` | `pets.owned` (species by name), `pets.altar` | custom pets with no species are dropped |
| mounts `star>0` | one owned mount per def, `level = star` | `baseHp`/`baseAtk` back-solved from the stored value if present, else 0; rarity = the species rarity |
| glyph inventory + `mount.glyphIds` | `glyphs`, `mount.glyphs` sockets | unmapped ids dropped |
| `sigilValues[].level`, `sigilForgeTier` | `sigils.owned`, `sigils.altarTier` | user-typed damage values dropped |
| `relicLevels` | `relics` | use `relics.json` `sentinelMigration` |
| `awakening{path,points}` | `awakening{path, level}` | |
| `transcendence.unlockedPositions` | default preset `allocatedNodeIds` (`n_col,row`) | only if the position exists on the class board |
| presets: `loadout`, `talentSet`, `petId`, `mountId`, `relicIds`, `sigilIds` | `equipmentSet` 1/2 (M1); the rest through `idMaps` in the final pass (contract above) | `fortressBuffs` of the active preset only → `character.fortress` (B6b) |
| `drop`, `dropGoal`, opponents, `runHistory`, linking state, `goal`, `linked`, `manualTotals` | dropped | |

---

## 4. Getting final stats despite the server gaps

The server computes the live `computedStats` and adds relics and possibly other sources
(`stats.md` §2, §10). The app therefore works in three tiers:

1. **Computed (tier 1).** `calculateTotalStats` runs on the user's pieces.
   - The base is `character.baseResidual`, which defaults to the client's `baseStats`.
   - Relics are added through `sources/relic.js` as additive points. This is an **assumption**, and
     the UI labels it as one.
   - `a7` is passed as `undefined`, as the only client caller does.
2. **Sheet (tier 2).** The user types the in-game sheet into `preset.sheet`, or
   `oblivion.sheet` for the Oblivion realm. When a sheet is present, the engines use it verbatim.
3. **Validation (tier 3).** `diffSheet(computed, sheet)` compares the two per key.
   - Tolerances: Attack and HP ±1, percent stats ±0.1, multipliers ±0.01.
   - The UI shows "explained / unexplained" per stat.
   - "Absorb into base" moves the Attack, HP, Attack Speed, Crit Chance and Crit Damage residuals
     into `baseResidual`.
   - The other residuals are carried as `residual` and added in raw space to every candidate built
     from that preset (see "Residual carry" below).
   - Client oracle: the in-game "Set N preview" runs the same function without relics. The user can
     enter a relic-free preview as a golden fixture.

**Sheet-anchored deltas.** These are used by Drop Check and by gear search.
1. `raw0 = sheet.raw<Key>` if it is printed, otherwise `rawFromSoftCapped(sheetEffective)`.
2. `effective' = round(applySoftCap(raw0 + Δ))`.
3. Attack and HP are split into flat and percent parts using the known Attack% / HP% sources:
   `flat = total / (1 + pct/100) / attackMult`.

This mirrors the client's `softCapGainFromSheet` (L1080334-1080366).

**Residual carry.** For optimiser candidates that differ in more than one item:
`candidateStats = calculateTotalStats(candidate) ⊕ residual(currentPreset)`, applied per key in raw
space with the curve applied afterwards. With no sheet, the residual is 0 and results are tier 1.

---

## 5. The four features

| Feature | Inputs | Metric | Engine | UI |
|---|---|---|---|---|
| **1. Gear swap / Drop Check** | A candidate item (slot, rarity, primary, secondaries, conduit), the realm, all presets (or one), and optional saved opponents. | Per preset, the per-stat anchored delta, then Δ auto-attack DPS (closed form, `combat-pve.md` §7) and Δ sim DPS (`dpsVsDummy`, N=32, common random numbers). Optional: Δ survival vs the chosen enemy (N=200) and Δ PVP win rate vs opponents (N=64). Verdict is upgrade, sidegrade or downgrade with a CI. The item's legal secondaries and ceilings come from `gear.json` / `drops.json`. | `pipeline/anchoredDelta` + `metrics` (worker task `dropCheck`) | `screens/DropCheckScreen` + `drop/VerdictCard` (adapted). The item editor is shared with Gear (`gear/ItemEditor`). |
| **2. PVE build optimiser** | A preset, a target (dummy 60 s; campaign chapter or hard chapter from `combat-pve.json`; classic dungeon step or Oblivion floor from `pve-content.json`; World Boss affinity from `world-boss.json`; or a user-entered mob), an objective (DPS, TTK median/P90, survival %), the search space toggles (talent allocation, relics ≤4, generic/utility/Ancient sigils + conditions, pet, mount + glyph sockets, transcendence preset, equipment set) and a budget. | Tiered: tier 0 closed form (µs), then tier 1 sim N=16 on the top few hundred, then tier 2 N=64 on the top 20-50. Common random numbers with seeds from `hash(buildKey, targetKey, i)`, a result cache, cancel returns best-so-far. | `search/*` over `metrics`, using the residual carry | `screens/OptimiserScreen` + `optimiser/CandidateCard` (from `SimulatedPresetCard`) + `optimiser/RunHistory` (from `RunHistoryPanel`). "Apply to preset" writes ids only. |
| **3. PVP duel** | My preset (sheet or computed) as attacker or defender, and an opponent (`character.opponents`, or "clone my preset as spec X"). | Win rate N=400 with a Wilson CI, mean and P90 duration, timeout share, and the avoid/crit/disrupt frequencies. One traced duel. | `pvp/resolver` via `runDuel` with ×8 HP applied to both sides (`applyPvpHpBuff`) | `screens/DuelScreen` (small; target <400 lines) + `DuelTimeline` (kept) + `duel/OpponentEditor`. Optional: import an `/arena/fight` JSON for `replayCheck` (E9). |
| **4. Oblivion hero** | `oblivion.{unlocked, level, activeRealm, sheet}`, `equipment.oblivion` (12 slots), `oblivionEnchantStones` (incl. Oblivion stones and Oblivion Power), and the rest from the active preset. | The realm's total stats, Oblivion Power, and per floor: net strain = instability − Oblivion Power, win % (N=64) and TTK, plus the highest floor with ≥90% wins. Drop Check runs in realm `oblivion`. | `pve/fight` with the Oblivion options (`pve-content.md` §11) + `pve/enemies` floors | `screens/OblivionScreen` (realm toggle, level, power summary, floor table). Gear editing reuses `screens/GearScreen` with `realm="oblivion"`. |

Fidelity labels shown in the UI:
- Campaign fights are exact rules: the client runs them.
- Dungeons, World Boss, arena and the Oblivion dungeon are the model of the server
  ([SERVER] / [UNRESOLVED] in `combat-pve.md` §1).
- Every sim result shows N and a CI.

---

## 6. Testing

- **Colocated Vitest, as today.** Engine and lib tests are pure and need no DOM. Component tests run
  through the `rosterStore` singleton. `src/test-setup.js` keeps the seeded `'Test'` character, and
  M1 updates it to the v2 API.
- **Port tests are hand-traced and cite their lines.** Every ported function gets cases named with
  their decompile range, e.g. `it('rollAttackDamage: crit + double hit (L1085998-1086047)')`. The
  expected values are traced by hand from the decompile and shown in a comment table. Use doc worked
  examples where they exist:
  - Block raw 80 → 62.22, raw 120 → 70.00, Penetration 66.08 → 51.0.
  - Pet tier multiplier `t²−t+1`.
  - Sigil L5 Health 1819.
  - Amplify ×1.6 at +10.
  - The Oblivion floor 10 power of 170.
- **Scripted RNG.** `rng.js` exports `mulberry32(seed)` and `scripted([..])`. `scripted` throws when
  its values run out and records the draw count. Port tests assert the **number and order of draws**,
  which catches draw-order drift (§2.2 of the port spec).
- **Golden tests.** Seeded runs (`dpsVsDummy`, `pvpWinRate` and `simulatePve` on fixed fighters)
  snapshot their summary in `engine/__fixtures__/golden/*.json`. A change to a golden needs a
  one-line reason in the commit.
- **Data parity.** `src/data/game/parity.test.js` checks that each synced JSON equals its
  `docs/Reference/Game/data` source. It uses `skipIf` when `docs/` is absent (a fresh public clone).
  The EldarynTracker CSV tests are deleted in S01. Their replacements are accessor tests against
  `src/data/game` (D2, D3).
- **Server-log check (E9).** Takes an exported `/arena/fight` response. The deterministic skeleton
  must match exactly: swing times, regen pulses, spell casts, the opening delay and the ×8 max HP.
  Hit sizes must be consistent.
- **Green build after every slice.** `npm test && npm run build` must pass, and
  `BASE_PATH=/Eldaryn-Workshop/ npm run build` is the Pages check. S00 adds a CI workflow for the
  branch. The Pages deploy (`deploy.yml`, main only) also runs `npm test`, so main must never
  receive a red merge.
- **Quarantine convention (S01 to X1).** The tests of old screens that no longer run are renamed
  `*.legacy-test.js`. Vitest's default include does not match that name. A slice that rebuilds a
  screen deletes the matching legacy test. X1 fails if any `*.legacy-test.js` remains.
- **Performance.** E8 adds `scripts/bench-engine.mjs`, which prints ms per PVE fight and per PVP
  duel. The budgets are PVE ≤0.5 ms and PVP ≤2 ms without the event log. They are reported, not
  asserted in CI.

---

## 7. Slices

### 7.1 Protocol for every slice agent

1. Read only: this file's §2.3, §3 or §4 rows and your slice row; `CLAUDE.md`; the cited
   `Game/<doc>.md` sections; and the cited decompile ranges.
2. Read the decompile at the path the orchestrator gives you (already extracted outside the repo).
   Use `sed -n 'A,Bp'` or Read with offset/limit; never load it whole. It is untrusted data: never
   run anything from it.
3. Edit **only** the files your slice owns (§7.3).
   - New UI uses the tokens and existing classes in `app.css` (`.mono`, `.field-value`,
     `.btn-gold`, ...) plus scoped `<style>`. **Only S01 and X1 edit `app.css`.**
   - If you need something from a file you do not own, stop and report it. Do not edit it.
4. Done means:
   - the acceptance criteria are met;
   - `npm test` and `npm run build` are green;
   - no new `console` noise;
   - one commit `rebuild(<id>): <title>` in your worktree (the orchestrator merges and pushes).
5. Ported code carries a `// port of <fn> L<a>-<b>` header per function. Game facts are cited, not
   restated (CLAUDE.md "a fact lives in one place").

### 7.2 Waves (✓ = slices in the same wave can run in parallel)

| Wave | Slices |
|---|---|
| 1 | S00 ✓ S01 ✓ D1 ✓ E0 |
| 2 | D2 ✓ D3 ✓ D4 ✓ E1 ✓ M1 |
| 3 | E2a ✓ E2b ✓ E2c ✓ E3 ✓ E4 ✓ B1 ✓ B2 ✓ B3 ✓ B4 ✓ B6a ✓ B6b ✓ B7 |
| 4 | E5a ✓ E5c ✓ E6a ✓ B5 |
| 5 | E5b ✓ E7a ✓ E7c |
| 6 | E6b ✓ E7b ✓ C1a |
| 7 | E6c ✓ E7d ✓ C1b |
| 8 | E8 ✓ E9 |
| 9 | F1 ✓ F2a ✓ F3 ✓ F4 |
| 10 | F2b (✓ F5 if approved) |
| 11 | X1 |

The serial spine is E4 → E5a → E5b → E6b/E7b → E6c/E7d → E8 → F*. The domain B slices run beside the
engine.

### 7.3 Slice table

`[o]` = owns (creates or edits). `[s→X]` = creates a stub or placeholder that slice X later takes
over. Every slice also owns its own `*.test.js` files.

**Ownership transfer (stub-then-replace).** A file has exactly one owner at a time. The stubbing
slice owns it until it merges, and from then on the slice named after the arrow is the sole owner;
the stubbing slice never edits it again. Transfers:
- S01 `screens/<Name>Screen.svelte` placeholders → the slice that owns that screen below.
- M1 `model/<d>.js` and `store/<d>.js` domain stubs → the domain slice named in §3.
- M1 `src/lib/assets/{pets,mounts,glyphs,sigils}.js` (moved out of `assets.js`) → B3, B4, B4, B5.
- E8 `tasks/{optimize,dropCheck,oblivionFloors}.js` stubs and the working `tasks/duel.js` → F2a, F1,
  F4, F3.
- `src/data/game/`: D1 owns the sync script, `parity.test.js` and the 15 existing copies. The script
  copies every `*.json` in `docs/Reference/Game/data`, so D2 (`skills.json`) and D4
  (`awakening.json`, `world-boss.json`) own their new source file and its synced copy, and only run
  `npm run sync:data`.

| ID | Title | Depends | Owns | Acceptance | Model / effort |
|---|---|---|---|---|---|
| **S00** | Branch CI | — | `[o] .github/workflows/ci.yml` | Runs `npm ci`, `npm test` and `npm run build` with `BASE_PATH` on push to any non-main branch and on PRs. `deploy.yml` untouched. | haiku / low |
| **S01** | Retire invented screens; freeze the shell | — | Deletes the S01 row of §2.4. `[o] src/App.svelte, Sidebar.svelte, app.css`, `[o] src/components/PendingScreen.svelte`, `[o] src/components/navVisibility.js`, `[s→owner] src/components/screens/*Screen.svelte` (14 placeholders), renames to `*.legacy-test.js`. Old domain screens stay on disk unrouted as reference. No `src/lib` edits. | App routes the final nav (§2.5) to placeholder screens. `navVisibility` hides Oblivion unless `character?.oblivion?.unlocked === true` (tested with plain objects). Settings and Welcome work. Nav colour triples for `character, optimiser, duel, oblivion` exist. `npm test` is green with only the quarantined tests excluded. No import of a deleted component remains. The build is green. | sonnet / medium |
| **D1** | Data sync + core catalogues | — | `[o] scripts/sync-game-data.mjs`, the 15 existing `src/data/game/*.json` copies, `src/data/game/parity.test.js` (globs every synced file), `src/lib/game/{stats,classes}.js`, `package.json` script `sync:data` | `npm run sync:data` copies every JSON file in `docs/Reference/Game/data` (15 today). The parity test passes, or is skipped without `docs/`. `game/classes.js` exports `CLASSES`, `specsForClass`, `available(stat, class)` (L1213616-1213879), the attunement bonus and sigil unlocks. `game/stats.js` exposes the stat rows, caps, ceilings, units and rounding by `computedKey` and enum. | sonnet / low |
| **D2** | Catalogues: gear, stones, drops, talents, relics, skills | D1 | `[o] src/lib/game/{gear,stones,drops,talents,relics,skills}.js`, new `docs/Reference/Game/data/skills.json` (from `skills.md` §3) + its synced copy | Accessors: slots per realm, rarities, the secondary pool per class, conduit config, stone types/pools/amplify table/Oblivion grades, talent trees by spec (8), relics by class (4), the 14 skills with effects and costs. Tests use the JSON values. | haiku / medium |
| **D3** | Catalogues: sigils, mounts-glyphs, pets, fortress, transcendence, PVE/PVP content | D1 | `[o] src/lib/game/{sigils,mountsGlyphs,pets,fortress,transcendence,combatPve,combatPvp,pveContent}.js` | `game/transcendence.js` imports `transcendence.json` statically and exposes synchronous accessors (no `import()`, §8 Size); the slice reports the gzip size it adds to the main chunk. Major glyphs by class and spec (42). Sigils by class and spec with `isSigilSpeciesActiveForSpec`. Tests replace the deleted CSV tests: catalogue counts and spot values. | haiku / medium |
| **D4** | New extractions: awakening, world boss | D1 | `[o] docs/Reference/Game/data/{awakening,world-boss}.json` + synced copies, `src/lib/game/{awakening,worldBoss}.js`, and a `data/` row in `Game/README.md` | `awakening.json`: per-point bundles for both paths, with class and spec overrides (L1222246-1222304, `awakening.md` §3-§4). `world-boss.json`: the affinity configs, boss stats, the 60 s window and 100 ms tick (L1153423-1153478). Every value carries a line citation. | sonnet / medium |
| **E0** | RNG + types | — | `[o] src/lib/engine/{rng,types}.js` | `mulberry32`, `sfc32`, `scripted`, `hashSeed(...parts)`. JSDoc typedefs: `ComputedStats`, `Fighter`, `Item`, `Stone`, the source bonus objects (a2..a10), `MobSpec`, `PveResult`, `DuelResult`. The same seed gives the same sequence. | sonnet / medium |
| **E1** | Soft caps, ceilings, PVP rating | E0, D1 | `[o] engine/core/caps.js` | Port of module 3959 (L1080181-1080516): `applySoftCap`, `rawFromSoftCapped`, `applyCombatCeiling`, `softCapGainFromSheet`, `softCapEfficiency`, `pvpRatingToPercent`. Patch-note cases pass, and the round trip holds. Miss hard cap is 85. | sonnet / medium |
| **E2a** | Sources: talents, awakening, transcendence | E0, D2, D3, D4 | `[o] engine/sources/{talents,awakening,transcendence}.js` | Ports of L1096663-1096759, L1221780-1221985 and L1217901-1217995. The transcendence source takes the class board as an argument (sync, pure); it never imports the catalogue. Spec and class override precedence for awakening. Hand-traced cases per class. | sonnet / medium |
| **E2b** | Sources: pet, mount + glyph secondary, stones, relic | E0, D2, D3 | `[o] engine/sources/{pet,mount,stones,relic}.js` | Ports of L1221320-1221766, L1224876-1225023, L1205726-1206148 and L1142576-1142598. Pet altar secondary scaling ×(1+0.02(L−1)). Amplify ×(1+0.06L) excluding Oblivion Power. Mount `baseHp*(1+0.1(level−1))`. | sonnet / medium |
| **E2c** | Sources: sigil scaling, sigil passives, fortress | E0, D3 | `[o] engine/sources/{sigilScale,sigilPassive,fortress}.js` | `getSigilSpellScaled` L1067622-1068264, including the caps listed as high gaps. `calculateSigilBonuses` and `getSigilBonusAttack/Hp` L1095765-1096000, L1067546-1067621 (the L5 Health 1819 case). Fortress with the class remap L1222325-1222947 (the BOTTOM remap). | sonnet / high |
| **E3** | Stat pipeline | E1 | `[o] engine/pipeline/{totals,sheet,sheetDiff,anchoredDelta}.js` | `calculateTotalStats` L1215735-1217872 verbatim: class and form rules, floors, rounding, `raw*` emission (`stats.md` §3). It takes the source bonus objects as arguments, so it does not depend on E2. `sheet.js` holds the key list, units, tolerances and parsing. Mystic, Necromancer and Druid-form cases, including `totalDominion` (`stats.md` §3.5). | sonnet / high |
| **E4** | Combat primitives | E1 | `[o] engine/core/{entity,buffs,shield,rolls}.js` | `createPlayerEntity`/`createMobEntity` L1087500-1087646. `applyBuffsToEntity` L1085543-1085695 (multiplicative Attack % buff). `absorbWithShield`, the heal budget, `applyDamageReduction`, `rollAttackDamage`, `rollPenetrationCritMult`, `rollDisruption` L1085790-1086166. Scripted-RNG tests assert the draw count. | sonnet / high |
| **E5a** | Debuffs, stacks, glyph overrides, Chrono Flux | E4, D3 | `[o] engine/core/{debuffs,stacks,glyphMods,chronoFlux}.js` | Module 3966 (L1093377-1093800). `createStackCombat` L1079785-1080125. `stackGlyphOverrides`/`applySigilGlyphMods` L1080527-1081239: coverage checked against the 42 major glyphs, with a test listing any uncovered ids. `chronoFluxFromEvents` L1094066. Bulwark numbers are 8/4/7, burn 1. | sonnet / high |
| **E5c** | Minions | E4 | `[o] engine/core/minions.js` | `createMinion`, `minionSwing`, respawn L1094190-1095536. Formulas as in `classes.md` §7. | sonnet / medium |
| **E5b** | Spells + config builders | E5a, E2c | `[o] engine/core/{spells,spellConfig}.js` | Module 3964 L1089591-1092724: momentum, `isConditionMet`, transforms, buff modifiers, `processSpellsTick`, `triggerTransformSpell`. Cast order from module 3965. Builders `getActiveCombatSpells`, `getEquippedShieldConfig`, `getEquippedSummonConfig` L1095542-1096330. **Must resolve `k` in `modSpellDmg` (L1090892)** and write the answer into `combat-pve.md` §10.2. | opus / high |
| **E6a** | PVE enemies | E4, D3, D4 | `[o] engine/pve/enemies.js` | `makeMob` L1084790-1084839 and `buildChapterLevels` L1084840 onward. Hard chapters, classic dungeon steps, Oblivion floors (floor 10 power 170) and World Boss affinities, all from the JSON catalogues. Returns `MobSpec`. | sonnet / medium |
| **E6b** | PVE tick | E5a, E5b, E5c | `[o] engine/pve/tick.js` | `processCombatTick` L1086167-1087434 (about 1,270 lines). Scripted-RNG tests per branch assert draw count and order. | sonnet / high |
| **E6c** | PVE fight driver | E6a, E6b | `[o] engine/pve/fight.js` | `simulateFight` L1087661-1089480 incl. its `finishMinionTick` closure (L1087924-1088000), with options for `opening` ('half' or 'zero'), the Oblivion options, `dtMs`, `log`. With spells off, the sim mean converges to the closed form within 1% at N=2000. | sonnet / high |
| **E7a** | PVP hit resolution | E4, E5a | `[o] engine/pvp/{attack,hpBuff}.js` | Module 5399 helpers L1452736-1453844: `getPvpHpMultiplier`, `pvpRatingToFraction`, `applyRegen`, `processAttack` with `mitigate` and `applyLifesteal`; plus `applyPvpHpBuff` L1454678-1454717 (×8 HP). Rule tests: a single avoid roll; penetration only when miss is 0. | sonnet / high |
| **E7b** | PVP arena spells | E5b | `[o] engine/pvp/arenaSpells.js` | `mapSpellEventType` + `processArenaSpells` L1453845-1454677. Scripted-RNG draw-order tests per spell kind. | sonnet / high |
| **E7c** | PVP reactions, shields, minions | E5a, E5c | `[o] engine/pvp/reactions.js` | The `simulateArenaPvP` closures L1454739-1455733 (`applyStackToTarget`, `applyElusiveToSwinger`, `applyCritDownToSwinger`, `reactToAttack`, `tagShieldSnapshots`, `tagMinionSnapshots`, `finishMinionTick`, `killMinionsOfDead`, `minionStrike`, `shieldBaseFor`), ported as a factory over an explicit duel-state object instead of captured registers. | sonnet / high |
| **E7d** | PVP resolver loop | E7a, E7b, E7c | `[o] engine/pvp/{resolver,events}.js` | `simulateArenaPvP` header L1454718-1454738 and main loop L1455734-1457672, with the 14-argument mapping confirmed at L1454738-1456045. `events.js` defines the `DuelEvent` log schema that `DuelTimeline` consumes. `runDuel` wrapper. Rule tests: time-up goes to strictly higher raw HP, ties to the defender; the mutual-kill rule; the 10 ms tick; the attacker swings first. Event-free mode gives the same results as log mode for the same seed. | opus / high |
| **E8** | Metrics + worker plumbing | E6c, E7d | `[o] engine/metrics.js`, `scripts/bench-engine.mjs`, `optimizerWorker.js`, `optimizerClient.js`, `src/lib/tasks/index.js`; `[s→F2a/F3/F1/F4] tasks/{optimize,duel,dropCheck,oblivionFloors}.js` (stubs except a working `duel`) | The four metrics with Wilson or t CIs, common-random-number seeding and a pure-input cache key. The worker dispatches by `mode` through `tasks/index.js`. Cancel returns best-so-far. The benchmark prints ms per fight. | sonnet / medium |
| **E9** | Server-log replay check | E7d | `[o] engine/pvp/replayCheck.js`, fixture `engine/__fixtures__/arena-fight.sample.json` (synthetic until the user supplies a real one) | Compares the deterministic skeleton and the per-hit size consistency, and reports mismatches per rule. | sonnet / medium |
| **M1** | Model v2 core + store facade + storage v2 | S01, D1 | `[o] src/lib/model/index.js, character.js, presets.js` + `[s→domain]` **stubs** `model/{equipment,stones,talents,pets,mounts,glyphs,sigils,relics,awakening,transcendence,fortress,skills,oblivion,drop,opponents,runs}.js`. `[o] src/lib/store/{characters,presets,sheets}.js` + `[s→domain]` stubs `store/{gear,stones,talents,pets,mounts,sigils,relics,awakening,transcendence,character-extras,drop,pvp,oblivion,runs}.js`. `[o] rosterStore.svelte.js` (facade spreading every store file), `storage.js`, `src/test-setup.js`, `WelcomeScreen.svelte`. `[o] src/lib/assets.js` (becomes a barrel), `[s→B3/B4/B5] src/lib/assets/{pets,mounts,glyphs,sigils}.js` (moved verbatim). | The roster round-trips through normalise. v1 JSON imports become v2 with the core fields migrated, and the §3 migration contract is in place: domain `migrate<D>FromV1` returns `{value, idMap}`, and `migratePresetsFromV1(v1, idMaps)` runs last (stubbed domains give `null` references). `store/characters.js` has `setOblivionUnlocked`. The v1 key is untouched. 4-class creation works. Two-preset minimum and max 8. Every mutator ends with `persist()`. Domain stubs return defaults. | sonnet / high |
| **B1** | Gear, stones, Oblivion loadout | M1, D2 | `[o] model/{equipment,stones}.js, store/{gear,stones}.js, screens/GearScreen.svelte, components/gear/*` (adapted from `GearLoadoutsScreen`, `LoadoutColumn`, `SlotSilhouette`, `StoneGrid`, `StoneForm`; new `ItemEditor`) | Three sets (set1, set2, oblivion) and 9/12 slots. The secondary picker is class-gated. Conduit. Stones with `amplifyLevel` and Oblivion grade. A stone can sit in both sets, and the Oblivion pool is separate. The v1 gear and stone migration works. The screen takes a `realm` prop. | sonnet / high |
| **B2** | Talents | M1, D2 | `[o] model/talents.js, store/talents.js, screens/TalentsScreen.svelte, components/talents/*` (from `TalentTierList`) | All 8 trees, tier gating, the points total from `talents.json`, two sets, and the v1 name-matched migration. | sonnet / medium |
| **B3** | Pets | M1, D3 | `[o] model/pets.js, store/pets.js, screens/PetsScreen.svelte, components/pets/*, assets/pets.js` | 18 species with evolved names by tier. Altar level and tier, where a tier change wipes the collection after `ConfirmButton` and nulls `preset.petId`. Secondaries are class-gated. Preview stats come from E2b once it lands (until then show only base values). `migratePetsFromV1` returns an `idMap`, and a v1 preset's `petId` survives full migration. | sonnet / medium |
| **B4** | Mounts + glyphs | M1, D3 | `[o] model/{mounts,glyphs}.js, store/mounts.js, screens/MountsScreen.svelte, components/mounts/*, assets/{mounts,glyphs}.js` | Owned mount instances (species, rarity, `baseHp`/`baseAtk`, level 1-5). Sockets 3/2/1. Glyph instances, where sealed glyphs cannot be socketed and major glyphs are class- and spec-filtered. The v1 migration works, and `migrateMountsFromV1`'s `idMap` keeps a v1 preset's `mountId`. | sonnet / high |
| **B5** | Sigils | M1, D3, E2c | `[o] model/sigils.js, store/sigils.js, screens/SigilsScreen.svelte, components/sigils/*, assets/sigils.js` | Ownership levels and altar tier. Per-preset equip of 3 generic + a utility slot (Summon, Shield or Form, by spec) + 1 Ancient, with slot unlocks by level. Activation conditions from level 54. The derived spell numbers display from `sigilScale`. `migrateSigilsFromV1`'s `idMap` (v1 sigil id → species) keeps a v1 preset's sigils. | sonnet / high |
| **B6a** | Relics + Awakening | M1, D2, D4 | `[o] model/{relics,awakening}.js, store/{relics,awakening}.js, screens/{Relics,Awakening}Screen.svelte` | Relics for 4 classes with level scaling, and ≤4 per preset (2 base + 2 extra). Awakening path and level ≤15 with the override display. v1 migration including `sentinelMigration`, and `migrateRelicsFromV1`'s `idMap` keeps a v1 preset's `relicIds`. | sonnet / medium |
| **B6b** | Character screen: level, skills, fortress, base residual | M1, D2, D3 | `[o] model/{skills,fortress}.js, store/character-extras.js, screens/CharacterScreen.svelte` | Class/spec summary and level. Skill levels incl. the Oblivion point, plus attunement bans (cap per class). Fortress owned buffs with the class-remap preview; v1 fortress migrates from the active preset only (§3 contract, step 5). `baseResidual` editor. The Oblivion unlock toggle (§2.5). | sonnet / medium |
| **B7** | Transcendence | M1, D3 | `[o] model/transcendence.js, store/transcendence.js, transcendence.js, screens/TranscendenceScreen.svelte, components/transcendence/*` (from `Grid`/`Node`/`Drawer`) | 6 boards and ≤4 presets, with `preset.transcendencePresetId` linking. Costs from `transcendence.json`. The graph logic is verified or fixed against `transcendence.md` §2/§7. v1 position migration into the `'default'` preset, whose `idMap` sets `preset.transcendencePresetId`. | sonnet / medium |
| **C1a** | Build layer | M1, E2a, E2b, E2c, E3, B1–B7 | `[o] src/lib/build/{presetInputs,stats,residual,fighter,describe}.js` | `computePresetStats` and `buildFighter` for every class and realm (Oblivion uses `equipment.oblivion` + the active preset's other parts). The full fixture character per class gives stable totals (golden). Sheet override and residual carry follow §4. `formConfig` comes from the equipped Form sigil. The Fighter carries `totalDominion` from the pipeline (never user-entered). | sonnet / high |
| **C1b** | Presets hub + sheet entry + validation UI | C1a | `[o] screens/PresetsScreen.svelte, components/presets/*` (from `PresetEditor`, `PresetCard`), `components/sheet/{SheetFields,SheetDiff}.svelte` (from `StatsFields`), `format.js` | Preset grid and editor with id selectors. Sheet entry per class-gated `computedKey`. A per-stat diff table with tolerance colouring and "absorb into base". `format.js` no longer imports `constants.js`. | sonnet / high |
| **F1** | Gear swap / Drop Check | C1a, E8 | `[o] model/drop.js, store/drop.js, features/swap.js, tasks/dropCheck.js, screens/DropCheckScreen.svelte, components/drop/*` (from `VerdictCard`) | §5 row 1. A verdict per preset with a CI. "Apply to set" writes the item into `equipment.<set>`. Works with and without a sheet, and in both realms. | sonnet / high |
| **F2a** | PVE optimiser engine | C1a, E8 | `[o] search/{search,candidates,objectives}.js, tasks/optimize.js, model/runs.js, store/runs.js` | §5 row 2. A generic beam with subset enumeration (salvaged from `optimizer.js`), tiered evaluation and the result cache. Over a 60 s dummy, the top result is ≥ the current preset's value (same seeds). Runs are saved under the byte budget. | sonnet / high |
| **F2b** | PVE optimiser UI | F2a | `[o] screens/OptimiserScreen.svelte, components/optimiser/*` (from `SimulatedPresetCard`, `RunHistoryPanel`) | Target, objective and space pickers. Progress, cancel, the top-N with CIs, a diff vs the current preset, and apply-to-preset. | sonnet / medium |
| **F3** | PVP duel | C1a, C1b, E8 | `[o] model/opponents.js, store/pvp.js, features/duel.js, tasks/duel.js, screens/DuelScreen.svelte, components/duel/*`, `src/components/DuelTimeline.svelte` (kept in place; adapted to E7d's `DuelEvent` schema) | §5 row 3. Opponent CRUD plus "clone my preset as spec X". Win rate N=400 with a CI in the worker. A traced duel in the timeline. Swap sides. | sonnet / high |
| **F4** | Oblivion hero | C1a, C1b, B1, E6c, E8 | `[o] model/oblivion.js, store/oblivion.js, features/oblivionDungeon.js, tasks/oblivionFloors.js, screens/OblivionScreen.svelte, components/oblivion/*` | §5 row 4. A realm toggle (the store sets `activeRealm`, and other screens read it). Oblivion Power total, a floor table with strain and win %, and the max floor at ≥90%. | sonnet / medium |
| **F5** | *(optional, Q3)* PVP objective in the optimiser | F2a, F3 | `[o] search/pvpObjective.js` | Screens on win rate vs the saved opponents with successive halving (N=64, then 400 on the top handful). | sonnet / medium |
| **X1** | Cleanup + docs | all | Deletes every old lib module in §2.4 and the old components/tests, plus `*.legacy-test.js`. `[o] app.css` (new numeric selectors), `docs/Reference/data-model.md` (rewritten for v2), `CLAUDE.md` (architecture, commands), and archives `combat-model.md` | No `src/lib/*Data.js`, `constants.js`, `dps.js`, `totals.js`, `statCaps.js` or `simulation.js`. No legacy tests. A grep for deleted names is empty. Ready to merge to main (merging is the user's call). | sonnet / medium |

---

## 8. Risks, unknowns, questions

**Risks and unknowns** (the owning slice handles each one)
- **Server boundary.** Most fights, the final sheet, and how relics combine are server-side. This is
  mitigated by the sheet tier, the residual carry and the fidelity labels (§4, §5).
- **Spell damage `k`** (E5b), **Chrono Flux units** (E5a), **paralyze 1000 ms vs the 2 s tooltip**
  (E4) and **the PVE silence consumer** (E6b). Port the code value, cite it, and record the
  resolution in the Game doc.
- **Live loop vs shared engine.** They differ on spell resist and the mob opening. The default is
  the shared engine with `opening` exposed (E6c).
- **Draw order is behaviour.** Scripted-RNG tests guard it. Common random numbers only partly cancel
  noise when branches differ.
- **Performance.** The sim-heavy search may be too slow. E8 benchmarks first, and F2a keeps tier 0
  and tier 1 cheap. Fallback: lower N and use successive halving.
- **Decompile misreads.** Hermes register tracing can be wrong. Any port finding that contradicts a
  Game doc goes to `app-gap-2.7.0.md` with lines, and is not silently "fixed".
- **Lossy v1 migration.** Rolled mount bases and pet rarities may be missing. The v1 key is kept
  untouched, so nothing is lost.
- **Repo split.** Resolved: since 2026-10-14 `docs/` is tracked in the main repo (now private);
  `edoc` is retired. Commit docs with plain `git`.
- **Size.** `transcendence.json` (272 KB raw) is imported statically, because the stat pipeline,
  the build layer and the worker all need it synchronously (§2.1). D3 reports its gzip cost in the
  main chunk. If that is too large, the fallback is a single boot-time preload in the store facade
  that every compute path awaits once, never a lazy accessor inside the engine. `combat-pve.json`
  (151 KB) is only imported by the engine and worker chunks.

**Questions only the user can answer**
1. **Publishing the data.** The app must bundle `src/data/game/*.json` in the public repo and on
   GitHub Pages. Is shipping the extracted catalogues publicly OK, and should the `source`/`line`
   citation fields be stripped from the public copy?
2. **Branching.** Answered: the rebuild lives on `claude/sweet-cannon-klhjs3`. No merge to `main` (or
   Pages deploy) without the user.
3. **PVP in the optimiser.** Is the standalone duel simulator enough, or should the optimiser also
   search for PVP win rate (slice F5)?

---

## Review notes (2026-10-14)

Reviewer findings and how they were handled:
1. **Two owners per file.** Fixed: explicit `[s→X]` stub-then-replace transfers in §7.3, and the
   sync script copies every JSON so D2/D4 own only their new files.
2. **v1 preset references.** Fixed: the `{value, idMap}` contract and the final
   `migratePresetsFromV1` pass in §3, with per-domain acceptance tests. The fortress rule (active
   preset only) is now spelled out.
3. **Lazy `transcendence.json` vs a sync engine.** Fixed by dropping the lazy load: it is imported
   statically and accessors stay sync (§2.1, D3, E2a, B7, §8 Size).
4. **F3/F4 missing C1b.** Fixed.
5. **Oblivion nav before M1.** Fixed: S01's pure `navVisibility.js` reads the field defensively.
   This also exposed that the unlock toggle was unreachable on a hidden screen, so it moved to the
   Character screen (B6b, mutator in M1).
6. **E6/E7 too big.** Fixed: E6 → E6a/b/c and E7 → E7a/b/c/d along the decompile's own function
   boundaries; only E7d stays on opus (it integrates the draw order). E3 was already sonnet and is
   left whole, because `calculateTotalStats` is one function whose rounding order must not be split
   across agents.
7. **Necromancer Dominion.** Not a gap: the client derives it in `calculateTotalStats` from
   `talents.dominionFlat + transcendence.dominionFlat + 1` (`stats.md` §3.5), both already
   persisted, and "it never comes from gear" refers to gear only. A user-entered field would
   duplicate a derived value. The plan now states this in §3, E3 and C1a.
8. **Layer order and `DuelTimeline`.** Fixed: the model moved below build and the store above
   features (§2.1). E7d owns the `DuelEvent` schema (`pvp/events.js`), and F3 owns adapting
   `DuelTimeline.svelte`.
