# Loot and Drops

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

`decompiled.js` below means `.../gamedata/idlehunt_2.7.0/gamedata/decompiled.js`. Line numbers are `L<n>`.

## Overview

Drops are the source of all gear. The client does **not** roll a drop: it sends `POST /hunt` (L883817) and the server returns `results[]`, each with `itemDropped` (null or an item with `rarity`, `itemLevel`, `slot`, `primaryStats`, `secondaryStats`, `conduit`, optionally `upgradedFrom` / `qualityRerolledFrom`) (L1049580-1049700 region, `applyHuntResult`). What the client **does** hold is: the rarity-odds table by player level, the Fortune skill's drop-chance values, the rarity gates, the loot-filter / loot-bag logic, item stat formulas and the secondary-stat pool. Rarity odds shown in the UI come from client tables, so the client table is the best available description of the server roll, but the server roll itself is **[SERVER]**.

Contribution to power: drops do not add stats directly. Rarity and item level set the primary stats (Attack / HP) of a gear piece, and rarity sets how many secondary stats it carries and which can appear. Everything about the stat formulas themselves lives in `gear.md` and `stats.md`; this doc owns "what can drop, how often, and what the filter keeps".

Rarity order, low to high: Common, Uncommon, Rare, Epic, Legendary, Mythic, Ancient, Divine, Eternal, Oblivion. `RARITY_ORDER` is this array **[CODE]** L669241-669270.

## §1 Drop chance per fight

- Whether a hunt produces an item at all is **[SERVER]**. The client exposes the figure it displays as "Base Drop Chance - driven by your Luck skill" (i18n summary text, L911259): `getItemDropChance(luckLevel) = FORTUNE.effects[luckLevel-1] ?? 60` **[CODE]** L885453-885470, used by `selectRealmItemDropChance` L1673599-1673608.
- Fortune skill id `luck`, name "Fortune", max level 5, effects `[60, 70, 80, 90, 100]` (% drop rate), upgrade costs `[30, 80, 200, 500]` gems, unlocks at player level 12 (`UNLOCK_LEVELS.SKILL_FORTUNE`) **[CODE]** L885883-885891, L668649.
- `GAME_CONSTANTS.ITEM_DROP_CHANCE = 60` is the same base (L670527). No other client reader of this constant exists (grep: only the definition), so the 60 in the constants object is a default, not an independent mechanic **[CODE]**.
- At Fortune 5 the displayed chance is 100 %. Whether this means "every hunt drops" or "per mob" is **[UNRESOLVED]**: the Hunting skill gives 1 to 10 (12 with the Oblivion point) mobs per hunt (`getMobsPerHunt`, L885443-885452; effects `[1..10]`, oblivionPoint effect 12, L885872-885882) and `applyHuntResult` counts `results[].itemDropped != null` per result row (one row per mob). So the drop roll is evidently per mob, with the chance above; the client never rolls it **[DERIVED]** from the results shape, not stated in code.
- Hunting grounds on the world map give an extra "roll": `worldMapHuntExtraRollPct = 10` for `HUNTING_GROUNDS` spots (L1235105-1235136, constant L1235578 `WORLD_MAP_CAMP_BONUS_PCT = 10`). The "camp" boost factor is `1.1` (L1235089-1235092). `useCampBoostedDropRates` multiplies each *featured* rarity's weight by 1.1 for display (L1673746-1673803). Whether the server grants a literal extra roll or a x1.1 weight is **[SERVER]**.
- Per-spot featured rarities (display filter only), L1235581-1235663 **[CODE]**:

| Spot | Featured rarities |
|---|---|
| ironhold_hunt | Uncommon, Rare, Epic |
| verdant_hunt | Rare, Epic, Legendary, Mythic |
| warden_hunt | Epic, Legendary, Mythic, Ancient |
| frostmaw_hunt | Legendary, Mythic, Ancient, Divine |
| infernal_hunt | Mythic, Ancient, Divine, Eternal |
| divine_hunt | Ancient, Divine, Eternal, Oblivion |

  `worldMapHuntDrops` shows a rarity only if it is in the spot's list and at or above the spot's `minRarity` (L1918250-1918300). A rarity not in the list is `notInRealm`; one the player has not unlocked is `lockedAtLevel`.
