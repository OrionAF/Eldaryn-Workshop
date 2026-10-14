# PVE Content and Oblivion

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

Everything here is read from the client bundle. Fights in Crusade, Celestial Trial and World Boss are **simulated on the server**; the client holds only config numbers and replays logs. So most "enemy stats" below are exact config, but the combat outcome is **[SERVER]**. Line numbers are `decompiled.js L<n>`.

Tags: **[CODE]** read directly, **[DERIVED]** computed from CODE, **[SERVER]** decided server-side, **[UNRESOLVED]** not determined.

**What this system contributes to a character's power (gear-optimiser view):**
- No PVE-content system grants a permanent stat multiplier directly. Permanent power enters indirectly: **Oblivion** (a second, separate hero with its own gear scale, 3 extra slots, Oblivion Level and Oblivion Power), **Crusade** (enchant stones, Mythic Soulstones, Ichor), **Celestial Trial** (glyphs, Celestial/legendary/mythic dust), **Arcane Quarry** (Tempering/Attunement essences that raise item and stone quality), **Dungeons** (coins, Oblivion Stones/Essence in the Oblivion Dungeon) and **World map camps** (small economy bonuses).
- Facts owned elsewhere: stones/quality math see `stones.md`; drops/rarity tables see `drops.md`; item attack/HP formulas see `gear.md`; Oblivion Power as a stat see `stats.md`; Sigil/Glyph effects see `sigils.md` / `mounts-glyphs.md`; clan/Village Raid see `clan-fortress.md`; combat resolution see `combat-pve.md`.

Static catalogue (Oblivion XP/drop/floor tables, 7 dungeons, 22 progress chapters) is in `data/pve-content.json` (schema §12). Crusade/Celestial/World Boss tables live in the earlier extractions `gamedata/crusade.json`, `celestial.json`, `world_boss.json` and are summarised here, not duplicated.

---

## §1 Unlock levels

**[CODE]** `UNLOCK_LEVELS` L668649: PROGRESS 1, LOOT_FILTER 2, LOOT_BAG 4, WORLD 5, DUNGEON_1 5, PETS 6, SKILLS 8, WORLD_MAP 9, RAID_1 10, EVENTS 11, SKILL_FORTUNE 12, TALENTS 15, QUESTS 16, SIGILS_MYSTIC 17, CLASH 18, RELICS 22, MARKET 22, SIGILS 25, DUAL_EQUIP 28, WORLD_BOSS 30, CRUSADE 35, DUAL_TALENTS 38, ARCANE_QUARRY 39, CELESTIAL_TRIAL 40, MOUNTS 40, PRESETS 41, SKILL_MINING_CHARGES 42, AWAKENING 45, AMPLIFICATION 50, MYTHIC_CRUSADE 52, TRANSCENDENCE 55, CHRONOFORGE 74, SKILL_ASCENSION 78, CELESTIAL_TRIAL_HARD 60. `OBLIVION_PRESTIGE` = 95 (from `OBLIVION_PRESTIGE.UNLOCK_LEVEL`, L669119).
Max player level `MAX_PLAYER_LEVEL` = 100 **[CODE]** L670527.

---

## §2 World map: zones, spots, travel, camp bonuses

