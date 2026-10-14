# Relics

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

Relics are collectible, per-class, three-tier (bronze/silver/gold) permanent stat items. A character owns relics, upgrades each with tier-coloured medals, and equips a few in slots. Equipped relics add flat-by-level stat bonuses on the Character screen. The full catalogue (68 relics) is in `data/relics.json` (schema in §9). Purchase, equip, upgrade, sell, slot purchase and medal exchange are all server calls; the client only holds definitions, constants and display logic. All line numbers refer to `decompiled.js`; the catalogue/constants live in Metro module 4130 (L1142336-1143998).

## §1 Access and unlock

- Unlock level: `UNLOCK_LEVELS.RELICS = 22` **[CODE]** L668649 (same table as MARKET 22, SIGILS 25). `hasRelicAccess(level, ownedCount)` = `level >= 22 || ownedCount > 0` **[CODE]** L1371520-1371545.
- `RELIC_CONSTANTS.UNLOCK_LEVEL = 18` exists in the relic module **[CODE]** L1142660 but the one consumer found (`hasRelicAccess`) uses the shared table (22). Treat 18 as dead data **[UNRESOLVED]**: I did not find any reader of `RELIC_CONSTANTS.UNLOCK_LEVEL`.
- Unlock popup text: relics "are bought with medals in the Relic Shop and give permanent stat bonuses once equipped", reached via Character > ARTIFACTS > Relics **[CODE]** L668751.

## §2 Relic definition and per-level stat

Each definition has `id, name, tier, class, bonuses[1..2], cost, maxLevel, icon, description` and optionally `specHint` **[CODE]** L1142668+. `specHint` (MYSTIC_MAGE, MYSTIC_DRUID, NECROMANCER_DOOMWEAVER) is only passed to a `SpecBadge` UI component **[CODE]** L1343409, L1343650; no filter/gating was found, so it does not restrict equipping (absence of any gating **[UNRESOLVED]** since server could enforce).

Each bonus is `{type, baseValue, maxValue}`. Stat at a given level **[CODE]** L1142576-1142598 (call sites pass `(baseValue, maxValue, level, maxLevel)`, L1343252-1343262, L1345255-1345265):

```
statAt(base, max, level, maxLevel):
    if maxLevel <= 1 or level <= 1: return base
    return base + (max - base) * (level - 1) / (maxLevel - 1)     // linear, no clamping
```

So level 1 gives `baseValue`, `maxLevel` gives `maxValue`. A relic purchased starts displayed at level 1 (upgrade UI passes current level; `[DERIVED]` from the upgrade-cost call at L1341908 using current level, purchase level itself is **[SERVER]**).

## §3 Tiers, max level, cost

