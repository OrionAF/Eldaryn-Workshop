# Clans, Fortress and Village Raids

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

Citations are `decompiled.js L<n>`. Static tables live in `data/clan-fortress.json` (schema in §9). Provenance tags: **[CODE]**, **[DERIVED]**, **[SERVER]**, **[UNRESOLVED]**.

## Overview

For a gear optimiser the only stat-bearing clan system is **Fortress ownership**. A clan that owns a fortress gives every member a fixed block of combat stats, plus non-combat income bonuses. Nothing else in the client gives clans a stat bonus: clan rank (§6), Clan Wars (§7), the War Pact skill (§8) and Village Raids (§5) produce rewards or discounts, not character stats. [UNRESOLVED] I searched for `clanBuff`, `clanBonus`, `clanLevel` and `clanPerk` and found only the fortress "Clan Buffs" guide text (L910368-910372) and a UI category key (L1564039). A server-side clan perk would not be visible in the client.

Class matters. The BOTTOM buff's Damage Reduction and Block are remapped per class (§2.2).

Stat integration is owned by `stats.md`. This file covers only what the fortress contributes.

## §1 Fortress structure and schedule

### §1.1 Fortresses
There are 5 fortresses in 3 groups. [CODE] L1223973-1224023.

| id | name | group |
|---|---|---|
| TOP_1 | Frost Citadel | TOP |
| TOP_2 | Flame Citadel | TOP |
| BOTTOM_1 | Shadow Bastion | BOTTOM |
| BOTTOM_2 | Storm Keep | BOTTOM |
| CORE | Abyssal Core | CORE |

Bosses (L1224030-1224048, `FORTRESS_BOSS_DEFINITIONS`; the group keys are lost by the decompiler and the order is taken from the boss names): [CODE]
- TOP, "Fortress Guardian": baseHp 2.0e10, attack 500, attackSpeed 1.
- BOTTOM, "Fortress Warden": baseHp 2.0e10, attack 500, attackSpeed 1.
- CORE, "Core Overlord": baseHp 2.7e10, attack 800, attackSpeed 1.2.

### §1.2 Unlock
- Player level 22 (`REQUIRED_PLAYER_LEVEL`, L1223934) and clan membership (guide L910298, "Level 22 in the Clash tab. Requires clan membership", L911488). [CODE]
- Sieges begin once the server has been live for 7 days. `getFortressUnlockAt(server) = server.openedAt + features.fortressUnlockDelayMs`, with `fortressUnlockDelayMs = 604800000` (L1044010-1044024, L1045822). [CODE]

### §1.3 Weekly schedule
```
WEEK_ANCHOR_MS = Date.UTC(2026, 2, 9)            # Mon 2026-03-09 00:00 UTC  (L1223937-1223945)
dayIdx = floor((now - WEEK_ANCHOR_MS) / 86400000) mod 7     # L1222949-1222982
SIEGE_SCHEDULE = {0:TOP, 1:off, 2:BOTTOM, 3:TOP, 4:off, 5:BOTTOM, 6:CORE}   # L1224094-1224111
```
This gives Mon TOP, Tue off, Wed BOTTOM, Thu TOP, Fri off, Sat BOTTOM, Sun CORE. [CODE] It matches the guide text (L910304). Both fortresses of a group are sieged together.

Phases, measured from 00:00 UTC of the siege day (`getCurrentSiegePhase`, L1223051-1223109): [CODE]
- PREPARATION: 0 to 43,200,000 ms (12 h).
- ACTIVE: next 39,600,000 ms (11 h).
- ENDED: the rest of the day.
- IDLE: off days.

The guide labels these 01:00-13:00 CET and 13:00-00:00 CET (L910310). Those are the same windows in CET and are not separate constants. [DERIVED]

