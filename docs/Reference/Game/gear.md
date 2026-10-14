# Equipment and items

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

Provenance tags: **[CODE]** read from client code, **[DERIVED]** computed from [CODE] values, **[SERVER]** decided server-side, **[UNRESOLVED]** not determined. Citations are `decompiled.js L<n>`. Catalogue tables (rarity table, 26-entry secondary-stat pool, per-class slot weights, item types, constants) are in `data/gear.json`; this file explains how they are used.

## Overview

A character wears gear in 9 base slots (12 in the Oblivion realm). Each item has a rarity (10 tiers), an item level, primary stats (Attack and Health), and 0 to 3 rolled secondary stats; Eternal and Oblivion items additionally carry a Conduit. The client holds the *formulas and tables* that define what an item may roll (so the client can show quality and ceilings), but item creation (drops, upgrade attempts, rolls) is **[SERVER]**: the client only sends equip/discard/switch requests and receives equipment plus recomputed `computedStats`. A gear optimiser therefore needs: (a) the shown per-item stats (entered by the user), and (b) these formulas to reason about ceilings, quality and what a given rarity/level can roll. There is **no set-bonus system, no gear upgrade/enhance/forge screen and no item-level "enchant" in the client** (see §10). Stat sockets are Stones (see `stones.md`).

## §1 Slots

- Base slots (`EquipmentSlotType`, display order): HEAD, SHOULDERS, CHEST, LEGGINGS, BOOTS, WEAPON, OFFHAND, RING, TRINKET **[CODE]** (`EQUIPMENT_SLOT_ORDER`, array literals at L1174041-1174077, the 9 base slots in that order and the 3 Oblivion-only slots as a second array, concatenated into the 12-slot order; enum L665400-665800). `data/gear.json` `slotOrder` holds the 12-slot order.
- Oblivion-only slots: BELT, GLOVES, RIFT_CORE (`OBLIVION_ONLY_EQUIPMENT_SLOTS`; `NEW_SLOT_COUNT: 3`); the Oblivion realm slot order is the 9 base slots followed by these 3 **[CODE]** (L1173904-1174092, L669119).
- Display names: Helmet, Shoulderplates, Chestplate, Leggings, Boots, Ring, "Amulet" (TRINKET), Belt, Gloves, Rift Core. WEAPON/OFFHAND by class: Warrior Sword/Shield, Sentinel Bow/Quiver, Mystic Staff/Relic, Necromancer Scythe/Soul Lantern **[CODE]** (L678420-678500).
- Item type names by rarity (`ITEM_TYPES_BY_RARITY`, cosmetic material names): Common Iron; Uncommon Steel, Reinforced; Rare Sapphire, Runic; Epic Shadow, Arcane; Legendary Infernal, Void; Mythic Dragonforged, Celestial; Ancient Abyssal; Divine Cosmic; Eternal Chronoforged; Oblivion Riftforged **[CODE]** (L1202960-1203197). No stat effect found.
- `INVENTORY_MAX_SLOTS: 50`, `LOOT_BAG_MAX: 8`, `MIN_ITEM_LEVEL: 1`, `MAX_ITEM_LEVEL: 100` (base cap) **[CODE]** (L670527).

## §2 Rarity tiers

Order (`RARITY_ORDER`): Common < Uncommon < Rare < Epic < Legendary < Mythic < Ancient < Divine < Eternal < Oblivion **[CODE]** (L669134-669275). `isRarityAtLeast(a,b)` = index(a) >= index(b).

Secondary-stat count by rarity (`secondaryStatCount`) **[CODE]** (L669134-669275):

| Common | Uncommon | Rare | Epic | Legendary | Mythic | Ancient | Divine | Eternal | Oblivion |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 1 | 1 | 2 | 2 | 2 | 3 | 3 | 3 |

Colours are in `data/gear.json`. Eternal ("Chronoforged") gear starts dropping at player level 74 (`CHRONOFORGE`) **[CODE]** (L668649, L668849). Oblivion realm START_RARITY is Mythic **[CODE]** (L669119-669127).

## §3 Primary stats (Attack and Health)

Per-rarity bases and per-level scales (`RARITY_STAT_TIERS`) **[CODE]** (L677956-677992; full table in `data/gear.json`):