| Tier | maxLevel | Bonuses |
|---|---|---|
| bronze | 10 | exactly 1 |
| silver | 15 | exactly 2 (all silver) |
| gold | 20 | 2 (Shadowbind, Titan's Oath, Worldroot Heart have 1) |

maxLevel per definition **[CODE]** (field `maxLevel`; bronze 10, silver 15, gold 20 in all 68). Enum `RelicTier = BRONZE|SILVER|GOLD` L669557. Medal currency field per tier is `'bronze'|'silver'|'gold'` (`getMedalFieldForTier` L1142341).

Purchase cost: definition field `cost` (units of the tier's medal, **[DERIVED]** from `getRelicSellValue` which starts `invested = def.cost` and refunds medalTier = tier, L1142612-1142645). Values seen: bronze 5 or 6, silver 8 (10 for the crit/crit-damage "Fortune/Deadeye/Arcanist's/Lich's" relics), gold 5 or 6; listed per relic in the JSON. Some `cost`/`maxLevel` values are assigned via reused registers (`costMaxLevelResolvedFromRegisters` flag in JSON); I resolved them by tracing register loads (r13=5, r8=6, r11=10, r12=8, r10=15, r6=20 at L1142660-1142685) and they are consistent with tier patterns. Whether purchase is actually charged `cost` is **[SERVER]** (`POST /relics/purchase {relicId}`).

## §4 Upgrade cost

```
upgradeCost(tier, currentLevel) = UPGRADE_BASE_COST[tier] + currentLevel * UPGRADE_COST_PER_LEVEL[tier]
UPGRADE_BASE_COST      = { bronze: 2, silver: 3, gold: 2 }
UPGRADE_COST_PER_LEVEL = { bronze: 1, silver: 2, gold: 2 }
```
**[CODE]** L1142374-1142398, L1142660-1142666 (fallbacks 2 and 1 if tier missing). The UI evaluates it with the relic's current level when `level < maxLevel` (L1341895-1341912) and the cost is paid in the relic's tier medal. Examples **[DERIVED]**: bronze L1->2 = 3; gold L19->20 = 2+19*2 = 40; silver L14->15 = 3+14*2 = 31. Total bronze L1->10 = sum_{l=1..9}(2+l) = 63; silver L1->15 = sum_{l=1..14}(3+2l) = 252; gold L1->20 = sum_{l=1..19}(2+2l) = 418 **[DERIVED]**. The authoritative charge is **[SERVER]** (`POST /relics/upgrade`).

## §5 Equip slots

```
getMaxRelicSlots(extraSlotsPurchased) = BASE_SLOTS + min(extraSlotsPurchased, MAX_EXTRA_SLOTS)   // 2 + min(n, 2) => 2..4
slotUnlockCost(extraSlotsPurchased):  0 -> 15 silver medals ; 1 -> 8 gold medals ; else null
```
**[CODE]** L1142530-1142573, constants L1142660 (`BASE_SLOTS 2, MAX_EXTRA_SLOTS 2, SLOT_3_COST_SILVER 15, SLOT_4_COST_GOLD 8`). Persisted relic state is `{ownedRelics[], equippedRelicIds[], extraSlotsPurchased}` plus a `medals` wallet **[CODE]** L1165460-1165640; slot purchase is `POST /relics/purchase-slot`. Whether duplicates/one-per-tier limits apply to equipping is **[SERVER]**.

## §6 Sell and medal exchange

```
invested = def.cost + sum_{l=1}^{level-1} upgradeCost(tier, l)
refund   = floor(invested / 2)   // in the relic's tier medal
```
**[CODE]** L1142612-1142645 (`getRelicSellValue`); actual credit **[SERVER]** (`POST /relics/sell`).

`MEDAL_EXCHANGE` **[CODE]** L1143988-1143993: upgrade direction costs 5 of a tier for 1 of the next (bronze->silver, silver->gold); downgrade costs 1 for 3 of the lower tier (gold->silver, silver->bronze). Executed by `POST /relics/exchange-medals {from, direction, amount}` **[SERVER]**.

Medal sources seen elsewhere (owned by other systems; only noted): siege/clan-rank rewards (`bronzeMedals`, `silverMedals`, `goldMedals`, L668268-668316 and L1063335-1063355) and a loot table with `silver_medal_2` (50%), `gold_medal_1` (20%) at L1052771-1052787. See clan-fortress.md and pve-content.md.

## §7 Contribution to character stats

Relic bonuses are "permanent stat bonuses" while equipped (§1). How they add into the stat pipeline (additive vs multiplicative, raw vs percent) is owned by stats.md; the client's relic module only supplies the numbers. No client function that sums relic bonuses into a stat sheet was found in the decompile (searched for relic bonus/stat calculators), so mapping `HP_PERCENT` to the HP-percent accumulator (`healthPercent`, the same pool as mount `hpPercent` and pet/glyph `HEALTH_PERCENT`) is an assumption **[UNRESOLVED]**. Stat units as shown by `formatStatValue` **[CODE]** L1345034-1345110:

| Stat type | Display | Meaning of stored number |
|---|---|---|
| ATTACK_SPEED, MINION_ATTACK_SPEED | `+x.xx` (2 dp, no %) | flat value (0.08-0.35, minion 0.1-0.4), not a percent |
| CRIT_DAMAGE | `+round(v*100)%` | fraction (0.4 = +40%) |
| PVP_ATTACK, PVP_DEFENSE | `+round(v)` | flat rating |
| HP_REGEN | `+x.x` (1 dp, no %) | flat value |
| all others | `+x.x%` | percent |

Stat enum (`RelicStatType`) L669568+: HP_PERCENT, ATTACK_PERCENT, PENETRATION, BLOCK_CHANCE, CRIT_CHANCE, CRIT_DAMAGE, DAMAGE_REDUCTION, LIFESTEAL, ATTACK_SPEED, HP_REGEN, PVP_ATTACK, PVP_DEFENSE, MISS_CHANCE, BLIND_CHANCE, PARALYZE_CHANCE, SPELL_DAMAGE, SPELL_RESIST, SPELL_CRIT_CHANCE, SPELL_VAMP, DISRUPTION_CHANCE, FEAR_CHANCE, MINION_ATTACK, MINION_HEALTH, MINION_CRIT_CHANCE, MINION_LIFESTEAL, SOUL_LINK, MINION_ATTACK_SPEED (the enum also lists WOUND, BLEED, POISON, SLOW, CRIT_DOWN etc., unused by any relic).

## §8 Catalogue summary and sentinel migration

Counts **[CODE]**: Warrior 14 (6/4/4), Sentinel 14 (6/4/4), Mystic 20 (8/6/6, includes Mage- and Druid-hinted relics), Necromancer 20 (8/6/6) = 68. `SENTINEL_RELIC_MIGRATION` (L1143969) maps the 14 Warrior ids to their Sentinel equivalents (e.g. relic_iron_heart -> relic_falcons_eye, relic_dragon_core -> relic_void_arrow), i.e. Sentinel relics replaced a legacy shared set; `getSentinelRelicId` falls back to the same id. The rename is applied only when the player's class is SENTINEL, to both `ownedRelics[].relicId` and `equippedRelicIds` (L1139715-1139790); the old Warrior ids stay valid Warrior relics, so a migration must be class-conditional. Per-relic data is in the JSON.

Old-doc check: `Warrior Relics.txt` shows Crimson Charm Penetration 12-24 and Dragon Core Penetration 12-50; the code has Crimson Edge 6-10 and Dragon Core 6-22 **[CODE]** (refuted: old doc stale). Other Warrior numbers match.

## §9 JSON schema (`data/relics.json`)

`source` (citations), `constants` (slots, costs, exchange), `sentinelMigration` (old->new id map), `relics[]`: `{id, name, class, tier, cost, maxLevel, specHint|null, bonuses:[{stat, base, max}], defLine, costMaxLevelResolvedFromRegisters?}`. `stat` uses the game enum names in §7.