### §1.4 Tokens and boss fight
- 3 siege tokens/day (`SIEGE_TOKENS_PER_DAY`), reset hour 0. Each attack, on a defender or the boss, costs 1 token (L1223934, L910316). [CODE]
- Boss fight lasts 60,000 ms (`BOSS_FIGHT_DURATION_MS`). [CODE]
- Fights are simulated server-side. [SERVER] The client only plays back ticks; `BOSS_TICK_INTERVAL_MS` is 10.

## §2 Fortress buffs (the stat contribution)

### §2.1 Catalogue
`FORTRESS_BUFFS[group].combat` (L1224050-1224075). Values are percentage points, except attackSpeed and pvp*, which the UI formats without a `%` (L1223419-1223426). [CODE]

| group | attackPercent | healthPercent | attackSpeed | critChance | penetration | hpRegen | damageReduction | blockChance | pvpAttack | pvpDefense |
|---|---|---|---|---|---|---|---|---|---|---|
| TOP | 5 | - | 0.03 | 3 | 3 | - | - | - | 15 | - |
| BOTTOM | - | 5 | - | - | - | 3 | 5 | 3 | - | 15 |
| CORE | - | - | - | - | - | - | - | - | 25 | 25 |

Non-combat (`.nonCombat`), per owned group: [CODE]

| group | xpIncomePercent | bonusCrusadeSeals (/day) | bonusRaidKeys (/day) |
|---|---|---|---|
| TOP | 5 | 1 | 0 |
| BOTTOM | 5 | 1 | 0 |
| CORE | 10 | 1 | 1 |

The in-game text confirms these (L910370):
- TOP: "+5% Attack, +0.03 Atk Speed, +3% Crit, +3% Penetration, +15 PvP Attack".
- BOTTOM: "+5% Health, +3% HP Regen, +5% Dmg Reduction, +3% Block, +15 PvP Defense".
- CORE: "+25 PvP Attack, +25 PvP Defense, +10% XP, +1 Crusade Seal/day, +1 Raid Key/day".

### §2.2 Class remap
`getFortressBuffCombatForClass(combat, playerClass)` (L1222835-1222947). It runs before summing. For each source key the value is added to the destination key and the source key is deleted, but only when the source value is present and non-zero (L1222918-1222921); a zero source key is left in place. [CODE]

| class | damageReduction goes to | blockChance goes to |
|---|---|---|
| WARRIOR (and any class not listed) | unchanged | unchanged |
| SENTINEL | missChance | blindChance |
| MYSTIC | lifesteal | hpRegen |
| NECROMANCER | healthPercent | hpRegen |

There are only 4 `PlayerClass` values: WARRIOR, SENTINEL, MYSTIC, NECROMANCER (L1533963-1533975). [CODE]

Resulting BOTTOM stat block per class (adding to the base BOTTOM values) [DERIVED from §2.1 and this table]:
- Warrior: healthPercent 5, hpRegen 3, DR 5, block 3, pvpDef 15.
- Sentinel: healthPercent 5, hpRegen 3, miss 5, blind 3, pvpDef 15.
- Mystic: healthPercent 5, hpRegen 3+3=6, lifesteal 5, pvpDef 15.
- Necromancer: healthPercent 5+5=10, hpRegen 6, pvpDef 15.

The guide text only mentions the Sentinel case (L910370). The Mystic and Necromancer remaps exist in code only. A second, equivalent post-sum function `remapFortressBonusesForClass` (L1222568-1222660) does the same swap on a summed bonus object. [CODE]