- Hunt stamina cost `STAMINA_HUNT_COST = 1`, regen 1 per 60 s, initial 1200 (L670527); Vitality skill changes the regen interval `[60,50,42,35,30,25]` s (L885892-885900). Energy economics belong to `skills.md`.

## §2 Rarity odds by player level

`getDropRatesForLevel(level) = DROP_RATE_TABLE[clamp(level, 1, MAX_PLAYER_LEVEL=100)]` **[CODE]** L1213885-1213901. `MAX_PLAYER_LEVEL = 100` L670527.

The table is built by `w(unc, rare, epic, leg, myth, anc, div, ete, obl)` with `common = 100 - sum(others)` **[CODE]** L1214007-1214118; the 100 rows are calls L1214119-1214762. Every row sums to 100 **[DERIVED]** (asserted when building `data/drops.json`).

Full table: `data/drops.json` key `dropRatesByLevel` (100 rows, percent). Schema: `{level, common, uncommon, rare, epic, legendary, mythic, ancient, divine, eternal, oblivion}`.

First level a rarity has non-zero weight (`getRarityUnlockLevel`, L1213963-1213996, scans levels 1..100 for the first level where the weight is > 0; returns 101 if never) **[CODE]**, values **[DERIVED]** from the table:

| Rarity | Unlock level | Weight at unlock |
|---|---|---|
| Common | 1 | 100 |
| Uncommon | 2 | 5 |
| Rare | 6 | 1 |
| Epic | 14 | 0.05 |
| Legendary | 27 | 0.01 |
| Mythic | 38 | 0.01 |
| Ancient | 50 | 0.01 |
| Divine | 63 | 0.01 |
| Eternal | 74 | 0.01 |
| Oblivion | 83 | 0.01 |

Selected anchor rows (percent) **[CODE]** L1214119-1214762:

| Level | Common | Unc | Rare | Epic | Leg | Myth | Anc | Div | Ete | Obl |
|---|---|---|---|---|---|---|---|---|---|---|
| 30 | 44.95 | 17 | 30 | 8 | 0.05 | 0 | 0 | 0 | 0 | 0 |
| 50 | 33.49 | 5 | 26 | 20 | 12 | 3.5 | 0.01 | 0 | 0 | 0 |
| 80 | 19.8 | 5 | 11 | 20 | 12 | 18.5 | 10 | 3.5 | 0.2 | 0 |
| 90 | 6.2 | 5 | 6 | 20 | 12 | 23.5 | 15 | 10 | 2 | 0.3 |
| 100 | 2.5 | 5 | 2 | 16 | 12 | 23 | 18 | 13 | 5 | 3.5 |

Shape notes **[DERIVED]**: Uncommon bottoms out at 5 from level 42; Epic caps at 20 over levels 49-90 then falls to 16 by level 100; Legendary caps at 12 from level 46; Mythic peaks 23.5 at 90-93 then eases to 23; Rare falls monotonically from 30 (levels 19-42) to 2.

`getMaxDropRarity(level)` returns the highest rarity with weight > 0 (iterates Oblivion down to Common, L1213923-1213962). `RARITY_ORDER`-based `useRealmMaxDropRarity` does the same for the active realm (L1673836-1673878).

The same table is the "pure" rate for the Regular realm. The UI shows it via `formatDropRate` (L1681496+; 2 decimals under 1 %, 1 decimal otherwise).

## §3 Oblivion realm drop model

When the Oblivion axis is active (`usesOblivionDropModel` = `selectUsesOblivionAxis`, L1673550-1673557), rates come from `getOblivionDropRates(realmLevel)` instead **[CODE]** L1189841-1189971, constants L1190283-1190331.

- `OBLIVION_MAX_LEVEL = 100`. Minimum drop rarity in this realm is `OBLIVION_PRESTIGE.START_RARITY = MYTHIC` (L669121 area; `selectRealmMinDropRarity` L1673577-1673598). Common..Rare/Epic/Legendary entries are 0.
- Unlock fraction per rarity (`getOblivionRarityUnlockLevel(r) = max(1, round(frac[r] * 100))`, else 101): Ancient 0.10, Divine 0.25, Eternal 0.55, Oblivion 0.85 **[CODE]** L1190289-1190309. Mythic's fraction was lost in the decompile (the value register was overwritten); it has weights from the start, so level 1 is assumed **[UNRESOLVED]** (checked L1190290-1190292).
- Per-rarity parameters (`unlockWeight`, `capWeight`, `shape`) **[CODE]** L1190310-1190331:

