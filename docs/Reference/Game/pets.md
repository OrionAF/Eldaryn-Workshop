# Pets and Pet Altar

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

Players buy **eggs** with dungeon coins, **hatch** them into pets, and keep a collection (max 100) with one pet equipped as a companion. Every pet's level is the **account-wide Pet Altar level** (1-50), raised by **sacrificing** spare pets for altar XP. The altar also has a **tier** (1-8). Ascending the altar to a higher tier releases the whole collection and multiplies base stats. The equipped pet contributes flat Attack and flat HP (from species base x altar level x altar tier) plus its server-rolled secondary stats (scaled by altar level). A pet has no ability or skill. The client holds no ability data, only flavour text.

Decompiled line numbers all refer to `decompiled.js`. Static data is in module 4209 (L1187824-1189237). The bonus calculator is module 4300 (L1221320-1221766). The egg module is 4315 (L1234692-1234828). The store slice is module 3952 (L1070762-1071355). The REST wrapper is module 3846 (L932276-932846). The power score is module 4208 (L1187237-1187823). The Pets screen is around L1209800-1234440.

Catalogue and tables are in `data/pets.json`. Its schema is listed in section 10. Pointers to other systems: stat aggregation is `stats.md`, Bargain Hunter (egg discount) is `skills.md`, dungeon coins are `drops.md` / `pve-content.md`, sigil altar is `sigils.md`.

## 1. Constants

| Name | Value | Tag |
|---|---|---|
| PET_CONSTANTS.PURCHASE_COST | 100 (dungeon coins, base egg price) | [CODE] L1188651, L1234773-1234777 |
| MAX_OWNED_PETS | 100 | [CODE] L1188651 |
| MAX_PET_LEVEL (legacy per-pet level) | 50 | [CODE] L1188651 |
| STAT_GROWTH_PER_LEVEL | 0.07 | [CODE] L1188651 |
| SECONDARY_GROWTH_PER_LEVEL | 0.02 | [CODE] L1188651 |
| SECONDARY_STAT_COUNT (default) | 2 (overridden per species, section 3) | [CODE] L1188651 |
| BASE_MERGE_XP / MERGE_XP_LOSS_PERCENT | 25 / 10 (legacy merge) | [CODE] L1188651 |
| PET_ALTAR_CONSTANTS.MAX_ALTAR_LEVEL | 50 | [CODE] L1188729 |
| PET_ASCEND_CONSTANTS | TIER_STAT_MULT 3, TIER_XP_MULT 2, MAX_TIER 8 | [CODE] L1188731 |
| ROMAN tier labels | '', I, II ... VIII | [CODE] L1188733 |
| EGG_CONSTANTS | MAX_UNHATCHED_EGGS 20, hatch animation 5000-8000 ms, QUICK_OPEN_COUNT 20 | [CODE] L1234773 |
| QUICK_OPEN_OPTIONS | 10, 20, 50 (default 20) | [CODE] L1234779-1234781 |
| LEGACY_ALTAR_XP_RATIO | 1.5 | [CODE] L1188850 |

The UI purchase-batch button buys 10 eggs (`purchaseBatch(10)`) [CODE L1229534]. Eggs cannot be bought at 20 unhatched, or at 100 owned pets for hatch [CODE L1229263-1229264, L1229395].

## 2. Rarities

Rarity strings: COMMON, UNCOMMON, RARE, EPIC, LEGENDARY, MYTHIC, ANCIENT, DIVINE, ETERNAL, OBLIVION [CODE L665560-665580].

Only COMMON..ANCIENT have species. `PET_DEFINITIONS` has 18 entries and nothing at DIVINE+ [CODE L1189087-1189231]. Eggs exist for all ten rarities (names/colours at L1234785-1234821). The PET_RARITY_POWER table covers COMMON..ANCIENT only (section 8).

## 3. Species catalogue (18)

Per species: `baseAttack`, `baseHp`, `secondaryStatCount`, evolved name [CODE L1189087-1189231, evolved names L1188172-1188808]. Evolved names appear only when altar tier >= 2: `getPetDisplayName(species, tier)` returns the base name for tier < 2, else `EVOLVED_PET_NAMES[species]` [CODE L1188172-1188200]. It is the same species and the same stats at every tier, only the label changes.

