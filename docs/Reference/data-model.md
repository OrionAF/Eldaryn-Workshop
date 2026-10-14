# The Data Model (v2) — canonical reference

> **Status:** Current · **Last verified:** 2026-10-14
> **Covers:** the persisted v2 shape (Roster → Character → Preset and friends), the
> character-wide / per-preset / per-mount split, where normalisation lives, the v1
> migration contract, storage keys, and the stat-sheet tiers.

**This is the source of truth for the persisted domain shape.** `src/lib/model/`
implements it and cites this file. Game facts behind each field live in
`Reference/Game/*.md`; the build that produced this layout is
`WIP/being-worked-on/rebuild-plan.md`.

The pre-rebuild (v1) model, `totals.js`, `dps.js` and `combat-model.md` are gone.
`combat-model.md` is archived in `Archive/outdated-notes/`; the combat and stat math
now lives in `Reference/Game/stats.md`, `combat-pve.md` and `combat-pvp.md`.

---

## 1. The shape

Field names and enum values follow the client state (`PlayerClass` `WARRIOR`,
spec keys `WARRIOR_TANK`, `SecondaryStatType` enum names, species ids from the
JSON), which keeps the `build/` adapters close to identity. Static data stays
code (`src/data/game/*.json` via `src/lib/game/*`); only ids, levels, allocations
and user-entered rolls are saved.

```
Roster    = { schemaVersion: 2, characters: Character[], currentId }

Character = {
  id, name,
  class: 'WARRIOR' | 'SENTINEL' | 'MYSTIC' | 'NECROMANCER' | null,
  level: 1..100,
  baseResidual: { attack, hp, attackSpeed, critChance, critDamage },   // tier-1 base
  skills: Record<skillId, level>,  attunementBans: SecondaryStatType[],
  fortress: { owned: ('TOP'|'BOTTOM'|'CORE')[] },
  equipment: { set1: Equip, set2: Equip, oblivion: Equip },
     Equip = { items: Record<Slot, Item | null>,        // base 9 slots; oblivion 12
               enchantSlots: Record<BaseSlot, stoneId | null> }
     Item  = { rarity, itemLevel | null, quality | null,
               primaryStats: {attack, hp},
               secondaryStats: [{type, value}],
               conduit: {type: 'FLAME'|'EARTHEN'|'DARK', value} | null }
  enchantStones: Stone[],  oblivionEnchantStones: Stone[],        // separate pools
     Stone = { id, type, quality, amplifyLevel: 0..10, oblivionLevel: 1..5 | null,
               stats: [{type, value}] }                          // value = rolled, pre-amplify
  talentSets: [TalentSet, TalentSet],
     TalentSet = { spec: SpecKey | null, allocation: Record<talentId, rank> }
  pets: { altar: {level: 1..50, tier: 1..8},
          owned: [{id, species, rarity, secondaries: [{type, value}]}] },
  mounts: [{ id, species, rarity, baseHp, baseAtk, level: 1..5,
             glyphs: {minor: [id|null ×3], major: [id|null ×2], mythic: [id|null ×1]} }],
  glyphs: [{ id, glyphType, rarity, sealed, secondary: {stat, quality} | null }],
  sigils: { altarTier: 1..8, owned: Record<species, {level: 1..30}> },
  relics: Record<relicId, level>,
  awakening: { path: 'SHADOW'|'RADIANT'|null, level: 0..15 },
  transcendence: { presets: [{id, name, allocatedNodeIds: string[]}],   // max 4; 'default' always exists
                   activePresetId },
  oblivion: { unlocked, level: 0..100, activeRealm: 'base'|'oblivion', sheet: Sheet | null },
  presets: Preset[]   (2..8),  activePresetId,
  drop: { realm, slot, item: Item } | null,
  opponents: [{ id, name, class, spec, sheet: Sheet, sigils, utility, ancient,
                conditions, majorGlyphs, altarTier }],
  runs: OptimiserRun[]        // byte-budgeted run history
}

Preset = { id, name, equipmentSet: 1|2, talentSet: 0|1, petId | null, mountId | null,
           relicIds: string[] (≤4), sigilSpecies: string[] (≤3),
           utilitySigilSpecies | null, ancientSigilSpecies | null,
           sigilConditions: Record<species, conditionId>,
           transcendencePresetId | null, sheet: Sheet | null }

Sheet  = { values: Partial<ComputedStats>, enteredAt }          // tier-2 input, §5
```

