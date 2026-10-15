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
  server: number | null,                    // the game server; sets the Fortress boss clan cap (clan-fortress.md §3.1)
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
                conditions, majorGlyphs, altarTier,
                imported: { playerId: string|null, level: 1..200, importedAt: ISO|null } | null }],   // `imported`: set only for an opponent imported from Rankings (null when typed; old saves load as null)
  runs: OptimiserRun[]        // byte-budgeted run history; `schema: 2` = an optimiser-result/2 (model/runs.js header; optional `steps` = the search's final per-block rows, simulation.md §Progress);
                              // `powerFloor` (the run's Combat Power guard) and each Row's `power` are kept when present
}

Preset = { id, name, equipmentSet: 1|2, talentSet: 0|1, petId | null, mountId | null,
           relicIds: string[] (≤ relic slot cap), sigilSpecies: string[] (≤3),
           utilitySigilSpecies | null, ancientSigilSpecies | null,
           transcendencePresetId | null, sheet: Sheet | null }
  // A null (or unresolved) transcendencePresetId builds on `transcendence.activePresetId`, then
  // 'default', then the first board (`model/legality.js` resolveTranscendencePreset; the game keeps
  // the active board for a null link, Game/transcendence.md §9). Below level 58 (the link unlock)
  // reconcile clears a link that picks the same board as null would; a link to another board stays
  // saved but is ignored, and `checkPreset` warns (`transcendenceLink`). What the stats, power, the
  // Ancient check and the optimiser run on is `effectiveTranscendencePreset`: no board below 55, the
  // unlinked board below 58, else the resolved one.

Sheet  = { values: Partial<ComputedStats>, enteredAt, inputsKey | null,  // tier-2 input, §6
           presetId | null }                                // presetId: Oblivion sheet only
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
  `previewLevelChange` first). Equipped relics must be owned (level > 0). Set 2 (level 28), Dual Talents (38)
  and Mounts (40) are *reported* by `checkPreset`, not repaired: they still count in the build, and the
  optimiser refuses a preset that uses them (`previewLevelChange` lists them as `flagged`). Transcendence
  (55) and its links (58) are kept but ignored below their levels (`effectiveTranscendencePreset`, see
  Preset above; listed as `inert`); `checkPreset` only warns. The two-preset padding uses set 2 / talent set 1 only once the level unlocks them, else set 1 /
  talent set 0; saved presets are not rewritten. A level that is `''`, `null`, a boolean or an array is the
  max level (like `undefined`), never 1.
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
  preset the build runs on (`effectiveTranscendencePreset`, so never below level 55) allocates the species' `transcendenceNode` (`ancientActive`). The altar can
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
- **Fortress is character-wide** (clan state), not per preset as in v1. So is `server` (whole number or null, default null; kept by the `fortress` domain): it only picks the clan cap of the Fortress boss target.
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

The Oblivion realm has one gear loadout (`equipment.oblivion` + `oblivionEnchantStones`). The
app builds the rest (talents, pet, mount, relics, sigils, board) from whichever preset is chosen;
which choices the server uses in the rift is unknown from the client (`Game/pve-content.md` §9),
so the one Oblivion sheet belongs to the preset it was entered for (§6).

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
- `importJson` throws `ImportError` (with the JSON `line` for a syntax error) for text that is neither a
  profile nor a roster with at least one character; the roster is then untouched. `loadRoster` keeps
  its empty fallback for a corrupt stored blob.
- Every store mutator ends with an explicit `persist()`, so save timing is
  deterministic around character switches and downloads.
- `saveRoster` returns `{ok, error, trimmed, dropped}` and the store exposes it as `saveState`
  (`{ok, error, at, trimmed, dropped}`), so a failed write (quota, private mode) is shown, not swallowed.
  Before writing, run history is trimmed across **all** characters to `ROSTER_RUN_BYTE_BUDGET`
  (`model/runs.js` `enforceRosterRunsBudget`: oldest unpinned detail first, then oldest unpinned rows,
  one pass by per-run size estimates); the per-character budget still applies on normalise.

### 5.1 The per-device UI key

View state lives apart from the roster under **`eldaryn_ui_v1`** (`src/lib/uiState.js`): `v`, `lastHash`
(route to reopen), `areaLast` (last page per area), `optimiserSetups` (per character: preset, fight, objective, toggles, `powerFloor` (the Combat Power guard,
a positive whole number or null; `ui/optimiserSetup.js normaliseSetup`), effort, seed; a Celestial fight names its
partner by id, another character's preset or an opponent, and normalises to no partner once that is gone,
simulation.md §Celestial Trial) and
`prefs` (`density`, `reduceMotion`, `defaultEffort`, `cpuProfile`: `eco` | `balanced` (default) | `max`,
the worker-pool size of a job, simulation.md §Worker pool; `dropSets`: `all` (default) | `set1`, the gear
sets Drop Check compares against, simulation.md §Drop Check). Every read and write is try/catch-guarded, a
missing or broken value falls back to the defaults, and nothing in the roster depends on it. It is not
exported with the roster. Session jobs (`lib/jobs.svelte.js`) are not persisted; the optional resume
checkpoints use IndexedDB, opt-in.