| Rarity | unlockWeight | capWeight | shape |
|---|---|---|---|
| Mythic | 10 | 15 | 0.5 |
| Ancient | 0.3 | 12 | 1.2 |
| Divine | 0.1 | 4 | 1.4 |
| Eternal | 0.03 | 1.25 | 1.6 |
| Oblivion | 0.01 | 0.9 | 1.8 |

```
U = getOblivionRarityUnlockLevel(rarity)
if L < U: weight = 0
else:
  t = min(1, (L - U) / max(1, 100 - U))
  weight = round((unlockWeight + (capWeight - unlockWeight) * t^shape) * 1000) / 1000
```
- `getOblivionDropWeightTotal(L) = min(100, round(sum(weights) * 1000) / 1000)` (L1190123-1190153). The max total is 33.15 at L100 **[DERIVED]** (15+12+4+1.25+0.9). What fills the other ~67-90 % is **[UNRESOLVED]**: the client has no weights for lower rarities in this model (all set to 0, L1189860-1189901), so the remainder is either server-side or a lower-rarity floor not in the client.
- Derived per-level values: `data/drops.json` key `oblivionModel.ratesByLevel`.
- Oblivion XP per hunt `floor(200 + 8*level + rand*20 - 10)`, min 1 (L1190087-1190119, constants L1190287); level XP `floor(85000 * L^1 * ramp(L))` with ramp slopes 0.06 / 0.18 / 0.5 after Divine / Eternal / Oblivion unlock levels (L1189718-1189808, L1190285). Belongs to `pve-content.md`; recorded here only because it feeds the realm level that indexes these tables.
- Oblivion item power: stat level is `itemLevel * 0.5` (`ITEM_LEVEL_SCALE`) and attack / HP are then multiplied by 2.75 / 2.8 (`POWER_MULT_ATTACK`, `POWER_MULT_HP`); Oblivion max item level 200; `COMMIT_MIN_LEVEL 15`, `UNLOCK_LEVEL 95` **[CODE]** L669119, L677339-677354, L677533-677620. See `pve-content.md`.

## §4 Item level of drops

- `MIN_ITEM_LEVEL 1`, `MAX_ITEM_LEVEL 100` in `GAME_CONSTANTS` (L670527); no client code reads either, so the bound is only documentary **[CODE]** (grep of `MIN_ITEM_LEVEL`/`MAX_ITEM_LEVEL`: definition lines only).
- How the server picks an item level is **[SERVER]**. The client persists `itemLevelWatermarks` (an object keyed per slot/realm; initialised `{}` at L670693, round-tripped L1138683) and the Ascension skill text says "your drops climb toward the new cap over time (via the item-level watermark)" (L885983). So drops trend to a per-slot watermark rather than being uniformly random, **[UNRESOLVED]** beyond that: the watermark update rule is not in the client.
- Ascension skill (`ascension`, unlock level 78): max item level `[100,130,160,190,240]`, costs `[500,1000,1500,2000]` gems; `getMaxItemLevel(level) = effects[max(1,level)-1] ?? effects[0]` **[CODE]** L885676-885700, L885983-885991, L668649. Above item level 100, stat level is `ascensionEffectiveLevel(L) = 100 + (L - 100) * 0.4` (`ASCENSION_ABOVE_100_STAT_RATE = 0.4`) **[CODE]** L677322-677337, L677995. Example: item level 240 gives stat level 156 **[DERIVED]** 100 + 140*0.4. The skill text says "roughly twice as high at item level 200" which does not match 0.4 (200 would be 140 stat level, 1.4x); trust the code **[DERIVED]**.
- Item primary stats **[CODE]** L677533-677620:
  ```
  statLevel = itemLevel (regular) or itemLevel * 0.5 (Oblivion realm)   -- statLevelForItem
  eff = ascensionEffectiveLevel(statLevel)
  attack = floor((atkBase[rarity] + eff * atkScale[rarity]) * (Oblivion ? 2.75 : 1))
  hp     = floor((hpBase[rarity]  + eff * hpScale[rarity])  * (Oblivion ? 2.8  : 1))
  ```
  Per-rarity bases are in `gear.md`; rarity base table at L677953-677994 (Common atk 5+1x, hp 15+3x ... Oblivion atk 61000+370x, hp 126000+820x). Per-slot attack/HP weights by class are at L678046-678207 (see `gear.md`).

