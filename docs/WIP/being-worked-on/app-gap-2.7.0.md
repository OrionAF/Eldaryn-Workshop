# App vs game 2.7.0 — gap list

> **Status:** open — the work queue for the app rebuild · **Generated:** 2026-10-14 from the 2.7.0 extraction run
> **Truth lives in:** `Reference/Game/<system>.md` — every row below cites the client code; this file only lists where `src/` disagrees.

Each system's extraction agent read the current app and recorded where it disagrees with the 2.7.0 client, what the game has that the app lacks, and what could not be resolved from the client. Severity is the extractor's judgement of impact on optimiser results. Claims were spot-checked (177 checks, 1 contradicted and fixed); the gap rows themselves were not independently re-verified — confirm against the cited lines before acting.

## Summary

| System | High | Medium | Low | Not in app | Unresolved |
|---|---|---|---|---|---|
| [stats](../../Reference/Game/stats.md) | 1 | 5 | 4 | 10 | 7 |
| [classes](../../Reference/Game/classes.md) | 2 | 3 | 2 | 8 | 6 |
| [combat-pve](../../Reference/Game/combat-pve.md) | 2 | 5 | 6 | 18 | 12 |
| [combat-pvp](../../Reference/Game/combat-pvp.md) | 5 | 8 | 4 | 16 | 8 |
| [gear](../../Reference/Game/gear.md) | 0 | 3 | 3 | 11 | 7 |
| [drops](../../Reference/Game/drops.md) | 0 | 0 | 3 | 13 | 8 |
| [stones](../../Reference/Game/stones.md) | 1 | 3 | 3 | 8 | 7 |
| [talents](../../Reference/Game/talents.md) | 1 | 3 | 2 | 7 | 4 |
| [skills](../../Reference/Game/skills.md) | 0 | 0 | 0 | 5 | 5 |
| [relics](../../Reference/Game/relics.md) | 1 | 4 | 4 | 8 | 6 |
| [sigils](../../Reference/Game/sigils.md) | 3 | 5 | 3 | 12 | 10 |
| [mounts-glyphs](../../Reference/Game/mounts-glyphs.md) | 3 | 8 | 3 | 9 | 8 |
| [pets](../../Reference/Game/pets.md) | 1 | 4 | 2 | 9 | 8 |
| [awakening](../../Reference/Game/awakening.md) | 2 | 2 | 2 | 6 | 4 |
| [transcendence](../../Reference/Game/transcendence.md) | 1 | 2 | 4 | 10 | 6 |
| [clan-fortress](../../Reference/Game/clan-fortress.md) | 1 | 1 | 3 | 7 | 8 |
| [pve-content](../../Reference/Game/pve-content.md) | 1 | 1 | 1 | 9 | 8 |

## stats

The client defines 29 SecondaryStatType members plus Attack/HP primaries. Its calculateTotalStats sums base, gear, talents, pets, sigils, stones, awakening, fortress, transcendence and mounts purely additively. Attack and HP take a flat x (1+pct/100) product, with class/form multipliers and zeroing rules applied before one soft-cap curve. The curve is soft + K*(1-(2K/(over+2K))^2), exactly what the app implements, and the game's patch-note numbers reproduce under it. Separate COMBAT_CEILINGS (crit 95, lifesteal 80, speed 4.5, etc.) bound in-combat buffs added on top of the sheet value. PVP rating converts as r/(r+200) and is a live input to arena damage. The live computedStats comes from the server (relics are not in the client formula). Client "Combat Power" is a progression-weighted sum (rarity, ilvl, quality, altar, etc.), not a function of stat totals.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Miss Chance hard cap | src/lib/constants.js (STAT_FIELDS miss_chance) | softCap 50, cap 90 | SOFT_CAPS.MISS_CHANCE = {soft:50, hard:85}; combat ceiling 90 | decompiled.js L1080461-1080462, L1080486 |
| medium | Combat ceilings (post-buff caps) | src/lib/statCaps.js, src/lib/constants.js | No concept; only soft/hard caps. Hard cap treated as the maximum reachable value. | COMBAT_CEILINGS applied via min(sheet + buff, ceiling) after in-combat buffs: crit 95, lifesteal 80, attack speed 4.5 (450%), penetration 80, block 85, DR 75, miss 90, blind 60, hp regen 70, spell crit 95, spell vamp 80, minion crit 95, minion lifesteal 80, soul link 80, minion atk speed 4.5. Ceilings exceed some hard caps (e.g. crit 90 vs 95), so buffs can push past the hard cap. | decompiled.js L1080486-1080515, L1085543-1085694, L1079643-1079740 |
| medium | Base HP | src/lib/constants.js (health base 10) | Base Health = 10 | player.baseStats = {attack:10, hp:100, attackSpeed:1, critChance:0, critDamage:1.5}; default computedStats totalHp 100 | decompiled.js L664443-664456, L1137824, L1138564 |
| medium | Stat catalogue | src/lib/constants.js (STAT_FIELDS) | 20 fields; no Spell Crit, Spell Vamp, Disruption, Fear, Minion stats, Soul Link, Minion Atk Speed, Oblivion Power, Dominion, Conduits | 29 SecondaryStatType members, plus totalDominion and Flame/Earthen/Dark conduit totals. Spell Crit 50/90, Spell Vamp 40/70, Disruption 10/20, Fear 10/20 (merged into Disruption), Minion Crit 50/90, Minion Lifesteal 40/70, Soul Link 40/70, Minion Atk Speed 2/4 (multiplier); Minion Attack/Health and Oblivion Power are uncapped. | decompiled.js L665656-665713, L1080443-1080485, L1217178-1217490 |
| medium | Class gating of stats | src/lib/constants.js (classOnly), src/lib/model.js | Only Warrior and Sentinel exist; classOnly gates Miss/Blind/Paralyze (Sentinel) and DR/Block (Warrior); Double Hit and Crit/Lifesteal/Penetration available to all | 4 classes. Double Hit is Warrior+Sentinel only. DR and Block are Warrior AND Mystic (Mystic zeroed unless the form unlocksBlockAndDr). Necromancer excludes Crit Chance, Lifesteal, Penetration (totals forced to 0). Mystic Spell Crit forced to 0 unless spec MYSTIC_MAGE. | decompiled.js L1213731-1213862, L1216903-1216935, L1217116-1217133 |
| medium | Form multipliers and passive effects | src/lib/totals.js | All sources additive; no form-level multipliers | formConfig.attackSpeedMult multiplies raw attack speed before the curve; attackMult multiplies final Attack; gearHpMult scales the gear-HP part; formConfig.passiveEffects add ATTACK_SPEED, CRIT_CHANCE, HP_REGEN, LIFESTEAL, MISS, BLIND, PENETRATION and (conditionally) DR/Block. | decompiled.js L1216937-1216941, L1216990-1217110, L1217135-1217177 |
| low | Rounding/flooring of totals | src/lib/totals.js, src/lib/dps.js | No rounding of final totals | totalAttack and totalHp are floored; Attack Speed and Crit Damage effective totals rounded to 2 dp of the multiplier (1 percentage point); other capped/percent totals to 1 dp; PVP ratings, Dominion, Oblivion Power, conduits rounded to integers. | decompiled.js L1217155-1217394, L1217333-1217340 |
| low | Relics in the totals pipeline | src/lib/totals.js | Relics are summed into calculated totals like other sources | The client calculateTotalStats has no relic argument at all; relic effects enter computedStats only through server responses (applyRelicEquip/Upgrade/Sell assign result.stats). | decompiled.js L1209934-1209948, L1165477-1165757 |
| low | Penetration crit interaction | docs/Reference/combat-model.md (RULED: Penetration CAN crit) | What pierces a block takes the crit roll | In-game tooltip: 'this percentage of your base damage (pre-crit) still goes through' - implies pre-crit. A rollPenetrationCritMult symbol exists, so unresolved; defer to combat-pvp. | decompiled.js L911272 (tooltip); strtab.txt L42600 |
| low | Combat Power | CONTEXT.md / combat-model.md section 0 (retired CP derivation) | CP is a stat-derived rating that was reverse-engineered then retired | Client Combat Power is Round(sum of equipment + sigils + enchants + transcendence + pet + mount + relics + talents + awakening + level), each a rarity/level/quality weighted term; no stat totals are used. Server use unknown. | decompiled.js L1187242-1187617, L1187673-1187818 |

### In the game, not in the app

