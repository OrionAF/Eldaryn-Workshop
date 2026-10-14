# Enchant Stones (Socketed Stones) and Stone Amplification

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

In the game these are **Enchant Stones** (screen "Enchantment": tabs STONES / ARMORY / AMPLIFY / GRADE). The app calls them "Socketed Stones". Stones drop from Crusades (and Oblivion floors), are "awakened" to reveal their stats, are socketed one-per-equipment-slot in the Armory, and add flat stat bonuses to the character. Amplification multiplies every stat on one stone by up to 1.6x. Oblivion Stones are a sixth type with their own grade system.

Static catalogue (stat pools, ranges, amplify table, Oblivion grades): `data/stones.json` (schema in §9). Provenance tags: [CODE], [DERIVED], [SERVER], [UNRESOLVED]. Line numbers refer to `decompiled.js`.

Related systems: stat names and their meaning see `stats.md`; drop rates and which content drops which stone see `drops.md` / `pve-content.md`; gear quality/Tempering see `gear.md`.

## §1 Stone types

Enum `EnchantStoneType` = PVE_ATTACK, PVE_DEFENSE, PVP, ULTIMATE, MYTHIC, OBLIVION **[CODE]** (L669842-669854). Config per type **[CODE]** (L1205586-1205627, `ENCHANT_STONE_CONFIG`):

| Enum | Name | Stats on stone | Guaranteed stats | Random stats come from | Dust on grind |
|---|---|---|---|---|---|
| PVE_ATTACK | Crimson Warstone | 2 | none | attack pool (14 stats) | 1 |
| PVE_DEFENSE | Verdant Wardstone | 2 | none | defense pool (11 stats) | 1 |
| PVP | Azure Duelstone | 2 | 1 PvP stat, drawn from weighted pair: PVP_ATTACK w20, PVP_DEFENSE w80 | full pool (24) | 1 |
| ULTIMATE | Eldaryn Stone | 3 | PVP_ATTACK + PVP_DEFENSE | full pool (24) | 2 |
| MYTHIC | Mythic Soulstone | 4 | PVP_ATTACK + PVP_DEFENSE | full pool (24) | 3 |
| OBLIVION | Oblivion Stone | 5 | OBLIVION_POWER + PVP_ATTACK + PVP_DEFENSE | full pool (24) | 4 + (grade-1) |

- `statCount` includes the guaranteed stats **[CODE]**; `allowDuplicateStats: false` for all types **[CODE]**.
- Azure: `secondaryPool` holds the PvP draw and `statPool` the classic stat; the UI text "one PvP stat plus one classic stat" (L911420) agrees. Whether the 20/80 weights are the server's actual odds is **[SERVER]** (the client only holds the config copy).
- Counting, "Azure = 1 PvP + 1 free", "Eldaryn = 2 PvP + 1 free", "Mythic = 2 PvP + 2 free" is **[DERIVED]** from statCount minus guaranteed.
- Colours (L1205586-1205620): Crimson `#ef4444`, Verdant `#22c55e`, Azure `#3b82f6`, Eldaryn `#a855f7`, Mythic `#ec4899`, Oblivion `#7c3aed` **[CODE]**.
- Dust yield table `STONE_DUST_YIELD` (L1206375-1206398): PVE_ATTACK/PVE_DEFENSE/PVP = 1, ULTIMATE = 2, MYTHIC = 3, OBLIVION = 3 + `OBLIVION_OVER_MYTHIC`(1) = 4 **[CODE]** (the three "1" keys are decompile-elided but match UI text "basic & PvP = 1, Eldaryn = 2, Mythic = 3", L910043).

## §2 Stat pools and value ranges

Each pool entry: `{type, minValue, maxValue, weightExponent: 2, decimals}` **[CODE]** (L1205311-1205572). Full table in `data/stones.json` `stats`. Summary:

- Attack pool (PVE_ATTACK), 14 stats: crit chance, crit damage, attack speed, double hit, lifesteal, penetration, spell damage, spell crit chance, spell vamp, minion attack, minion crit chance, minion lifesteal, soul link, minion attack speed.
- Defense pool (PVE_DEFENSE), 11 stats: health %, HP regen, damage reduction, block chance, miss chance, blind chance, paralyze chance, disruption chance, spell resist, fear chance, minion health.
- Full pool (24): the 13 attack-pool stats other than penetration plus all 11 defense-pool stats (13+11=24 **[DERIVED]**; per-stat `inFullPool` flag in the JSON). Penetration is attack-pool only **[CODE]**.
- Special stats (never in a random pool): PVP_ATTACK 5-25, PVP_DEFENSE 5-20 (integers, decimals 0), OBLIVION_POWER 8-30 (integer) **[CODE]**.
- Values are percent numbers (crit chance 0.5-2.5 means 0.5%-2.5%) except PvP Attack/Defense, which are plain integers **[DERIVED]** from decimals/ranges and the UI context; the unit of PvP ratings itself see `combat-pvp.md`.
- Ranges are the same for every stone type that contains the stat (one shared def per stat) **[CODE]**.
- No flat Attack or flat Health roll exists on regular stones, and `ATTACK_PERCENT` is handled in the bonus summation but is in no pool **[CODE]** (L1205826 vs pools).
- Roll distribution: `weightExponent` 2 appears on every def. The gear roll function `rollSecondaryStatValue` (L677736) uses `min + (max-min) * random^exponent` (skewed toward the minimum). The stone roll itself is server-side, so the same formula for stones is an inference **[UNRESOLVED]**; client never rolls stone stats.
- Quality (1-100, `MAX_QUALITY` = 100) is stored per stone; see §6.

## §3 Obtaining, awakening, grinding

- Stones arrive "sealed" (`activated: false`, no stats). Awakening is an API call (`/enchant-stones/activate`, `/activate-batch`; L933390, L933428) and the roll is **[SERVER]**. Batch size `AWAKEN_BATCH_SIZE` 10; animation 5000-8000 ms; unlock level `UNLOCK_LEVELS.CRUSADE` = 35 **[CODE]** (L1205306-1205309, L668657). Bulk awaken needs at least 2 sealed stones (UI text).
- Only activated stones contribute stats: `calculateEnchantStoneBonuses` skips any stone with `activated` falsy (L1205747) **[CODE]**.
- Stone type of a drop is rolled by `rollEnchantStoneType` using per-source `enchantWeights` (L1702035). Owned by `drops.md` / `pve-content.md`.
- Grinding (`/enchant-stones/grind`, L933586): destroys stones for Stone Dust (§1 yield table). Socketed stones cannot be ground (UI text L910057-ish `grind.sub`). Oblivion stones also yield Oblivion Essence (§7). Dust yield depends on type only, never amplify level ("Amplify levels yield no extra dust", L911632) **[CODE]**.

## §4 Sockets (Armory)

- Nine equipment slots can each hold one stone: HEAD, SHOULDERS, CHEST, LEGGINGS, BOOTS, WEAPON, OFFHAND, RING, TRINKET **[CODE]** (L1162966-1162993, `EMPTY_ENCHANT_SLOTS`); `TOTAL_ENCHANT_SLOTS` = 9 (L2139822).
- Slots exist in three independent maps: `enchantSlots` (Set 1), `enchantSlots2` (Set 2), `oblivionEnchantSlots` (Oblivion realm) **[CODE]** (L1162871-1162887). Each map is `slot -> stoneId | null`.
- Oblivion realm keeps its own stone list (`oblivionEnchantStones`) separate from `enchantStones` (L1162904-1162921) **[CODE]**.
- API: `/enchant-stones/socket {stoneId, slot, targetSet}` and `/unsocket {slot, targetSet}` (L933470, L933510). No socket count per rarity: sockets are per slot, fixed, not per item **[CODE]** (nothing in gear data gates sockets; searched module 4154 and the Armory UI).
- No type restriction per slot visible client-side **[UNRESOLVED]** (server could reject; the UI tray shows "Tap a slot to socket the stone" for any stone).
- A stone can be socketed in Set 1 and Set 2 at the same time: the inventory label function chooses `stones.setBoth` ("SET 1+2") when the id is present in both maps (L2066440-2066463) **[CODE]**. Whether the same stone placed twice is counted twice depends on which set is the active equipment set: `baseSlotsForSet` returns `enchantSlots2` for set 2, else `enchantSlots` (L1173216-1173235) **[CODE]**. Which set feeds the character's displayed totals when both exist is **[UNRESOLVED]** (see `gear.md`, DUAL_EQUIP unlock level 28 in L668650).
- Oblivion-realm stones are listed with label `realmGear.realmOblivion` and cannot be placed in Set 1/2 **[DERIVED]** from the separate maps.