```
effectiveLevel(L)  = L <= 100 ? L : 100 + (L - 100) * 0.4          # ASCENSION_ABOVE_100_STAT_RATE = 0.4  [CODE] L677322, L677996
statLevelForItem(L, oblivion) = oblivion ? L * 0.5 : L              # ITEM_LEVEL_SCALE = 0.5               [CODE] L677339, L669119
itemStatLevel(item) = statLevelForItem(item.itemLevel, item.realm == 'OBLIVION')   [CODE]
attackForItem(rarity, L, oblivion) = floor((atkBase + effectiveLevel(statLevelForItem(L,oblivion)) * atkScale) * (oblivion ? 2.75 : 1))   [CODE] L677533
hpForItem(rarity, L, oblivion)     = floor((hpBase  + effectiveLevel(statLevelForItem(L,oblivion)) * hpScale ) * (oblivion ? 2.8  : 1))   [CODE] L677578
```

POWER_MULT_ATTACK 2.75 and POWER_MULT_HP 2.8 apply only to Oblivion-realm items **[CODE]** (L669119).

Examples **[DERIVED]**: Legendary L100 attack = 1550 + 100*12 = 2750. Oblivion item L200: statLevel 100, attack = floor((61000 + 100*370) * 2.75) = 269500, HP = floor((126000 + 100*820) * 2.8) = 582400.

Per-slot, per-class weights (`SLOT_WEIGHTS_BY_CLASS`, `{attack, hp}` per slot, 12 slots) are in `data/gear.json` **[CODE]** (L677997-678208). Examples: Warrior Weapon 1.5/0.2, Offhand 0.3/1.2, Ring 1.0/0.1; Sentinel Weapon 1.8/0.15; Mystic and Necromancer tables are identical to each other (Weapon 1.75/0.15). `getSlotWeights(slot, class)` falls back to the Warrior table (`SLOT_WEIGHTS`) for an unknown class **[CODE]** (L677645). **[UNRESOLVED]**: no client code multiplies `attackForItem` by the slot weight, so "item attack = attackForItem x weight.attack" is an inference, not code. Where the displayed item Attack/Health come from is **[SERVER]** (items arrive with their stats); checked every reference to `attackForItem`, `hpForItem`, `getSlotWeights`, `SLOT_WEIGHTS` (only re-exports at L2043674-2043702).

## §4 Secondary stats

Pool (`SECONDARY_STAT_POOL`): 26 entries, all with `minRarity: RARE`, `weightExponent: 2` **[CODE]** (L678209-678418; table in `data/gear.json`). Not in the pool although present in the `SecondaryStatType` enum: PVP_ATTACK, PVP_DEFENSE, OBLIVION_POWER (the last is an Oblivion enchant-stone stat, see `stones.md`) **[CODE]** (L665400-665800). `getSecondaryStatsForRarity(r)` = pool entries with index(minRarity) <= index(r) (so every pool stat is available from Rare up) **[CODE]** (L677688). No class filter exists in the client pool; whether the server filters class-irrelevant stats (e.g. Miss/Blind/Paralyze) is **[SERVER]**, and Attunement (skills) bans stats from the pool (see `skills.md`).

Ceiling and roll **[CODE]** (L677356, L677713, L677751):

```
secondaryStatMaxValue(def, L):                       # L = itemStatLevel
  frac  = min(L, 100) / 100
  base  = def.min + (def.max - def.min) * (0.5 + 0.5 * frac)
  return L > 100 ? base * effectiveLevel(L) / 100 : base

rollSecondaryStatValue(type, L):
  v = def.min + (secondaryStatMaxValue(def, L) - def.min) * random()^2     # weightExponent = 2
  return round to def.decimals

rerollSecondaryStatValueUpward(type, cur, L):         # Artisan-style quality reroll
  max = secondaryStatMaxValue(def, L)
  if cur >= max: return cur
  v = round(cur + (max - cur) * random(), decimals)
  return v > cur ? v : min(cur + 10^-decimals, max)
```

So the ceiling at L=1 is min + 50.5% of the range and reaches the table max at L=100; above L=100 it scales by effectiveLevel/100 (L=200 gives x1.4; the Ascension skill text says "roughly twice", which is the marketing reading, not the code **[DERIVED]**: 100 + 100*0.4 = 140). Rolls are heavily skewed to the low end (random squared): expected roll = min + range/3 of the level ceiling **[DERIVED]**. Values are the in-game display percentages (the `%` form), `decimals` is 1 for most stats and 2 for Attack Speed, Crit Damage, Minion Attack Speed.

## §5 Quality

