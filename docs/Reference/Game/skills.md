# Skills System

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

Skills are permanent, gem-purchased account upgrades. They are **not stat sources**: no skill adds ATK/HP/crit/etc. Their only indirect contributions to gear power are **Ascension** (raises the item-level cap of drops) and **Attunement** (bans secondary stats from the drop roll table), plus Fortune/Midas/Artisan which improve drop quantity/quality. All other skills are economy/convenience. Module 3605 (`decompiled.js L885162-886032`) holds the catalogue and effect getters; module 3145 (L668383-668986) holds unlock levels; module 3844 (L931910-932140) is the API wrapper; the UI is `SkillsScreen` (L2170312+, upgrade UI around L2170999 and L2172290-2172360).

## §1 Global rules

- Unlock of the Skills page: player level 8 (`UNLOCK_LEVELS.SKILLS = 8`). **[CODE]** L668649
- Starting gift on unlock: `SKILLS_UNLOCK_GEMS = 80` gems ("You earned 80 Gems!"). **[CODE]** L668654-668655, L668699
- `INITIAL_GEMS = 80`, `RESET_COST = 200` gems, `UNLOCK_LEVEL = UNLOCK_LEVELS.SKILLS`. **[CODE]** L885860-885867
- Skill level `L` ranges 1..`maxLevel`. Effect at level L = `effects[L-1]`; the cost to go from L to L+1 = `costs[L-1]` (so `costs.length = maxLevel-1`, `effects.length = maxLevel`). **[CODE]** L885363-885442 (getSkillUpgradeCost: null if L<1 or L>maxLevel, null at maxLevel absent oblivion point)
- Base level is 1 (every skill's level-1 effect is its un-upgraded baseline, e.g. Mastery 0%, Bargain 0%). That a new character starts at level 1 is **[DERIVED]** from `effects[0]` being the baseline and `costs[0]` being the 1->2 price; the initial level itself is stored server-side. **[SERVER]**
- Gems spent on skill L: `sum(costs[0 .. min(L,maxLevel)-2])` + (`oblivionPoint.cost` if the skill has one and `L > maxLevel`). **[CODE]** L885801-885852
- Reset: `POST /skills/reset` costs 200 gems fee; UI text: "Every skill returns to its base level. You pay a {{cost}} gem fee and get back all {{refund}} gems spent on upgrades." Net = refund - 200. **[CODE]** L911293, L932003-932008 (refund amount computed server-side; client mirrors with getSkillGemsSpent) **[SERVER]**
- Upgrade: `POST /skills/upgrade {skillId}`; info `GET /skills`; attunement bans `POST /skills/attunement {excludedStats}`. Server validates. **[CODE]** L931933, L931971, L932045
- Tracks (UI grouping): hunt, fortune, merchant. **[CODE]** L911287

## §2 Oblivion point (extra level)

Seven skills carry an `oblivionPoint {cost, effect}`: one extra level above `maxLevel`, shown only when the player has `oblivionUnlocked` (Oblivion prestige realm). `OBLIVION_SKILL_POINTS_ENABLED = true`, `OBLIVION_SKILL_POINT_COST = 3000` (all seven use cost 3000). **[CODE]** L885213, L885870, L2172294-2172322

```
getSkillLevelCap(skill, oblivionUnlocked) = maxLevel + (skill.oblivionPoint && oblivionUnlocked ? 1 : 0)
getSkillEffect(skill, L, fallback=0):
    if skill.oblivionPoint and L == maxLevel+1: return oblivionPoint.effect
    return effects[L-1] ?? fallback
isOblivionSkillLevel = skill.oblivionPoint && L > maxLevel
cost of the oblivion step = getSkillUpgradeCost(skill, maxLevel) = oblivionPoint.cost
```
**[CODE]** L885165-885205, L885363-885442. UI strings: "The Rift opens one more level on this skill." **[CODE]** L911289.

## §3 Catalogue (14 skills)

Columns: id / name / track / unlock player level / maxLevel / costs (gems, L->L+1) / effect by level / Oblivion point (cost 3000 effect). **[CODE]** L885872-886026; unlock levels L668649.

| id | Name | Track | Unlock Lv | Max | Costs | Effects (L1..) | Oblivion |
|---|---|---|---|---|---|---|---|
| hunting | Hunting | hunt | 8 | 10 | 50,100,150,180,240,300,360,420,500 | 1..10 mobs per hunt | 12 |
| luck | Fortune | fortune | 12 | 5 | 30,80,200,500 | 60,70,80,90,100 (% drop rate) | - |
| vitality | Vitality | hunt | 20 | 6 | 40,100,250,600,1000 | 60,50,42,35,30,25 (sec / energy) | - |
| petDiscount | Bargain Hunter | merchant | 26 | 5 | 40,100,250,500 | 0,10,20,30,40 (% pet egg discount) | 50 |
| mastery | Mastery | hunt | 31 | 5 | 80,200,450,800 | 0,8,16,24,32 (% XP) | 40 |
| sigilDiscount | Arcane Bargain | merchant | 32 | 5 | 60,150,350,700 | 0,10,20,30,40 (% sigil forge discount) | 50 |
| miningCharges | Deep Mining | fortune | 42 | 4 | 50,100,150 | 3,4,5,6 daily Arcane Quarry charges | 8 |
| crusadeDiscount | War Pact | merchant | 46 | 6 | 60,120,200,350,600 | 0,20,40,60,80,100 (% crusade honor discount; max = free) | - |
| midasTouch | Midas Touch | fortune | 33 | 5 | 300,500,750,1000 | 0.5,1,1.5,2,3 (% chance to upgrade drop rarity) | - |
| artisan | Artisan | fortune | 33 | 5 | 150,350,600,800 | 0,2,4,6,8 (% quality reroll) | 10 |
| summonLuck | Summoner's Pact | merchant | 40 (`MOUNTS`) | 5 | 100,200,400,700 | 60,70,80,90,100 (% mount summon success) | - |
| ascension | Ascension | fortune | 78 | 5 | 500,1000,1500,2000 | 100,130,160,190,240 (max item level) | - |
| attunement | Attunement | fortune | 19 | 4 | 500,1000,2000 | 0,1,2,3 banned-stat slots | - |
| keySave | Skeleton Key | merchant | 56 | 5 | 500,1000,1500,2000 | 0,2,4,6,8 (% dungeon key refund) | 10 |

Total gems to max (non-oblivion), **[DERIVED]** sum of costs: Hunting 2060; Fortune 810; Vitality 1990; Bargain 890; Mastery 1530; Arcane Bargain 1260; Deep Mining 300; War Pact 1330; Midas 2550; Artisan 1900; Summoner 1400; Ascension 5000; Attunement 3500; Skeleton Key 5000. Grand total 28,520 gems (arithmetic of the rows above).

Unlock-notification text "Midas Touch / Artisan: 2 New Skills Unlocked" both at 33. Dual (Hunting) unlock text claims Skills page opens from the Hunt screen. **[CODE]** L668693, L668785.

## §4 Effect formulas and what each affects

```
getMobsPerHunt(L)        = effect(hunting, L, fallback 1)
getItemDropChance(L)     = luck.effects[L-1] ?? 60          // percent; used after each hunt
getStaminaRegenIntervalMs(L) = (vitality.effects[L-1] ?? 60) * 1000     // 60s -> 25s per energy
getEnergyForHours(h, L)  = floor(h * 3600 / (vitality.effects[L-1] ?? 60))
getXpMultiplier(L)       = 1 + effect(mastery, L, 0)/100
getDiscountedPetCost(L, c)   = floor(c * (1 - effect(petDiscount, L, 0)/100))
getDiscountedSigilCost(L, c) = floor(c * (1 - effect(sigilDiscount, L, 0)/100))
getMiningChargesPerDay(L)    = effect(miningCharges, L, 3)
getDiscountedCrusadeCost(L, c) = floor(c * (1 - (crusadeDiscount.effects[L-1] ?? 0)/100))
getRarityUpgradeChance(L)    = midasTouch.effects[L-1] ?? 0     // percent
getQualityRerollChance(L)    = effect(artisan, L, 0)            // percent
getMountSummonSuccessChance(L) = (summonLuck.effects[L-1] ?? 60) / 100
getMaxItemLevel(L)       = ascension.effects[max(1,L)-1] ?? ascension.effects[0]
getDungeonKeyRefundChance(L) = effect(keySave, max(1,L), 0)    // percent
getMaxExcludedStats(L, class) = (attunement.effects[max(1,L)-1] ?? 0) + getClassAttunementBonus(class)
```
**[CODE]** L885316-885790. Note only those using `getSkillEffect` honour the Oblivion extra level (Hunting, Bargain, Mastery, Arcane Bargain, Deep Mining, Artisan, Skeleton Key); the ones that index `effects` directly (Fortune, Vitality, War Pact, Midas, Summoner, Ascension, Attunement) have no oblivion level, consistent with the catalogue.

Fortune's "% drop rate" semantics (per-hunt drop probability vs. a multiplier) are applied in hunt code at L1673601; the server decides the actual drop. **[SERVER]** The exact roll is not in the client.

## §5 Gear-relevant skills (for the optimiser)

- **Ascension**: item-level cap 100/130/160/190/240 for L1..5. Description: "Item levels above 100 keep scaling every stat linearly: an item-level-200 drop rolls stats roughly twice as high as an item-level-100 one"; drops climb toward the cap via the "item-level watermark". **[CODE]** L885983, L668853. Exact scaling formula and watermark are server/gear territory **[SERVER]**; see `gear.md`, `drops.md`.
- **Attunement**: bans secondary stats from the roll table for items, pets and enchant stones; freed slot rerolls to another stat. Ban slots = `effects[L-1]` + class bonus; changing bans is free, via `POST /skills/attunement`. **[CODE]** L885992, L885736-885763. Class bonus `CLASS_ATTUNEMENT_BONUS`: Warrior 0, Sentinel 0, Mystic +1, Necromancer +1 (so casters have one slot even at level 1; UI text "Your arcane focus" for Mystic and "Your command over death" for Necromancer, "the first ban slot is already open at skill level 1, and every upgrade adds one more, up to 4 at max"). **[CODE]** L668930-668960 (class keys are decoded from register moves; mapping inferred from the order Warrior, Sentinel, Mystic, Necromancer and matches the UI text). Max bans: warriors/sentinels 3, casters 4. **[DERIVED]**
- **Midas Touch** and **Artisan**: chance to bump rarity tier / reroll quality on every non-Discarded drop (even filter-hidden ones). **[CODE]** L885954, L885963. See `drops.md`.
- Other skills (Hunting, Fortune, Vitality, Mastery, discounts, Deep Mining, Skeleton Key, Summoner's Pact) affect economy only; none touch combat.

## §6 Unlock-level table (UNLOCK_LEVELS subset)

SKILLS 8, SKILL_HUNTING 8, SKILL_FORTUNE 12, SKILL_ATTUNEMENT 19, SKILL_VITALITY 20, SKILL_PET_DISCOUNT 26, SKILL_MASTERY 31, SKILL_SIGIL_DISCOUNT 32, SKILL_MIDAS_TOUCH 33, SKILL_ARTISAN 33, MOUNTS 40 (Summoner's Pact), SKILL_MINING_CHARGES 42, SKILL_CRUSADE_DISCOUNT 46, SKILL_KEY_SAVE 56, SKILL_ASCENSION 78. **[CODE]** L668649

## §7 Unknowns

- Starting skill level and whether the server clamps ban counts: **[SERVER]**.
- How `luck` percentage combines with base drop rate: **[UNRESOLVED]** (checked only the getter and call at L1673601).
- Whether the 4th-slot oblivion step costs gems vs another currency: the client compares to `gems` balance (`r1 >= oblivionPoint.cost`, L2172337-2172343) and the label says "OBLIVION POINT"; treated as gems. **[DERIVED]**

## Compare with the app

The app (`src/`) has no skills, attunement, ascension or item-level model (grep for attunement/ascension/item level returns nothing). Everything above is new to the app.