## §5 Stat contribution (formula)

`calculateEnchantStoneBonuses(stones)` (L1205726-1206148) **[CODE]**:

```
bonus = { attackSpeed, doubleHit, critChance, critDamage, hpRegen, lifesteal,
          healthPercent, attackPercent, damageReduction, blockChance, missChance,
          blindChance, paralyzeChance, penetration, pvpAttack, pvpDefense,
          spellDamage, spellResist, spellCritChance, spellVamp, disruptionChance,
          fearChance, minionAttack, minionHealth, minionCritChance,
          minionLifesteal, soulLink, minionAttackSpeed, oblivionPower,
          flatAttack, flatHp } = 0
for each stone in stones (the equipped ones, caller-supplied; skip if !activated):
    if stone.type == OBLIVION:
        s = OBLIVION_STONE_BASE_STATS[clampLevel(stone.oblivionLevel)]
        bonus.flatAttack += s.attack ; bonus.flatHp += s.hp
    for each stat in stone.stats:
        bonus[statKey] += getEnchantStoneStatValue(stone, stat, stone.amplifyLevel)

getEnchantStoneStatValue(stone, stat, amplifyLevel):
    if stone.type == OBLIVION and stat.type == OBLIVION_POWER:
        return oblivionPowerForQuality(stone.quality) * getOblivionPowerGradeMult(stone.oblivionLevel)
    return stat.value * getEnchantStoneStatMultiplier(stone, stat.type, amplifyLevel)

getEnchantStoneStatMultiplier(stone, statType, amplifyLevel):
    if stone.type == OBLIVION and statType == OBLIVION_POWER:
        return getOblivionPowerGradeMult(stone.oblivionLevel)
    return 1 + 0.06 * (amplifyLevel or 0)          # getAmplifyStatMultiplier
```

- Contributions are purely additive per stat key; no per-slot weighting **[CODE]**.
- Amplify multiplies **every** stat on the stone, including guaranteed PvP stats and (for Oblivion) the non-Power rolled stats **[CODE]**.
- Quality, `qualityBonus`, rarity and slot do not enter this function for any non-Oblivion stone: `stat.value` is used as stored **[CODE]**. So whatever the stored `value` is already reflects quality server-side (§6).
- Caller supplies the list: `useSocketedStoneIds` unions the ids of both sets and the Oblivion map (L1173834-1173885). Which exact list each combat/stat screen passes to `calculateEnchantStoneBonuses` was not traced **[UNRESOLVED]**.
- Mapping of keys to the app's stat model (`pvpAttack`, `critDamage`, ...) is 1:1 by name. Note `critDamage` ranges 0.05-0.16 and `attackSpeed` 0.01-0.1 (two decimals), far smaller than other percents; unit semantics see `stats.md` **[UNRESOLVED]**.

## §6 Quality, Tempering/Attunement