```
calculateStatQuality(type, value, L):
  if type not in pool: return 1
  max = secondaryStatMaxValue(def, L); range = max - def.min
  if range <= 0: return 1
  cmax = round(def.min + range, decimals)                 # max rounded to the stat's decimals
  if cmax - def.min <= 0: return 1
  return clamp(round((value - def.min) / (cmax - def.min) * 99) + 1, 1, 100)       [CODE] L677176-677260
calculateItemQuality(item) = round(mean over item.secondaryStats of calculateStatQuality(type, value, itemStatLevel(item)))
                             # returns null when the item has no secondary stats                  [CODE] L677261
```

Quality is relative to the *item's own level ceiling* (a roll at max for its level is Q100). The loot filters ("Q91+") use this (see `drops.md`). Whether the server stores `item.quality` with the same function is **[UNRESOLVED]** (the Total Power calculation reads `item.quality` as supplied, L1187237).

## §6 Item level, Ascension and Oblivion caps

- Base item-level range 1..100 (`MIN_ITEM_LEVEL`, `MAX_ITEM_LEVEL`) **[CODE]** (L670527).
- Regular realm: the **Ascension skill** (unlock level 78) raises the drop cap: effects by skill level 1..5 = **100, 130, 160, 190, 240**; upgrade costs 500/1000/1500/2000 **[CODE]** (L885162-886032 skill table, `getMaxItemLevel` L885676); both cap tables are in `data/gear.json` `maxItemLevelByAscension` (`regular`, `oblivion`, indexed by Ascension level - 1). Drops "climb toward the new cap over time (via the item-level watermark)" per its description; the watermark logic is **[SERVER]** (client only stores `itemLevelWatermarks`, keyed `"<realm>_<x>"` by `watermarkKey`, L670599, L670693).
- Oblivion realm: `ASCENSION_MAX_ITEM_LEVELS = [200, 260, 320, 380, 480]`, indexed by `max(1, ascensionLevel) - 1`, falling back to index 0; `MAX_ITEM_LEVEL: 200`; `DARK_CONDUIT_MIN_RARITY = DIVINE` **[CODE]** (L669094, L669119-669127). These equal exactly 2x the regular caps (200/260/320/380/480 vs 100/130/160/190/240) and `ITEM_LEVEL_SCALE` is 0.5, so an Oblivion item at its cap has the same *stat level* as a regular-realm item at its cap **[DERIVED]**: 480 * 0.5 = 240.
- Max player level 100 (`MAX_PLAYER_LEVEL`) **[CODE]** (L670527). Oblivion prestige is unlocked at player level 95 (`UNLOCK_LEVEL`), `COMMIT_MIN_LEVEL` 15, `REQUIRE_FULL_OBLIVION_SET: true`, `WINDOW_DAYS` 21, `SOFT_WINDOW_XP_MULT` 0.5 (a 50% XP penalty, `getOblivionXpPenaltyPct`), `ENERGY_CARRY_CAP` 20000 **[CODE]** (L669119, L668987-669133). Oblivion progression itself belongs to `pve-content.md`.

## §7 Conduits and Chrono Flux (Eternal gear)

- Eternal items carry a Conduit, a 4th stat (`ConduitType`: FLAME, EARTHEN, DARK). Flame charges Chrono Flux when you deal damage; Earthen when you take damage; Dark does both **[CODE]** (UI strings L668849, L911275, L931359-931365).
- Roll type: 50/50 Flame/Earthen (`rollConduitType`, `random() < 0.5 ? EARTHEN : FLAME`) **[CODE]** (L677413 region).
- `rollConduitForRarity(rarity, L, oblivion=false)`: if `oblivion` and rarity >= DIVINE then DARK; else Eternal gives Flame/Earthen; Oblivion rarity gives DARK; any other rarity gives none **[CODE]** (L677825-677900).
- Value (`CONDUIT_CONFIG`: min 10, mid 45, max 70, breakLevel 40, variance 0.15, decimals 0) **[CODE]** (L678419):

```
Lc = clamp(L, 1, 100)
base = Lc <= 40 ? 10 + (45 - 10) * (Lc - 1) / 39
                : 45 + (70 - 45) * (Lc - 40) / 60
value = max(10, round(base * (1 + (2*random() - 1) * 0.15)))
```

- What conduit value does in combat (Flux per hit, threshold, transform duration; "awakens your equipped Ancient Sigil's transform", no cooldown, can re-awaken, each further charge costs more) is **[UNRESOLVED]** here: see `sigils.md` / `combat-pve.md`. Not modelled by the app.