**Zones [CODE]** (L1056505): ironhold_outpost, verdant_necropolis, wardens_hollow, frostmaw_crypt, infernal_summit, divine_gate (display names Ironhold Outpost, Verdant Necropolis, Warden's Hollow, Frostmaw Crypt, Infernal Summit, Divine Gate).

**Spots [CODE]** (module 4129, L1141877-1142335; types HUNTING_GROUNDS, DUNGEON, BOSS_SITE, EVENT_SPOT, SETTLEMENT, PVP_ARENA, CRUSADE, PET_SHOP, PORTAL):
- ironhold: hunt, dungeon, boss, event, outpost(settlement)
- verdant: hunt, arena, event, village
- warden: hunt, dungeon, crusade, event
- frostmaw: hunt, arena, event, pet shop
- infernal: hunt, dungeon, crusade, event
- divine: hunt, arena, event, pet shop, portal (locked/comingSoon types: PORTAL and BOSS_SITE/EVENT_SPOT per `isWorldMapSpotComingSoon` L1141877+; a spot is a travel destination unless `locked===true` or its type is in the coming-soon type list).
Start spot: `WORLD_MAP_STARTING_SPOT_ID` = `ironhold_outpost` **[CODE]** L1141719-1141876.

**Camp bonuses [CODE]** (module 4317, L1235084-1235687; UI text L911212). Active only while **stationed** at a spot of the right type and **not travelling** (`travel === null`):

| Spot type | Effect | Value |
|---|---|---|
| DUNGEON | Dungeon Coins per clear | x1.1 (`worldMapDungeonCoinMultiplier`, `applyWorldMapCampBonus = round(x*1.1)`) |
| PVP_ARENA | Honors per Arena win | x1.1 (`worldMapArenaHonorMultiplier`) |
| SETTLEMENT/village (`'village'`, `WORLD_MAP_VILLAGE_LABEL_KEY`) | Raid Influence per raid step | x1.1 (`worldMapRaidInfluenceMultiplier`), stacks with clan bonus (UI) |
| PET_SHOP | Pet egg cost | x0.9 (`worldMapCampDiscountFactor` = 0.9, `applyWorldMapCampEggDiscount`) |
| HUNTING_GROUNDS | "10% of your kills roll for an extra drop from the rarities listed" | `worldMapHuntExtraRollPct` = 10 (slot2) |
| CRUSADE | "Personal cache": on a **full clear** (all 3 bosses) an extra enchant stone rolls only for you | cache chance % below |

Hunt featured rarities per spot **[CODE]** (`WORLD_MAP_HUNT_FEATURED`): ironhold {Uncommon, Rare, Epic}; verdant {Rare, Epic, Legendary, Mythic}; warden {Epic, Legendary, Mythic, Ancient}; frostmaw {Legendary, Mythic, Ancient, Divine}; infernal {Mythic, Ancient, Divine, Eternal}; divine {Ancient, Divine, Eternal, Oblivion}. The client also multiplies featured-rarity drop-rate display by `worldMapCampBonusFactor` = 1.1 (`useCampBoostedDropRates`, L1673740+), but the user-facing rule is the 10% extra-roll text above. **[UNRESOLVED]** whether the server uses the 1.1 factor, the 10% extra roll, or both (client shows both; the real roll is server-side drops, see `drops.md`).

Crusade cache chance **[CODE]**: NORMAL 10, HARD 10, MYTHIC (Mythic+0) 10 (percent). Mythic+L (L>=1): `[10,11,12,15,18,20,22,26,28,32][min(L,10)-1]`; cap level 10, max 32 %. From Mythic+3 up (`WORLD_MAP_CRUSADE_CACHE_MYTHIC_ONLY_LEVEL`=3, `worldMapCrusadeCacheForcedType`) the cache only pays Mythic Soulstones (stone type MYTHIC). Table keys for NORMAL/HARD/MYTHIC were lost by the decompiler (`r1[6]=r5`, `r1[3]=r5`), all three values equal 10 **[DERIVED]** from the three assignments of the same register.

**Travel [CODE]** (module 6141, L1918982-1919150): `baseMinutes` = same zone: `INTRA[zone]` = {ironhold 120, verdant 150, warden 180, frostmaw 210, infernal 240, divine 270}; different zones: sum of `ZONE_LEG_MINUTES[i]` for legs between the zones, legs `[180,360,480,600,720]`. `durationSeconds = round(baseMinutes*60 / (1 + max(0,speed)/100))`. The `speed` argument source (a travel speed %) is **[UNRESOLVED]** (not traced). Server holds position/arrival (`worldMapTravel.arrivesAt`, client clock offset `worldMapClockOffsetMs`) **[SERVER]**.

---

## §3 Progress chapters (story campaign)

**[CODE]/[summary of `progress_chapters.json`, source L~1084788-1085500]**: 22 chapters (11 normal + 11 hard, `displayChapter` 1-11), 10 levels each, 3 mobs per level. `hp/attack = round(base * levelMult * 2)`; mob roster rotates by level index; hard chapters scale base by per-chapter `hpScale/atkScale`, override penetration and share level multipliers. Spot-check: chapter 1 L1 mobs 120/180/260 HP, chapter 22 L10 Chrono Wraith 1.1259e12 HP / 1.0933e11 atk (see `data/pve-content.json` `progressChapters`, which stores level 1 and 10 only; the full 220-level table is in the source JSON). Progress completion goes through `completeLevel` (module 3972); rewards **[UNRESOLVED]** (server).
`completeLevel` has no client-side formula for permanent stats; chapter progress as a power source is **[SERVER]/[UNRESOLVED]**.

---

## §4 Classic dungeons (Forsaken Mines etc.)

**[CODE]** module 3943 (L1062171-1062963). `DUNGEON_CONFIG`: INITIAL_KEYS 4, KEYS_PER_DAY 2, RESET_HOUR 0 (UTC), TICK_INTERVAL_MS 10, PREPARED_FIGHT_TTL 1.8e6, FAST_PASS_COOLDOWN 300000, SHIELD_MITIGATION 0.5. Unlock `DUNGEON_1` level 5 (all 7 dungeons share `requiredPlayerLevel` = DUNGEON_1). Intro text: "2 dungeon keys a day; a clear spends one" (L668805 region).

Seven dungeons (normal), each 8 steps: Forsaken Mines (dungeon_1), Howling Ruins, Frozen Catacombs, Infernal Temple, Abyssal Rift, Divine Gate, Chrono Sanctum. Each step has 3 mobs from a 5-6 entry roster and a step multiplier:
```
mob.hp   = round(baseHp  * stepMult)
mob.atk  = round(baseAtk * stepMult)
step 1..7 mobs = roster[(3*s)%(n-1)], roster[(3*s+1)%(n-1)], roster[(3*s+2)%(n-1)]   (s = 0-based step)
step 8 mobs    = roster[n-3], roster[n-2], roster[n-1]   (boss last)
coins per step = table (stepCoins)
```
Forsaken Mines step multipliers `[1,1.2,2,3.2,4.4,6.4,7.8,9.6]`, coins `[45,60,78,86,90,95,100,105]`; full per-dungeon multipliers, coins, rosters in `data/pve-content.json` `classicDungeons`. The roster-index rule is **[DERIVED]** from `buildSteps` L1062171+271..326.

Hard variants (id `dungeon_N_hard`) **[CODE]** `hardVariant`: take the last 3 mobs' max baseAtk, cap normal mobs' baseAtk to `1.05 * thatMax`; `hp = round(baseHp * hpScale * hpMulStep * (1 - DR/100))`, `atk = round(min(baseAtk,cap) * atkScale * k / 1.25)` etc. Per-dungeon `{hpScale, atkScale, blockChance, penetration, damageReduction}` = `[216000/63000/20/50/0, 46500/17800/21/52/0, 16100/4670/22/54/30, 3690/1320/23/56/30, 707/325/24/58/30, 275/625/25/60/30, 308/604/26/62/30]`, with a per-dungeon `{hp,atk}` share `[.5/.85,.5/.85,.5/.55,1/.55,1/.65]`, multiplier ladder `[1,1.09,1.19,1.3,1.42,1.55,1.69,2.05]` and hard coins `3010 + 10*(8*idx+step)` (`hardCoinRewards`). Because the hard formula was only partly traced (register aliasing), the exact hard hp/atk are **[UNRESOLVED]**; the structure above is **[CODE]**. Outcome and coin payout are **[SERVER]** (`prepare/resolve/sweep/fastPass` modules 3607/3608).
Camp bonus x1.1 coins applies (§2). Dungeon coins buy things in the shop (not a stat source).

---

## §5 Crusade (Hell Crusade) incl. Mythic and Mythic+

Summary of `gamedata/crusade.json` (source L1701581-1702426 config, L1862677-1869281 sim). Spot-checked: `getMythicPlusBossMultiplier` L1701902, `getCrusadePowerRequirement` L1701736, `getMythicPlusEnchantWeights` L1701588.
- Unlock Crusade level 35, Mythic level 52, War Pact skill unlock 46. Keys: INITIAL 2, +2/day (reset hour 0). Group 3, solo allowed; boss time budget 300000 ms for the entire run. Entry cost: Mythic 10 Honors (discounted by War Pact skill, cost = floor(cost * (1 - effectsPct[lv-1]/100)), effects `[0,20,40,60,80,100]`). **[CODE]**
- Boss base HP/attack (Hell): Obsidian Sentinel 4.86e6 / 13500 / 1.1; Infernal Demon 7.29e6 / 15600 / 1.3; Fire Lord 9.29475e6 / 18300 / 1.5. Hell bosses only auto-attack. **[CODE]**
```
bossHp  = round(base.hp  * partyScale[n].hp  * diff.bossStatMult * diff.bossHpMult  * mythicPlusMult(L))
bossAtk = round(base.atk * partyScale[n].atk * diff.bossStatMult * diff.bossAtkMult * mythicPlusMult(L))
partyScale n=1: hp .4 atk .45 | n=2: .75/.75 | n=3: 1/1
NORMAL: statMult 1, atkMult .5, hpMult .8 | HARD: 1.7, 1, 1 | MYTHIC: 2.9, 1, 2
mythicPlusMult(L) = 1.35^min(L,3) * (L>3 ? 1.5^(L-3) : 1)     (L<=0: 1)
powerRequirement  = NORMAL 0, HARD 11000, MYTHIC 13000; Mythic+L = round(13000 * 1.18^L)
```
Bosses have 0 block/DR/miss, so player hits are unmitigated. Boss targets the Tank holder, else Control, else highest HP. **[CODE]**
- **Rewards that matter for power:** enchant stones. Drop count per run: `rate = (L>0 && bossesKilled==3) ? 3 : diff.enchantDropChance[partySize][bossesKilled]`; repeatedly: stop if `random > min(rate,1)`, else +1 stone, `rate -= 1`. Stone type weighted: NORMAL PVE_ATTACK 40 / PVE_DEFENSE 40 / PVP 20; HARD 25/25/40 PVP and 10 ULTIMATE; MYTHIC 15/15/30/40 ULTIMATE; Mythic+L: PVE_ATK/DEF `max(0,10-2L)`, PVP `max(10,15-L)`, ULTIMATE `max(25,35-L)`, MYTHIC `8L`, OBLIVION 0. Ichor reward per Mythic+L `[1,2,2,3,3,4,5,6,7,8,9]` index min(L,10). **[CODE]**
- Result and exact loot winner roll are **[SERVER]**; client simulator `simulateCrusadeFight` (L1868835) is shipped but not called.

---

## §6 Celestial Trial

Summary of `gamedata/celestial.json` (module 4150 L1156882-1160944). Unlock 40 (Normal), 60 (Hard); Mythic uses Oblivion Level. Group 2, boss Empyrean Gatekeeper, 4 spells (Halo Breach add summons every 20 s cap 6, Gatekeeper's Burden, Judgment Strike every 30 s x3 atk, Celestial Overload at 5 adds x(1+5) atk). Seals: price 100, daily max 3. **[CODE]**
```
mult(L) = prod_{l=ref+1..L} (1 + band(l).growth);  ref = 40
bossHp   = round(baseHp * hpMult(L)   * bossStatMult)    NORMAL baseHp 1.6e7, baseAtk 5640, aspd 1.5
bossAtk  = round(baseAtk * atkMult(L) * bossStatMult)
add: hp = round(bossHp*0.025), atk = round(bossAtk*0.2)
MYTHIC bossHp additionally x max(1, 2.5*(partyProxy/1.39e8)^0.75)   [SERVER]
partyProxy = max over members of atk*aspd*(1+crit%*(critDmg-1))*(1+doubleHit%)*resonance
```
Glyph drops (levels interpolated from anchors), dust ranges `avg = baseAvg + max(0,L-ref)*perLevel` (Normal 1.5/0.5 at 40; Hard 5/0.5; Mythic 45/1.55 at ref 1). Season rewards ranks capped at 50. Mythic resonance: player attacks and sigil spells scale with own **Oblivion Power** (display `+round(coef*sqrt(power)*100)%` = +200 % at 100, +400 % at 400); tank Oblivion Power raises Block Fury. **[CODE]**
`celestialCommittedScalingLevel(OL) = round(intercept + perOblivionLevel*max(1,OL))`; NORMAL 78.7 + 0.324*OL, HARD 81.5 + 0.262*OL (table in source JSON). Which level the server uses for the party is **[UNRESOLVED]**.

---

## §7 World Boss

Summary of `gamedata/world_boss.json`. Unlock 30. **[CODE]** Tokens 3/day (reset hour 0), fight 60000 ms, tick 100 ms, one boss Elder Dragon HP 2.0e10 (damage race, no client scaling). Season = 3 days open / 3 days closed: `sessionYear = floor((now - anchor)/259200000)`, active when even; anchor 2026-01-21T00:00Z. Affinity per season cycle is a chained no-repeat walk over NONE / FORTIFIED / ENRAGED: `idx(0) = hashInt(0) % 3`, `idx(c) = (idx(c-1) + 1 + hashInt(c) % 2) % 3`, with cycle 40 forced to ENRAGED and the override feeding the next cycle (L1152886-1152985; `hashInt` steps and rule in `data/world-boss.json` `affinityCycle`). The anchor is `Date.UTC(2026, 0, 21)` (L667970-667981); a second config block that reuses `SESSION_ANCHOR_MS` with TOKENS_PER_DAY 5, TICK_INTERVAL_MS 10 and FIGHT_RANGE 3 is not the World Boss config.
Affinities: FORTIFIED blockChance 80, spellResist 30, penetration pierces spell resist; ENRAGED lethal, hit = 18 % of max HP, avoided rebound 28 %, frenzy after 20 s, ramps 0.03 dmg/s and 0.08 aspd/s, aspd cap 6, fight up to 300000 ms. NONE is plain. Rewards by leaderboard position tiers (e.g. 1st: 60 honors, 200 gems, 1500 energy), bracket 200 players, participation <10 gives `max(1,floor(v*0.2))` for every reward value above 0 (L1153330-1153392). Achievements 3m/6m/15m season damage give 20 gems each. **[CODE]**
All hit/block/ramp math is **[SERVER]**; player stats are not sent with the fight (server uses its own copy). The app's 60 s Monte Carlo (`simulation.js`) matches the 60 s duration but models a target dummy.

---

## §8 Arcane Quarry

**[CODE]** Unlock level 39 (`ARCANE_QUARRY`), 3 Mining Charges per day (`maxCharges: 3`, intro text L668805; UI says charges reset daily at 1:00 AM local, `quarry.info`), skill **Deep Mining** (`miningCharges`, maxLevel 4, "daily charges", unlock `SKILL_MINING_CHARGES` 42). Two essence types: **Tempering** (raises item quality) and **Attunement** (raises enchant-stone quality). Spending them is done in Character → Enchant → Armory and "permanently boosts the item's stats"; essences can be exchanged 1:`count` in either direction (exchange dialog L910054).
Ore layout, essence yields per vein and the quality-to-stat mapping are **[SERVER]** (client slice L1164381 stores `revealedTiles`, `savedOreLayout`, no yield tables). Quality maths see `gear.md` / `stones.md`.

---

## §9 Oblivion prestige (OBLIVION_PRESTIGE, module 3146)

Constants **[CODE]** L669119: ENABLED true; ACTIVATION_OPENS_AT_MS 1787756400000 (2026-08-27T15:00Z, **[DERIVED]** ms to date); ADMIN_PREVIEW true; COMMIT_ENABLED true; COMMIT_MIN_LEVEL 15 (Oblivion Level required to leave); **UNLOCK_LEVEL 95**; REQUIRE_FULL_OBLIVION_SET true; WINDOW_DAYS 21; SOFT_WINDOW_XP_MULT 0.5; ENERGY_CARRY_CAP 20000; ENERGY_CARRY_BONUS_PER_LEVEL 6000; COMMIT_CONFIRM_SECONDS 10; MAX_ITEM_LEVEL 200; ASCENSION_MAX_ITEM_LEVELS `[200,260,320,380,480]`; ITEM_LEVEL_SCALE 0.5; POWER_MULT_ATTACK 2.75; POWER_MULT_HP 2.8; START_RARITY Mythic; DARK_CONDUIT_MIN_RARITY Divine; NEW_SLOT_COUNT 3.

**Unlock/enter** (`isOblivionPrestigeUnlocked(level, enabled) = enabled && level >= 95`; entry also requires "Oblivion gear in every slot" when `REQUIRE_FULL_OBLIVION_SET`, error `FULL_SET_REQUIRED`; requirements UI shows `levelOk`, `oblivionSetOwned/Needed`). **[CODE]** L668987+, L1170027. The error code list: COMMIT_LEVEL_TOO_LOW, COMMIT_IN_PARTY, PRESTIGE_DISABLED, PRESTIGE_LOCKED, FULL_SET_REQUIRED, ALREADY_COMMITTED, ALREADY_ACTIVATED, NO_OBLIVION_CHARACTER, COMMIT_DISABLED (L909435 block).

**What carries / resets (UI text, L668850 and L909435) [CODE]:**
- You get a **second hero** ("Oblivion hero"); the base hero is untouched and you switch realms freely (`selectActiveRealm`, `beginRealmSwitch`).
- Carried in: level, talents, awakening, transcendence, pets, sigils, relics, currencies, clan; Energy up to the cap: `kept = min(energy, 20000)`, `bonus = 6000 * max(0, floor(baseLevel) - 95)`, `carried = kept + bonus` (`getOblivionEnergyCarry`, `getOblivionEnergyBonusLevels` L2113640+). "That progress (base levels past 95) does not carry into the rift, so part of it comes back as Energy."
- Starts empty: no gear, new enchant sockets, separate loot filter and **presets are base realm only** (single loadout in the rift). Drops start at Mythic and climb on the Oblivion scale; Oblivion has its own drop table (§10).
- **3 new equipment slots** exist only in the rift ("twelve slots" total in the left-state text).
- **Leaving** (commit, permanent, requires Oblivion Level >= 15, not in a crusade party, 10 s confirm): the Oblivion hero becomes the only hero; base gear in BOTH equipment sets, base enchant stones (socketed or stored) and the base loot bag are **destroyed**. Kept: all equipped rift slots, rift enchant stones, Oblivion Level; level, talents, sigils, pets, currencies, clan untouched. Afterwards "Rift drop rates follow you", Oblivion Dungeon/keys/stones stay open.
- **XP window:** full XP for 21 days from entry, then x0.5 (`getOblivionXpPenaltyPct = round((1-0.5)*100)` = 50 %). Clock runs regardless of play. **[CODE]**
- **Item scale in the rift** (`statLevelForItem`, `attackForItem`, `hpForItem` L677330+): `statLevel = isOblivion ? itemLevel * 0.5 : itemLevel`; `attack = floor((atkBase + atkScale*f(statLevel)) * 2.75)`, `hp = floor((hpBase + hpScale*f(statLevel)) * 2.8)` where `f` is the base-game item-level curve (see `gear.md`). Max item level 200 base, ascension caps `[200,260,320,380,480]` (base game: 100/130/160/190/240 per skill text L668850). **[CODE]**, the combined effect on final stats is **[DERIVED]**: the rift multiplies item attack/HP by 2.75/2.8 on top of the halved level scale.

**Permanent power from Oblivion:** Oblivion Level (§10), Oblivion Power (§11), the 3 extra slots, Oblivion-rarity gear and Oblivion Stones.

---

## §10 Oblivion Level, XP and drop table

**[CODE]** module 4212 (L1189711-1190344). Max level 100 (`OBLIVION_MAX_LEVEL`).
```
unlockLevel(rarity) = max(1, round(frac[rarity]*100));  frac: MYTHIC 0 [DERIVED], ANCIENT .10, DIVINE .25, ETERNAL .55, OBLIVION .85
ramp(L) = 1                                   L < 25
        = 1 + 0.06*(L-25)                      25 <= L < 55
        = 2.8 + 0.18*(L-55)                    55 <= L < 85
        = 8.2 + 0.5*(L-85)                     L >= 85
xpToReach(L) = floor(85000 * L^1 * ramp(L))    for 2 <= L <= 100   (xp to go from L-1 to L)
oblivionLevelFromXp: advance while cumulative + xpToReach(level+1) <= totalXp
xpReward(hunt, L) = max(1, floor(200 + 8*L + floor(rand*20) - 10))        (param meaning L: [UNRESOLVED])
mobLevel(OL) = round(40 + (min(OL,100)-1)/99 * (100-40))
```
Total XP to Oblivion Level 100 = 2,736,166,987 **[DERIVED]** (sum of table; xp cost of level 100 = 133,450,000).

Drop weights (percent-style weights, `getOblivionDropRates`): per rarity `u = unlockLevel`; if OL<u weight 0; else `t = min(1,(OL-u)/max(1,100-u))`, `w = round(1000*(unlockW + (capW-unlockW)*t^shape))/1000`. Constants (unlock, cap, shape): MYTHIC (10, 15, 0.5); ANCIENT (0.3, 12, 1.2); DIVINE (0.1, 4, 1.4); ETERNAL (0.03, 1.25, 1.6); OBLIVION (0.01, 0.9, 1.8). `getOblivionMaxDropRarity` = highest rarity with weight > 0 (default Mythic). Total weight capped at 100, "most rolls yield nothing" (Fortune decides whether a mob rolls at all). Full 100-level table in `data/pve-content.json`. Oblivion-rarity first drops at OL 85 [DERIVED].

---

## §11 Oblivion Power, Oblivion Dungeon and Oblivion Stones

**Oblivion Power** is a secondary stat (`SecondaryStatType.OBLIVION_POWER`) rolled on Oblivion enchant stones: `oblivionPowerForQuality(q) = round(8 + (q-1)/99 * (30-8))`, q clamped 1..100 (module 4279, L1205217+), i.e. 8 at quality 1 to 30 at quality 100. Other enchant ranges there (min..max): PVP_ATTACK 5-25, PVP_DEFENSE 5-20, CRIT_CHANCE 0.5-2.5, CRIT_DAMAGE 0.05-0.16, ATTACK_SPEED 0.01-0.1, DOUBLE_HIT 0.5-4, LIFESTEAL 0.5-4, PENETRATION 0.5-3, SPELL_DAMAGE 1.2-10, ... (the stone details belong to `stones.md`). **[CODE]**
Where Oblivion Power does work: (a) the Oblivion Dungeon strain gap below, (b) Celestial Mythic resonance (§6). Power in normal combat is **[UNRESOLVED]** (not found as a damage multiplier outside those).

**Oblivion Dungeon** [CODE] (config L1706694; module with `getFloorInstability` L1706365): keys INITIAL 3, +1/day (reset hour from DUNGEON_CONSTANTS), key cost 1 per floor, no key loss on defeat; sweep = instant payout for one key. Floor window: below 3 / above 6 around the deepest floor.
```
mobHp(f)  = round(20,000,000 * 1.13^(f-1))     mobAtk(f) = round(34,000 * 1.06^(f-1))
aspd 1, block 20, penetration 12
n = f - 3 (free floors 3);  instability(f) = n<=0 ? 0 : round(34 + 21*(n-1) + 0.5*(n-1)*n/2)
effective = max(0, round(instability) - round(oblivionPower))      ("Net strain")
bite(x, half) = 100 * x/(x+half)      (half 12 -> outgoing healing -, regen half 6)
playerDamageMult = max(0, 1 - 0.97 * x/(x+6))           (x = effective instability)
true damage per 500 ms pulse = min(12 %, 0.06 % * effective)  ; ramps +0.04/s up to x2.5
```
So Oblivion Power directly cancels dungeon instability point for point. Floor 10 needs 171 power, floor 30 needs 756 (**[DERIVED]**, table in JSON). The client rounds with JS `Math.round` (L1706367-1706415), which rounds an exact x.5 up; the sum is exactly x.5 on floors 9, 10, 17, 18, 25, 26, 33, 34, 41, 42, 49, 50, 57 and 58, so those are one higher than a round-half-even table. Mobs: Shatterhorn Behemoth (f1+), Fractured Sovereign (f11+), Abyssal Reality Eater (f31+). Drops: Mythic Stone (base 13 %, +1 %/floor to floor 6, then +2.5 %, cap 60 %), Oblivion Stone (15 %, +0.5 %/floor to floor 9, then +2 %, cap 50 %; first clear of floors <= 8 guaranteed), Oblivion Essence from floor 9 (2 + 0.25/floor); stone level shares unlock at floors 6/17/26/36 (levels 2-5). Max one Oblivion Stone per run. **[CODE]** Fight resolution **[SERVER]**.
Oblivion stone levels/grades (`OBLIVION_STONE_*`, module 4282) and `getOblivionPowerGradeMult = POWER_GRADE_MULT^(grade-1)` see `stones.md`.

---

## §12 Data file schema

`data/pve-content.json`: `source`; `oblivionXpCurve.table[{toLevel,xpCost,cumulative}]`; `oblivionDropWeights.byOblivionLevel[{oblivionLevel,MYTHIC,ANCIENT,DIVINE,ETERNAL,OBLIVION,mobLevel}]`; `oblivionDungeonFloors.floors[{floor,mobHp,mobAttack,instability}]` (1-60); `classicDungeons.dungeons[{id,name,stepMultipliers[8],stepCoins[8],mobRoster[{name,baseHp,baseAtk,baseSpd}]}]`; `progressChapters[{chapter,displayChapter,difficulty,name,level1Mobs,level10Mobs}]`.

## §13 Verification note

Spot-checked line citations: `getMythicPlusEnchantWeights` L1701588, `getMythicPlusBossMultiplier` L1701902, `getCrusadePowerRequirement` L1701736, `getGlobalSessionYear` L667575, `applyWorldBossParticipationScaling` L1153327, `getCelestialBossStats` L1156882 all land on the named functions.