| Species | Evolved (tier>=2) | Rarity | baseAtk | baseHp | Secondary slots |
|---|---|---|---|---|---|
| Flame Toad | Pyre Toad | Common | 120 | 700 | 1 |
| Dust Mite | Dust Stalker | Common | 240 | 350 | 1 |
| Moss Beetle | Moss Warden | Common | 180 | 550 | 1 |
| Thornback Lizard | Thornfang | Uncommon | 380 | 1200 | 2 |
| Ember Fox | Blaze Fox | Uncommon | 500 | 750 | 2 |
| Gloom Bat | Gloomwing | Uncommon | 280 | 1600 | 2 |
| Storm Hawk | Storm Raptor | Rare | 950 | 1400 | 2 |
| Crystal Serpent | Prism Naga | Rare | 520 | 3000 | 2 |
| Shadow Lynx | Umbra Lynx | Rare | 720 | 2100 | 2 |
| Void Spider | Void Weaver | Epic | 1700 | 2500 | 2 |
| Iron Golem | Iron Bastion | Epic | 900 | 5200 | 2 |
| Blood Wyvern | Gore Wyvern | Epic | 1300 | 3800 | 2 |
| Infernal Drake | Hell Drake | Legendary | 3000 | 4400 | 3 |
| Frost Wyrm | Rime Wyrm | Legendary | 1600 | 9200 | 3 |
| Celestial Gryphon | Astral Gryphon | Legendary | 2300 | 6800 | 3 |
| Elder Phoenix | Sun Phoenix | Mythic | 3500 | 10000 | 3 |
| Astral Seraph | Star Seraph | Mythic | 4200 | 9500 | 3 |
| Ancient Drake | Primal Drake | Ancient | 5200 | 15000 | 3 |

All [CODE]. Each species has exactly one fixed rarity. The server picks the species when an egg hatches [SERVER]; the client only receives `hatchedPet{id,species,rarity,level,xp,secondaryStats,createdAt}` [CODE L1229645-1229665]. The hatch-species odds within a rarity are not in the client [UNRESOLVED]: only `getPetDefinitionsByRarity` exists (L1188623), with no weighting.

## 4. Primary stats (what the pet adds)

```
altarLevel = getAltarProgress(altar.totalXp, altar.tier).level      # section 6
tierMult(t) = 1 + (3-1)*(t-1) + (t-1)*(t-2)  =  t^2 - t + 1          # t clamped to [1,8]
flatAttack = floor( baseAttack * (1 + (altarLevel-1)*0.07) * tierMult(tier) )
flatHp     = floor( baseHp     * (1 + (altarLevel-1)*0.07) * tierMult(tier) )
```
[CODE] `tierStatMultiplier` L1187858-1187892, `getPetBonusAttack`/`getPetBonusHp` L1188403-1188478, call site `calculatePetBonuses` L1221379-1221414 (level and tier come from the altar, not the pet entry).

[DERIVED] tier multiplier, with `TIER_STAT_MULT`=3: t=1..8 gives 1, 3, 7, 13, 21, 31, 43, 57. Check t=3: 1 + 2*2 + 2*1 = 7.

Only the equipped pet counts: `calculatePetBonuses` returns all zeros if no pet is equipped or it is not found in `ownedPets` [CODE L1221342-1221368]. `computedStats` is also sent by the server on equip/unequip [CODE L1071130-1071139]; the client's own sum is used for the Stats screen preview (L1209841).

The per-pet `level`/`xp` fields exist on the pet object but the stat path ignores them. The stat path uses the altar level.

## 5. Secondary stats