---

## 6. Stat sheet tiers

The server computes the live stats and adds relics and possibly other sources
(`Game/stats.md`), so the app works in three tiers:

1. **Computed (tier 1).** `calculateTotalStats` (`engine/pipeline/totals.js`) runs
   on the preset's pieces via `build/presetInputs.js`. The base is
   `character.baseResidual`; relics enter as additive points, an ASSUMPTION the UI
   labels as one.
2. **Sheet (tier 2).** The user types the in-game sheet into `preset.sheet` (or
   `oblivion.sheet` for the Oblivion realm). While it describes the build (below), the engines
   use it verbatim.
3. **Validation (tier 3).** `diffSheet(computed, sheet)` compares per key
   (tolerances: Attack/HP ±1, percent ±0.1, multipliers ±0.01). "Absorb into base"
   moves the five base residuals into `baseResidual`; other residuals are carried
   (`build/residual.js`) and added in raw space to every candidate built from that preset.

**Sheet status** (`computePresetStats(...).sheetStatus`, `build/stats.js`). A sheet stores
`inputsKey`, the fingerprint (`sheetInputsKey`: `metricKey` of the preset's engine inputs except
the base residual, the realm and the character level) of the build it was entered for. The
Oblivion sheet also stores the `presetId` it was entered for: the rift has one live loadout, and
which of the app's presets the server uses there is unknown, so the sheet belongs to one preset.

| Status | When | Effect |
|---|---|---|
| `fresh` | `inputsKey` equals the current build's | sheet overlaid, residual taken |
| `stale` | the build changed since, or the Oblivion sheet belongs to another preset | computed stats, empty residual, warning; the stored sheet is still returned for re-entry |
| `unverified` | no `inputsKey` (a legacy sheet, a game-profile import, or rows carried to a new Oblivion owner) | sheet overlaid, residual taken, warning ("Confirm sheet matches this build") |
| `none` | no sheet | computed stats |

A new sheet is stamped with the current build; editing rows keeps the old stamp, so a stale
sheet stays stale until the user confirms it (`confirmPresetSheet` / `confirmOblivionSheet`).
Absorbing into base never stales a sheet. Deleting the owner preset leaves the Oblivion sheet ownerless:
`deletePreset` reconciles at once (and `reconcileOblivion` does the same on load), clearing the dangling
`presetId`, and the sheet then counts only where its `inputsKey` matches.

The overlay keeps a computed `raw*` the sheet omits while the computed total equals the sheet's
(it then describes the same total); otherwise the raw is dropped.

Sheet-anchored deltas (Drop Check, gear search; `engine/pipeline/anchoredDelta.js`) add a raw-space
change to the sheet. `computePresetStats(...).exact` (`calculateTotalStatsExact`) carries the
computed pipeline's unrounded Attack/HP flat and percent and every capped raw. Where the sheet
agrees with them after rounding, the change is computed exactly and only the residual (sheet minus
computed) is anchored; otherwise the sheet's 1-dp values are used and `anchoredDeltaDetailed`
returns `approx: true` with a per-key error bound (Attack/HP from the percent's ±0.05 rounding,
capped stats one display tick).