## §8 Dual Equip (two equipment sets)

- Unlock player level 28 (`DUAL_EQUIP`) **[CODE]** (L668649). State: `equipment` (set 1), `equipment2` (set 2), `activeEquipmentSet` (default 1), `viewedEquipmentSet` (UI only) **[CODE]** (L670535-671001).
- "Each set has independent gear, and the active set is the one that determines your combat stats" **[CODE]** (L668769). `equipItem` writes to the active set unless a target set is given; `switchActiveSet` is a server call (`/equipment/switch-set`) whose result returns new `computedStats`; equip/discard also call the server (`/equipment/equip`, `/equipment/discard`, `/equipment/discard-batch`) **[CODE]** (L886033-886296).
- `selectDualSetAvailable` = not in the Oblivion realm: in Oblivion there is one loadout (`oblivionEquipment`, `oblivionEnchantSlots`) **[CODE]** (L1173183). `equipment2` falls back to `equipment` if null.
- Each set has its own socketed stones (`enchantSlots` / `enchantSlots2`) **[CODE]** (L1173169-1173903); see `stones.md`.
- Final character stats are returned by the server (`computedStats`); the client never sums gear itself **[SERVER]**.

## §9 Loadout Presets

A preset stores *references*, not item contents: `{ id, name, icon, equipmentSet (1|2), talentSet, petId, mountId, relicIds, sigilSpecies, utilitySigilSpecies, transcendencePresetId, isDefault }` **[CODE]** (L1144090, L1167516-1167943). Activating a preset switches the equipment set, talent set, pet, mount, relics and sigils; "dirty" detection compares the live selections to the active preset **[CODE]** (L1167614). Unlock player level 41 (`PRESETS`). Constants: `FREE_SLOTS 1`, `MAX_PRESETS 8`, `NAME_MAX 8`, `BASE_COST 100`, `COST_STEP 200`; slot n costs `0` if n <= 1 else `100 + (n - 1 - 1) * 200` (2nd = 100, 3rd = 300, ... 8th = 1100) **[CODE]** (L1144002, L1144182). Currency of the cost is **[UNRESOLVED]** (not read in `getPresetSlotCost`). Endpoints `/presets`, `/presets/buy|update|activate|delete` **[CODE]** (L1198333-1198615).

## §10 What the client does not contain

Searched `upgrade`, `enhance`, `forge`, `reforge`, `set bonus`, `setBonus`, `socket`: no gear upgrade/enhance/forge system, no set bonuses, no item reforging. The only improvement paths are drop-time: Midas Touch skill (rarity-upgrade chance per drop: 0.5/1/1.5/2/3 percent by skill level) and Artisan skill (quality reroll chance 0/2/4/6/8 percent; unlock level 33 for both) **[CODE]** (L885162-886032, L668649); stones/amplification (`stones.md`). Rarity-upgrade and reroll resolution happen server-side **[SERVER]**.

## §11 Total Power (display score, not combat)

Equipment portion of `calculateTotalPower` **[CODE]** (L1187237-1187823):

```
equipPower = sum over equipped items of
   EQUIP_RARITY_POWER[rarity] * (1 + 0.6 * effectiveLevel(itemStatLevel(item)) / 100) * (1 + 0.35 * (item.quality ?? 0) / 100)
EQUIP_RARITY_POWER = Common 5, Uncommon 12, Rare 28, Epic 65, Legendary 150, Mythic 340, Ancient 750, Divine 1600, Eternal 3400, Oblivion 7000
```

Other components (sigils, enchants, transcendence, pet, mount, relics, talents, awakening, level) belong to their systems.

## §12 Contribution to character stats

Each equipped item contributes its Attack, Health and each secondary stat (Attack Speed, Double Hit, Crit Chance, Crit Damage, HP Regen, Lifesteal, Health %, Attack %, Damage Reduction, Block/Miss/Blind/Paralyze Chance, Penetration, Spell/Minion stats, Soul Link) plus socketed stone stats to the character's totals. How totals are combined, soft caps and percent stacking are **[SERVER]** (client receives `computedStats`) and owned by `stats.md`.

## §13 App comparison pointers

See the StructuredOutput discrepancy list; key points: the app has 9 slots only (no Belt/Gloves/Rift Core/Oblivion loadout), a single stat block per slot with no rarity/level/quality/conduit, two loadouts (matches Dual Equip's 2 sets but the app has no unlock level), and its "preset" holds `loadout: 0|1` index (consistent with `equipmentSet`).