Each pet carries `secondaryStats: [{type, value}]` set by the server at hatch (number of entries per section 3). Rolled values and ranges are not in the client [SERVER]. Units follow `stats.md` §1.3: `ATTACK_SPEED`, `CRIT_DAMAGE` and `MINION_ATTACK_SPEED` secondaries are multiplier deltas (0.08 = +8%), all others percent points. [DERIVED] the pet bonus is summed into the same `attackSpeed`/`critDamage` accumulators as stones and glyphs (L1216389-1216409), whose ranges are 0.01-0.1 and 0.05-0.16 (stones.md §5) and 0.03-0.2 (mounts-glyphs.md §9), so the stored value is not in percent points. Any store that keeps such a roll in percent points must divide by 100 before it enters the totals. The client scales the stored value by altar level:

```
secondary(value, altarLevel) = parseFloat( (value * (1 + (altarLevel-1)*0.02)).toFixed(2) )
```
[CODE] `getPetSecondaryStatValue` L1188479-1188497. Tier does not enter this formula [CODE]. At altar 50 the multiplier is 1.98 [DERIVED: 1 + 49*0.02].

Types the bonus calculator accepts, each summed into its own field [CODE L1221429-1221739]: ATTACK_SPEED, DOUBLE_HIT, CRIT_CHANCE, CRIT_DAMAGE, HP_REGEN, LIFESTEAL, HEALTH_PERCENT, ATTACK_PERCENT, DAMAGE_REDUCTION, BLOCK_CHANCE, MISS_CHANCE, BLIND_CHANCE, PARALYZE_CHANCE, PENETRATION, SPELL_DAMAGE, SPELL_RESIST, SPELL_CRIT_CHANCE, SPELL_VAMP, DISRUPTION_CHANCE, FEAR_CHANCE, MINION_ATTACK, MINION_HEALTH, MINION_CRIT_CHANCE, MINION_LIFESTEAL, SOUL_LINK, MINION_ATTACK_SPEED (26). The enum also has PVP_ATTACK, PVP_DEFENSE, OBLIVION_POWER (L665684-665713), which the pet calculator ignores. Output keys: `flatAttack, flatHp, attackSpeed, doubleHit, critChance, critDamage, hpRegen, lifesteal, healthPercent, attackPercent, damageReduction, blockChance, missChance, blindChance, paralyzeChance, penetration, spellDamage, spellResist, spellCritChance, spellVamp, disruptionChance, fearChance, minionAttack, minionHealth, minionCritChance, minionLifesteal, soulLink, minionAttackSpeed` [CODE L1221760]. Aggregation into totals is additive: `calculateTotalStats` adds `flatAttack`, `flatHp`, `attackSpeed`, `doubleHit`, `critChance`, `critDamage`... to the running sums [CODE L1216389-1216409]; see `stats.md` for how they combine.

## 6. Pet Altar level and XP

Altar state is `{totalXp, tier}`; the level is derived, not stored [CODE L1070838, getAltarProgress L1187977-1188048].

```
need(L, tier) =                                   # XP to go from level L to L+1
    L >= 50 : Infinity
    base = 95*L + 80
    if L >= 45: base = base * (1 + (L-44)*0.15)
    floor( base * tierXpMult(tier) )
tierXpMult(tier) = 2 ^ (clamp(tier,1,8) - 1)      # TIER_XP_MULT 2

getAltarProgress(totalXp, tier):
    level = 1; xp = max(0, floor(totalXp))
    while level < 50 and xp >= need(level, tier): xp -= need(level, tier); level += 1
    if level >= 50: xp = 0
    return {level, xp, need: need(level,tier), totalXp}
```
[CODE] L1187925-1187975 (need), L1187894-1187923 (tier mult), L1187977-1188048 (progress), cumulative `altarXpToReachLevel` L1188223-1188265.

[DERIVED] total XP from level 1 to 50, summing need(1..49): tier 1 = 130,663, doubling each tier up to tier 8 = 16,724,960 (full per-level tables in `data/pets.json`). Check tier 1: need(1)=175, need(44)=4260, need(45)=5008, need(49)=8286.