- Per-stone fields persisted client-side: `id, type, activated, stats[{type,value}], quality, qualityBonus, amplifyLevel, oblivionLevel, acquiredAt, activatedAt` (`mapEnchantStone`, L1048491-1048570) **[CODE]**.
- `MAX_QUALITY` = 100 (L1889573-1889611) and the Quarry constants: Arcane Quarry (unlock level 39) gives Tempering Essence (gear) and Attunement Essence (stones); "ATTUNE: RAISE QUALITY" calls `/quarry/attune {stoneId}` (L934449 area) **[CODE]**.
- Quarry `QUALITY_BONUS_TIERS`: [10-15 w40], [15-25 w30], [25-35 w20], [35-40 w10] (L1889620-1889628). Whether these apply to stone attunement or only gear tempering is **[UNRESOLVED]** (the stone card shows "+qualityBonus" in purple, L2065817-2065850, so stones do carry `qualityBonus`).
- How quality or qualityBonus alters `stat.value`: **[SERVER]**. The client function in §5 ignores both for non-Oblivion stones; for Oblivion only, quality sets the Oblivion Power (§7).
- Essence exchange: spend 3 of one essence, get 1 of the other (`SPEND_PER_UNIT` 3) **[CODE]**.

## §7 Oblivion Stones

Stone type OBLIVION, 5 grades (`oblivionLevel` 1-5) **[CODE]** (L1206738-1206808):

| Level | Grade | Base Attack | Base HP | Mirrors tier | Power grade mult | Upgrade essence cost to reach | Essence from grinding |
|---|---|---|---|---|---|---|---|
| 1 | Common | 3250 | 10700 | Mythic | 1 | - | 1 |
| 2 | Uncommon | 10650 | 25900 | Ancient | 1.5 | 8 | 2 |
| 3 | Rare | 17500 | 43500 | Divine | 2.25 | 18 | 3 |
| 4 | Epic | 30800 | 77700 | Eternal | 3.375 | 39 | 4 |
| 5 | Legendary | 50800 | 130500 | Oblivion | 5.0625 | 85 | 5 |

```
normalizeOblivionStoneLevel(x) = clamp(floor(x), 1, 5)   (non-finite -> 1)
getOblivionPowerGradeMult(L)   = 1.5 ^ (L - 1)              # POWER_GRADE_MULT = 1.5
oblivionPowerForQuality(q)     = round(8 + (30-8) * (clamp(q,1,100) - 1) / 99)   # q null -> 1
OblivionPower(stone)           = oblivionPowerForQuality(quality) * 1.5^(level-1)
getOblivionUpgradeCost(target) = round(8 * 2.2^(target - 2)),  only for integer 2 <= target <= 5, else null
getOblivionEssenceYield(stone) = 1 + (level - 1) * 1       # GRIND_ESSENCE_BASE 1, PER_GRADE 1
```

- Base attack/HP are flat bonuses added to `flatAttack`/`flatHp` regardless of rolled stats; "mirrors tier" is a design label for gear tiers **[CODE]**. `GEAR_PIECE_FRACTION` 0.5 is defined (L1206808) but its use was not traced **[UNRESOLVED]**.
- Upgrade cost argument being the target level is **[DERIVED]** from the range check (valid only 2..5); caller not traced. Total essence 1->5 = 8+18+39+85 = 150 **[DERIVED]**.
- Raising the grade adds base HP/Attack and multiplies Oblivion Power; "other rolled stats stay exactly as they are" (L910037 `ruleBaseOnly`) **[CODE]**. Upgrade call is `upgradeStone` in module 5848 (L1705211-1705301) with server-side result **[SERVER]**.
- What Oblivion Power does in combat: see `pve-content.md` / `combat-pve.md`.
- Oblivion stones drop by floor with grade shares (module 5851 `getFloorStoneLevelShares`); see `pve-content.md`.

## §8 Stone Amplification

Unlocks at character level 50 (`AMPLIFICATION_CONSTANTS.UNLOCK_LEVEL` = 50 and `UNLOCK_LEVELS.AMPLIFICATION` = 50) **[CODE]** (L1206371, L668657). UI path Character > Enchants > AMPLIFY.