- COMBAT_CEILINGS / applyCombatCeiling (separate post-buff caps)
- rawFromSoftCapped inverse and softCapGainFromSheet: sigil transform/buff stat gains are credited through the sheet's soft cap (Miss, Block, Penetration)
- Sheet GAIN colour: t=clamp((1-gain)/0.75), mix rgb(250,204,21) to rgb(239,68,68)
- Mystic and Necromancer classes with class-unique and excluded stat lists, form passive effects, and attackMult/attackSpeedMult/gearHpMult form multipliers
- Spell Crit, Spell Vamp, Disruption (with effect SILENCE/STAGGER/FEAR), Fear (merged into Disruption total), Minion Attack/Health/Crit/Lifesteal/Atk Speed, Soul Link, Oblivion Power stats
- Dominion total (Necromancer: talents + transcendence + 1) and Flame/Earthen/Dark conduit totals
- Client Combat Power formula (TOTAL_POWER_CONFIG) used to gate content
- 12 equipment slots in the stat pipeline (Belt, Gloves, Rift Core in addition to the app's 9)
- Client-side build estimators (critFactor, autoAttackDps with additive double hit, offense/defense capShare scores)
- Live computedStats is server-supplied; client calculateTotalStats is used only for the other-set preview

### Server-side or unresolved

- Server-side computedStats: the authoritative total is server-supplied; whether it floors/rounds like the client preview and what extra sources (relics at least) it includes
- Argument a7 of calculateTotalStats (never populated by the only caller)
- Whether base stats scale with level on the server (client uses constant baseStats attack 10 / hp 100)
- Sigil ANCIENT power value (1000) reads out of order vs LEGENDARY (2900); several TOTAL_POWER_CONFIG values are register-traced
- Whether the server's leaderboard/gating Combat Power uses the same TOTAL_POWER_CONFIG
- Whether Penetration-pierced damage can crit (tooltip vs rollPenetrationCritMult)
- Detailed contribution functions of talents, pets, sigils, stones, mounts, glyphs, awakening, transcendence and relics (owned by their own docs)

## classes

The game has 4 classes (Warrior, Sentinel, Mystic, Necromancer) and 8 specs. The client holds no per-class base stats or level growth; those come from the server as computedStats. The client does fix the level cap (100), the XP curve (a closed form with a multiplier ladder), class-keyed secondary-stat gating (which stats gear can roll), the Attunement ban-slot bonus (Mystic and Necromancer +1), class-keyed sigil unlock levels (25 for Warrior/Sentinel, 17 for Mystic/Necromancer), and the Necromancer minion formulas (minion HP and attack scale from player stats times sigil percent times minion-stat bonuses). For a gear optimiser the class contributes the rollable secondary-stat set and the class-keyed bonuses owned by other systems, plus minion scaling for Necromancer.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Class list | src/lib/constants.js (CLASSES, L168) | Only Warrior and Sentinel exist | Four classes: WARRIOR, SENTINEL, MYSTIC, NECROMANCER, none locked on the create screen | decompiled.js L665454-665464, L2039513-2040400 |
| high | Spec list | src/lib/constants.js (SPECS_BY_CLASS) | 4 specs: arms, protection, marksmanship, disruption | 8 specs: adds mage (Arcanum), druid (Wildshape), deathlord, doomweaver | decompiled.js L911095, talent_trees_v1.json trees |
| medium | Class-only secondary stats | src/lib/constants.js (classOnly on dmg_reduction, block_chance) | Damage Reduction and Block Chance are Warrior-only | Mystic can also roll Damage Reduction and Block Chance | decompiled.js L1213700-1213800 (CLASS_UNIQUE_SECONDARY_STATS) |
| medium | Double Hit gating | src/lib/constants.js (double_hit field) | No class gating on Double Hit | Double Hit is unique to Warrior and Sentinel; Mystic and Necromancer cannot roll it | decompiled.js L1213700-1213800 |
| medium | Excluded stats | src/lib/constants.js | No concept of excluded stats per class | Necromancer cannot roll Crit Chance, Lifesteal or Penetration | decompiled.js L1213800-1213840 (CLASS_EXCLUDED_SECONDARY_STATS) |
| low | Base stats | src/lib/dps.js (BASE_ATTACK/BASE_SPEED/BASE_CRIT/BASE_CRIT_MULT) | Base attack 10, speed 100%, crit 0%, crit mult 150% | Matches client initial baseStats (attack 10, hp 100, speed 1, crit 0, critDamage 1.5), but these are placeholders for every class; real per-class base stats are server-supplied | decompiled.js L664445-664458, L1137820-1137835 |
| low | Level cap and XP | (none) | App has no level cap or XP model | Cap 100; closed-form XP curve; 504,553,241 total XP to cap | decompiled.js L1050354-1050608, L670527 |

### In the game, not in the app

- Mystic class (Mage and Druid specs) and Necromancer class (Deathlord and Doomweaver specs)
- Class-keyed rollable secondary-stat gating (unique and excluded lists) and control-stat set
- Attunement class ban-slot bonus: Mystic +1, Necromancer +1, Warrior and Sentinel 0
- Class-keyed sigil unlock level: 17 for Mystic/Necromancer, 25 for Warrior/Sentinel
- Necromancer minion stats (scale from player attack and HP, minion-specific attack, health, speed, crit, lifesteal, Soul Link, Dominion)
- Druid bear and wolf forms
- XP curve with explicit multiplier ladder and level cap 100; Oblivion separate level axis
- Spell Crit, Spell Vamp, Disruption chance, Fear chance and minion stats as class-unique stats

### Server-side or unresolved

- Per-class base stats and per-level growth (server-side computedStats)
- Attunement per-level ban count (effects array null in static definition)
- Meaning of xpRewardForHunt argument and live use
- How Dominion is gained and capped
- CLASS_ATTUNEMENT_BONUS literals inferred from register values 0 and 1 (no explicit literal beside assignment)
- Meaning of SKILLS_UNLOCK_GEMS = 80

## combat-pve

PVE fights run on one delta-time engine (processCombatTick plus spell, debuff and stack layers). The client runs the Progress (campaign) fights itself every 100 ms with unseeded Math.random and reports only /progress/complete. Dungeon, raid, Oblivion, crusade, fortress boss, world boss and arena fights are server-simulated, and the client replays their tick logs. The stamina Hunt is a server loot/XP roll with no combat. Swing interval is round(1000/AttackSpeed) ms with a carried remainder and at most one swing per side per tick. A player swing goes: one combined negate roll against block+miss, then crit and double-hit draws (the double hit deals plain attack and cannot crit), damage reduction, shield, floor-lifesteal clamped to missing HP, then blind/paralyze/disruption procs. A negated swing pierces only for attackers with Penetration, and only if the defender's Miss is exactly 0. Pierced damage can crit. Attack % buffs multiply the final Attack, and other buff stats are clipped by the combat ceilings. Campaign mob stats are round(base * levelMultiplier * 2), with Penetration on chapters 9+ and on every hard chapter. The world boss has three affinities: Dormant, Fortified (80% block, 30% spell resist) and Enraged (hits back for 18% max HP). A gear optimiser should read the build as: swings/s from Attack Speed, per-swing yield from Attack, Crit, Crit Damage and Double Hit, and incoming damage reduced by DR, then Block/Miss with the Penetration caveat.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Timed Attack % buffs | src/lib/dps.js (buffedAttack), also statWeights.js Attack % probe | RULED 2026-07-28: Attack % buffs add into the Attack % total: (flat + flatAdd) * (1 + (basePct + pctAdd)/100); explicitly not multiplicative on displayed Attack | applyBuffsToEntity does attack = floor(entity.attack * (1 + buff.attackPercent/100)) where entity.attack is totalAttack, which already contains the character's Attack %. The buff is multiplicative on final Attack (Elusive likewise round(a*(1+p/100))). | decompiled.js L1085552-1085569 (applyBuffsToEntity), L1079688-1079699 (applyElusiveBuff), live call L1074875-1074886, totalAttack composition L1217135-1217177 (stats.md) |
| high | World boss model | src/lib/simulation.js (header), docs combat-model.md section 5 | 60 s Monte Carlo against a pure target dummy: no defence, no mechanics, never attacks; lifesteal and regen irrelevant | Boss behaviour depends on a rotating affinity. Dormant matches the app. Fortified: boss blocks 80% of hits, resists 30% of spell damage, only Penetration gets through. Enraged: boss hits back for 18% of the player's max HP, ramps damage and speed, 28% of blocked/dodged hits rebound, no 60 s timer (cap 300 s, fight ends when the player dies). Elder Dragon HP is 20e9. | L1153433-1153449 (affinity configs), L1153478 (boss), L1153423 (60 s, 100 ms tick), English text L910735-910739 |
| medium | Tick clock and swing schedule | src/lib/simulation.js (TICKS_PER_SEC 400, swing every 40000/speed ticks, first swing on tick 1, speed clamped >= 100) | Fixed 400 ticks/s clock; swing interval 40000/speed ticks accruing on a float accumulator; first swing on tick 1; speed never below 100% | Delta-time engine: 100 ms ticks for Progress and world boss, 10 ms for server dungeon/raid/arena/crusade/fortress fights. Interval = round(1000/attackSpeed) ms, remainder carried, at most one swing per side per tick. Player timer starts at 0 so the first swing is after one full interval; in Progress the mob timer starts at half its interval. No >= 1.0 speed clamp exists (mobs run 0.45-1.5; Slow reduces by up to 50%). Long-run swing rate equals computeDps's assumption to within the ms rounding. | L1086319-1086336, L1086422, L1086435, L1073403-1073424, L1074397-1074415, L1085224, L1153423, L1062719 |
| medium | Block, Miss and Penetration resolution | docs combat-model.md section 6 (pvpSimulation resolution order); tankObjective.js landedFraction | Defender Miss roll first (full dodge, nothing pierces), then separate Block roll where only attacker Penetration % of the pre-crit base goes through | PVE engine uses one roll against (blockChance + missChance); the sum is not capped. On a negated swing Penetration applies only if the defender's missChance === 0 (round(attack*pen/100), then optional crit multiplier, then DR, shield, lifesteal). The event is labelled miss if defender Miss > 0 else block. A defender with any Miss therefore avoids pierce entirely. | L1086436-1086449, L1086762-1086884 (player attacks), L1086971-1086984, L1087100-1087236 (enemy attacks) |
| medium | Tank objective assumptions | src/lib/tankObjective.js | landedFraction = (1-DR)*(1-block): a block negates the entire hit in PVE; dungeon monster Penetration unknowable and assumed 0; DR applies as a smooth fraction | Mobs carry Penetration in the client data: campaign chapters 9/10/11 have 18/40/48, hard chapters 50-70, dungeon mobs 6-10 plus blockChance 5-10. A blocked mob swing pierces round(attack*pen/100) (then DR) when the player's Miss is 0. DR is applied per hit as max(1, round(d*(1-DR/100))). Spell damage uses a separate resist path and while a minion lives the enemy hits the minion, not the player. | L1085228-1085306 and L1085414-1085434 (campaign pen), L1062731-1062760 (dungeon), L1087100-1087236, L1085970-1085996 |
| medium | Paralyze duration | docs combat-model.md section 10 (paralyze duration 2 s, OBSERVED tooltip); PARALYZE_SEC 2 in pvp goal | 2 s | UI tooltip says 2 s, but the engine constant PARALYZE_DURATION_MS is 1000 ms (the arena engine reads the same constant). 2000 ms is STAGGER_STUN_MS. Server value for server-run fights is unknown. | L1089576-1089578 (constants), L1087498 (export), L1453220 (arena use), tooltip L911271 |
| medium | Spell damage vs target resistance | docs combat-model.md section 7; pvpGoalObjective spellLanded | Spell damage reduced by target Spell Resist % (and, in the PVP goal, multiplied by (1-DR)) | Multiplier = 1 - min(R, 60)/100 (60 = SOFT_CAPS.SPELL_RESIST.hard) applied after (1 + spellDamage%). R is spellResist alone in the live client Progress loop but spellResist + damageReduction in the shared engine copy, so target DR adds to resist (not multiplies) there and the combined factor cannot go below 0.4. | L1090876-1090927 (modSpellDmg), L1074783 (live R), L1088301-1088303 (shared copy R) |
| low | Procs on blocked/pierced swings | docs combat-model.md section 6 (documented assumption) | A blocked hit with Penetration > 0 counts as landed for procs (blind, paralyze, disruption) | Blind, Paralyze and Disruption are rolled only on the not-negated branch, once per swing (not per double-hit strike). A negated swing, pierced or not, rolls no procs. Lifesteal does apply to pierced damage. | L1086577-1086860 (procs on hit branch), L1086762-1086884 (negated branch has none) |
| low | Blind semantics | docs combat-model.md section 6 / pvpSimulation | Blind is a counter: consume one stack, whole swing deals 0 | Blind is a boolean on the enemy; it cannot be re-applied while set; the enemy's next due swing is consumed (event defender_blind, timer resets) and the flag clears. Status check order on an enemy swing is Paralyze, then Fear, then Blind. | L1086577-1086602, L1086957-1087343 |
| low | HP regen and lifesteal mechanics | src/lib/dps.js computeHps; docs combat-model.md section 6 | Regen accrues per tick as originalMaxHp*regen/100/400 clamped at max; computeHps counts lifesteal/regen totals including overheal | Regen is applied in 100 ms pulses: max(1, round(maxHp*hpRegen/100/10)), only when below max, capped at missing HP, only for the player. Lifesteal is floor(post-DR damage*ls/100) capped at missing HP, so overheal is never credited, and negated swings give none. | L1086337-1086420, L1086471-1086497 |
| low | Miss Chance hard cap | src/lib/constants.js (miss_chance cap 90) | soft 50, hard 90 | SOFT_CAPS.MISS_CHANCE is soft 50, hard 85 (the 90 is the separate in-combat ceiling for buffed values). Owned by stats.md; recorded here because the negate roll sums Block and Miss. | module 3959 SOFT_CAPS (L1080430-1080480 region), COMBAT_CEILINGS L1080486-1080515 |
| low | Closed-form scope | src/lib/dps.js computeDps | PVE ignores enemy defence, block, miss, blind and penetration | True for campaign mobs (DR 0, Block 0, Miss 0, no crit) but not for dungeon/raid mobs (blockChance, Penetration, possible DR), the Fortified world boss (80% block), or spell damage. The formula attack*(1+c*(cm-1)+h)*speed itself matches the engine: crit and double-hit are independent draws, the double hit deals plain attack and cannot crit. | L1085998-1086046, L1086517-1086575, L1062731-1062760, L1153440 |
| low | Per-hit integer rounding | src/lib/dps.js, simulation.js | Continuous expected-value arithmetic | Crit damage round(attack*critDamage); DR round with a minimum of 1 per hit; lifesteal floor; regen max(1, round); spell damage floor with minimum 1. Matters only for very small attack/HP values. | L1086016-1086020, L1085985-1085991, L1086484-1086487, L1086354-1086367 |

### In the game, not in the app

- Delta-time fight engine with per-mode tick sizes (100 ms client/world boss, 10 ms server) and half-interval mob opening timers in Progress
- Single combined Block+Miss negate roll, penetration only when defender Miss is exactly 0, event labelled by Miss > 0
- Disruption mechanic (Mage Silence 3 s, Bear Stagger 3 stacks to a 2 s stun, Wolf Fear 1 s) rolled per landed swing, plus Fear Chance stat
- Enemy status model: Paralyze/Fear/Blind each consume an enemy swing, checked in that order
- Spell layer: 11 spell types with fixed cast order, 1000 ms opening delay for DAMAGE/DEBUFF spells (500 ms Null Pulse), spell crit (ceiling 95), Spell Vamp (ceiling 80), spell resist capped at 60, momentum stacks, Chrono Flux transform charge
- Debuff system on the enemy: Bleed/Poison stacking DoTs that can crit (default x1.5), Wound (regen/heal reduction up to 100%), Slow (up to 50% attack speed), Crit Down
- Stack sigils: Bulwark (HP/DR/thorns per stack, loses 2 per hit), Elusive (attack/crit/lifesteal/speed per stack), Sunder and Siegebreaker (strip enemy DR/Block/Miss/Blind/Regen, decay 2/s)
- Thorns reflect events (Bulwark and Iron Bastion) that can kill the mob
- Shield spell with 0.5 mitigation (each shield point absorbs 2 damage), optional refill from lifesteal/regen
- Necromancer minion: tanks all enemy swings while alive, own swing timer and crit, soul link heal, respawn timer, frenzy/empower
- Combat ceilings applied to buff stacking (Crit 95, Lifesteal 80, Attack Speed 4.5, DR 75, Block 85, Miss 90, Blind 60, Pen 80, Regen 70) while Crit Damage and Spell Resist buffs are uncapped
- Mob entities can carry damageReduction, blockChance and penetration; campaign chapters 9+ and all hard chapters have mob Penetration
- 22 campaign chapters (11 normal + 11 hard) of 10 levels x 3 mobs with explicit per-level multipliers and hard-chapter hp/atk scale factors
- World boss affinities Dormant / Fortified / Enraged rotating on a hashed 2-session cycle
- Oblivion instability engine hooks: true-damage pulses, healing/regen multipliers, heal cap per second, shield-overflow block, defence bands
- Crusade boss entity generation from player-count scaling, difficulty multipliers and Mythic+ multiplier
- Heal budget (healCapPctPerSec) and 20-minute fight cap in the shared engine
- Fights in Progress are client-authoritative (unseeded Math.random); the server receives only the cleared chapter/level

### Server-side or unresolved

- Whether the server's dungeon/raid/boss/world-boss fights run exactly the bundled shared engine (simulateFight etc.) - no client call site found
- Server-side validation of /progress/complete and of the damageDealt the client posts to /world-boss/fight-end
- World boss internals: Enraged damage/attack-speed ramp formulas, whether the boss uses the same combined block roll, how penetrationPiercesSpellResist applies, what the 57 s meteor does, Fear resist for bosses
- Real paralyze duration on the server (code 1000 ms vs tooltip 2 s)
- Whether spell target resistance is spellResist alone (live Progress code) or spellResist+DR (shared engine copy) in server fights
- Whether the uncapped Block+Miss sum is intended or a capped combination server-side
- Unit of buff ATTACK_SPEED effect values (added directly to the 1.0-based attackSpeed) - defined in sigil data
- Consumer of silencedMs on enemies (no mob spells in Progress)
- Whether a fight timeout exists in the live Progress loop (none found; the 20 min cap is only in the shared engine)
- Siegebreaker numbers and exact Sunder/Bulwark/Elusive config values (sigil data, see sigils.md)
- Oblivion instability constants (OBLIVION_DUNGEON) and dungeon/raid/crusade mob catalogues (owned by pve-content)
- mob DR for dungeon/raid enemies beyond what hardVariant scaling exposes

## combat-pvp

PVP fights (Arena/Clash, Clan War PVP, Fortress PVP, practice) are resolved server-side: the client POSTs a fight request and replays the returned 10 ms tick log. A complete two-sided PVP simulator (simulateArenaPvP, module 5399) is in the bundle but never called. Its output shape matches the server response exactly, so it is very likely the shared resolver (inferred, not proven). Rules: every fighter gets floor(Health x 8) HP, with regen and shields sized off the pre-multiplier HP. Attacker swings first each tick and the defender still swings if killed, so mutual kills are possible. Avoidance is one roll against Block+Miss, and Penetration works only if the defender's Miss is exactly 0. PVP Attack/Defense are r/(r+200) fractions applied only to swings, not to spells, DoTs or thorns. The 60 s timeout goes to higher RAW HP (tie to the defender; the % rule was reverted before release). For the optimiser, PVP adds the two ratings, the x8 pool, and the 60 s two-sided fight shape that makes Block, Miss, DR, regen, lifesteal and Disruption matter.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Timeout winner | src/lib/pvpSimulation.js (runPvpSingle tail) | 60 s timeout won by higher remaining HP PERCENTAGE (Jul 2026 patch); equal = draw | Arena/Clan War timeout awards victory to higher ABSOLUTE (raw) HP, strict >; tie goes to the defender; no draw outcome. Percentage rule was reverted before release (it exists only for Clan War Final Battle duels via hpBp). | decompiled.js L1457456-1457543 (time_up, attackerWon = a.hp > d.hp); strtab.txt L82770, L92978 |
| high | Avoidance roll (Miss vs Block) | src/lib/pvpSimulation.js (resolveHit) | Separate Miss roll (full dodge) then separate Block roll on the remainder | One roll: random*100 < Block+Miss. Avoided swings are labelled 'miss' if defender.missChance>0 else 'block'. P(avoid)=(Block+Miss)/100. | decompiled.js L1452914-1452927, L1453530-1453550 |
| high | Penetration rule | src/lib/pvpSimulation.js (resolveHit); combat-model.md s6 | A Block roll lets Penetration% of base through, even if the defender also has Miss | Penetration only works when defender.missChance === 0 exactly. Any Miss makes every avoided swing (including the Block share) deal 0. Pierced damage = round(attack*pen/100) * (crit? critDamage:1), then DR, PVP Attack, PVP Defense; no double hit or on-hit procs. | decompiled.js L1453403-1453430, L1086048-1086072; strtab.txt L92168 |
| high | Disruption (Silence / Stagger / Fear) | src/lib/pvpSimulation.js | Not modelled (stat exists in constants.js only) | disruptionChance rolls per landed swing: SILENCE 3000 ms (stops spell casts), FEAR 1000 ms (attacker loses swings), STAGGER +1 stack, 3 stacks = 2000 ms stun. | decompiled.js L1086073-1086166, L1453248-1453400, L1089572-1089576 |
| high | Stack sigil numbers | src/lib/pvpSimulation.js (PVP_SIGIL_MECHANICS) | Bulwark of Thorns: +4% HP, +2% DR, 4% thorns per stack, burn 2 per unblocked hit. Siegebreaker Mark: 4% Block reduction per stack. | Bulwark of Thorns: +8% max HP, +4% DR, +7% thorns per stack, loses 1 stack per unblocked hit (the 4/2/5/-2 set is the Druid Bear form). Siegebreaker: 3% HP Regen, 3% Block, 4% Miss, 4% Blind. Sunder (4/4/4/4, 1.75/s) and Elusive (3/3/3/3, burn 2) match. Debuff stacks apply to the target only for the duration of that swing. | decompiled.js L1069204, L1069436, L1069455, L1070141-1070167, L1454739-1454814 |
| medium | Double hit | src/lib/pvpSimulation.js (scheduleSwing) | Double-hit roll after every non-paralyzed swing (even missed/blocked), second strike gets its own Miss/Block roll and its own proc rolls | Double hit only on a swing that was not avoided; second strike uses plain attack (no crit), no avoid roll, only if defender still alive; blind/paralyze/disruption procs roll once per swing, after the double hit. | decompiled.js L1452929-1452936, L1453096-1453141, L1453143-1453400 |
| medium | Paralyze duration and refresh | src/lib/pvpSimulation.js (PARALYZE_SECONDS=2); src/lib/pvpGoalObjective.js (PARALYZE_SEC=2) | Paralyze proc stuns 2 s; re-proc extends via max() | PARALYZE_DURATION_MS = 1000 for the stat proc; cannot proc while already paralyzed. 2000 ms is STAGGER_STUN_MS (Bear disruption). | decompiled.js L1089575-1089579, L1453193-1453246 |
| medium | Sigil spell / DoT damage chain | src/lib/pvpSimulation.js (pvpChain via pureDamage) | Sigil damage goes through target DR, attacker PVP Attack and target PVP Defense | Spell damage and debuff DoT ticks take only target Spell Resist and target PVP Defense (max(1, round(x*(1-frac)))). No DR, no PVP Attack. PVP Attack also not applied to minion strikes or thorns. | decompiled.js L1454121-1454146, L1456502-1456531, L1456653-1456682, L1455596-1455612; strtab.txt L96371, L96715 |
| medium | Mutual kill | src/lib/pvpSimulation.js (runPvpSingle loop) | Mutual kill always counts as a LOSS for the player | If both HP <= 0: attackerWon = attacker.hp > defender.hp on UNCLAMPED values (player wins if overkill is smaller); tie goes to defender. Event log clamps to 0 so both bars show 0 either way. | decompiled.js L1457525-1457543, L1457269-1457374 |
| medium | Swing timing and order | src/lib/pvpSimulation.js (scheduleSwing, 400 ticks/s) | First swing on tick 1 for both sides; interval 40000/Speed ticks | 10 ms ticks; swing timers start at 0 and fire when timer >= round(1000/attackSpeed') ms (first swing about one interval in); at most one swing per side per tick; attacker (player) resolves before defender; spell/DoT kills prevent that tick's swings; loop includes t=60000. | decompiled.js L1455933-1455936, L1456990-1457000, L1457111-1457121, L1456790-1456796, L1457307 |
| medium | Thorns reflect basis | src/lib/pvpSimulation.js (onLandedHit) | Thorns reflect % of the attacker's PRE-mitigation hit | Reflect = round(eventDamage*thorns%/100) where eventDamage is the post-mitigation damage of the landed hit (pierced amount on a block, so 0 on a clean block); hits the swinger's shield then HP with no DR/PVP rating. | decompiled.js L1455018-1455277, L1080008 |
| medium | Combat ceilings on buffs | src/lib/pvpSimulation.js (statNow over-cap rule) | Sigil buff layers may exceed the stat cap with no limit | Buffed values are clamped by combat ceilings: Miss 90, Blind 60, DR 75, Block 85, Crit 95, Lifesteal 80, Attack Speed 4.5, Penetration 80, HP Regen 70, Spell Crit 95, Spell Vamp 80. | decompiled.js L1080486; strtab.txt L92168, L92929, L92948 |
| medium | Shields and minions | src/lib/pvpSimulation.js | No shield pool, no Necromancer minions | PVP shield pool = floor(2*rawMaxHp*shield%/100) absorbing before HP; a living minion intercepts the opponent's swings (no avoid roll, no DR/PVP applied to minion damage) and extends the fight horizon by the summon window. | decompiled.js L1455714-1455792, L1452906-1452912, L1453570-1453754, L1094791-1094825 |
| low | Blind | src/lib/pvpSimulation.js (blindStacks) | Blind is a stacking counter; each stack voids one swing; rolls on every landed hit | Blind is a boolean; cannot be applied to an already-blinded target; consumed by one swing. Swing-gate order is paralyze > fear > blind, so a paralyzed/feared attacker keeps the blind until it actually swings. | decompiled.js L1452886-1452905, L1453143-1453191 |
| low | Integer rounding | src/lib/pvpSimulation.js (pvpChain) | Continuous float chain dmg*(1-DR)*(1+atk)*(1-def) | Integer rounding after each step; DR and PVP Defense steps floor at 1; PVP Attack step has no floor. | decompiled.js L1452937-1453003 |
| low | HP Regen | src/lib/pvpSimulation.js (housekeep) | Smooth per-tick regen = originalMaxHp*hp_regen/100/400 | Pulse every 100 ms: max(1, round(rawMaxHp*hpRegen/100/10)), only heals below buffed max; overflow refills shield; Wound/Siegebreaker reduce hpRegen first. Same average rate on pre-x8 HP. | decompiled.js L1452765-1452839, L1456834-1456884 |
| low | Sigil activation conditions | src/lib/sigilEffects.js / pvpSimulation.js | Active sigils fire on cooldown (enemy-targeting at 1 s) | Damage/Debuff sigils honour HP-threshold activation conditions only in PVP (ENEMY_HP_BELOW_80/60/40/20, MY_HP_BELOW_*); Buff/Heal conditions apply everywhere; unlocks at level 54. | decompiled.js L1089843-1090050, L1091440-1091533, L668649; strtab.txt L29216 |

### In the game, not in the app

- PVP ladder: 10 ranks, 28 influence thresholds, 3-day sessions, FIGHT_RANGE 3, per-fight influence/honors by ladder offset, rank multipliers, session rewards by rank x position tier, 5 tokens/day, 1 free second chance/day (data/combat-pvp.json)
- Clan War PVP: 3 tokens/day, roll/reroll/forfeit (forfeit costs a token), 30 War Points per win, 0 per loss
- Fortress PVP defender fights (attack-defender endpoint); time_up treated as terminal by the replay adapter
- Clan War Final Battle duel engine: 36x HP, 120 s, protocol-v1 log, end reasons WIPE/MUTUAL_WIPE/TIMEOUT_SURVIVORS/TIMEOUT_HP(basis points)/TIMEOUT_DRAW/WALKOVER
- Disruption effects (Silence 3 s, Stagger 3 stacks -> 2 s stun, Fear 1 s) in duels
- PVP shield pool using PVP_SHIELD_BASE_MULTIPLIER 2
- Necromancer minions: intercept swings, extend fight horizon, soul link
- Spell debuffs (Wound, Bleed, Poison, Slow capped 50%, Crit Down) and Spell Resist as the spell mitigation path
- HP-threshold sigil activation conditions applied to Damage/Debuff sigils in PVP only (level 54)
- Druid Bear/Wolf stack forms (Bear 4/2/5 thorns burn 2; Wolf Siegebreaker)
- Iron Bastion buff thorns
- Combat ceilings on buffed stats
- Integer rounding and min-1 floors in the damage chain
- 100 ms regen pulses with overflow to shield refill
- Practice-fight endpoint (/leaderboard/practice-fight)
- Event/log schema (X_hit, X_crit, X_block, X_miss, X_blind, X_fear, X_thorns_reflect, minion_*, spell_*, debuff_*, time_up, attacker_dead/defender_dead)

### Server-side or unresolved

- Server source is unavailable: identity of the live resolver with the bundled simulateArenaPvP is inferred from identical output shape and event types
- Live behaviour on mutual kill and equal-HP timeout (sim: higher unclamped HP wins, tie to defender)
- Whether the server applies x8 HP to Fortress PVP and what time_up means for the outcome there
- Opponent selection, matchmaking pool, anti-cheat, RNG seed, loss influence and second-chance semantics (SERVER)
- Disruption effect assignment per spec/form (see combat-pve.md s8.3 / classes.md); not re-derived
- What the final (21st) argument of processSpellsTick does inside the spell engine (module 3964 not fully traced); observable PVP Defense application on spell damage is read directly
- Spell opening delay / cooldown start (old note: enemy-targeting sigils first fire at 1 s) not re-measured; see combat-pve.md s10.1
- Meaning of TICK_ORDER 'alternate' and SWING_LEAD_MS in the Final Battle duel engine

## gear

Gear has 9 base slots, plus 3 Oblivion-only slots (Belt, Gloves, Rift Core). There are 10 rarities, and secondary-stat count is 0/0/1/1/2/2/2/3/3/3. Primary Attack/Health follow attackForItem and hpForItem: floor((base + effLevel*scale) * oblivionMult), where effLevel is 1:1 up to 100 and 0.4 per level above 100. Secondaries come from a 26-stat pool (all Rare+), rolled as min + (levelMax-min)*random^2, and quality is each roll's position within the level-scaled range. Eternal and Oblivion items carry a Flame/Earthen/Dark conduit that feeds Chrono Flux. Dual Equip (level 28) gives two sets, and presets store references to set/talent/pet/mount/relics/sigils. Item creation, per-item displayed stats, the watermark and final totals are server-side; the client holds the formulas and tables. There is no set-bonus or gear upgrade/forge system in the client.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| medium | Equipment slots | src/lib/constants.js (SLOTS) | 9 slots: Head, Shoulders, Chest, Leggings, Boots, Weapon, Offhand, Ring, Trinket | 9 base slots plus Belt, Gloves, Rift Core as Oblivion-realm-only slots (separate oblivionEquipment loadout, no dual set in Oblivion) | decompiled.js L1173904-1174092, L669119 (NEW_SLOT_COUNT 3), L1173183 |
| medium | Item model | src/lib/model.js, src/components/GearLoadoutsScreen.svelte | Each slot is one flat OffensiveStats block with no rarity, item level, quality, secondary-stat list or conduit | Items have rarity, itemLevel, realm, quality, secondaryStats [{type,value}] (0-3 by rarity) and an Eternal/Oblivion conduit | decompiled.js L669134-669275, L677261, L677825 |
| medium | Item-level caps and scaling | src/lib/constants.js / model.js | No item-level model | Base cap 100; Ascension skill raises to 130/160/190/240; Oblivion caps 200/260/320/380/480 at ITEM_LEVEL_SCALE 0.5; stats scale 0.4 per level above 100 | decompiled.js L885162-886032, L669119-669127, L677322, L677996 |
| low | Rarity scale | src/lib/constants.js (RARITIES) | 10-tier scale Common..Oblivion, used for pets/mounts/glyphs/sigils | Same 10 names in the same order; gear rarity also drives secondaryStatCount, primary-stat tables and Total Power | decompiled.js L669134-669275, L665400-665800 |
| low | Dual Equip unlock | src/lib/model.js (loadouts, 2 fixed) | Always 2 loadouts, no unlock gating | Dual Equip unlocks at player level 28; before that only set 1; unavailable in the Oblivion realm | decompiled.js L668649, L1173183 |
| low | Preset contents and limits | src/lib/model.js (Preset), src/lib/buildConfig.js | Preset = loadout index + talentSet + pet + relics (+ per-character mounts etc.); two-preset minimum | Game preset = equipmentSet + talentSet + petId + mountId + relicIds + sigilSpecies + utilitySigilSpecies + transcendencePresetId; unlock level 41; 1 free slot, max 8, name max 8 chars, slot n cost 100+(n-2)*200 for n>=2 | decompiled.js L1144002, L1144090, L1144182, L1167516-1167943 |

### In the game, not in the app

- Rarity-driven secondary-stat counts (0/0/1/1/2/2/2/3/3/3)
- Primary Attack/Health tables per rarity with level scaling and Oblivion multipliers (2.75 attack, 2.8 HP)
- Per-class per-slot attack/hp weights (SLOT_WEIGHTS_BY_CLASS, 12 slots)
- 26-stat secondary pool with level-scaled ceilings, squared-random roll and per-stat quality (1-100)
- Item quality = mean secondary-stat quality
- Conduits (Flame/Earthen/Dark) on Eternal and Oblivion gear that charge Chrono Flux; Chrono Flux unlocks at level 74
- Oblivion realm: separate 12-slot loadout, item-level caps by Ascension, DARK conduit from Divine rarity upward
- Ascension skill (level 78) raising item-level drop cap and the item-level watermark
- Midas Touch (rarity-upgrade) and Artisan (quality reroll) drop-time skills
- Total Power equipment term: rarityPower*(1+0.6*effLevel/100)*(1+0.35*quality/100)
- Server-side equip, discard and switch-set calls returning recomputed computedStats

### Server-side or unresolved

- How displayed item Attack/Health relate to attackForItem x slot weight (no client code multiplies them; inference only)
- Item creation, drop rolls, rarity-upgrade and quality-reroll resolution, and the item-level watermark are server-side
- Whether the server applies a class filter to the secondary-stat pool
- Currency used to buy extra preset slots
- Chrono Flux charge amounts, threshold and transform numbers (belongs to sigils/combat-pve)
- How final totals combine gear with other sources, soft caps and percent stacking (stats system)
- Whether item.quality stored by the server uses the same calculateItemQuality function

## drops

The client never rolls drops: POST /hunt returns items, so the actual roll, item level and pity are server-side. The client does hold a 100-level rarity-odds table (Uncommon unlocks at L2, Rare L6, Epic L14, Legendary L27, Mythic L38, Ancient L50, Divine L63, Eternal L74, Oblivion L83), a separate Oblivion-realm weight model, the Fortune skill (60/70/80/90/100 % drop rate), Midas Touch and Artisan post-roll modifiers, Ascension (item level cap up to 240, with stat level above 100 scaling at 0.4), and Attunement. It also holds the loot-filter pipeline, the Loot Bag (8 slots, 20 for Premium), the 26-stat secondary pool with its roll and quality formulas, and the Oblivion dungeon drop formulas. Drops contribute to power indirectly: rarity and item level set gear primary stats and the number (0 to 3) and pool of secondary stats.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| low | Rarity odds / unlock levels | src/lib/dropGoals.js, src/components/DropCheckScreen.svelte | The app has no model of drop chance or rarity odds by level. Drop Check only scores a manually entered candidate item against presets. | Rarity odds follow a 100-row table by player level. Common is the remainder after the other rarities are subtracted, and each rarity has a first-nonzero level. | decompiled.js L1213885-1214762; docs/Reference/Game/data/drops.json |
| low | Verdict scope | src/lib/dropGoals.js | Verdict is the goal-score delta (DPS / sim DPS / tank) of swapping the entered item. | The game's own loot filter keeps or discards drops using rarity mode, secondary-stat HAS_ANY/HAS_ONLY, quality floor (average of per-stat quality 1-100), conduit type, and a 'beats equipped in BOTH attack and HP at same rarity' check, not DPS. | decompiled.js L676561-676894 |
| low | Item quality input | src/components/DropCheckScreen.svelte | Candidate item stats are entered as printed values only. | The game computes a per-item Quality (Q1-Q100) from secondary-stat rolls relative to a level-dependent max. Max for a stat = (min + (max-min)*(0.5+0.5*min(statLevel,100)/100)) * ascension factor above 100, so the same printed roll scores differently at different item levels. | decompiled.js L677176-677304, L677356-677388 |

### In the game, not in the app

- Rarity odds by player level (Common..Oblivion), 100-row table, plus rarity unlock levels
- Separate Oblivion-realm drop weight model with unlock fractions 0.1/0.25/0.55/0.85 and per-rarity shape exponents
- Fortune skill: item drop chance 60/70/80/90/100 %, unlocks at player level 12, max level 5
- Midas Touch (0.5 to 3 % one-tier rarity upgrade) and Artisan (2 to 8 % quality reroll, 10 % with Oblivion point)
- Ascension skill: item level cap 100/130/160/190/240; stat level above 100 scales at 0.4 per level
- Attunement: ban 1 to 3 (plus a class bonus) secondary stats from the drop pool
- 26-stat secondary pool (including minion stats and soul link), all min rarity Rare, value roll = min + (max-min)*rand^2 with a level-scaled max
- Secondary-stat count by rarity: Rare/Epic 1, Legendary/Mythic/Ancient 2, Divine/Eternal/Oblivion 3
- Conduits: Eternal drops roll FLAME/EARTHEN 50/50, Oblivion drops roll DARK; value 10-70 with 15 % variance
- Loot filter with per-rarity DISCARD/FILTER/KEEP modes, stat/quality/conduit/stat-upgrade filters, and per-set filters with Premium dual equip
- Loot Bag: 8 slots, 20 for Premium, hunting stops when full; offline hunting (12 h cap) applies the same filter server-side
- World map hunting-ground camps: x1.1 boost on featured rarities and +10 % extra roll, with per-spot featured rarity lists
- Oblivion dungeon drops: Mythic stone, Oblivion stone, Oblivion essence formulas and a first-clear stone guarantee on floors 1-8

### Server-side or unresolved

- Server drop roll: per-mob vs per-hunt, whether a Fortune value of 100 means a guaranteed drop, and the actual rarity roll algorithm (the client table is the best proxy)
- Item level selection and the itemLevelWatermarks update rule are server-side
- Which Oblivion-realm rarities fill the remaining probability: Oblivion model weights sum to at most 33.15 %
- Mythic unlock fraction in the Oblivion model was lost in the decompile (assumed level 1)
- Whether the world-map camp +10 % is a literal extra roll or a x1.1 weight
- Boss or dungeon drops in the regular realm and any hidden pity: no client evidence
- Attunement redraw behaviour and Midas/Artisan rolls are performed server-side
- Celestial trial reward tiers (module 5931), daily chests (module 3910) and the lucky wheel (module 6501) were not extracted

## stones

In-game these are "Enchant Stones", with 6 types (Crimson/PVE_ATTACK, Verdant/PVE_DEFENSE, Azure/PVP, Eldaryn/ULTIMATE, Mythic, plus Oblivion). They drop sealed from Crusades (unlock level 35). Awakening rolls 2-5 stats per type server-side from per-type pools whose ranges the client holds. Stones are socketed one per slot in 9 equipment slots, in two sets plus a separate Oblivion-realm map. calculateEnchantStoneBonuses sums each stone's stat value times (1 + 0.06*amplifyLevel). Oblivion stones add flat Attack/HP from a 5-grade table, and their Oblivion Power is round(8 + 22*(quality-1)/99) times 1.5^(grade-1). Amplification unlocks at level 50, goes to +10, and costs Stone Dust per attempt (win or lose) at 1/1/1/1/2/2/3/3/3/4 dust for target levels 1-10 (doubled and ceiled for Oblivion). Success rates fall from 100% to 10%, and the expected dust to reach +10 is about 84.6. A stone's contribution therefore ranges from 1.0x to 1.6x its rolled values.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Amplification | src/lib/stonesData.js | No amplification modelled; per-stone value is entered as-is | Each stone has amplifyLevel 0-10 and every stat is multiplied by 1+0.06*level (1.6x at +10). Applied to all stats including PvP. Oblivion Power is excluded. | decompiled.js L1206371, L1205639-1205725 |
| medium | Stone types and sixth type | src/lib/stonesData.js | 5 types: verdant, crimson, azure, eldaryn, mythic | 6 types. Oblivion is also an Enchant Stone type: 5 stats, guaranteed Oblivion Power + PvP Attack + PvP Defense, 5 grades, flat Attack/HP. | decompiled.js L1205620, L1206738-1206808 |
| medium | Free-stat pool per type | src/components/StoneForm.svelte | Free rows offer every gear stat except PvP Attack/Defense and core attack/health | Crimson draws only from a 14-stat attack pool, Verdant only from an 11-stat defense pool, and Azure/Eldaryn/Mythic/Oblivion from a 24-stat pool. Penetration is Crimson-only. Each stat has a fixed min/max range. Flat attack/health are never rolled. | decompiled.js L1205311-1205572 |
| medium | Sacrifice vs dust | docs/Reference/Notes/socketed-stones-design.md | Old doc has no amplification system | Some in-game text still says 'sacrifice a stone' and '+8% per level, 1.8x', but the 2.7.0 code uses Stone Dust cost and a 0.06 per-level step (1.6x at +10). | decompiled.js L668825, L911427-911433 vs L1206371 |
| low | Azure PvP stat | src/lib/stonesData.js | Azure: player picks PVP Attack XOR PVP Defense | Matches in shape (one PvP stat + one classic). The game draws it from a weighted pair (Attack w20, Defense w80), a server roll. Ranges are Attack 5-25 and Defense 5-20. | decompiled.js L1205573-1205599 |
| low | Quality effect | src/components/StoneForm.svelte | Quality is display-only with no effect on any calc | Matches for non-Oblivion stones (client bonus function ignores quality and qualityBonus). For Oblivion stones quality sets Oblivion Power: round(8+22*(q-1)/99) times the grade multiplier. | decompiled.js L1205241-1205277, L1205676-1205713 |
| low | Socket model | src/lib/stonesData.js | One stone can sit in one slot per loadout, in both loadouts at once; 9 slots | Matches: 9 slots, enchantSlots (Set 1) and enchantSlots2 (Set 2), and the UI labels a stone in both sets as 'SET 1+2'. The game also has a third map, oblivionEnchantSlots, with its own stone list for the Oblivion realm. | decompiled.js L1162871-1162887, L2066440-2066463 |

### In the game, not in the app

- Stone Amplification: unlock level 50, +1 to +10, success rates 100% down to 10%, dust cost per attempt, never destroys the stone, 6% of base per level
- Stone Dust economy: grind yields by type (1/1/1/2/3/4+), amplify costs, Oblivion costs doubled
- Oblivion Stone type with grades 1-5, flat base Attack/HP table, Oblivion Power formula, Oblivion Essence upgrade costs (8/18/39/85) and grind yield
- Sealed/awaken workflow: stones drop unactivated and contribute nothing until awakened (batch awaken)
- Arcane Quarry Attunement/Tempering essences and qualityBonus on stones (quality capped at 100)
- Per-type stat pools with explicit min/max ranges and decimals, and Penetration restricted to the Crimson attack pool
- Separate Oblivion-realm socket map and stone list
- Azure weighted PvP stat draw (Attack 20 / Defense 80)

### Server-side or unresolved

- Stat roll distribution for stones is server-side. Gear uses min+(max-min)*rand^2, and the same weightExponent 2 appears in stone config, so a similar skew is likely but unverified.
- How quality and qualityBonus (Arcane Quarry attunement, tiers 10-15/15-25/25-35/35-40) change stone stat values is server-side; whether attunement tiers apply to stones or only gear is unresolved.
- Which socket set feeds the character's active stats when both Set 1 and Set 2 are populated, and how it ties to DUAL_EQUIP (level 28), was not traced.
- Server-side slot and type restrictions on socketing are unknown; the client shows none.
- Exact caller list passed to calculateEnchantStoneBonuses for each screen was not traced.
- The Oblivion upgrade cost function's argument is inferred to be the target grade (valid range 2-5). GEAR_PIECE_FRACTION 0.5 is defined but its use was not traced.
- Unit semantics of crit damage (0.05-0.16) and attack speed (0.01-0.1) stone values relative to the stats system are unresolved.

## talents

Talents are 8 fixed spec trees (2 per class, 6 tiers, thresholds 0/5/10/15/20/25 points spent in the whole set) of linear-rank passives. One point per rank, 1 point per level from lvl 15 to 43 (29 total, per set). Each talent adds valuePerRank*rank to a stat delta (some tier-6 talents add two stats), summed additively into the character's stats from the ACTIVE talent set only. Respec is 10 gems per set (resets path and points). Dual Talents unlocks at lvl 38 for 200 gems and gives a second independent set (A/B). Allocation state is server-authoritative; the client mirrors the rules for UI. Verified talent_trees_v1.json against the code literals: all 8 trees identical, so it was reused as the data basis (extended with line citations).

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Spec coverage | src/lib/constants.js, talentTreeData.js | Only Warrior (Arms, Protection) and Sentinel (Marksmanship, Disruption) trees exist | 8 specs: also Mystic Arcanum/Wildshape and Necromancer Deathlord/Doomweaver (159 talents total) | decompiled.js L1097011-1097091 (getSpecsForClass), trees L1097106-1097925 |
| medium | Attack speed talent values | src/lib/talentTreeData.js | Combat Frenzy, Rapid Nocking, Flurry Shot, Rapid Disruption ranks [3,5,8] speed | valuePerRank 0.025 (fraction) = 2.5/5/7.5 %; UI toFixed(0) rounds to 3/5/8 for display | decompiled.js L1184625-1184680 (formatTalentValue), tree literals via data/talents.json |
| medium | Dual-stat talents | src/lib/talentTreeData.js (Talent = single statKey + ranks[]) | One stat per talent | secondaryBonusPerRank on 4 tier-6 talents (Heart of the Great Bear, Fury of the Dire Wolf, Demonic Supremacy, Undying Bulwark) | decompiled.js L1096663-1096759 (calculateTalentBonuses), data/talents.json |
| medium | Stat keys | src/lib/talentLean.js, constants STAT_FIELDS | Offense/defense key sets without spell, minion, fear, soul link, disruption keys | Trees use spellDamage, spellVamp, spellCrit, disruptionChance, fearChance, spellResist, minionAttack/Health/CritChance/Lifesteal, soulLink | decompiled.js L1096863 (26-key bonus object) |
| low | Dual Talents and respec costs | src/lib/model.js (talentSets) | Two sets A/B, 29 point cap, no unlock level or costs | Set B requires lvl 38 + 200 gems; respec 10 gems per set; stats use only the active set; cap of 29 is per set | decompiled.js L1097092-1097104, L2189305-2189385, L2189803-2189900, L1209640-1209850 |
| low | Spec/ids naming | src/lib/talentTreeData.js | spec keys arms/protection, id prefixes arms_/protection_ | enum WARRIOR_DPS/WARRIOR_TANK, id prefixes dps_/tank_ (suffixes identical) | decompiled.js L665830-665850, tree literals |

### In the game, not in the app

- 4 more spec trees (Arcanum, Wildshape, Deathlord, Doomweaver)
- Dual-stat tier-6 talents (secondaryBonusPerRank)
- Minion, spell, fear, soul link, disruption, spell resist talent stats
- Dual Talents (Set B) unlock lvl 38 / 200 gems, with active-set switching
- Respec for 10 gems per set
- Per-set point accounting (each set gets all 29 points)
- Unused constant MAX_ALLOCATABLE_POINTS = 31

### Server-side or unresolved

- Server-side enforcement of allocation, respec and activation rules; server computedStats composition
- Cooldown or cost of activating the other talent set (none in client)
- Floor value used for pointsNeeded in the UI label (closure slot unresolved)
- Whether talent stats go through the same soft caps as other sources (owned by stats.md)

## skills

Skills are 14 permanent, gem-purchased upgrades unlocked from player level 8, which gifts 80 gems. Level L has effect effects[L-1], and costs[L-1] is the price of L to L+1. Seven skills have an extra Oblivion level (3000 gems) for Oblivion-unlocked players. A reset costs 200 gems and refunds all gems spent. Skills add no combat stats. Ascension (item-level cap 100/130/160/190/240) and Attunement (bans secondary stats from drop rolls, +1 slot for Mystic and Necromancer) affect gear quality indirectly. Midas Touch (rarity upgrade chance) and Artisan (quality reroll chance) also affect drops. The rest are economy or convenience (mobs per hunt, energy regen, XP, discounts, mining charges, key refund, summon success).

### In the game, not in the app

- All 14 skills with unlock levels, costs, effects and Oblivion points
- Ascension item-level cap and the linear stat scaling above item level 100
- Attunement secondary-stat bans with a class bonus
- Midas Touch rarity upgrade and Artisan quality reroll
- Skill reset (200 gems, full refund of gems spent)

### Server-side or unresolved

- Starting skill level: server-side, assumed to be 1.
- How Fortune's percentage combines with the base drop rate: server-side, not resolved.
- Exact item-level stat scaling and the watermark mechanic: server-side.
- Class bonus mapping was decoded from register-style code and matches the UI text, but the keys are inferred.
- Whether the Oblivion point is paid in gems: inferred from the UI comparing the cost against the gem balance.

## relics

Relics unlock at level 22 and come in 68 class-specific definitions (Warrior 14, Sentinel 14, Mystic 20, Necromancer 20) across three tiers: bronze (max level 10, 1 stat), silver (15, 2 stats) and gold (20, 1-2 stats). Each stat is linear in level, from baseValue at level 1 to maxValue at maxLevel. Characters equip 2 relics, plus up to 2 more slots bought with 15 silver and 8 gold medals. Upgrades cost tier medals: base + level * perLevel. Selling refunds floor(invested / 2). Medal exchange is 5:1 up and 1:3 down. Equipped relics add permanent stat bonuses (HP%, Attack%, crit, penetration, PVP ratings, minion and spell stats). The client only holds definitions, constants and display logic. Purchase, equip, upgrade, sell and exchange are server calls.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Class coverage | src/lib/relicsData.js | Only Warrior and Sentinel relic pools exist | Mystic has 20 relics (Mage and Druid hinted) and Necromancer has 20 (minion, spell and fear stats) | decompiled.js L1143163-1143967 |
| medium | Equip slots | src/lib/relicsData.js, src/lib/constants.js | PRESET_RELIC_CAP / RELIC_EQUIP_CAP = 4 slots, with medals deliberately not modelled | 2 base slots plus up to 2 bought extras: slot 3 for 15 silver medals, slot 4 for 8 gold medals. Not everyone has 4. | decompiled.js L1142530-1142573, L1142660 |
| medium | Attack speed units | src/lib/relicsData.js | speed min 8.0 / max 35.0 (percent-style) | ATTACK_SPEED baseValue 0.08 / maxValue 0.35, displayed '+0.08' with 2 decimals and no percent sign, so a flat value | decompiled.js L1142733+, formatStatValue L1345034-1345110 |
| medium | HP regen units | src/lib/relicsData.js | hp_regen treated as a percent (2-8) | HP_REGEN is displayed as '+x.x' with no percent sign, so a flat value | decompiled.js L1345034-1345110 |
| medium | Medals, costs, sell and exchange | src/lib/relicsData.js, src/lib/relicSuggester.js | Medals deliberately not modelled. The suggester treats N as free levels per relic. | Upgrade cost is tier medals, base + level * perLevel. Purchase cost is def.cost. Sell refunds floor(invested / 2). Medal exchange is 5:1 up and 1:3 down. Total to max: bronze 63, silver 252, gold 418 (excluding purchase). | decompiled.js L1142374-1142398, L1142612-1142648, L1143988-1143993 |
| low | Crit damage units | src/lib/relicsData.js | crit_mult 40-80 and 60-120 | CRIT_DAMAGE stored as a fraction (0.4-0.8, 0.6-1.2) and displayed x100 as '%'. Numerically equivalent, but the unit is a fraction. | decompiled.js L1345034-1345110 |
| low | Level clamping and level 0 | src/lib/relicsData.js relicLevelValue | Clamps level to [1, maxLevel] | statAt returns base when level <= 1 and does not clamp above maxLevel. The formula is otherwise identical (linear). | decompiled.js L1142576-1142598 |
| low | Old doc penetration values | docs/Reference/Source/game-data/Warrior Relics.txt | Crimson Charm Penetration 12-24, Dragon Core Penetration 12-50 (old doc) | Crimson Edge 6-10, Dragon Core 6-22. The app already matches the code. | decompiled.js L1142783, L1142843 |
| low | Unlock level and ids | src/lib/relicsData.js | No unlock level. Ids are kebab-case, e.g. 'crimson-charm'. | Unlock level 22 (UNLOCK_LEVELS.RELICS). Game ids are relic_crimson_edge, so the app id 'crimson-charm' is a non-matching label for Crimson Edge. | decompiled.js L668649, L1142783 |

### In the game, not in the app

- Mystic relic pool: 20 relics, with Mage-hinted and Druid-hinted entries (spell damage, spell crit, spell vamp, disruption, spell resist)
- Necromancer relic pool: 20 relics with minion attack / health / crit / lifesteal / attack speed, soul link, fear chance and spell stats
- Relic stat types the app lacks: SPELL_DAMAGE, SPELL_RESIST, SPELL_CRIT_CHANCE, SPELL_VAMP, DISRUPTION_CHANCE, FEAR_CHANCE, MINION_*, SOUL_LINK, MISS_CHANCE, LIFESTEAL
- Medal economy: bronze/silver/gold medals, upgrade-cost formula, sell refund, medal exchange 5:1 and 1:3
- Purchasable extra slots (15 silver, then 8 gold), giving max 4 equipped
- Relic Shop (purchase with medals)
- Sentinel migration map from legacy shared relic ids to Sentinel ids
- specHint spec badges on relics (UI only)

### Server-side or unresolved

- Authoritative purchase, upgrade and sell charges and the starting level on purchase are decided server-side (/relics/* endpoints).
- Whether equip enforces a limit such as one relic per tier or no duplicates is server-side.
- Whether specHint restricts equipping is unknown. The client only uses it as a UI badge.
- RELIC_CONSTANTS.UNLOCK_LEVEL = 18 has no reader found. The effective unlock is UNLOCK_LEVELS.RELICS = 22.
- How relic stats enter the final stat pipeline is owned by stats.md. This module only supplies the numbers.
- Seven or eight relics have cost and maxLevel assigned via reused registers. I resolved them by register tracing and they fit the tier patterns.

## sigils

Sigils are Honors-forged collectibles (unlocked at level 25 for Warrior/Sentinel, 17 for Mystic/Necromancer) equipped in up to 3 slots (unlocking at levels 25/28/32, or 17/28/32) plus a class-specific utility slot. Each equipped sigil adds flat Attack and Health: floor(base * (1 + 0.1*(L-1)) * 3^(altarTier-1)) with rarity bases 166/1300 (Common) up to 9000/58000 (Legendary) and 6000/40000 (Ancient). This is the bulk of their passive power. Common auras add percent stats. Active spells (damage, DoT/bleed/poison, heal, timed buffs, shields, summons, forms) scale with sigil level only (x(1+0.08*(L-1)), toFixed(1), clamped by a per-stat max). Damage is a percentage of the player's Attack. Cooldowns and durations never scale. Legendary stack sigils and Ancient transforms (60s, once per fight, charged by Chrono Flux max 7000) change combat behaviour. Forge, rarity rolls, fragments and equip validation are server-side; the client holds the odds curves, Altar level costs and all formulas.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Bulwark of Thorns numbers | src/lib/sigilsData.js (notes) / sigilEffects.js | +4% Health%, +2% DMG Reduction, +4% Thorns per stack; unblocked hit burns 2 stacks | Warrior Bulwark: +8% Max HP, +4% DR, +7% Thorns per stack, unblocked hit burns 1 stack (the 4/2/5/burn-2 numbers belong to the Mystic Druid's Primal Instinct bear form) | L1069192-1069212, L1070149-1070200 |
| high | Missing per-stat caps on buff magnitudes | src/lib/sigilsData.js (SIGIL_EFFECTS) | No cap on iron-bastion block_chance, phantom-veil miss_chance, sanguine-rush lifesteal, blinding-mark blind_chance, withering-touch regen debuff (grow +8%/level uncapped; e.g. Blinding Mark 99.6% at L30) | Caps: Block 25 (reached L20), Miss 25 (L10), Lifesteal 25 (L10), Blind 50 (L10), Wound regen reduction 85 (L7); Warborn Fury Penetration 15 cap 20 | L1069150-1069425 (maxValue literals), L1067622-1068264 (min(..., max)) |
| high | Sigil damage numbers | src/lib/sigilEffects.js / SigilsScreen.svelte | Damage, tick damage and regen debuff are user-typed flat numbers per sigil | Spell damage = floor(Attack * attackPercent/100) (attackPercent level-scaled and capped), then Spell Damage % multiplier; DoT/bleed ticks use damagePerTickPercent per stack. All derivable from level and the character's Attack. Table in sigils.json. | L1090474-1092345 (processSpellsTick), L1090892 (modSpellDmg), L1067622-1068264 |
| medium | Stat-derivation FP quirk | src/lib/sigilsData.js | sigilStat = floor(curve*(L+9)*3^(tier-minTier)); 14 level-5 Health rows left as an unexplained 'game quirk' | floor(baseHp*(1+(L-1)*0.1)*3^(tier-1)); the residual is IEEE-754 (1300*(1+4*0.1)=1819.9999999999998 -> 1819). Same off-by-one at L14 and L19 for Common/Epic HP and Ancient Attack at L14 (not scraped). App's curve*(L+9) form gives 1820 etc. | decompiled.js L1067546-1067621 (getSigilBonusAttack/Hp), L1066773 (sigilTierStatMult) |
| medium | Legendary/Ancient forge-tier gate | src/lib/sigilsData.js | SIGIL_MIN_FORGE_TIER Legendary 2, Ancient 2; sigilStat returns 0 below that and the UI blocks equip | Stat formula is uniform 3^(tier-1) for every rarity with no equip gate; Legendary just cannot be forged below tier 2 (LEG_UNLOCK_TIER). Ancients are not tier-gated in client code, so an Ancient at tier 1 gives 6000/40000 x(1+0.1(L-1)). | L1066809 (isSigilLegendaryUnlocked), L1068838 (LEG_UNLOCK_TIER=2), L1066773 |
| medium | Sanguine Rush Attack Speed steps | src/lib/sigilsData.js | stepsFrom {1:20, 5:30}, stops at 30% | Value is 0.2*(1+0.08(L-1)) rounded to ONE decimal: 0.2 (L1-4), 0.3 (L5-10), 0.4 (L11-16), 0.5 (L17-22), 0.6 (L23-29), 0.7 (L30), cap 0.8. Not a hand-observed step. | L1067622-1068264 (toFixed(1)), L1069210-1069232 defs (value 0.2 max 0.8) |
| medium | Slot count and unlock levels | src/lib/constants.js (PRESET_SIGIL_CAP) / SigilsScreen | Always 3 equip slots; no level gating of slots | Slots unlock by character level: 1 at 25, 2 at 28, 3 at 32 (Mystic/Necromancer 17/28/32). Mystic Mage gets an extra shield slot, Druid a form slot, Necromancer a summon slot. | L1068809-1068821, L1066498-1066537 |
| medium | Stormcaller / Ancient transform values | src/lib/sigilsData.js | Flameborn Attack +80%, HP +50%; Earthwarden +30%/+100%; Stormcaller unknown; 'Charge 7000 Chrono Flux' text | Also Flameborn +12 Penetration, Earthwarden +16 Block, Stormcaller +60% Attack, +70% HP, +20% Miss; PEN/BLOCK/MISS go through the sheet soft cap; 60s; flux max 7000 confirmed | L1069467-1069552, L1089965-1090085, L1094180 |
| low | Siegebreaker Mark Block strip | src/lib/sigilsData.js | strips 3% HP Regen, 4% Block Chance, 4% Miss, 4% Blind per stack | Sentinel Siegebreaker strips 3% HP Regen, 3% Block, 4% Miss, 4% Blind (Druid Rend wolf form is the 4% Block variant) | L1069445-1069466 |
| low | Warborn Fury Penetration | src/lib/sigilsData.js | penetration omitted, manual input | 15 at L1, cap 20 (L6), scales like other buff stats | decompiled defs for Warborn Fury (L1068994 block) |
| low | Cooldown/duration ignore level | src/lib/sigilsData.js | cooldownSec/durationSec are fixed catalogue values | Confirmed fixed at all levels; glyphs only reduce cooldown, floor 1000 ms (MIN_SIGIL_COOLDOWN_MS) | L1067622-1068264, L1080869 |

### In the game, not in the app

- Mystic (21 entries: Mage + Druid variants, forms, shields) and Necromancer (10 entries, minions) sigil catalogues, with their utility slots (shield / form / summon)
- Sigil Activation Conditions (unlock level 54): ON_COOLDOWN, ENEMY_HP_BELOW 80/60/40/20 for damage/debuff (PvP only), MY_HP_BELOW 80/60/40/20 for buff/heal (PvE and PvP)
- Slot unlock levels by character level (25/28/32 or 17/28/32)
- Sigil Altar tiers (cap 3) with Altar level xp curve round(6+0.5L)*2^(tier-1), forge cost 10*2^(tier-1) Honors, evolve keeps 75% Honors and destroys all sigils
- Forge rarity odds as banded ease curves of Altar level (Legendary only from tier 2)
- Sigil levels 1-30 via fragments (L+1 per level-up); Ancient sigils are unique and stay level 1
- Active spell damage as % of Attack with level scaling and per-stat caps; DEBUFF types (Wound/Bleed/Poison/Slow/Crit-down), silence, paralyze, fear, blind-on-tick
- Combat ceilings (Miss 90, Blind 60, DR 75, Block 85, ...) that clamp sigil buffs
- Stack sigil mechanics: Bulwark/Sunder/Elusive/Siegebreaker exact per-stack values, decay 1.75/s, burn counts
- Druid forms (Ursine/Lupine/Dire Ursine/Alpha Lupine) multipliers: gear HP, Attack, Attack Speed, plus Tank requiring Ursine form
- Arcane Momentum (30 stacks, Spell Damage/Crit/Vamp), Abyssal Ward and Void Aegis shield refill flags
- Sigil power-rating term SIGIL_RARITY_POWER (Uncommon 300, Rare 700, Epic 1500, Legendary 2900, Ancient 1000)

### Server-side or unresolved

- How the forge-odds helper receives its sixth argument (Altar level) - read odds as uncommon/rare/epic/legendary/0 (L1067031, pw L1068840)
- Whether an equipped Ancient sigil consumes one of the 3 generic slots (UI says 'alongside'; counter excludes Ancients; validation is server-side)
- Final spell damage multiplier k in modSpellDmg and the crit path (see combat-pve.md)
- How the aura ATTACK_SPEED accumulator is merged into the final Attack Speed stat (fraction 0.1 = +10% assumed)
- Chrono Flux gain units per event and CHRONO_FLUX_RECHARGE_FACTOR=50 role
- Common value of SIGIL_RARITY_POWER (register not resolved); Ancient=1000 looks odd vs Legendary 2900
- Meaning of the optional 4th argument of isConditionMet (MY_HP_BELOW short-circuit)
- Server-side: rarity roll, duplicate/companion drops, fragment grants, level-up, evolve execution, authoritative computedStats
- BEAR/WOLF assignment of two-variant Druid spells was taken from decompile order plus description text, not an explicit key
- Arcane Bargain (skill_sigil_discount) discount magnitude (skills.md)

## mounts-glyphs

Mounts are server-granted instances with rolled baseHp/baseAtk (percent points), level 1-5, and a socket board of 3 minor, 2 major and 1 mythic glyph. Only the active mount contributes stats: attackPercent += round(baseAtk*(1+0.1*(level-1))) and hpPercent += round(baseHp*(...)), plus one rolled secondary stat per unlocked minor glyph. Major glyphs give no stats. They are sigil modifiers (42 types across Warrior, Sentinel and Mystic) that retune cooldown, damage, thorns, paralyze, bleed stacks and so on, indexed by rarity. They apply only when the sigil is equipped and the glyph is on the active mount, and duplicates keep the highest rarity. Mounts also cut world-map travel time by a rarity-based percent. Summoning, XP, drops and rolls are server-side; the client holds mirror helpers and the request shapes. The two mythic glyphs have only descriptive text in the client.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Mount star vs level | src/lib/mountsData.js | Per-mount observed [min,max] envelopes for stars 1-3; fallback to the nearest observed star; no data for stars 4-5 | 'Star' is mount level 1-5 (MOUNT_MAX_LEVEL=5). Stats are baseHp*(1+0.1*(level-1)), rounded, from one rolled base. Envelopes at any level follow from rarity range, bias and this formula. | decompiled.js L1072522-1072546, L1072863-1072866 |
| high | Major glyph catalogue | src/lib/glyphsData.js | 17 families (Warrior and Sentinel subsets) with a 'from + step*rank' law and an observedRarities allow-list | 42 major glyph types: Warrior 12, Sentinel 13, Mystic 17 (9 mage, 8 druid with requiredSpec), Necromancer 0. Each lists explicit 5-value arrays for Common to Legendary, so every rarity is exact and the 'estimated' projection is unnecessary. | decompiled.js L1083900-1084786 (L1084092-1084733 entries) |
| high | Bleed stack ceiling glyphs (Emberhoard Sigil, Hemorrhagic Excess) | src/lib/glyphsData.js | maxStacks flat 9; tickDamagePct = 40 + 4*rank | maxStacksBonus is [1,1,2,2,3] by rarity, not flat. Applied as maxStacks=(maxStacks ?? 1)+bonus. stackDamagePercent [10..50] multiplies damagePerTickPercent and rounds (Common 40 to 44, matches app). | decompiled.js L1084xxx sg-hemorrhage-stacks / sg-ember-stacks; apply L1081100-1081150 |
| medium | Mount catalogue size | src/lib/mountsData.js | 11 mounts; Celestial Moth and Bone Wyvern are left out as 'art but no data' | 13 species. Celestial Moth (hp-bias) and Bone Wyvern (attack-bias) are Legendary with stat range [44,49]. Ember Wyvern, Void Manta, Sunfire Phoenix and Abyss Ray are not in the client species table. | decompiled.js L1072742-1072773 |
| medium | Mount roll model | src/lib/mountsData.js | HP and ATK are free bounded sliders within an observed envelope | baseHp/baseAtk are uniform integer rolls whose range is set by rarity range and species bias (attack/hp/balanced). My derived level-1 ranges reproduce all of the app's star-1 data. Rolled once per instance, so a level-up cannot re-roll them. | decompiled.js L1071942-1072034, L1072841-1072862 |
| medium | Per-mount scope | src/lib/mountsData.js / glyphs | One entry per species with a star and rolled bonuses; presets pick a mount id | ownedMounts is an array of instances (uuid id, species, rarity, rolled bases, level, xp, glyphs). A preset snapshot stores mountId. Whether duplicates are separate instances or merged into XP is server-side. | decompiled.js L1071356-1071632, L1144135-1144141 |
| medium | Bramblethorn Crest | src/lib/glyphsData.js | thornsPerStackPct only (4 + 0.2*rank) | Also adds maxStacksBonus [0,0,0,1,1] to Bulwark of Thorns. | decompiled.js sg-bulwark-thorns entry, apply in resolveSigilGlyphMods L1083530-1084000 |
| medium | Missing Festering Coil (issue #9) | src/lib/glyphsData.js | Absent; planned as maxStacks 3 flat on Venom Wound | sg-venom-stack, kind POISON_STACK, maxStacks [3,4,5,6,7] by rarity. It sets poisonPermanentMaxStacks as an absolute ceiling (max of sources), not a flat 3. | decompiled.js sg-venom-stack entry; resolve code L1083530-1084000 |
| medium | Glyph combination rules | src/lib/glyphsData.js | Does not state how multiple glyphs of one type stack | Deduped by glyphType, keeping the highest rarity. Different types on the same sigil add (cooldown, damage, paralyze, bleed). Sunder decay takes the min and poison stacks the max. Cooldown floor is 1000 ms. | decompiled.js L1083530-1084000, L1081205-1081239 |
| medium | Mythic glyphs | notes in glyphsData.js header and big-rework-v1-notes.md | Mythic glyphs 'do not exist in game yet' | Two mythic-tier types exist in the catalogue: Celestial Wrath (+25% crit damage, rising to +40% against targets below 30% HP) and Astral Bond (+20% to all of the mount's stats while deployed in battle). Only descriptive text is present in the client; no applying code was found. | decompiled.js L1225965-1225975 |
| medium | Minor glyphs are free-form | src/lib/glyphsData.js header | Minor glyphs are free-form {statKey, value} user entries | 12 minor catalogue types with fixed rarity. At unlock each rolls ONE secondary stat uniformly from the class-filtered 26-stat pool, with quality in a rarity band (Common 0.1-0.2 ... Legendary 0.8-1, Mythic fixed at 1) and value=min+(max-min)*quality rounded to the stat's decimals. These give hard value bounds the UI can enforce. | decompiled.js L1225362-1225546, L1226000-1226020, L677317-678505 |
| low | Mount XP and level cap | src/lib/mountsData.js | Not modelled (stars are set by hand) | XP per level [4,30,100,300] to reach levels 2-5; duplicate XP is 1 per duplicate; max level 5. | decompiled.js L1072867, L1072517-1072521 |
| low | Sealed glyph state | src/lib/glyphsData.js / model | No sealed concept | Glyphs drop sealed; only unlocked (sealed===false) glyphs have effect. A sealed glyph has no rolled secondary. | decompiled.js L1224994, L1080838 |
| low | Mount bonus bundle | src/lib/totals.js (mountContribution) | Mount adds HP% and ATK% from rolled values; glyph secondary summed separately | Mount adds attackPercent and hpPercent; glyph secondaries are added to the same 27-key bundle, and healthPercent and hpPercent both feed the same HP% accumulator. | decompiled.js L1224876-1225043, L1216797-1216808 |

### In the game, not in the app

- Mount speed by rarity (Common 40, Uncommon 60, Rare 100, Epic 220, Legendary 400 percent) used for world-map travel time: seconds = round(baseMinutes*60/(1+pct/100)); zone legs [180,360,480,600,720] min, intra-zone 120-270 min
- Summoning altar: tiers Common-Legendary, max altar level 10, per-tier dust costs, summonsToMax, success 0.6 base improved by Summoner's Pact (60-100 percent), unlock at level 40
- Mount XP/level system (levels 1-5, +10 percent of base per level, XP [4,30,100,300])
- Glyph economy: transmute N same tier/rarity glyphs to one rarity higher (3 per step, final step 5/4/3 for minor/major/mythic tier); reforge 2 glyphs (3 at Legendary/Mythic) for a different type; glyph unlock rolls the secondary
- Rarity quality bands and a 26-stat secondary pool with min/max/decimals for minor glyphs
- Major glyph kinds not modelled by the app: DAMAGE (Tempest Quiver, Overcharged Focus, Deepbrand Rune), SHIELD_POWER, CC_EXTEND, ATTACK_SPEED_BUFF for Mystic, ELUSIVE_BUFF (Evasive Crescendo), POISON_STACK (Festering Coil)
- Mystic major glyphs (17, with MYSTIC_MAGE/MYSTIC_DRUID requiredSpec) and the Warrior and Sentinel glyphs the app lacks (Verdant Renewal, Tempest Quiver, Crimson Cadence, Spectral Alacrity, Bloodfletch Tempo, Feverpulse Emblem, Festering Coil, Evasive Crescendo)
- Cooldown floor of 1000 ms after glyph cooldown reductions
- Celestial Trial is the glyph source: Normal drops minor, Hard drops minor and major, with level-interpolated rarity chances

### Server-side or unresolved

- Server-side summon outcome, duplicate handling and mount XP source
- Whether altar-tier upgrade wipes mounts (pet altar does)
- Glyph drop numeric chance anchors per Celestial Trial boss level (register-aliased in the decompile)
- How mythic glyphs g-wrath and g-astral are applied, if at all
- Exact per-class restrictions of SECONDARY_STAT_POOL beyond the class-unique lists
- Whether the client mirror formulas for rollMountStats/rollGlyphSecondary match the server (client has no call sites for them)
- Base cooldowns and stack numbers of the sigils themselves (owned by sigils.md)
- Precise line numbers for some sub-ranges are approximate (marked in doc as ranges)

## pets

The game has 18 pet species, Common to Ancient, each with a fixed baseAttack, baseHp and secondary-slot count. A pet has no level of its own: its level is the account-wide Pet Altar level (1-50), derived from altar.totalXp and tier. The equipped pet adds flat ATK/HP of floor(base * (1 + 0.07*(altarLevel-1)) * (t^2-t+1)), with altar tier t from 1 to 8. It also adds server-rolled secondary stats scaled by (1 + 0.02*(altarLevel-1)), which does not depend on tier. Altar XP per level is (95L+80), with an extra x(1+0.15*(L-44)) from level 45, times 2^(tier-1). It comes from sacrificing pets (flat XP per rarity). Ascending the altar tier releases the collection and resets the altar to level 1. Coins and drop odds also reset. Egg rarity odds are interpolated from lifetime eggs purchased. The pet term in the power score is separate and display-only.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Secondary stats scale with altar level | src/lib/petsData.js | Secondary rolls never scale with tier or level (petStats adds s.value raw) | Secondary value = parseFloat((value*(1+(altarLevel-1)*0.02)).toFixed(2)), so x1.98 at altar level 50. Tier does not scale them. | decompiled.js L1188479-1188497, applied at L1221424-1221428 |
| medium | Max altar tier | src/lib/petsData.js | COMPANION_MAX_TIER = 10; multiplier table extends to T10 = x91 | PET_ASCEND_CONSTANTS.MAX_TIER = 8, so multipliers stop at T8 = x57 | decompiled.js L1188731 (TIER_STAT_MULT 3, TIER_XP_MULT 2, MAX_TIER 8) |
| medium | Legendary secondary slot count | src/lib/petsData.js | PET_SECONDARY_SLOTS_BY_RARITY.Legendary = 2 | All 3 Legendary species (Infernal Drake, Frost Wyrm, Celestial Gryphon) have secondaryStatCount 3. Common 1, Uncommon/Rare/Epic 2, Mythic/Ancient 3. | decompiled.js L1189184-1189207 |
| medium | Secondary stat pool | src/lib/petsData.js | 16 secondary types in SECONDARY_STAT_RANGES, with scraped min/max envelopes | Bonus calculator handles 26 types. Missing from the app: SPELL_CRIT_CHANCE, SPELL_VAMP, DISRUPTION_CHANCE, FEAR_CHANCE, MINION_ATTACK, MINION_HEALTH, MINION_CRIT_CHANCE, MINION_LIFESTEAL, SOUL_LINK, MINION_ATTACK_SPEED. Roll ranges are server-side and not in the client. | decompiled.js L1221429-1221739, enum L665656-665713 |
| medium | Companion count and tier availability | src/lib/petsData.js | 36 companions in 18 tier-1/tier-2 pairs; tier-1 pets only obtainable at altar tier 1, tier-2 pets from tier 2 up | 18 species. The 'tier-2' names are evolved display names of the same species, shown when altar tier >= 2. Stats and species are identical; there is no tier-gated catalogue in the client. | decompiled.js L1188172-1188200 (getPetDisplayName), L1188735-1188808 (EVOLVED_PET_NAMES) |
| low | Primary stat curve and rounding | src/lib/petsData.js | Fitted slope/intercept per companion, with different fits for the tier-1 and tier-2 partners (e.g. Dust Mite 16.8514 vs Dust Stalker 16.6667), Math.round | Exact formula: floor(baseAtk*(1+0.07*(L-1))*tierMult). Both names of a pair share the same base stats, e.g. Dust Mite/Stalker base 240 gives 16.8*L+223.2. Result is floored, not rounded. | decompiled.js L1188403-1188478 and species bases L1189087-1189231 |
| low | Altar XP model | src/lib/petsData.js | Takes altar.level as an input; no XP curve or tier XP scaling | Level derived from totalXp. need(L,t)=floor((95L+80)*(L>=45?1+0.15*(L-44):1)*2^(t-1)). Tier 1 total to level 50 = 130,663, doubling per tier. | decompiled.js L1187925-1187975, L1187977-1188048 |

### In the game, not in the app

- Altar XP curve per level and tier, with a x2 per tier XP multiplier
- Sacrifice XP per pet rarity (30 up to 9000) and an auto-sacrifice-on-hatch feature
- Egg economy: 100 coin base price, Bargain Hunter discount, max 20 unhatched eggs, max 100 owned pets, quick-open of 10/20/50
- Rarity drop odds that shift with lifetime eggs purchased (21-row interpolated table)
- Pet power-score term: PET_RARITY_POWER * altarLevel/50 * 3^(tier-1)
- 10 rarities for eggs, up to Oblivion, though species only exist up to Ancient
- Favorites protect pets from auto-sacrifice
- Legacy per-pet merge/XP system (calculateMergeXp, altarXpFromLegacyPet) kept for migration
- Ascend resets coins and drop odds (totalPetsPurchased) as well as releasing the collection

### Server-side or unresolved

- Secondary stat value roll ranges per stat and rarity are server-side, so the app's min/max envelopes cannot be verified from the client.
- Which species an egg hatches into, and what a Divine/Eternal/Oblivion egg hatches into, are server-side.
- Post-ascend altar totalXp, coin balance and surviving eggs are server-set.
- The divine column in rarity weight rows 500-700 is read from register state (constant 0.3). It looks suspicious.
- Pet unlock level (petsUnlocked) was not found.
- Whether the server still performs legacy merges.
- Bargain Hunter's exact discount-per-level table was not read; it belongs to skills.
- Pet combat/art modules (5379, 5610, 5727, etc.) were not read for hidden combat behavior.

## awakening

Awakening unlocks at level 45 and gives 1 point per level up to 59 (max 15 points). The player picks Shadow (offence) or Radiant (defence). Each point adds a fixed, linear stat bundle (value x points, rounded to 1 decimal, or 2 for attack speed). The bundle is chosen by spec override first, then class override, then the path default, and an override replaces the whole bundle. The path default is the Warrior one. Path choice, point spending and reset are server calls. The bundle feeds the shared stat pipeline next to stones, fortress, transcendence and mounts. It adds roughly +30% Attack for Shadow or +37.5% HP for Radiant at 15 points.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Mystic and Necromancer Radiant | src/lib/awakeningData.js | only Warrior and Sentinel are defined, so Mystic/Necromancer get null | hpPercent 2.5, hpRegen 0.7, spellResist 0.5 per point | decompiled.js L1222290-1222303 |
| high | Shadow for spell classes | src/lib/awakeningData.js | Shadow is identical for all classes (attack 2, crit 0.5, critMult 2, pen 0.6) | Necromancer: attack 2, critDmg 2, spellCrit 0.5, spellVamp 0.4 and no crit or pen. MYSTIC_MAGE spec: critDmg 2, spellDmg 2, spellCrit 0.5, spellVamp 0.4 and no attack, crit or pen | decompiled.js L1222249-1222270 |
| medium | Sentinel Radiant Miss Chance | src/lib/awakeningData.js | miss_chance 0.5/pt | missChanceFlat 1/pt (blind 0.5, paralyze 0.2) | decompiled.js L1222285 |
| medium | Spec dependence | src/lib/awakeningData.js | Bundle depends on path and class only | Spec override (MYSTIC_MAGE under Shadow) takes precedence over class override | decompiled.js L1222046-1222121 |
| low | Points cap and gating | src/components/AwakeningScreen.svelte | Fixed 0-15 allocator, freely editable, ignoring character level | Available = max(0, min(level,59) - 44 - spent), zero below level 45. Points are spent one at a time via a server call. Path switch or reset costs gems and sets level to 0 | decompiled.js L1222198-1222229; strtab.txt L24958 |
| low | Attack speed / rounding | src/lib/awakeningData.js | no rounding, no attack speed or lifesteal fields | Result rounded with toFixed(1) (toFixed(2) for attack speed); bundle has 17 keys including attackSpeed and lifesteal, all 0 in 2.7.0 | decompiled.js L1221780-1221985 |

### In the game, not in the app

- Spell stats on the Awakening bundle: spellDamageFlat, spellCritChanceFlat, spellVampFlat, spellResistFlat
- Specialisation-level overrides (MYSTIC_MAGE)
- Class overrides for Necromancer and Mystic
- Gem cost to reset the path (UI text says 50 Gems)
- Quest 'Awakened' completes at awakeningLevel >= 1
- Rounding of the bonus bundle to 1 decimal (2 for attack speed)

### Server-side or unresolved

- Whether the 50 gem reset cost is a fixed server constant (only seen in UI text)
- How the Flat keys are applied in calculateTotalStats (percent vs raw), not read; see stats.md
- Server rules for choose-path and awaken validation
- Whether the +1 preview offset in the view is exactly 1 (register r13 not traced)

## transcendence

Transcendence is a level-55 character-wide node board. The player spends Mythic Ichor (from Mythic Crusade, earn rate server-side) to allocate nodes outward from a free Awakened Core at (0,0). Every board is a 279-cell grid (core, 255 common, 14 uncommon, 7 glyph sockets, 2 sigils). It is generated by buildBoard from constant tables and differs per class and spec (6 boards: Warrior, Sentinel, Mystic Mage/Druid, Necromancer Doomweaver/Deathlord). Each node adds a flat stat (common 0.4-1.5 depending on stat, uncommon is two stats doubled). The bonus is a pure additive sum over allocated nodes, fed into the shared stat pipeline as the transcendence source. Ichor cost depends on a global slot counter (price brackets 1..80, uncommon = 3 slots, sigil flat 30), so the full board costs 13285 Ichor. Up to 4 Transcendence Presets (unlock Lv58, slot gem prices 0/1000/1500/2000) each hold their own allocation.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Class coverage | src/lib/transcendenceData.js | Only Sentinel and Warrior trees exist | Six boards: Warrior, Sentinel, Mystic Mage, Mystic Druid, Necromancer Doomweaver, Necromancer Deathlord, each with its own stat pools and uncommon nodes | decompiled.js L1218021-1221319 (boardFlavor, atkPoolFor, defPoolFor, notableOverridesFor) |
| medium | Warrior node data | src/lib/transcendenceData.js | Warrior 4:9 is paralyze_chance 0.2; Warrior 11:22 has statKey 'health' (not a valid key) | Equivalent cells are Block 0.4 (col -10,row -17) and Max HP 1 (col -3,row -4) | derived board vs app, buildBoard L1218446; stat pools L1220xxx slot9 |
| medium | Removal rule | src/lib/transcendence.js | No removal connectivity rule documented in the pure logic | A node can be removed only if all other allocated nodes remain connected to the core; refund is the difference of slot-based totals | canRemoveNode L1219820, removeRefund |
| low | Attack Speed unit | src/lib/transcendenceData.js | speed value 1 (common) / 2 (uncommon) | attackSpeedFlat 0.01 / 0.02, shown x100 as 1% / 2% | L1220224 (pool value), formatStatValue module 6613 L2203826+ |
| low | Start node / core | src/lib/transcendence.js | startPosition 14:25 is the first unlockable node with no prerequisite | A free non-allocatable Awakened Core sits at (0,0) (app 14:26); 14:25 is simply the only node adjacent to it. Reachability is 'linked to core or an allocated node' | isReachable L1219780; core node in buildBoard |
| low | Sigil names | src/lib/transcendenceData.js | Sigils are anonymous type 'sigil' nodes with no species | Left sigil = Earthwarden (Sentinel: Stormcaller), right = Flameborn; sigil grants an Ancient Sigil species | _closure1_slot31/32 L1221070-1221086 |
| low | Sigil/socket status | src/lib/transcendence.js | Glyph sockets are inert and excluded from the walkable graph; sigils allocatable | Same: sockets not allocatable (kind not in isAllocatableKind), sigils allocatable; but UI still shows stale 'coming soon' strings | isAllocatableKind module 4299; i18n nodeSheet |

### In the game, not in the app

- Per-class/spec boards for Mystic (Mage, Druid) and Necromancer (Doomweaver, Deathlord) with distinct stat pools and Necromancer exclusion of crit chance, lifesteal, penetration
- Named uncommon nodes with flavour effects (14 fixed positions, overrides per class/spec)
- Deathlord Dominion nodes (4 positions, dominionFlat +1 each) and minion stats (minionAttack/Health/Crit/Lifesteal/AttackSpeed, soulLink)
- Druid-only flag: Damage Reduction and Block are Ursine-form only
- Transcendence Presets: 4 max, 1 free, gem prices 1000/1500/2000, Lv58, name <=18 chars, 12 icons, linkable from build presets via transcendencePresetId
- Ichor is a shared capacity per preset (remaining = earned - spent on open board)
- Tier names (Ascendant, Exalted, Radiant, Mythic, Transcendent) and row bands
- Allocation order independence: total cost = prefixSum(slots) + 30*sigils; full board = 13285 Ichor
- Removal connectivity rule and refund formula; reset endpoint
- Unlock at Lv55; server endpoints /transcendence, allocate, remove, reset, presets/*

### Server-side or unresolved

- Mythic Ichor earn rate per Mythic Crusade clear (server)
- Whether reset has a gem/Ichor cost (none visible in client)
- Sigil grant/revoke logic (server: grantedSigil, revokedSigilSpecies)
- Future function of glyph sockets (client has 7 cells and text only)
- Class key attribution of CLASS_EXCLUDED_SECONDARY_STATS (decompiler lost keys; Necromancer inferred)
- How Dominion nodes are capped or combined with other Dominion sources (see classes.md)

## clan-fortress

The only clan system that gives character stats is Fortress ownership. Each owned fortress group (TOP, BOTTOM, CORE) adds a fixed combat stat block to every clan member, once per group. Non-combat income bonuses come with it: XP income, Crusade Seals/day, and Raid Keys/day for CORE. BOTTOM's Damage Reduction and Block are remapped by class: Sentinel gets Miss and Blind, Mystic gets Lifesteal and HP Regen, Necromancer gets Health% and HP Regen. Everything is added into the same accumulators as other stat sources. Fortress stars add +4% XP per star and make the boss take more damage. Sieges run on a fixed weekly schedule, with a boss shield, a contribution bonus and a 3x/2x conquest threshold. Clan rank, Clan Wars (war points, session rewards), the War Pact skill and Village Raids give only rewards or discounts, not stats. Raid and war fight simulation is server-side.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | BOTTOM buff, class remap | src/lib/totals.js | FORTRESS_BUFF_STATS.bottom grants health_pct 5, hp_regen 3, dmg_reduction 5, miss_chance 5, block_chance 3, blind_chance 3, pvp_defense 15 to every class at once | BOTTOM gives healthPercent 5, hpRegen 3, damageReduction 5, blockChance 3, pvpDefense 15; DR and block are then remapped by class. Warrior keeps DR and block; Sentinel gets miss 5 and blind 3 instead; Mystic gets lifesteal 5 and hpRegen +3 instead; Necromancer gets healthPercent +5 and hpRegen +3 instead. The app double counts miss/blind alongside DR/block. | decompiled.js L1224050-1224075 (FORTRESS_BUFFS), L1222835-1222947 (getFortressBuffCombatForClass), L1224076-1224081 (remap tables) |
| medium | TOP buff attack speed unit | src/lib/totals.js | top.speed = 3 | attackSpeed = 0.03, shown as '+0.03 Atk Speed' with no % sign. The sum is added into the same accumulator as base attackSpeed. The app may be off by 100x depending on how its speed stat is scaled (stats.md owns that). | decompiled.js L1224054, L910370, L1223419-1223426, L1216767-1216768 |
| low | Non-combat fortress bonuses | src/lib/totals.js, src/components/PresetsScreen.svelte | Fortress buffs are stat-only checkboxes | Each owned group also gives xpIncomePercent (TOP 5, BOTTOM 5, CORE 10), +1 Crusade Seal/day, and CORE +1 Raid Key/day. Stars add +4% XP each. | decompiled.js L1224056, L1224064, L1224072, L1222661-1222805 |
| low | Fortress stars | src/lib/model.js | No star concept | Stars 1-5 per TOP/BOTTOM fortress (CORE never). +4% XP per star; boss damage amp 0/0/50/200/500/1000% by stars, +500% per extra star. | decompiled.js L1223969-1223972, L1224396-1224469, L910340 |
| low | Ownership exclusivity | src/lib/rosterStore.svelte.js | top and bottom mutually exclusive, core independent | Consistent. A clan may hold one TOP/BOTTOM fortress at a time; CORE is independent. Enforced server-side. | decompiled.js L910352, L910364 |

### In the game, not in the app

- Fortress stars and the siege boss vulnerability multiplier
- Per-class remap of the BOTTOM buff (Sentinel, Mystic, Necromancer)
- Non-combat clan bonuses: XP income, Crusade Seals/day, Raid Keys/day
- Fortress Siege system: weekly schedule, boss shield, contribution bonus, conquest thresholds, attack and defense rewards, medal tiers
- Clan ranks by War Power, Clan Wars (war point rates, double-reward days, session rewards), Final Battle squads
- War Pact skill (Crusade honor-cost discount, 6 levels, unlocks at level 46)
- Village Raids: 5 raids x 8 steps, mob scaling and influence rewards

### Server-side or unresolved

- War Power formula for clan ranks (server-side)
- Unit of the fortress attackSpeed 0.03 relative to the app's speed stat
- CLAN_WAR_MIN_MEMBERS is 8 in code but UI text says 2 members; enforcement unknown
- Meaning of WAR_POWER_TRANSFER ratios (1 / 0.75)
- Clan Wars and Fortress PvP duel resolution, raid combat resolution and fortress capture resolution are server-side
- Whether raid influence is awarded on every clear or only the first
- Argument roles of calculateBossShield (a1 assumed to be a starting-defender guard)
- FortressBuffCard UI (module 5591) was not read in detail

## pve-content

PVE content (world map camps, 22 progress chapters, 7 classic dungeons, Crusade/Mythic+, Celestial Trial, World Boss, Arcane Quarry) grants no direct permanent stat multiplier. It feeds power indirectly through enchant stones, glyphs, dust, essences and Oblivion. Crusade, Celestial and World Boss fights run on the server, so the client only exposes config numbers. Oblivion (unlock at level 95) creates a second hero with 3 extra gear slots, a 100-level Oblivion Level with its own XP curve and drop table, and a 2.75x attack / 2.8x HP item multiplier at half item-level scale. Oblivion Power cancels Oblivion Dungeon instability point for point, and also drives Celestial Mythic resonance. Leaving the rift is permanent and destroys the base gear.

### Where the app is wrong

| Sev | Area | App file | App says | Game says | Citation |
|---|---|---|---|---|---|
| high | Oblivion | src/lib/constants.js | Only lists 'Oblivion' as a rarity name in RARITIES. No Oblivion realm, level, power, extra slots or item multipliers are modelled. | Oblivion prestige is a separate second hero. UNLOCK_LEVEL 95, 3 extra slots, item attack x2.75 and HP x2.8 at ITEM_LEVEL_SCALE 0.5, MAX_ITEM_LEVEL 200 with ascension caps [200,260,320,380,480], START_RARITY Mythic, 100 Oblivion Levels. | decompiled.js L669119, L677330-677630 |
| medium | World Boss simulation | src/lib/simulation.js | 60 s Monte Carlo World Boss fight against a target dummy. | The 60 s duration matches. The season boss carries an affinity: FORTIFIED has 80 % block and 30 spell resist, ENRAGED is lethal (18 % max-HP hits, frenzy ramps, up to 300 s). The boss has 2e10 HP and is a leaderboard damage race. All boss hit, block and ramp math is server-side. | world_boss.json affinities; decompiled.js L1152855-1153517 |
| low | Drop Check content notes | src/components/DropCheckScreen.svelte | Says not to rely on Drop Check for Crusades or Celestial Trials. | Crusade and Celestial are server-simulated, but their boss stat formulas and enchant drop counts are fully in client config (Crusade L1862721, Celestial L1156882). | decompiled.js L1862721-1862740, L1156882 |

### In the game, not in the app

- Oblivion prestige realm: second hero, 21-day full-XP window then x0.5 XP, energy carry cap 20000 plus 6000 per base level past 95, permanent leave (destroys base gear), 3 rift-only slots
- Oblivion Level (max 100): XP cost floor(85000*L*ramp(L)), mob level band 40-100, per-rarity drop weights unlocking at levels 1/10/25/55/85
- Oblivion Power stat (8-30 per stone by quality) offsets Oblivion Dungeon instability; also scales Celestial Mythic resonance
- Oblivion Dungeon: floor mob HP 2e7*1.13^(f-1), atk 3.4e4*1.06^(f-1), instability curve, Mythic/Oblivion Stone and Essence drops
- World map camp bonuses: +10% dungeon coins, arena honors and raid influence, -10% pet egg cost, +10% extra hunt roll on featured rarities, Crusade personal cache 10-32%
- Crusade Mythic+ scaling (1.35x per level, 1.5x above +3, power gate 13000*1.18^L) and Ichor rewards
- Celestial Trial Normal/Hard/Mythic with Oblivion-Level committed scaling map
- Arcane Quarry: Tempering and Attunement essences, 3 daily charges, Deep Mining skill
- World Boss season affinity cycle (hash-based) and leaderboard position reward tiers

### Server-side or unresolved

- Server combat outcome and loot rolls for Crusade, Celestial Trial and World Boss
- Arcane Quarry ore yields and essence-to-quality-to-stat mapping (server)
- Which level the server uses for the Celestial party boss level, and which level feeds oblivionXpRewardForHunt
- Whether the camp hunt bonus uses the 1.1x factor, the 10% extra roll, or both on the server
- Exact hard-dungeon hp/atk (hardVariant register aliasing only partly traced)
- World map travel speed percentage source
- Oblivion Power effect in normal combat outside the dungeon and Celestial
- Progress chapter completion rewards

## Coverage follow-ups

- **Crusade role readiness** (module 6044 `checkEhpFloor`, `readinessPercent`, `isActiveTank`, `getBossAttack`; module 6037 `describeRoleRequirement`) — the game's own EHP/readiness check for Crusade roles. Not extracted by any system doc; relevant to a tank objective.
- 438 tagged modules are uncited by any doc; a scripted pass classed them as rendering, replay plumbing, API clients and art lookups. Re-check if a system doc turns out thin.
