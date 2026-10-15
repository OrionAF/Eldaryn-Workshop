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
     Stone = { id, type, activated, quality, amplifyLevel: 0..10, oblivionLevel: 1..5 | null,
               stats: [{type, value}] }                          // value = rolled, pre-amplify
  talentSets: [TalentSet, TalentSet],
     TalentSet = { spec: SpecKey | null, allocation: Record<talentId, rank> }
  pets: { altar: {level: 1..50, tier: 1..8},
          owned: [{id, species, rarity, secondaries: [{type, value}]}] },
  mounts: [{ id, species, rarity, baseHp, baseAtk, level: 1..5,
             glyphs: {minor: [id|null ×3], major: [id|null ×2], mythic: [id|null ×1]} }],
  glyphs: [{ id, glyphType, rarity, sealed, secondary: {stat, quality} | null }],
  sigils: { altarTier: 1..8, owned: Record<species, {level: 1..30, condition?: conditionId}> },
  relics: Record<relicId, level>,  extraRelicSlots: 0..2,          // slots bought beyond the base 2
  awakening: { path: 'SHADOW'|'RADIANT'|null, level: 0..15 },       // capped by the player level
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
           relicIds: string[] (≤ relic slot cap), sigilSpecies: string[] (≤3),
           utilitySigilSpecies | null, ancientSigilSpecies | null,
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
  may sit in the sockets of **several** mounts (once per mount; evidence in
  `Game/mounts-glyphs.md` §8; only the v1 migration still makes clones `<id>~<n>`). A major
  glyph is inert unless its sigil is equipped and the mount is the preset's
  `mountId`. A sealed glyph cannot be socketed.
- **Progression gates (M1, `model/legality.js`).** Normalisation enforces what the level allows:
  talent points `talentPointsForLevel` (1 per level from 15, 29 at 43; over-cap allocations lose their
  highest tiers first), Awakening points `max(0, min(level, 59) - 44)`, relic slots `0` below level 22 else
  `2 + extraRelicSlots`, generic sigil slots `maxSigilSlots`. Lowering the level re-normalises (the UI shows
  `previewLevelChange` first). Equipped relics must be owned (level > 0). Set 2 (level 28), Dual Talents (38),
  Mounts (40) and Transcendence (55) are *reported* by `checkPreset`, not repaired. A level that is `''`,
  `null`, a boolean or an array is the max level (like `undefined`), never 1.
- **`extraRelicSlots`** (0..2) is `extraSlotsPurchased` of the game's relic state; an absent value is 2, so
  saves from before the field keep their four slots. It sits beside `relics` because `relics` is a plain
  id-to-level record.
- **Form sigils stay at level 1** (`clampSigilLevel`; L1328698, L1066539). Ancients too.
- **Sigil conditions are character-wide**: `sigils.owned[species].condition`, absent for `ON_COOLDOWN`, one
  value for every preset that equips the sigil. Saves that kept them per preset
  (`preset.sigilConditions`) are lifted on load: the active preset's value wins, else the first non-default;
  a disagreement is reported through `normaliseCharacter(raw, { report })` as
  `{kind: 'conditionConflict', species, kept, dropped}`. The condition applies only from level 54.
  `setPresetSigilCondition` is a deprecated alias of `setSigilCondition` (removed with the old screens).
- **An Ancient sigil follows the board** (Q3, strict): the stored choice is kept, but `buildFighter` and the
  stat pipeline ignore it, with a warning in `computePresetStats().warnings`, unless the transcendence
  preset the build resolves to allocates the species' `transcendenceNode` (`ancientActive`). The altar can
  only be evolved to tier 3 (`EVOLVE_TIER_CAP`); a recorded tier above that is allowed (data entry) and
  `checkPreset` warns.
- **`sigils.altarTier`** (1..8) replaces v1's `sigilForgeTier`; it tiers every
  sigil. Effect magnitudes come from the sigil level and altar tier through
  `engine/sources/sigilScale.js`; no damage numbers are stored.
- **Pets have no tier or level of their own.** The altar (`pets.altar`) scales the
  whole collection. Changing the altar *tier* wipes `pets.owned` (the game's
  behaviour) and nulls every `preset.petId`; confirm with the user first.
- **Stone pools are separate** (`enchantStones` vs `oblivionEnchantStones`);
  `enchantSlots` values must name a stone in the matching pool (reconcile
  enforces it). An OBLIVION-type stone lives only in the Oblivion pool and no other type
  there. Normalisation keeps a stone's stats to its type's pool (guaranteed stats first,
  then the Azure PvP draw, then free stats), clamps values to the stat's `[min, max]`
  and decimals and caps the count at `statCount`. `activated` (default true for old
  saves) is persisted and the engine skips a falsy one (`Game/stones.md` §1).