**XP sources:**
- Sacrifice: `altarXpFromSacrifice(rarity)` = flat per rarity [CODE L1188216-1188222, table L1188809-1188849]: Common 30, Uncommon 75, Rare 180, Epic 420, Legendary 720, Mythic 1200, Ancient 3000, Divine 4500, Eternal 6000, Oblivion 9000. The client formula has no tier factor. The server computes the real `altarXpGained`, `levelsGained` and `removedPetIds` [SERVER], which the client displays (L1230206-1230217). A sacrifice that gains 0 levels shows "Sacrificed N pets . +X Altar XP"; one that gains levels shows "Pet Altar reached Lv N! Every pet is now Lv N" (string L909212).
- Auto-sacrifice on hatch: the user picks rarities; matching newly hatched pets feed the altar. Favorited pets and the active companion are never auto-sacrificed (strtab L15913). Stored client-side in local storage `petAutoSac.enabled/rarities` (module 4593). After ascend the setting is switched off with a notification ("Auto Sacrifice turned off for your fresh collection", L1230326-1230347).
- Legacy: `altarXpFromLegacyPet(rarity, level) = floor(1.5 * sum_{l=1}^{level-1} petXpRequired(l, rarity))`, `petXpRequired(l, rarity) = floor( floor(15 + 12*l) * RARITY_XP_SCALE[rarity] )`, Infinity at l >= 50 [CODE L1187827-1187856, L1188303-1188350]. `RARITY_XP_SCALE` (Common..Oblivion): 1, 2, 3, 5, 8, 12, 18, 25, 30, 36 [CODE L1188653-1188692]. `calculateMergeXp` (merge system, `PET_RARITY_MERGE_SCALE` 1, 2, 5, 12, 25, 50, 100, 200, 300, 500; `25 * scale + floor((xp + sum petXpRequired) * 0.9)`) is also present [CODE L1188351-1188402, L1188693-1188727], but nothing in the Pets screen calls it. Treat both as legacy migration helpers. Whether the server still merges is [UNRESOLVED].

## 7. Altar tiers and ascend ("Evolve the Altar")

- The UI allows ascending when `altarLevel >= 50 AND tier < 8` (MAX_TIER) [CODE L1229197-1229206]. The client calls `POST /pets/ascend` with no body [CODE L932618-932651, L1230313-1230315].
- The server returns the new `ownedPets, eggs, equippedPetId, favoritePetIds, altar{totalXp,tier}, totalPetsPurchased, dungeonCoins, stats` and the client overwrites them [CODE L1071249-1071324]. The new values are not computed client-side [SERVER].
- UI text: "Releases all pets & resets altar, coins and drop odds. New pets are evolved and far stronger." (strtab L2100); "Altar Evolved to Tier N! Collection released. New pets are evolved." (L11243); "The altar drops back to Lv 1" (L7590). So ascending **wipes the collection** and resets the altar to level 1, and the dungeon-coin balance and drop odds (see `totalPetsPurchased` in section 9) also reset [DERIVED: the string plus the returned fields]. Whether `altar.totalXp` is set to 0 is [SERVER], and so is the surviving egg count.
- Effects of a higher tier: base ATK/HP multiplier `t^2 - t + 1` (section 4), altar XP need x `2^(t-1)` (section 6), evolved names, and the power-score multiplier `3^(t-1)` (section 8). Secondary stats do not scale with tier [CODE].
- There is no client-side list of species that are only obtainable at certain tiers. All 18 species exist at every tier [CODE]. The old doc's "tier-1 vs tier-2 pets" are the base and evolved names of the same 18 species, so a store with separate tier-1 and tier-2 definitions (36) double-counts. Max altar tier is 8 (`MAX_TIER`), so a companion/altar tier above 8 is invalid. Legendary species have 3 secondary slots (section 3).

## 8. Power score contribution

`calculatePowerBreakdown` pet term [CODE L1187436-1187469, constants L1187673, L1187741-1187770]:

```
petPower = PET_RARITY_POWER[rarity] * (min(altarLevel, 50)/50) * 3^(max(0, tier-1))
```
Pet rarity power (Common..Ancient): 120, 280, 600, 1200, 2400, 4400, 7200 [CODE]. This is the displayed power score only. For its relation to combat stats, see `stats.md`. Tier uses base 3 (`ALTAR_TIER_BASE`), not the stat polynomial.