Constants (L1206371-1206403) **[CODE]**:

```
MAX_LEVEL            = 10
STAT_BONUS_PER_LEVEL = 0.06
statMultiplier(L)    = 1 + 0.06 * L              # 1.60 at +10
success rate by TARGET level T (level the stone would reach): 
   T:  1    2    3    4    5    6    7    8    9    10
   p:  1.0  0.9  0.8  0.7  0.6  0.5  0.4  0.3  0.2  0.1
baseDustCost(T) = 1 if T<=4 ; 2 if T<=6 ; 3 if T<=9 ; 4 (T==10)
dustCost(stone, T) = baseDustCost(T), x2 and ceil for OBLIVION stones   # OBLIVION_COST_MULT = 2
```

- The caller passes `T = amplifyLevel + 1` to both the success-rate and cost functions (L2078050-2078110: `r47 = r46 + 1`) **[CODE]**. A stone at `amplifyLevel >= 10` is not selectable.
- Cost is paid in Stone Dust on every attempt, win or lose; on failure the target keeps its level and is never destroyed (L910057 `ruleSpent`, L911630) **[CODE]**. Success/failure roll is **[SERVER]** (`/enchant-stones/amplify {stoneId}`, L933548).
- Any stone type can be amplified; Oblivion stones pay double dust. No sacrifice stone is consumed in 2.7.0: dust replaced it **[CODE]**. The older intro text in `howItWorks`/`sacrifice`/`failSub` strings and "8% per level, 1.8x at +10" (L668825, L911429-911433) is stale; the constant is 0.06 and cost is dust **[CODE]**.
- Applies equally to every stat on the stone, including guaranteed PvP stats. Oblivion Power is excluded (it scales with grade instead) **[CODE]** (§5).
- Derived cost to climb (dust), all attempts costed at the per-level price: cost if every attempt succeeds = 1+1+1+1+2+2+3+3+3+4 = 21; expected dust to reach +10 = sum(cost/p) = 1 + 1.111 + 1.25 + 1.429 + 3.333 + 4 + 7.5 + 10 + 15 + 40 = **84.62** (non-Oblivion) **[DERIVED]**. Expected dust for one more level at +9->+10 = 40.
- Because the multiplier is additive-linear in level, a stone's contribution is `base * (1 + 0.06 * L)`; the game applies it to the stored per-stat value at calculation time, not to the stored value **[CODE]**.

## §9 JSON schema (`data/stones.json`)

Top-level: `source`, `notes`, `weightExponent`, `stats[]`, `specialStats[]`, `types[]`, `amplifyTable[]`, `oblivionGrades[]`.
- `stats[]`: `{stat, gameEnum, min, max, decimals, inPveAttackPool, inPveDefensePool, inFullPool}`.
- `specialStats[]`: PvP Attack/Defense and Oblivion Power ranges.
- `types[]`: `{key, enum, name, statCount, pool, guaranteed[], secondaryPool?, dustYield}`.
- `amplifyTable[]`: `{targetLevel, dustCost, successRate, statMultiplier}`.
- `oblivionGrades[]`: grade table from §7.

## §10 What this system contributes to character power

Additive stat bonuses from up to 9 socketed stones per set (Set 1 and Set 2), scaled by `1 + 0.06*amplifyLevel` per stone, mostly secondary/percent stats and PvP Attack/Defense. Oblivion stones add large flat Attack/HP and Oblivion Power. Maximum stat gain per stone is its max roll times 1.6.

## §11 Unresolved / server-side

- Actual roll distribution, quality's effect on values, attunement effect, awakening RNG, amplify RNG, Oblivion upgrade result: **[SERVER]**.
- Which stone set feeds the active character stats when both sets are populated: **[UNRESOLVED]**.
- Per-slot or per-type socket restrictions server-side: **[UNRESOLVED]**.