## §5 Which stats can roll

- **Secondary stat count by rarity** (`RARITY_CONFIG.secondaryStatCount`): Common 0, Uncommon 0, Rare 1, Epic 1, Legendary 2, Mythic 2, Ancient 2, Divine 3, Eternal 3, Oblivion 3 **[CODE]** L669200-669237.
- **Pool**: 26 secondary stats, all with `minRarity = RARE` (so every non-Common/Uncommon item can roll from the full pool, class-agnostic in the pool itself) **[CODE]** L678209-678418. Full ranges in `data/drops.json` key `secondaryStatPool` (schema `{type, minRarity, minValue, maxValue, weightExponent, decimals}`); every entry has `weightExponent 2`.
- **Value roll** (`rollSecondaryStatValue`, L677713-677749) **[CODE]**:
  ```
  maxV(statLevel) = (min + (max - min) * (0.5 + 0.5 * min(statLevel,100)/100))
                    * (statLevel > 100 ? ascensionEffectiveLevel(statLevel)/100 : 1)   -- L677356-677388
  value = round_to_decimals(min + (maxV - min) * random()^2)
  ```
  Low rolls are far more common (exponent 2 skews toward min). At statLevel 1 the ceiling is only 50 %-ish of the range.
- **Quality**: `calculateStatQuality(type, value, statLevel) = clamp(round((value - min) / (maxV - min) * 99 + 1), 1, 100)`; `calculateItemQuality` = round(mean of its secondary stats' qualities), `null`/0 when it has none (L677176-677304) **[CODE]**. The filter's "Q21+ ... Q91+" thresholds use this.
- `rerollSecondaryStatValueUpward` (L677751-677809): rolls uniformly in `(current, maxV]` and is guaranteed to improve by at least one decimal step. This is the Artisan reroll **[CODE]**; the call site is server-side.
- **Attunement** (skill, unlock 19, max 4, costs `[500,1000,2000]`): "Ban secondary stats from your drop pool... every banned stat is removed from the roll table entirely, so no item, pet or enchant stone will ever carry it." `getMaxExcludedStats(level, class) = effects[level-1] (0,1,2,3) + classAttunementBonus` **[CODE]** L885736-885763, L885992-885999. Removing the stat is applied by the server, hence **[SERVER]** for the redraw behaviour ("freed slot rolls one of the stats your build wants").
- **Conduits** (extra stat on top rarities): Eternal items roll a conduit FLAME or EARTHEN (50/50, `rollConduitType`), Oblivion items roll DARK; in the Oblivion realm DARK is rolled for rarity >= Divine (`DARK_CONDUIT_MIN_RARITY`). Value: `rollConduitValue(itemLevel)` with `min 10, mid 45, max 70, breakLevel 40, variance 0.15, decimals 0`: linear 10 to 45 over levels 1..40, then 45 to 70 over 40..100, multiplied by `1 + (rand*2 - 1) * 0.15`, floored at 10 **[CODE]** L677390-677488, L677825-677890, L678419. Conduit effects are in `gear.md`.

## §6 Midas Touch and Artisan (post-roll modifiers)

- **Midas Touch** (`midasTouch`, unlock 33, max 5): chance to upgrade a dropped item one rarity tier, effects `[0.5, 1, 1.5, 2, 3]` %, costs `[300,500,750,1000]` **[CODE]** L885954-885962 (`getRarityUpgradeChance` L885595-885612). Description: it attempts on every item not discarded, even ones the filter would hide.
- **Artisan** (`artisan`, unlock 33, max 5; Oblivion point 3000 gems gives effect 10): chance to reroll item quality higher, effects `[0,2,4,6,8]` %, costs `[150,350,600,800]` **[CODE]** L885963-885973, `getQualityRerollChance` L885624-885633.
- Both are rolled by the server: the item arrives with `upgradedFrom` (Midas) or `qualityRerolledFrom` (Artisan) holding the pre-modifier item **[CODE]** L676654-676696. The filter treats them specially (§7).
- Effect on filter outcome: a Midas-upgraded item is discarded outright if the *original's* rarity mode is DISCARD (L676654-676674 then L676878). An Artisan-rerolled item is evaluated for stat filters and quality against the *pre-reroll* secondary stats and the post-reroll primary stats (L676677-676696), so rerolls can never bring an item over the quality floor.

## §7 Loot filter

Unlocks at player level 2 (`LOOT_FILTER`); Loot Bag at level 4; second equipment set (dual set) at level 28 **[CODE]** L668649, L668655-668667.

State per filter set: `rarityModes` (per rarity: FILTER / DISCARD / KEEP_ALL), `secondaryStatFilters` (list), `secondaryStatMode` (HAS_ANY / HAS_ONLY), `qualityFilter` (null or 21..91), `ilvlFilterEnabled` ("Keep only stat upgrades"), `conduitFilter` ('ALL' / FLAME / EARTHEN / DARK). Defaults: all rarities KEEP_ALL, no stat filters, mode HAS_ANY, quality null, ilvl false, conduit 'ALL' **[CODE]** L676906-676991. Rarity modes are shared; the other filters can be per set when "PER_SET" mode is on, which needs Premium and the unlocked dual-equip set (`perSet = !Oblivion && premium.active && dualEquipUnlocked && lootFilterMode === 'PER_SET'`, L884036-884098, L1049530+).

`filterByLootSettings(drops, rarityModes, statFilters, quality, equippedRefs, statMode, conduit)`, per drop, in order **[CODE]** L676561-676894:

```
if drop.upgradedFrom and rarityModes[upgradedFrom.rarity] == DISCARD:   discard
item = drop with secondaryStats := drop.qualityRerolledFrom.secondaryStats if that exists
mode = rarityModes[item.rarity] ?? FILTER
if mode == DISCARD:   discard
if mode == KEEP_ALL:  keep
-- mode == FILTER:
if conduitFilter != 'ALL' and item.conduit and item.conduit.type != conduitFilter:  discard
if statFilters.length > 0:
   HAS_ANY:  keep only if some secondary stat type in statFilters
   HAS_ONLY: keep only if every secondary stat type in statFilters
   (fail -> discard)
if quality != null:
   q = calculateItemQuality(item); if q != null and q < quality: discard
if equippedRefs (ilvl filter on) and equipped[item.slot] exists with same rarity and has attack and hp:
   keep only if item.attack > equipped.attack AND item.hp > equipped.hp   else discard
keep
```
Notes: an item with no conduit passes the conduit filter; with the ilvl filter, a drop with no same-rarity equipped piece in that slot is kept. The conduit filter button is only available when its source rarity is in FILTER mode (`isConduitFilterAvailable`; FLAME/EARTHEN need Eternal, DARK needs Oblivion; L676539-676559, L677151-677166). The quality filter applies "Rare and higher" (items with no secondary stats have no quality, so they pass) per the in-app help (L911258).

`partitionDrops` runs the filter once per set (set1, set2) when per-set mode is on; an item is kept if either set keeps it, and `matchedSet` records which (set 1 if set1 kept it, else 2, both -> the active set) (L676993-677141). The Midas / Artisan skills run on items "you don't Discard" regardless of the detailed filters (skill text L885954).

## §8 Loot Bag

- `LOOT_BAG_MAX = 8` for free players; Premium `PREMIUM_LOOT_BAG_MAX = 20` (`getLootBagMax(premium)`) **[CODE]** L670527, L1041911-1041927, L1042191-1042192. `INVENTORY_MAX_SLOTS = 50` L670527.
- With the bag on, kept drops queue in `pendingItems` (per realm) instead of interrupting the hunt; when the bag fills, hunting stops with reason `BAG_FULL` ("Your loot bag filled up. Hunting stopped.") **[CODE]** L1048596+ (`applyHuntResult`), L910162.
- Filtered-out items are discarded server-side via `fireAndForgetDiscard` (call in `applyHuntResult`); equip / discard commands are `_equipItem` / `_discardItem(s)` (L886033-886296).
- Offline hunting: Premium feature; server runs the loop. `OFFLINE_HUNT_RATE_MULTIPLIER 5`, `OFFLINE_HUNT_BASE_INTERVAL_MS 1500`, `MAX_OFFLINE_HUNT_MS 43,200,000` (12 h), `OFFLINE_HUNT_MAX_ACTIONS 10000`, heartbeat 30 s, min away 60 s **[CODE]** L670527; the client sends the filter snapshot (`buildOfflineHuntSnapshot`, L884036-884098) via `POST /hunt/offline` and `/hunt/offline/ping` (L883875, L883910), so the server applies the same filter. Stop reasons: BAG_FULL, OUT_OF_ENERGY, TIME_CAP, CAUGHT_UP, PREMIUM_EXPIRED (L910162). Premium: 30-day subscription, `$4.99`; `FREE_FOR_ALL false` and `HONOR_GRANDFATHER false` in 2.7.0 (L1042181).

## §9 Dungeon and boss drops (Oblivion Rift dungeon)

Dungeon rewards are not item drops from the table above; the Oblivion dungeon (`OBLIVION_DUNGEON`) has its own pools **[CODE]** L1706694-1706758:

| Drop key | Reward | minFloor | baseChance | per floor | knee | per floor after knee | max |
|---|---|---|---|---|---|---|---|
| mythicStone | Enchant stone (Mythic) | 1 | 0.13 | 0.01 | 6 | 0.025 | 0.6 |
| oblivionStone | Oblivion stone (level split) | 1 | 0.15 | 0.005 | 9 | 0.02 | 0.5 |
| oblivionEssence | Currency, amount `floor(2 + 0.25*(floor - 9))`... | 9 | 1 | 0 | - | - | 1 |

Chance (`getFloorFamilyChance`, L1706009-1706096):
```
f = floor(max 1)
if f < minFloor: 0
if key == oblivionStone and firstClear and FIRST_CLEAR_GUARANTEES_STONE and f <= 8: 1
n = (knee == null) ? f - minFloor : min(f, knee) - minFloor
after = (knee == null) ? 0 : max(0, f - knee)
chance = clamp(base + perFloor*n + perFloorAfter*after, 0, maxChance)
```
Essence amount `floor(2 + 0.25 * (floor - minFloor))` where `minFloor = 9`; floor is clamped `>= 1` (`getFloorDropAmount` L1706203-1706238; `amount {base 2, perFloor 0.25}`).

Oblivion stone level share (`getFloorStoneLevelShares`, L1706098-1706201): stone levels 2..5 unlock at floors 6 / 17 / 26 / 36; each gets share `min(maxShare 0.45, max(0, 0.03 + 0.015 * (floor - unlockFloor)))`, allotted from the highest level down while a running remainder lasts; level-1 stone takes whatever is left. `rollFloorOblivionStoneLevel` picks by one uniform sample walking levels high to low (L1706568-1706627). Final per-level drop chance = family chance x share.

Other dungeon constants: 3 initial keys, 1 key per day, floor window below 3 / above 6, instability model, mob base HP 20,000,000 x 1.13^(floor-1), mob attack 34,000 x 1.06^(floor-1) (L1706694); these are combat / content, see `pve-content.md`. Stone and amplification effects: `stones.md`. Celestial trial reward tiers: `getCelestialRewardTiers` (module 5931, gems / energy / dungeon keys / glyphs by rank) and daily chests (module 3910) are reward systems, not the hunt drop table; not extracted here **[UNRESOLVED]** (not in scope for gear stats).

Boss drops from the regular hunt: no separate table found. The only regular-realm drop table is §2 and any boss difference would be server-side **[UNRESOLVED]** (searched `getDropRatesForLevel` callers: realm selector L1673661-1673684 only).

## §10 Pity / bonus mechanics

None in the client. No counter, pity threshold or guaranteed-drop logic exists in the hunt code or loot filter. The only guarantee found is the Oblivion dungeon first-clear stone on floors 1-8 (§9) **[CODE]**. Whether the server has hidden pity is **[SERVER]** / unknown.

## §11 Unlock levels (player level)

From `UNLOCK_LEVELS` (L668649): Loot Filter 2, Loot Bag 4, Skills screen 8, Hunting skill 8, Fortune 12, Attunement 19, Dual equip set 28, Midas Touch 33, Artisan 33, Ascension 78, Transcendence 55. Rarity gates: §2.

## `data/drops.json` schema

Top level: `source` (line citations), `rarityOrder`, `rarityUnlockLevel` (rarity -> first level with weight > 0), `dropRatesByLevel[100]` (percent), `oblivionModel {note, params, unlockFraction, ratesByLevel[100]}` (derived, mythic assumed unlock level 1), `secondaryStatPool[26]` (`{type, minRarity, minValue, maxValue, weightExponent, decimals}`), `secondaryStatCountByRarity`.