There is no persisted goal, linked flag, manual-totals mode, dominion value or
linking state: presets are pure choices of sources, and objectives are chosen at
search time. Dominion is derived (`totalDominion` from talents + transcendence + 1).

### Field notes that are not obvious from the shape

- **Mount `level` 1–5 replaces the v1 `star`.** A mount that exists in `mounts` is
  owned; there is no `owned` flag and no level 0. `baseHp`/`baseAtk` are the
  level-1 roll; the engine applies `1 + 0.1·(level − 1)`.
- **Glyphs are mount-bound sockets.** The inventory (`glyphs`) is character-wide;
  which glyph sits in which socket lives on `mount.glyphs`, and a glyph instance
  fits **one** socket (v1 reuse across mounts becomes clones `<id>~<n>`). A major
  glyph is inert unless its sigil is equipped and the mount is the preset's
  `mountId`. A sealed glyph cannot be socketed.
- **`sigils.altarTier`** (1..8) replaces v1's `sigilForgeTier`; it tiers every
  sigil. Effect magnitudes come from the sigil level and altar tier through
  `engine/sources/sigilScale.js`; no damage numbers are stored.
- **Pets have no tier or level of their own.** The altar (`pets.altar`) scales the
  whole collection. Changing the altar *tier* wipes `pets.owned` (the game's
  behaviour) and nulls every `preset.petId`; confirm with the user first.
- **Stone pools are separate** (`enchantStones` vs `oblivionEnchantStones`);
  `enchantSlots` values must name a stone in the matching pool (reconcile
  enforces it).