### §2.3 Aggregation
`calculateFortressBonuses(ownedFortressIds, playerClass = WARRIOR)` (L1222325-1222567): [CODE]
```
sum = {attackPercent, hpPercent, attackSpeed, damageReduction, critChance, critDamage,
       hpRegen, lifesteal, blockChance, missChance, blindChance, penetration, pvpAttack, pvpDefense} = 0
seenGroups = {}
for id in ownedFortressIds:
    def = FORTRESS_DEFINITIONS.find(id); if !def: continue
    if def.group in seenGroups: continue          # each group counts once
    seenGroups.add(def.group)
    c = getFortressBuffCombatForClass(FORTRESS_BUFFS[def.group].combat, playerClass)
    sum.attackPercent += c.attackPercent ?? 0
    sum.hpPercent     += c.healthPercent ?? 0     # healthPercent is renamed to hpPercent
    ... every other field added the same way (attackSpeed, DR, crit, critDamage, hpRegen,
        lifesteal, block, miss, blind, penetration, pvpAttack, pvpDefense)
```
- Owning both TOP fortresses does not double the buff, because buffs are per group and deduplicated.
- An empty owned list returns all zeros.

`calculateFortressNonCombatBonuses(ownedIds, fortressStars)` (L1222661-1222805): [CODE]
```
for id in ownedIds:
    if fortressStars: xpIncomePercent += calculateStarXpBonusPercent(fortressStars[id] ?? 0)   # per fortress
    if group already counted: continue
    xpIncomePercent += nonCombat.xpIncomePercent; bonusCrusadeSeals += ...; bonusRaidKeys += ...  # once per group
```

### §2.4 How the sum enters the character
`calculateTotalStats` takes the fortress bonus object as its 9th argument (a8, L1215745). It is added additively into the same accumulators as every other source (L1216758-1216799): [CODE]
```
attackPercent += f.attackPercent        hpPercent += f.hpPercent
attackSpeed   += f.attackSpeed          damageReduction += f.damageReduction
critChance    += f.critChance           critDamage += f.critDamage
hpRegen       += f.hpRegen              lifesteal += f.lifesteal
blockChance   += f.blockChance          missChance += f.missChance
blindChance   += f.blindChance          penetration += f.penetration
pvpAttack(accum) += f.pvpAttack         pvpDefense(accum) += f.pvpDefense
```
The caller is the stats screen (L1209922-1209924), which passes the owned-fortress list and the player class.

`attackSpeed` is added as stored: the accumulator starts from `base.attackSpeed` plus equipment ATTACK_SPEED rolls, so +0.03 is an absolute add on that scale **[CODE]** (see `stats.md` §3.2, L1216476-1216513). **[UNRESOLVED]** whether the stat page displays the sum as ×100.

### §2.5 Stars (non-combat benefit, boss debuff)
`FORTRESS_STARS` (L1223969-1223972): [CODE]
- default 1, max 5, `XP_PER_STAR` 4, `DMG_AMP_PERCENT_BY_STARS = [0,0,50,200,500,1000]`, and +500 per star beyond the table.

Rules from the guide (L910340): [CODE as text, enforcement is server-side]
- TOP and BOTTOM gain a star on capture (1★) and +1 for each siege day successfully defended. Stars reset to 1 when the fortress changes hands. CORE never has stars.
- Each star gives +4% XP income for the whole clan, on top of the 5% base (1★ = 9%, 2★ = 13%).
- Each star also makes the boss take more damage.

Formulas (module 4305): [CODE]
```
calculateStarXpBonusPercent(stars) = max(0, floor(stars)) * 4                     # L1224454-1224469
calculateStarVulnerabilityMultiplier(stars) =
    1 + (stars < 6 ? AMP[stars] : AMP[5] + (stars-5)*500) / 100                   # L1224396-1224436
```
Example: 4★ gives 1 + 500/100 = 6.0×. 2★ gives 1.5×.

## §3 Capturing, siege resolution and rewards