- **Item legality** (`model/equipment.js`): secondary values are clamped to the item-level
  ceiling `secondaryStatMaxValue` (`Game/gear.md` §4); a conduit must match
  `conduitTypesFor(rarity, realm)` (`Game/gear.md` §7, so an Oblivion-realm Divine+ item
  carries DARK only) or it is dropped. Both push an entry to the normalisation `report`.
  The stored item level may reach the top Ascension step; an owned item above the
  character's own step only warns (`itemWarnings`). Minor-glyph secondary quality is
  clamped to `GLYPH_QUALITY_BANDS[rarity]`; pet secondary values are only validated
  (finite, >= 0, 3 dp), the observed envelope being a UI hint and manual-entry clamp.
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
| **Character-wide** | One value shared by every preset | level, base residual, skills, fortress, both equipment sets and the Oblivion set, both stone pools, talent sets, the pet collection and altar, mounts, glyph inventory, sigil ownership, activation conditions and altar tier, relic levels and purchased relic slots, awakening, transcendence presets, Oblivion state, opponents, runs |
| **Per-preset** | The preset chooses | equipment set (1/2), talent set (0/1), pet, mount, relics, generic/utility/Ancient sigils, transcendence preset, and the user sheet |
| **Per-mount** | Neither of the above | glyph sockets (`mount.glyphs`), reached per preset via `preset.mountId` |

The Oblivion realm has one loadout (`equipment.oblivion` + `oblivionEnchantStones`);
the rest of the active preset carries over (`Game/pve-content.md` §9).

**Constraints the code enforces:** two-preset minimum (`MIN_PRESETS`; the store's
`deletePreset` refuses at the minimum, so never write a loop that deletes "down to one
preset"), maximum 8; relic cap 4 at most (`PRESET_RELIC_CAP`; the real cap is `relicSlotCap(level, extraRelicSlots)`) and generic
sigil cap 3 (`PRESET_SIGIL_CAP` in `model/presets.js`); at most 4 transcendence presets with
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
- JSON export/import is routed through `normaliseRoster`; import accepts v1 and v2 JSON, and a
  game profile JSON (§7), which is added to the roster as a new character instead of replacing it.
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

**Opponent sheets are sparse.** The editor saves only the rows the class sheet shows, and the user may
leave rows blank. At the PVP boundary (`completeDuelStats`, applied in `opponentFighter` and again in
`fighterDuelArgs`) every key the duel reads that is absent takes its neutral value: 0 for chances,
ratings, regen and Damage Reduction, 1.5 for Crit Damage (`Game/stats.md` §2). The keys it filled are
listed in the fighter's `defaulted` so the UI can say so. HP, Attack and Attack Speed have no neutral
value: `missingStats` reports them and `simulateArenaPvP` throws an `EngineInputError` for a
non-finite entity field. `disruptionEffect` is never stored in a sheet; it comes from class and form
(`engine/core/disruption.js`, `Game/stats.md` §3.2) for computed, sheet, typed and cloned fighters alike.

---

## 7. Game profile import

`model/gameProfile.js` (`isGameProfile`, `gameProfileToCharacter`) turns a captured player-profile
response (the client's own state) into a raw v2 character; `storage.js` `importJson` adds it to the
roster as a new, selected character (name + " (imported)" when taken). The profile itself is never
stored or committed; only the mapped fields below survive, and `normaliseCharacter` still validates them.

| Profile | v2 | Note |
|---|---|---|
| `player.{name,class,level}` | core | player id, clan, quests, shop, currencies are never read |
| `equipment` / `equipment2` + `enchantSlots(2)` | `equipment.set1` / `set2` | Oblivion-only slots are not in the base sets; `qualityBonus` is dropped, `quality` stays null |
| `oblivionPrestige.oblivion.{equipment,enchantSlots,enchantStones,level}` | `equipment.oblivion`, `oblivionEnchantStones`, `oblivion.level` | `unlocked`, `activeRealm` too |
| `enchantStones` | `enchantStones` | `OBLIVION_POWER` rows dropped (derived) |
| `talentState` / `talentState2`, preset `talentSet` 1\|2 | `talentSets[0\|1]`, `talentSet` 0\|1 | |
| `presets[]` | `presets` (max 8) | none: one preset from the live loadout (active sets, equipped pet/mount/relics/sigils) |
| `sigilState.ownedSigils`, `altarTier` | `sigils` | per-sigil `activationCondition` becomes `owned[species].condition`; an Ancient in `sigilSpecies` moves to `ancientSigilSpecies` |
| `petState` | `pets` | Attack Speed / Crit Damage / Minion Attack Speed secondaries x100 (pets keep percent points); altar level from `totalXp` + `tier` (Game/pets.md §6) |
| `mountState`, `player.glyphs` | `mounts`, `glyphs` | species upper-cased; glyph rarity Title case; glyph secondary stat enum becomes the pool key |
| `relicState.ownedRelics`, `extraSlotsPurchased`, `awakeningState`, `transcendencePresets` | `relics`, `extraRelicSlots`, `awakening`, `transcendence` | `activeTranscendencePresetId` kept |
| `skills.<id>Level` | `skills.<id>` | `excludedDropStats` becomes `attunementBans` |
| `fortressBuffs.ownedFortressIds` | `fortress.owned` | null means none |
| `computedStats` | the active preset's `sheet` | the Oblivion sheet when the rift is the active realm; only finite `total*`/`raw*` numbers |

**One glyph, several mounts.** The game lets one glyph id sit in the sockets of more than one mount and
the server counts it for the ridden mount (`Game/mounts-glyphs.md` §8). The v2 model allows the same
glyph id on several mounts (once per mount), so the import keeps the real ids.