## 9. Eggs, purchase and drop odds

- Price: `floor(100 * (1 - discountPct/100))` where `discountPct` is the Bargain Hunter skill bonus [CODE `getDiscountedPetCost` L885485-885503; skill table is in `skills.md`]. Purchase is a server call `POST /pets/purchase` (one) or `/pets/purchase-batch {count}` (UI uses 10); the server returns egg(s), `totalPetsPurchased` and `dungeonCoins` [CODE L1070857-1070947].
- Hatch: `POST /pets/hatch {eggId}`, `POST /pets/hatch-all`, `POST /pets/quick-open {count}` (buys and opens, count in {10, 20, 50}) [CODE L932391-932506, L1234779]. Hatching gives war points: `calculateWarPoints(PET_HATCH, count)` [CODE L1070981-1071043]; see `clan-fortress.md`.
- Egg rarity odds are percent weights interpolated by `totalPetsPurchased` (lifetime eggs bought; the UI passes `petState.totalPetsPurchased`, L1229398-1229400):

```
weights(n): n >= 700 -> table[700]; n <= 0 -> table[0];
            else find keys k0 <= n < k1 and lerp each rarity: w0 + (n-k0)/(k1-k0) * (w1-w0)
common = 100 - sum(other rarities)        # built by pw()
```
[CODE] L1188499-1188609 (lookup), table L1188852-1189071. Full 21-row table (keys 0, 1, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500, 600, 700) is in `data/pets.json` (`rarityWeightsPct`). Highlights, in percent (unc/rare/epic/leg/myth/anc): n=0 all Common; n=100: 36/16/7/0.5/0/0, so 40.5 Common; n=400: 32/30/20/12/1/0, so 5 Common; n=700: 14/18/22/25/10/0.8, with 0.3 Divine, so 9.9 Common.
- The columns for 500-700 pass seven arguments to `pw`. Read straight from registers, `divine` is 0.3 on all three rows. Ancient is 0.05, 0.2 and 0.8, so Divine exceeding Ancient is suspicious but is what the code shows [CODE, low confidence on the divine column]. Since no species exists at Divine, what a Divine egg hatches into is [UNRESOLVED]. The UI lists only rarities with weight > 0.05 [CODE L1229405-1229413].
- The server may apply its own rolls. These weights are the client display; the actual roll is [SERVER]. They match what the UI shows.

## 10. Server API summary and data file

Endpoints (all POST except info) [CODE L932276-932846]: `GET /pets`, `/pets/purchase`, `/pets/purchase-batch`, `/pets/hatch`, `/pets/hatch-all`, `/pets/quick-open`, `/pets/equip {petId}`, `/pets/unequip`, `/pets/sacrifice {petIds}`, `/pets/ascend`, `/pets/favorite {petId, favorite}`. Pets are unlocked by `petsUnlocked` (server flag; unlock level is in `classes.md` / `pve-content.md`, not found in this pass: [UNRESOLVED]).

`data/pets.json` schema: `source` (line citations), `species[]` {id, name, evolvedName, rarity, baseAttack, baseHp, secondaryStatCount}, `rarityWeightsPct[]` {totalPetsPurchased, common, uncommon, rare, epic, legendary, mythic, ancient, divine}, `altarXpNeededPerLevel` {tier "1".."8" -> 49 numbers, index i = XP from level i+1 to i+2} [DERIVED], `altarTotalXpToMax` {tier -> total} [DERIVED].

## 11. Not found / unresolved

- Secondary stat roll ranges per stat and per rarity: [SERVER] (only values arrive from the server).
- Species chosen when an egg hatches: [SERVER]. No weighting is present in the client.
- Exact post-ascend values (`totalXp`, coins, eggs): [SERVER].
- Pet unlock level (`petsUnlocked`): [UNRESOLVED].
- Pet art/combat modules (4234, 5379-5620, 5727) only render a companion sprite and minion motion; no pet combat ability was found there [UNRESOLVED: these modules were skimmed by name only, not read].