### §3.1 Damage pipeline (module 4305)
```
shield% = calculateBossShield(aliveDefenders, startingDefenders, maxClanSize)
    if startingDefenders <= 0 or maxClanSize <= 0: 0
    ratio = min(1, max(0, aliveDefenders) / maxClanSize)
    piecewise-linear interpolation of BOSS_SHIELD.CONTROL_POINTS over ratio     # L1224322-1224392
shieldToMultiplier(s)       = max(0, 1 - s/100)                                 # L1224162
calculateContributionBonus(kills) = min(2, 1 + 0.05*kills)                      # L1224176, CONTRIBUTION_BONUS
effectiveDamage = round(raw * shieldMult * contributionBonus * max(0, fatigue)) # fatigue default 1, L1224471-1224509
```
CONTROL_POINTS (ratio → shield%): 1→60, 0.8→50, 0.6→40, 0.5→30, 0.4→20, 0.2→10, 0.1→0, 0→0. `MAX_SHIELD_PERCENT` is 60 (L1223949-1223967). [CODE]

The argument order of `calculateBossShield` (`a0` alive, `a1` guard, `a2` divisor) is read from the bytecode. I assumed `a1` is the starting defender count. [DERIVED]

The guide says the divisor is the server's max clan size (L910334). `getClanMaxMembers` returns `maxMembersDefault` 50, or `maxMembersOverrides[serverId]` (5:30, 6-10:18, 99:20) (L1045076-1045092, L1045703-1045706). [CODE]

The guide's "Siege Fatigue" is the star vulnerability multiplier (UI string `fatigueValue: '+{{pct}}% DMG'`, L910292). `starVulnerabilityToPercent(m) = round((max(1,m)-1)*100)`. [CODE]

### §3.2 Winner and thresholds
```
determineSiegeWinner(clans) = clan with max totalEffectiveDamage, or null if that total <= 0      # L1224511-1224547
isConquestThresholdMet(damage, ownerDamageAtCapture, mult) = ownerDamage <= 0 ? true : damage >= ownerDamage*mult   # L1224549-1224565
getConquestThresholdMultiplier(group) = group == CORE ? 2 : 3                                     # L1223263-1223280
```
- A neutral fortress goes to the top-damage clan with no minimum.
- An owned TOP or BOTTOM fortress needs 3× the damage the owner dealt when it captured the fortress. Otherwise the owner keeps it and gains a star.
- CORE always goes to the top clan. Its 2× "defense threshold" decides the defender payout instead.

Other rules are the guide text (L910346-910366); enforcement is server-side. [SERVER] Further sub-rules:
- A clan can hold only one TOP/BOTTOM fortress at a time. CORE does not count toward that limit.
- "Can't claim" clans fight for rewards only.
- Trade-up and cascade rules apply between sibling fortresses.

### §3.3 Rewards
Attack tiers (damage rank among clans; `FORTRESS_CONTRIBUTION_TIERS`, L1224115-1224137): [CODE]

| rank | honors | influence | medals | energy | gems |
|---|---|---|---|---|---|
| 1 | 40 | 800 | 3 gold | 800 | 70 |
| 2-3 | 30 | 700 | 2 gold | 700 | 60 |
| 4-10 | 20 | 500 | 2 silver | 500 | 50 |
| 11-20 | 10 | 400 | 1 silver | 350 | 30 |
| 21+ | 5 | 200 | 1 silver | 200 | 15 |

- Defense reward (`FORTRESS_DEFENSE_REWARDS`, L1224139): gems 50, honors 30, influence 700, 2 gold medals, energy 700. [CODE]
- Core defense: every numeric field ×2 (`WIN_MULTIPLIER` 2) and gems +0 (`WIN_BONUS_GEMS` 0) when attackers stay below the 2× threshold (`buildCoreDefenseReward`, L1223783-1223848). [CODE]
- Reward scale by number of clans on the server (L1224141-1224152): ≥10 → 1.0, ≥7 → 0.8, ≥5 → 0.6, ≥3 → 0.4, ≥1 → 0.2. Numeric rewards are `ceil(value*scale)` and untouched at scale ≥ 1 (`scaleContributionRewards`, L1223152-1223220). [CODE]
- Medal tier from how long the clan has held the fortress (L1224204-1224321): [CODE]
  - `since <= 0` gives gold.
  - Otherwise `days = (now - since)/86400000`: ≥28 gold, ≥14 silver, else bronze.
  - Silver collapses gold into silver. Bronze collapses all medals into bronze.