- **Fortress is character-wide** (clan state), not per preset as in v1.
- **Value units:** Attack Speed and Crit Damage are multiplier deltas, other
  percent stats are percentage points; flat stats print with "." as a thousands
  separator in the game UI while percentages use "." as a decimal point
  (`format.js` `parseStat`/`formatStat` dispatch on the sheet key's kind).

---

## 2. The three scopes

This split is deliberate and load-bearing; don't move a field across it casually.

| Scope | Meaning | Members |
|---|---|---|
| **Character-wide** | One value shared by every preset | level, base residual, skills, fortress, both equipment sets and the Oblivion set, both stone pools, talent sets, the pet collection and altar, mounts, glyph inventory, sigil ownership and altar tier, relic levels, awakening, transcendence presets, Oblivion state, opponents, runs |
| **Per-preset** | The preset chooses | equipment set (1/2), talent set (0/1), pet, mount, relics, generic/utility/Ancient sigils and their conditions, transcendence preset, and the user sheet |
| **Per-mount** | Neither of the above | glyph sockets (`mount.glyphs`), reached per preset via `preset.mountId` |

The Oblivion realm has one loadout (`equipment.oblivion` + `oblivionEnchantStones`);
the rest of the active preset carries over (`Game/pve-content.md` §9).

**Constraints the code enforces:** two-preset minimum (`MIN_PRESETS`; the store's
`deletePreset` refuses at the minimum, so never write a loop that deletes "down to one
preset"), maximum 8; relic cap 4 and generic sigil cap 3 (`PRESET_RELIC_CAP`,
`PRESET_SIGIL_CAP` in `model/presets.js`); at most 4 transcendence presets with
`default` always present.

---

## 3. Normalisation layout

**Persisted state always goes through `normaliseRoster` / `normaliseCharacter`**
(`src/lib/model/index.js`); never trust a loaded or imported object's shape.
The model is pure and imports only L1 (`src/lib/game/*`).

- `model/index.js` — `normaliseRoster`, `newRoster`, `newCharacter`,
  `normaliseCharacter`, `reconcileCharacter`, `migrateCharacterFromV1`, and the
  `DOMAINS` table (normalisation order).
- `model/character.js` — core (`id`, `name`, `class`, `level`, `baseResidual`) and `newId`.
- `model/presets.js` — presets, cross-reference repair, v1 preset remap.
- `model/<domain>.js` — one file per domain: `equipment`, `stones`, `talents`,
  `pets`, `mounts`, `glyphs`, `sigils`, `relics`, `awakening`, `transcendence`,
  `fortress`, `skills`, `oblivion`, `drop`, `opponents`, `runs`.

Each domain exports four functions: `default<D>()`, `normalise<D>(raw, ctx)`,
`migrate<D>FromV1(v1Character)` and `reconcile<D>(character)`. `ctx` is
`{class, spec}`, used for gating. Order: core → talents (so `ctx.spec` exists) →
every other domain → presets → every domain's `reconcile` → presets' `reconcile`.

Rules when adding a persisted field:

1. Add its `default`, `normalise` (and `migrate` if it replaces a v1 field) in the domain file.
2. Validate against any static data it references: normalisation **drops** any
   saved reference that no longer resolves (a talent id after a class change, a
   glyph no longer in the catalogue).
3. Cross-references (`preset.petId` must be an owned pet, a socketed glyph must
   exist and be unsealed, an `enchantSlots` id must exist in its pool) belong in `reconcile<D>`.

---

## 4. v1 migration contract

`normaliseRoster` detects a v1 save (no `schemaVersion`) and routes each character
through `migrateCharacterFromV1`. Preset references are remapped in one final pass
so no domain touches `model/presets.js`:

1. `migrate<D>FromV1(v1Character)` returns `{value, idMap}`. `idMap` is
   `Record<v1Id, v2Ref>` for the domains that presets reference: `pets`, `mounts`,
   `relics` (via `sentinelMigration` in `relics.json`), `sigils` (id → species)
   and `transcendence` (→ `'default'`). Other domains return `idMap: {}`.
2. `model/index.js` runs every domain migration first and collects the id maps.
3. `migratePresetsFromV1(v1Character, idMaps)` runs last; unmapped ids become
   `null` or are dropped, then `normaliseCharacter` (and so `reconcile`) runs.
4. Fortress takes the `fortressBuffs` of the v1 active preset only; the others are dropped.

Dropped for good: `drop`, `dropGoal`, opponents, run history (sim, pvp and goal
records), linking state, preset `goal`/`linked`, `manualTotals`/`manualStats`,
user-typed sigil damage values. Class `Warrior`/`Sentinel` becomes
`WARRIOR`/`SENTINEL`, level defaults to 100, mount `star` becomes `level`,
`sigilForgeTier` becomes `sigils.altarTier`, awakening `points` becomes `level`.

---

## 5. Storage

`src/lib/storage.js` keeps the whole Roster as one JSON blob under
**`eldaryn_optimiser_state_v2`**.

- The v1 key `eldaryn_optimiser_state_v1` is **read** for migration when no v2 blob
  exists and is never deleted or overwritten by migration. The only place it is
  removed is the user-confirmed hard reset in Settings.
- JSON export/import is routed through `normaliseRoster`; import accepts v1 and v2 JSON.
- Every store mutator ends with an explicit `persist()`, so save timing is
  deterministic around character switches and downloads.

---

## 6. Stat sheet tiers

The server computes the live stats and adds relics and possibly other sources
(`Game/stats.md`), so the app works in three tiers:

1. **Computed (tier 1).** `calculateTotalStats` (`engine/pipeline/totals.js`) runs
   on the preset's pieces via `build/presetInputs.js`. The base is
   `character.baseResidual`; relics enter as additive points, an ASSUMPTION the UI
   labels as one.
2. **Sheet (tier 2).** The user types the in-game sheet into `preset.sheet` (or
   `oblivion.sheet` for the Oblivion realm). When present, the engines use it verbatim.
3. **Validation (tier 3).** `diffSheet(computed, sheet)` compares per key
   (tolerances: Attack/HP ±1, percent ±0.1, multipliers ±0.01). "Absorb into base"
   moves the five base residuals into `baseResidual`; other residuals are carried
   (`build/residual.js`) and added in raw space to every candidate built from that preset.

Sheet-anchored deltas (Drop Check, gear search) start from the sheet's raw value,
apply the delta, re-apply the soft cap, and split Attack/HP into flat and percent
parts (`engine/pipeline/anchoredDelta.js`). Details and the layer map:
`WIP/being-worked-on/rebuild-plan.md` §2 and §4.