**Rankings opponents.** A player profile opened from Rankings (`isRankingsProfile`: `computedStats` and
`equippedSigils`, no `player` and no `presets`) imports as an opponent (`opponentFromRankingsProfile`, Settings > Data >
Import, kind `opponent`). `computedStats` becomes the sheet as is (no model gaps); `activeSpec`, the worn sigils with
levels (Ancient and utility told apart by the catalogue), `sigilAltarTier` and `activeMajorGlyphs` (upper-case rarity
mapped to the app's) set the mechanics, and a Druid form follows from its utility sigil as for any opponent. Gear, pet,
mount, relics and the awakening path are not kept. Only `imported.playerId` (so a re-import updates the same opponent in
place, `saveRankingsOpponent`) and the display name are kept; clan and every other identifier are dropped. `imported.level`
is the player's real level: `opponentFighter` uses it (a typed opponent keeps the placeholder 100) and a Celestial run
reads it for the party scaling. A profile with no `playerId` always adds a new opponent.

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
| `player.server` | `server` | whole number, else null |
| `equipment` / `equipment2` + `enchantSlots(2)` | `equipment.set1` / `set2` | Oblivion-only slots are not in the base sets; `qualityBonus` is dropped, `quality` stays null |
| `oblivionPrestige.oblivion.{equipment,enchantSlots,enchantStones,level}` | `equipment.oblivion`, `oblivionEnchantStones`, `oblivion.level` | `unlocked`, `activeRealm` too |
| `enchantStones` | `enchantStones` | `OBLIVION_POWER` rows dropped (derived); `activated` kept, so a sealed stone adds nothing |
| `talentState` / `talentState2`, preset `talentSet` 1\|2 | `talentSets[0\|1]`, `talentSet` 0\|1 | |
| `presets[]` | `presets` (max 8) | none: one preset from the live loadout (active sets, equipped pet/mount/relics/sigils; no board link, so it follows the active board). The active board is a live change only for a preset linked to another board, which then links the active board. A live loadout that differs from the game's selected preset (`activePresetId`) UPDATES that preset (id, name and icon kept; report `liveLoadoutApplied`) and it takes the sheet. Fallback when the profile has no such preset: the live loadout is appended once as "Live loadout" (at 8 presets the sheet has no owner) |
| `sigilState` live lists | the live preset's sigils | Mystic Druid (active talent set `MYSTIC_DRUID`) reads `druidEquippedSpecies` / `druidUtilitySlotSpecies`, every other class `equippedSpecies` / `utilitySlotSpecies` |
| `sigilState.ownedSigils`, `altarTier` | `sigils` | per-sigil `activationCondition` becomes `owned[species].condition`; an Ancient in `sigilSpecies` moves to `ancientSigilSpecies` |
| `petState` | `pets` | Attack Speed / Crit Damage / Minion Attack Speed secondaries x100 (pets keep percent points); altar level from `totalXp` + `tier` (Game/pets.md §6) |
| `mountState`, `player.glyphs` | `mounts`, `glyphs` | species upper-cased; glyph rarity Title case; glyph secondary stat enum becomes the pool key |
| `relicState.ownedRelics`, `extraSlotsPurchased`, `awakeningState`, `transcendencePresets` | `relics`, `extraRelicSlots`, `awakening`, `transcendence` | `activeTranscendencePresetId` kept |
| `skills.<id>Level` | `skills.<id>` | `excludedDropStats` becomes `attunementBans` |
| `fortressBuffs.ownedFortressIds` | `fortress.owned` | null means none |
| `computedStats` | the selected (active) preset's `sheet`, after the live loadout was applied to it | the Oblivion sheet when the rift is the active realm, with `presetId` = that same preset; only finite `total*`/`raw*` numbers; sheets arrive unverified (no `inputsKey`, §6) |

`gameProfileToCharacter(profile, {report})` appends `{kind: 'liveLoadoutApplied', presetId, presetName, fields}` (`fields` = the changed preset
field names) to `report`; `importJson(text, roster, {report})` also passes it to
`normaliseCharacter` (M1/M2 `dropped`/`defaulted` entries), and `rosterStore.importFromJson` returns it.

**One glyph, several mounts.** The game lets one glyph id sit in the sockets of more than one mount and
the server counts it for the ridden mount (`Game/mounts-glyphs.md` §8). The v2 model allows the same
glyph id on several mounts (once per mount), so the import keeps the real ids.

### 7.1 Kinds, the report, and "Update <name>"

`importPlan.js` `planImport(text, roster)` is the dry run behind the import dialog (G3) and writes nothing.
It detects the kind (profile, roster backup, fight log, loot bag; anything else is a specific `ImportError`)
and, for a profile, reports the M1/M2/M3 entries above plus `dropped` entries (profile collections whose
members the catalogue or the class rules did not keep: stones, mounts, glyphs, pets, sigils, relics,
transcendence presets) and `defaulted` entries (item quality). A loot bag or fight log is handed to
Drop Check or the replay check (`importFlow.svelte.js` `takeHandoff`); it never touches the roster.

`model/merge.js` `mergeProfileIntoCharacter(existing, incoming)` brings a profile into an existing
character: everything the game owns is replaced, and `KEPT_ON_UPDATE` (id, name, base residual,
opponents, runs, drop) is kept, then the result is normalised so a preset reference the new data no
longer holds is repaired. Presets are merged by id: a game preset updates the app preset with its id
(the game's name and choices; that preset's saved sheet stays). One with no match fills an app preset
the game does not know that holds nothing (no pet, mount, relics, sigils, board link or sheet: the
two-preset padding), taking the game's id, else it is appended up to 8 (beyond that it is reported
`dropped`). An unmatched incoming preset that holds nothing is not brought over, since it cannot be told
apart from the padding of a one-preset profile. Presets made only in the app are kept. The profile's
sheet goes to the preset the game wears (the sheet's owner in the imported character), and the game's
selected preset becomes the active one.
`rosterStore.updateCharacterFromProfile` returns the character as it was; `restoreCharacter` is the
one-step undo (kept in memory only, so a reload ends it).