None of these rewards affect stats. See `drops.md` and `gear.md` for what honors, medals and influence buy.

## §4 Clans

- Roles: MEMBER, OFFICER, LEADER. Join policy: OPEN, CLOSED. Log kinds: JOIN, LEAVE, KICK, PROMOTE, DEMOTE, TRANSFER, COUP, SETTINGS, REQUEST. Election reasons: LEADER_INACTIVE, NO_ACTIVE_OFFICERS (module 3141, L666176-666215). [CODE]
- Max members: default 50, with per-server overrides (see §3.1). [CODE]
- Clan ranks from War Power (module 3142, L666548-666578): [CODE]

| rank | requiredWarPower |
|---|---|
| Warband | 0 |
| Legion | 4,500 |
| Dominion | 36,000 |
| Imperium | 112,000 |
| Sovereignty | 246,000 |

`getRankForWarPower` takes the highest rank whose threshold is ≤ power. [CODE]

- Clan seasons: 7 days, anchored at `Date.UTC(2026, 1, 26, 12, 0, 0)` = 2026-02-26 12:00 UTC (L666507-666519). [CODE]
- How War Power is computed (the formula) is not in the client. [SERVER]/[UNRESOLVED] Checked: module 3142 only consumes it, and `WAR_POWER_TRANSFER` (§7) is only a ratio table.

## §5 Village Raids

`village_raids.json` was spot-checked against the code and is correct for:
- `RAID_CONSTANTS`;
- the raid_1 and raid_2 step multipliers, rotation K and influence arrays;
- the raid_2 first-step HP: 5500 × 4.8 = 26,400;
- the raid_3 to raid_5 influence arrays and rotation K.

The full per-step table is in `data/clan-fortress.json` under `raids`. [CODE] L1064594-1065400.

- Constants (L1064866): 2 keys/day, reset hour 0, tick interval 10 ms, prepared-fight TTL 600,000 ms, fast-pass cooldown 600,000 ms. [CODE]
- Unlock: `UNLOCK_LEVELS.RAID_1` = 10 for all five raids (`requiredPlayerLevel`, L1065044 etc., value in `village_raids.json`). [CODE]
- Raids: raid_1 Bandit Village, raid_2 Fortified Stronghold, raid_3 Royal Garrison, raid_4 Shadow Enclave, raid_5 Obsidian Citadel. Each has 8 steps. [CODE]
- Mob scaling: `hp = round(baseHp * stepMult[step-1])`, `attack = round(baseAtk * stepMult[step-1])`, `attackSpeed = baseSpd` (L1064597-1064623). Roster of 6 per raid, 5 mobs per step. [CODE]
  - Steps 1-7 use mob indices `(i*k + j) mod 5`, with `i = step-1`, `j = 0..4`, and `k` = 3 for raids 1, 3 and 5 and 2 for raids 2 and 4.
  - Step 8 uses roster indices [1..5], so the boss (index 5) always appears on step 8. [CODE]
  - Verified against the client: roster index rule and step 8 in `buildBanditVillageSteps` (L1064959-1065047, the other four builders at L1065048, L1065136, L1065224, L1065312 are the same code with k = 2/3), `makeRaidMob` (L1064597-1064623, a missing multiplier defaults to 1). Step multiplier arrays: L1064868 (raid_1), L1064886, L1064904, L1064922, L1064940, stored as `stepMultipliers` in the JSON. The app builds the mobs in `engine/pve/enemies.js` `raidMobs`. [CODE]
- Step multipliers: raid_1 [1.8..3.9], raid_2 [4.8..14], raid_3 [1..9], raid_4 [1.2..11], raid_5 [1..11.5]. Exact arrays are in the JSON. [CODE]
- Influence per step: raid_1 [15,20,28,36,45,60,85,95], raid_2 [100..135], raid_3 [140..280], raid_4 [300..640], raid_5 [680..1500]. [CODE]
- Access: `isRaidAccessible(i, progress, level)` = `level >= required && (i == 0 || progress[prev.id] >= 8)`. [CODE]
- Sweeping a cleared step costs 1 key (`resolveRaidSweepTarget`, L1064717). [CODE]
- Village camp bonus: ×1.1 influence display at a "village" settlement on the world map (`village_raids.json` worldMapCampBonus). [CODE]
- Fast pass: 3 charges premium, 1 non-premium; reset gem costs are in `village_raids.json`. [CODE]
- The fight is simulated on the server (`fight-prepare` returns ticks). Player damage, mob defense and crit are not in the client. [SERVER]
- Raids give no stats. They give influence (which feeds arena rank, `drops.md`/`pve-content.md`) and WP (§7). The fortress CORE buff adds +1 raid key/day (§2.1).

## §6 Cross-system notes for the optimiser
- Fortress stats are additive percent and flat bonuses applied after the class remap. Stat definitions are owned by `stats.md`.
- A character has at most one TOP-or-BOTTOM group buff, plus optionally CORE. A clan can own only one TOP/BOTTOM fortress, while CORE is independent (§3.2).
- Because of the remap (§2.2), a Mystic or Necromancer never sees DR or Block from the fortress. They see lifesteal, hpRegen and, for Necromancer, extra health%.

## §7 Clan Wars

Wars run every 3-day arena session (L911455). Two clans are paired by `warPower`. [CODE guide text]

- Minimum members for a clan to enter: `CLAN_WAR_MIN_MEMBERS` = 8 in code (L1063260), but the in-game text says "at least 2 members" (L911456). [UNRESOLVED] The two disagree and the client may not enforce either.
- Rematch avoidance covers 2 sessions (`CLAN_WAR_REMATCH_AVOID_SESSIONS`). A clan with no opponent faces a "BYE" clan (L1063261-1063263). [CODE]
- PvP tokens: 3/day, reset hour 0. Win = 30 WP and loss = 0 (`CLAN_WAR_PVP`, L1063264). [CODE]
- War point rates (`WAR_POINT_RATES`, L1063267-1063306), where `wp = floor(amount_used / per) * amount`: [CODE]

| activity | WP |
|---|---|
| Influence | 1 per 10 |
| Honor | 1 per 1 |
| Dungeon key | 7 each |
| Crusade key | 5 each |
| Energy (stamina) | 1 per 100 |
| Pet hatch | 2 each |
| PvP win | 30 each |
| World Boss attack | 5 each |
| Fortress attack | 5 each |
| Fortress defense | 30 if defended, 15 if lost (`FORTRESS_DEFENSE_WP`, L1063308) |

- Remainders carry over (`calculateWarPointsWithRemainder`, L1063139-1063168). [CODE]
- Double-reward days (`DOUBLE_REWARD_SCHEDULE`, ×2, L1063359-1063381): session day 1 doubles Dungeon Key and Crusade Key, day 2 doubles Pet Hatch and Influence, day 3 doubles Energy. [CODE]
- `WAR_POWER_TRANSFER`: winner ratio 1, loser ratio 0.75 (L1063310). The meaning is not shown in the client. [UNRESOLVED]
- Session rewards by clan rank (win/loss) are in `data/clan-fortress.json` (`clanWarSessionRewards`). They are energy, honors, gems, crusade keys, influence and medals, not stats. [CODE] L1063312-1063358.
- Final battle (module 5540, L1533914-1534132). [CODE]
  - 3 rows × 2 slots = 6 per squad, with squads = max(1, ceil(maxMembers/6)).
  - Duel duration 120,000 ms.
  - Clan-battle PvP HP multiplier 36 and PvP shield base multiplier 2 (`CLAN_BATTLE_PVP_HP_MULTIPLIER` is 36 and shield base is 2 in the config object).
  - Final-battle bonus WP = `floor(wp * 10 / 100)`.
  - Held at 18:00 Europe/Prague on session day 3. Officer placement day is 2. Squad name max is 16 characters.
  - Roles come from spec: Warrior Tank, Dps, Sentinel Marksmanship, etc. mapped to MELEE or RANGED.
  - Duel resolution and any stat changes are done on the server. [SERVER]

PvP stats (`pvpAttack`/`pvpDefense`) from the fortress apply to these duels. The combat formula is owned by `combat-pvp.md`.

## §8 War Pact
War Pact is a **skill**, not a clan feature. `crusadeDiscount` ("War Pact", category merchant, max level 6, effect "% crusade discount") reduces the honor cost of entering Crusades. At max level Crusades are free. Unlocks at player level 46 (L885945, L1961997). [CODE] The per-level discount values are in `skills.md`. They give no character stats.

## §9 Data file schema
`data/clan-fortress.json` (camelCase). The `source` field carries the line citations.
- `fortressConstants` (includes `bossFightDurationMs`, `bossTickIntervalMs` 10 at L1223934 and `maxMembersDefault` 50 at L1045076), `fortresses[]`, `bosses{group}`, `buffs{group:{combat,nonCombat}}`, `classRemap{class:{from:to}}`
- `bossShieldControlPoints[]`, `stars`, `contributionBonus`
- `attackRewardTiers[]`, `defenseReward`, `coreDefenseWinMultiplier`, `rewardScaleByClanCount[]`
- `clanRanks[]`, `warPointRates[]`, `doubleRewardSchedule`, `clanWarSessionRewards[]`
- `raidConstants`, `raids[]`: each has `{id, name, requiredPlayerLevel, source, stepMultipliers[], roster[], steps[{stepNumber, influenceReward, mobIds[], mobHp[], mobAttack[]}]}`

## §10 App comparison
The app models Fortress Buffs as three checkboxes with fixed stat blocks (`src/lib/totals.js` `FORTRESS_BUFF_STATS`, `fortressBuffsContribution`). The Optimiser also has a `fortressBoss` target (`src/lib/engine/pve/fortressBoss.js`; contract in simulation.md §Fortress boss): the 60 s boss race, with the §3.1 shield, contribution bonus and §2.5 star multipliers shown as the clan's credited damage. Nothing else from this system is modelled.

Disagreements:
1. **BOTTOM class remap is missing, and miss/blind are double counted.** The app BOTTOM block gives `dmg_reduction 5 + miss_chance 5` and `block_chance 3 + blind_chance 3` at once. The game gives each class only one set (§2.2). Warrior gets DR and block, Sentinel gets miss and blind, Mystic gets lifesteal 5 and hpRegen +3, and Necromancer gets health% +5 and hpRegen +3.
2. **TOP `speed: 3`.** The game value is `attackSpeed 0.03`, displayed as "+0.03 Atk Speed". The app may be off by a factor of 100 depending on how `speed` is scaled. See §2.4, [UNRESOLVED].
3. **Non-combat bonuses.** The app has no XP income (5%/10%, plus 4% per star), Crusade Seals/day or Raid Keys/day.
4. **Stars.** The app stores no star state, so it lacks the star XP bonus. The boss vulnerability is modelled only as an input of the Optimiser's Fortress boss target (stars are chosen there, not stored).
5. **Matches.** TOP attack% 5, crit 3, penetration 3, pvpAttack 15; BOTTOM health% 5, regen 3, pvpDefense 15; CORE 25/25; top and bottom mutually exclusive, core independent. These are all consistent with §2.1 and §3.2.

Things the game has that the app lacks: stars, siege rewards, medals, clan ranks, Clan Wars, War Pact, Village Raids content.
