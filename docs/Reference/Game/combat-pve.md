# PVE Combat Resolution

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

How a PVE fight is resolved: the tick loop, swing timing, the hit pipeline
(negate roll, crit, double hit, damage reduction, penetration, shield,
lifesteal), status effects, buffs and spells as the engine applies them, enemy
stat generation for the campaign, and which fights the client runs itself
versus which it only replays.

**Tags.** **[CODE]** read directly from client code (`decompiled.js L<n>`).
**[DERIVED]** computed from [CODE] values, working shown. **[SERVER]** decided
server-side; the client shows only what is listed. **[UNRESOLVED]** could not
be determined; what was checked is stated. Line numbers are `decompiled.js`.

Machine-readable catalogue: `data/combat-pve.json` (campaign mobs, schema in
§15.4). Facts owned elsewhere are pointers: stat totals and soft caps
`see stats.md`; sigil spell catalogue and stack-sigil numbers `see sigils.md`;
dungeon / raid / Oblivion / crusade content `see pve-content.md`; arena rules
`see combat-pvp.md`; loot and the `/hunt` roll `see drops.md`.

**What this contributes to power.** Combat is where every stat in `stats.md`
becomes damage dealt or damage avoided. The engine reads the final displayed
totals (Attack, Attack Speed, Crit, Crit Damage, Double Hit, Lifesteal, HP
Regen, DR, Block, Miss, Blind, Paralyze, Penetration, Disruption, spell stats,
minion stats) one-to-one into an entity (§3); nothing is re-derived from
gear. Attack-side value is a per-swing product (§7); defence-side value is
applied per incoming swing (§6).

---

## §1 What runs where

Two things get called "hunting" and neither is a server combat simulation of the
player's build:

| Mode | Resolved by | Evidence |
|---|---|---|
| **Hunt** (stamina auto-hunt, loot + XP) | **[SERVER]**; no combat. `POST /hunt` returns `results[]`, `totalXpGained`, `pendingItems`, `newLevel`, `newUnlocks`. The client animation reports `damageDealt = player.baseStats.attack` (display only). | `L883817`, `L1694964-1695362` |
| **Offline hunt** | **[SERVER]** `POST /hunt/offline`, `/hunt/offline/ping` | `L883875`, `L883910` |
| **Progress / campaign** (chapters, levels, mobs) | **Client runs the whole fight** with `Math.random`, every 100 ms. Reports only `POST /progress/complete {chapter, level}`. | `L1074489-1078279`, `L1097977` |
| **Dungeon** (steps) | **[SERVER]** `/dungeon/fight-prepare` returns the full tick log, client replays it, then `/dungeon/fight-resolve {action: finalize\|flee}`. | `L886297-886699`, `L1716189-1716440` |
| **Raid** | **[SERVER]** same shape: `/raid/fight-prepare`, `/raid/fight-resolve`, `/raid/fight` | `L886736-886821` |
| **Oblivion dungeon** | **[SERVER]** `/oblivion-dungeon/floor-prepare`, `/floor-resolve` | `L1705095-1705146` |
| **Crusade** (group boss) | **[SERVER]** `/crusade/start`, `/crusade/solo`; client plays `ticks` | `L1703354-1703422`, `L1843245-1843842` |
| **Fortress boss** | **[SERVER]** `/fortress/boss-fight/start`; client plays `combatLog`. A server log shows the arena duel's rules with Fortress changes, not this engine (`clan-fortress.md` §1.4) | `L1399614`, `L1639328-1639938` |
| **Celestial Trial** (party of 2) | **[SERVER]**; the start response carries `celestialResult.ticks`, the client plays them; no client simulator (rules from server logs, §20) | `pve-content.md §6` |
| **World boss** | **[SERVER]** `/world-boss/fight-start` returns `fightId, bossHp, damageDealt, fightDurationMs, playerDied, combatLog`; client decodes the log and replays it, then posts `{fightId, damageDealt}` to `/world-boss/fight-end` | `L1702891`, `L1702935`, `L1152196-1152442`, `L1748209-1748249` |
| **Arena** | **[SERVER]** `/arena/fight` (`see combat-pvp.md`) | `L1101943` |

- The bundle also contains a **complete shared engine** (`simulateFight`,
  `simulateDungeonStep`, `simulateBossFight`, `simulateCrusadeFight`) whose
  rules are identical in structure to the live progress loop, with three
  exceptions: the live loop starts the mob's swing timer at half its interval,
  takes the spell resist from `mob.spellResist` alone, and fires a Chrono Flux
  transform at the top of the next tick (§10.6). **No call site
  for any of these was found** in the client (`grep` for the names returns only
  definitions and export lines). **[CODE]** `L1087661`, `L1670939`, `L1862921`,
  `L1868835`. They document the server's fight rules but whether the server runs
  exactly this code is **[UNRESOLVED]**.
- Progress fights use unseeded `Math.random()` (`L1086004`, `L1086029`); there
  is no deterministic replay.
- The server's validation of `/progress/complete` and of the world-boss
  `damageDealt` the client reports is **[UNRESOLVED]** (the client sends a
  rounded number it computed from the log, `L1748240-1748246`).
- Combat scenes (modules 5368 arena, 5871 dungeon, and the stage-engine
  modules 5613/5706/6078/6480 etc.) are **replay only**: they read tick events
  and draw them. No combat math lives in them. **[CODE]** module headers.

## §2 Clock and per-tick order

| Mode | Tick | Source |
|---|---|---|
| Progress (client) | 100 ms | `PROGRESS_CONSTANTS.TICK_INTERVAL_MS` `L1085224` |
| World boss | 100 ms | `WORLD_BOSS_CONSTANTS` `L1153423` |
| Dungeon, raid, arena, crusade, fortress boss | 10 ms | `L1062719`, `L1064866`, `L667970`, `L1702151`, `L1223934` |
| Oblivion dungeon | **[UNRESOLVED]**: its config (`L1706694`) has no tick constant; it borrows `DUNGEON_CONSTANTS.RESET_HOUR` | `L1706694-1706697` |

The app runs each mode at its client tick and assumes the dungeon's 10 ms for Oblivion floors
(`engine/pve/fight.js` `PVE_MODES`, labelled as an assumption).

No 400 ticks/second clock exists anywhere. The engine is delta-time based: every
step receives `dt` (the tick length) and advances three timers (§4).

**[CODE]** One tick, in order (shared engine `L1087661-1089480`, live progress
loop `L1074489-1078279`):

```
1  minion respawn timer advances (necromancer)                        L1088096-1088119
2  heal budget refills (Oblivion sustain cap only)                    L1088126-1088128
3  Oblivion "instability" pulse (true damage to player)               L1088129-1088208   (see pve-content.md)
4  processSpellsTick: cooldowns, casts, DoT/HoT ticks, buff expiry    L1088292-1088319
   -> apply owner heal / shield refill, target damage, control effects, new debuffs
5  processDebuffsTick on the enemy (DoT damage, expiry)               L1088736
6  recompute self buffs: Bulwark DR / HP, Elusive, Sunder on enemy,
   Slow on enemy attack speed                                         L1088825-1088950
7  processCombatTick: regen pulse, player swing, minion swing, enemy swing   L1088954
8  Chrono Flux / transform spells fire                                L1089035-1089180
9  stack runtimes consume this tick's events (Bulwark/Elusive/Sunder)  L1089199-1089300
10 thorns reflect on mob-hit events                                   L1089306-1089397
11 end check                                                          L1089416-1089457
```

Because spells run before swings (step 4 before 7), a spell that kills the enemy
this tick pre-empts the swing. **[DERIVED]** from the order above.

## §3 Entities

### §3.1 Player entity — `createPlayerEntity(computedStats)` `L1087500-1087587`

**[CODE]** One-to-one copy of the displayed totals (`see stats.md`):

| Entity field | From | Notes |
|---|---|---|
| `maxHp`, `hp` | `totalHp` | |
| `attack` | `totalAttack` | already includes Attack % |
| `attackSpeed` | `totalAttackSpeed` | swings per second, base 1.0 |
| `doubleHit`, `critChance`, `lifesteal`, `hpRegen`, `damageReduction`, `blockChance`, `missChance`, `blindChance`, `paralyzeChance`, `penetration` | `total*` | percent units |
| `critDamage` | `totalCritDamage` | **multiplier**, base 1.5 (`200% = 2x`) |
| `disruptionChance` (default 0), `disruptionEffect` (default `'SILENCE'`) | totals | |
| `spellDamage`, `spellResist`, `spellCritChance`, `spellVamp` | totals | default 0 |
| `pvpAttack`, `pvpDefense` | totals | not used in PVE |
| `shieldHp`, `shieldMax` | 0 | set by a SHIELD spell (§13) |

### §3.2 Mob entity — `createMobEntity(mob)` `L1087589-1087646`

**[CODE]**

```
maxHp = hp = mob.hp          attack = mob.attack        attackSpeed = mob.attackSpeed
damageReduction = mob.damageReduction ?? 0     blockChance = mob.blockChance ?? 0
penetration     = mob.penetration     ?? 0
critDamage = 1  (multiplier 1)    everything else 0:
doubleHit, critChance, lifesteal, hpRegen, missChance, blindChance,
paralyzeChance, disruptionChance, spellDamage, spellResist, spellCritChance, spellVamp
```

Consequences: mobs never crit, never double-hit, never heal and never apply
status effects to the player in this engine. A mob can have DR, Block and
Penetration (classic dungeons 3-7 carry `blockChance` 5-20 and `penetration` 6-52,
hard dungeons block 20-26, penetration 50-66 and DR 0 or 30, pve-content.md §4; campaign mobs
from chapter 9 on carry Penetration, §15).
A mob's Miss is always 0, which matters for the penetration rule in §5.4.

## §4 Swing timing

**[CODE]** `L1086319-1086336`, `L1086422`, `L1086435`.

```
attackerTimer += dt ; defenderTimer += dt ; regenTimer += dt
interval(side) = round(1000 / attackSpeed)            // ms, Math.round; attackSpeed is the totalAttackSpeed
                                                      // multiplier (1.3 -> 769 ms), not a per-swing time
player swings this tick  iff  attackerTimer >= interval(player)
    then attackerTimer = attackerTimer - interval(player)      // remainder kept
enemy  swings this tick  iff  defenderTimer >= interval(enemy)
    then defenderTimer = defenderTimer - interval(enemy)
```

- Timers are reset when a fight (each mob) starts: `resetCombatTimers(defenderTimer)`
  sets `attackerTimer = 0`, `regenTimer = 0`, `defenderTimer = argument`
  (`L1073403-1073424`). In the live progress loop the argument is
  `round(round(1000 / mob.attackSpeed) / 2)`, so **the mob's first swing comes after
  half its interval and the player's first swing after a full interval**
  (`setProgressPhase` `L1074380-1074415`). The shared engine copy starts all three
  timers at 0 (`L1087770`). Necromancer summon windows shift the opening timers
  further (`openingSwingTimerStart`, `L1094757`).
- At most **one swing per side per tick**. With a 100 ms tick this only binds for
  Attack Speed above 10; the engine ceiling is 4.5 (`see stats.md`).
- The remainder is carried, so the long-run rate is exactly `1000 / interval`
  swings per second. **[DERIVED]** from the subtraction above. The only
  distortion is `Math.round` on the interval (< 0.07% for AS 1.3, 0 for AS 2.5).
- `attackSpeed <= 0` gives an infinite interval: that side never swings.
- Attack Speed is **not clamped to >= 1**; mobs run 0.45 to 1.5 and the Slow
  debuff multiplies by `1 - reduction/100` (§9.2).
- `ATTACK_ANIM_LEAD_MS` shifts only the animation trigger flag in the progress
  loop (`L1075723-1075729`), not the swing timer.

## §5 Player swing — resolution order

**[CODE]** `processCombatTick` `L1086167-1087434`; helpers `L1085970-1086165`.
`atk` = player, `def` = enemy.

```
if def.dead: end.
// 1. negate roll (Block and Miss are ONE roll)
negate = def.blockChance + def.missChance
negated = negate > 0 and random()*100 < negate                       L1086436-1086449

if not negated:
    // 2. damage roll (rollAttackDamage)                              L1085998-1086046
    isCrit = random()*100 < atk.critChance
    dmg    = isCrit ? round(atk.attack * atk.critDamage) : atk.attack
    isDouble = atk.doubleHit > 0 and random()*100 < atk.doubleHit
    // 3. mitigation
    dmg = applyDamageReduction(dmg, def.damageReduction)
    // 4. shield (defender)  -> absorbWithShield, §13
    // 5. lifesteal on the post-DR, pre-shield number
    heal = floor(dmg * atk.lifesteal / 100), clamped to (maxHp - hp)   L1086471-1086497
    event 'attacker_crit' | 'attacker_hit' {damage: dmg}
    // 6. double hit: only if def still alive after the first hit     L1086517-1086575
    if isDouble and def.hp > 0:
        dmg2 = applyDamageReduction(atk.attack, def.damageReduction)   // not crit, no second negate roll
        shield, lifesteal as above; event type is always 'attacker_hit' (never crit), doubleHit: true
    // 7. status procs, once per swing, only if def alive
    blind:     atk.blindChance > 0 and not def.blinded and random()*100 < blindChance
               -> def.blinded = true, event 'defender_blinded'                      L1086577-1086602
    paralyze:  atk.paralyzeChance > 0 and def.paralyzedMs <= 0 and random()*100 < paralyzeChance
               -> def.paralyzedMs = 1000, event 'defender_paralyzed'                L1086604-1086629
    disruption: atk.disruptionChance > 0 -> rollDisruption (§8.3)                  L1086631-1086860
else:
    // 8. penetration path (§5.4) — no procs are rolled on a negated swing
```

```
applyDamageReduction(d, dr) = (dr > 0 and d > 0) ? max(1, round(d * (1 - dr/100))) : d     L1085970-1085996
```

### §5.1 Double hit

**[CODE]** The follow-up deals exactly `attack` (no crit roll, no crit multiplier;
`doubleHitDamage = attack` `L1086041-1086043`). It takes DR, shield and
lifesteal like any hit. It cannot be blocked because it only exists on a swing
that already passed the negate roll. The UI text agrees: "cannot crit or be
blocked" (`L911271`).

### §5.2 Crit and double-hit are independent draws

**[CODE]** Both are rolled in the same call to `rollAttackDamage`, before the
outcome of the hit is known. The double-hit strike is applied only if the enemy
is still alive. Neither is rolled on a negated swing.

**RNG draw rules** (`rollAttackDamage` `L1085998-1086047`) **[CODE]**: the crit draw is always
consumed, even at 0 % crit; the double-hit draw only when `doubleHit > 0`. A port must follow
these draws exactly to reproduce a seeded fight. `rollPenetrationCritMult` draws only when
`critChance > 0`.

### §5.3 Where lifesteal reads from

**[CODE]** `floor(dmg_after_DR * lifesteal / 100)`, then `min(that, maxHp - hp)`;
a full-HP player gains 0. Overheal is therefore **not** credited (the heal is
clamped to missing HP before it is applied). It is computed on the number before
the shield absorbs anything (`L1086484-1086497`).

### §5.4 Penetration (swing was negated)

**[CODE]** `L1086762-1086884`.

```
if atk.penetration > 0 and def.missChance === 0:            // exactly zero, not "low"
    base = round(atk.attack * atk.penetration / 100)
    mult = (atk.critChance > 0 and random()*100 < atk.critChance) ? atk.critDamage : 1   // rollPenetrationCritMult
    dmg  = round(base * mult)
    dmg  = applyDamageReduction(dmg, def.damageReduction)
    shield, lifesteal as in §5; damage dealt = dmg
else dmg = 0
event type = def.missChance > 0 ? 'defender_miss' : 'defender_block', damage: dmg
```

Key facts:
- **Penetration pierces only when the defender has zero Miss.** A defender with
  any Miss at all makes the whole negate fully avoid the swing, even when the
  negate was "really" the Block part.
- Pierced damage **can crit** (confirms the old ruling) and is reduced by DR.
- Pierced damage is the pre-crit **base** `attack * pen%`; Double Hit does not
  add a pierced second strike.
- No Blind / Paralyze / Disruption roll happens on a negated swing, pierced or
  not (the procs sit on the not-negated branch, `L1086577-1086860`).
- The event is labelled `defender_miss` whenever the defender's Miss > 0 (this is a
  label, not a separate roll).

### §5.5 Negate probability

**[DERIVED]** from the single roll above: `P(negate) = (block + miss)/100`
(clamped by `random() < p` so values >= 100 always negate). Block and Miss are
each capped separately (`see stats.md` ceilings 85 and 90) but their **sum is
not capped**, so a defender with both can reach 100% negate. This is the engine's
own behaviour; whether the sheet's separate caps are meant to prevent it is
**[UNRESOLVED]**.

## §6 Enemy swing — resolution order

**[CODE]** `L1086957-1087430`. Enemy swing check happens after the player swing
and after the minion swing, in the same tick, only if the enemy is alive.

```
if defenderTimer >= enemyInterval:
    defenderTimer -= enemyInterval
    if enemy.paralyzedMs > 0:   event 'defender_paralyze'; swing consumed        L1086960, 1087356
    elif enemy.fearedMs > 0:    event 'defender_fear';     swing consumed        L1086962, 1087343
    elif enemy.blinded:         event 'defender_blind';    enemy.blinded = false; swing consumed   L1086964, 1087330
    elif minion alive:          enemy hits the MINION instead (§12)             L1087238-1087328
    else:
        negate = player.blockChance + player.missChance ; same single roll as §5
        if not negated:
            isCrit = random()*100 < enemy.critChance        // always 0 for mobs
            dmg = isCrit ? round(enemy.attack*enemy.critDamage) : enemy.attack
            dmg = applyDamageReduction(dmg, player.damageReduction)
            dmg = absorbWithShield(player.shield, dmg, player.shieldMitigation ?? 0)  // §13
            enemy lifesteal (mob: 0)
            event 'defender_hit' {damage}, or 'attacker_dead' if player hp <= 0
        else:
            penetration path with enemy.penetration, only if player.missChance === 0;
            event 'attacker_miss' if player.missChance > 0 else 'attacker_block'   L1087100-1087236
```

- Paralyze, Fear and Blind each **consume the swing** (the timer still resets). A
  paralyze/fear lasts in wall-clock ms and counts down by `dt` every tick
  (`L1086309-1086318`), so a 1000 ms paralyze removes `1000 / enemyInterval`
  swings, not one.
- Order of status checks: Paralyze, then Fear, then Blind. Blind is a **boolean
  flag** (one swing), not a stack counter, and cannot be re-applied while set.
- Statuses exist only on the enemy side. The player cannot be blinded, paralyzed,
  feared or staggered by mobs in this engine; mobs have no such chances.
- A hit that kills the player ends the fight: the returned `attackerHp` is 0.
- **[CODE]** Event damage differs by side: `defender_hit` carries `round(effectiveDamage)` from
  `absorbWithShield` (the shield-mitigated cost, `L1087035`); the player-hit event carries the
  post-DR, pre-shield number (`L1086509`). `attackerDamageDealt` counts only the player's own
  swings (first hit, double hit, pierce), pre-shield; minion hits are excluded (`L1086944`).

## §7 Damage, healing and rounding — summary

**[CODE]** all of §5 and §6.

| Quantity | Formula | Rounding |
|---|---|---|
| Swing interval | `1000 / attackSpeed` | `Math.round`, ms |
| Normal hit | `attack` | integer already |
| Crit hit | `attack * critDamage` | `Math.round` |
| Double-hit strike | `attack` | none |
| Damage reduction | `d * (1 - DR/100)` | `Math.round`, `max(1, .)` when DR>0 (the inline steps in the enemy swing, enemy penetration and player penetration check only DR>0, so a 0 base becomes 1; `L1087004-1087018`, `L1087129-1087143`, `L1086793-1086807`) |
| Penetration damage | `round(attack*pen/100)`, `* critMult`, DR | `Math.round` twice, then DR |
| Lifesteal | `dmg * ls/100` | `Math.floor`, capped at missing HP |
| HP regen pulse | `maxHp * hpRegen/100 / 10` every 100 ms | `Math.round`, `max(1, .)`, capped at missing HP |
| Spell damage | §10.2 | `Math.floor`, `max(1, .)` |

**HP regen** `L1086337-1086420`: `regenTimer >= 100` triggers one pulse and
subtracts 100 (at most one pulse per `processCombatTick` call); pulse amount
`max(1, round(maxHp * hpRegen / 100 / 10))` (10 pulses a second, so `hpRegen` is
percent of max HP per second); `min(amount, maxHp - hp)` when below max, else 0;
emits `attacker_regen` only if > 0. The amount reads `player.maxHp` (the buffed entity) but the
clamp and overheal read the separate `attackerMaxHp` argument (default `player.maxHp`;
`L1086358` vs `L1086368`). Only the attacker (player) regenerates in
this function. The regen shield refill (`regenShieldRefillAmount`) is skipped when
`blocksShieldOverflow` is set (17th argument, from the Oblivion options, `L1087833-1087840`). The tooltip is consistent: "Percentage of max HP regenerated per
second in combat" (`L911271`).

**Expected output per player swing against a defender with DR `d`, Block `b`,
Miss 0, Penetration `p`, own Crit `c`, Crit Damage `m`, Double Hit `h`**
(ignoring rounding; **[DERIVED]**):

```
E = (1 - b) * R(attack) * (1 + c*(m-1) + h)  +  b * p * R(attack) * (1 + c*(m-1))     // R = (1 - d) mean mitigation
swings per second = 1000 / round(1000 / attackSpeed)
```

For `b = 0` and `d = 0` this reduces to the existing closed form
`attack * (1 + c*(m-1) + h) * speed` (DR 0, Block 0, as on every campaign mob).

## §8 Status effects

### §8.1 Constants — **[CODE]** values assigned `L1089570-1089584` (`L1087437-1087498` is only the export getters)

| Name | Value | Used for |
|---|---|---|
| `DISRUPTION_SILENCE_MS` | 3000 | Mage disruption |
| `STAGGER_STACKS_TO_STUN` | 3 | Bear disruption |
| `STAGGER_STUN_MS` | 2000 | Bear disruption stun |
| `FEAR_DURATION_MS` | 1000 | Wolf disruption |
| `PARALYZE_DURATION_MS` | **1000** | Paralyze proc (also read by the arena engine, `L1453220`) |
| regen pulse | 100 ms | §7 |
| fight cap in the shared engine | 1 200 000 ms (20 min) | §14 |

The Paralyze **tooltip says "fully stunned for 2 seconds"** (`L911271`); the
constant used by the engine is 1000 ms. The 2 s figure matches `STAGGER_STUN_MS`,
not `PARALYZE_DURATION_MS`. Whether the live server uses a different value is
**[UNRESOLVED]**; for the client-run progress loop the code value (1000 ms) is
what executes. The port uses 1000 ms.

### §8.2 Blind / Paralyze procs

Rolled once per landed swing (§5 step 7), against `blindChance` and
`paralyzeChance` (percent). Blind needs the enemy not already blinded; Paralyze
needs `paralyzedMs <= 0`.

### §8.3 Disruption — `rollDisruption` `L1086073-1086166`

```
if disruptionChance <= 0: none
effect = player.disruptionEffect            // SILENCE (Mage) | STAGGER (Bear) | FEAR (Wolf)
if effect == SILENCE and silencedMs > 0: none      // does not re-roll while active
if effect == FEAR    and fearedMs   > 0: none
if random()*100 >= disruptionChance: none
SILENCE: silencedMs = 3000                     event 'defender_silenced'
STAGGER: stacks += 1 ; if stacks >= 3: stunned -> stacks = 0, paralyzedMs = max(paralyzedMs, 2000)
         events 'defender_staggered' {staggerStacks}, then 'defender_paralyzed' {paralyzeMs: 2000}
FEAR:    fearedMs = 1000                       event 'defender_feared' {fearMs: 1000}
```

**[CODE]** If the roll passes but `disruptionEffect` is none of the three, the function
returns `undefined` rather than the no-proc record; the three real effects never reach it.

Silence has no consumer in PVE: `defenderSilencedMs` is decremented and returned by
`processCombatTick` (`L1086309-1086318`, `L1087092`) and only carried forward by `simulateFight`
(`L1088987`), and `processSpellsTick` is passed `silencedMs` 0 by both PVE callers
(`L1074777`, `L1088296-1088319`) **[CODE]**. Campaign mobs cast nothing either. Bosses "resist" Fear per UI text (`L911271`); the
resist roll is server-side **[SERVER]**. Where the disruption effect comes from
(class form) `see stats.md` / `see classes.md`.

## §9 Buffs, debuffs, ceilings

### §9.1 Self buffs — `applyBuffsToEntity` `L1085543-1085694`

Active buff-type spells contribute `{stat, value}` effects summed additively per
stat (`computeActiveBuffModifiers` `L1090093-1090361`; stats: ATTACK_PERCENT,
ATTACK_SPEED, LIFESTEAL, BLOCK_CHANCE, MISS_CHANCE, BLIND_CHANCE, CRIT_CHANCE,
CRIT_DAMAGE, DAMAGE_REDUCTION, HP_REGEN, HP_PERCENT, PENETRATION, SPELL_RESIST,
SOUL_LINK). They are then laid on the entity once per tick:

```
attack          = floor(entity.attack * (1 + buff.attackPercent/100))        // MULTIPLICATIVE on the final displayed Attack
attackSpeed     = min(entity.attackSpeed + buff.attackSpeed, 4.5)
lifesteal       = min(entity.lifesteal   + buff.lifesteal,   80)
blockChance     = min(entity.blockChance + buff.block,       85)
missChance      = min(.. + buff.miss, 90)    blindChance = min(.. + buff.blind, 60)
critChance      = min(.. + buff.critChance, 95)       damageReduction = min(.. + buff.dr, 75)
hpRegen         = min(.. + buff.hpRegen, 70)          penetration = min(.. + buff.pen, 80)
critDamage      = entity.critDamage + buff.critDamage/100            // no ceiling
spellResist     = entity.spellResist + buff.spellResist              // no ceiling
maxHp (cap for healing) = floor(maxHp * (1 + (selfHp% + buff.hpPercent)/100))        getBuffedMaxHp L1085767-1085788
```

**Attack % buffs multiply the final Attack**: `entity.attack` is `totalAttack`,
which already contains the character's Attack % (`see stats.md`), and the buff
then does `floor(totalAttack * (1 + pct/100))`. Buff additions to other stats are
additive on the sheet value and clipped by the ceilings, **not** by the soft caps.
Double Hit has no buff stat and no ceiling entry.

### §9.2 Enemy debuffs — `L1092930-1094002`

Debuff types seen: BLEED, POISON (DoT), WOUND (heal / regen reduction), SLOW
(enemy attack speed), CRIT_DOWN (crit chance reduction). Rules:

```
applyDebuff: new debuff -> stacks 1 (maxStacks from config), remainingMs = duration (or permanent)
             re-apply   -> stacks += 1 up to maxStacks (extra applications replace the oldest stackDamage),
                           refresh remainingMs unless permanent or the application carries a partySlot (L1093377-1093652)
DoT tick (BLEED/POISON, every tickIntervalMs):
             dmg = sum(stackDamages) or damagePerTickFlat*stacks
             if debuff.critChance > 0 and random()*100 < critChance: dmg = floor(dmg*critMult)   // default critMult 1.5
             enemy.hp -= dmg   (event 'debuff_tick')
computeDebuffModifiers: regenReductionPercent = min(sumWound, 100)
                        attackSpeedReductionPercent = min(sumSlow, 50)          // slot1 = 50, L1093997
                        critChanceReduction = sum
slowedAttackSpeed(as) = as * (1 - reduction/100)
critDownChance(c)     = max(0, c - reduction)
```

Party feeders (crusade) share a debuff instance: `feedSharedInstance`
`L1093035-1093239`; party detail `see pve-content.md`. **[CODE]** Merge rules: max stacks, max
reductions, permanent if any feeder is, `remainingMs` from the longest live feeder, damage
rescaled to the instance cadence. `processDebuffsTick` (`L1093653-1093868`) fires at most one
tick per call (no catch-up for a long dt) and draws rng only when the debuff's `critChance` > 0.

### §9.3 Sunder on the enemy (stack sigils)

When the player has Sunder stacks, the enemy's DR, Blind, Block, Miss and HP
Regen are reduced by `stacks * perStack` percentage points (floored at 0)
before each swing: `applySunderToTarget` `L1079741-1079800`, applied at
`L1075851-1075905`. Config values `see sigils.md`.

## §10 Spells inside the engine

The spell *catalogue* is `see sigils.md`. The engine rules are:

### §10.1 Types, order, opening delay — **[CODE]** `L1092725-1092929`, `L1090372-1090472`

- Spell types: DEFENSE, BUFF, HEAL, DAMAGE, DEBUFF, AURA, TRANSFORM, STACK, SHIELD,
  FORM, SUMMON.
- Within a tick spells are processed sorted by type in the order
  `DEFENSE 0, BUFF 1, HEAL 2, DAMAGE 3, DEBUFF 4, AURA 5, TRANSFORM 6, STACK 7,
  SHIELD 8, FORM 9, SUMMON 10`, then by a per-species opening rank (default 100,
  `NULL_PULSE` 0), then by equip order.
- **Initial cooldown** = opening delay: 1000 ms for **DAMAGE and DEBUFF** spells
  (`OFFENSIVE_OPENING_DELAY_MS`, `NULL_PULSE` 500 ms); 0 for every other type.
  Cooldown restarts at cast time (`cooldownRemaining = spell.cooldownMs`).
  This confirms the old "1 s first-hit delay" observation.
- A spell fires the first tick its cooldown is <= 0 and its optional activation
  condition holds (`isConditionMet`, `L1089843`); there is no player input. **Exception
  [CODE]:** when `processSpellsTick`'s `arg9` is false (both PVE callers, `L1074777`,
  `L1088319`), DAMAGE and DEBUFF spells skip `isConditionMet` and cast on cooldown
  (`L1091462-1091542`); only PVP passes true. So `ENEMY_HP_BELOW_*` has no effect in PVE.
  The gate is `(type is DAMAGE or DEBUFF) and not arg9` (`L1090474` signature: `offensiveConditions`
  is `arguments[9]`; the simulateFight call passes `false` there, `L1088296-1088319`). Spells of any
  other type still call `isConditionMet`, whose 4th argument (`arguments[10]`, also passed `false`
  in PVE) is the `MY_HP_BELOW_*` bypass. So for BUFF / HEAL / DEFENSE sigils `MY_HP_BELOW_X` is
  honoured in PVE against the owner's real HP percent (`hp / maxHp * 100 <= X`), and the optimiser
  may search those conditions. **[CODE]** (`L1089843-1090050`, call `L1091440-1091533`).
- Silence: a `silencedMs` (arg16) > 0 blocks every new cast while active effects keep
  ticking (`L1091462-1091464`). PVE passes 0; PVP passes the caster's `silencedMs`.
- Spell types sort with `SPELL_TYPE_CAST_ORDER_FALLBACK` = 9 when unknown (same register as
  FORM, `L1092914`).

### §10.2 Spell damage — `modSpellDmg` `L1090892-1090927`, crit `L1090933-1090988`

```
base        = floor(attack * attackPercent/100)      (initial hit)  or damagePerTick(Flat)   (DoT tick)
crit chance = min(spellCritChance + buff SPELL_CRIT + momentum, 95)
crit        = random()*100 < chance ;  crit multiplier = the entity's critDamage (shared with swings)
amount      = max(1, floor( base * (1 + (spellDamage + buff SPELL_DAMAGE + momentum)/100) * (1 - min(R, 60)/100) ))
```

**Resolved (E5b port):** the "further multiplier `k`" of older notes (`sigils.md` §5) is this
resist factor, `_closure2_slot9 = 1 - min(R ?? 0, SOFT_CAPS.SPELL_RESIST.hard)/100`, computed once
per `processSpellsTick` call (`L1090876-1090891`); there is no other factor. Crit path
(`L1090933-1090982`): the chance is `applyCombatCeiling(spellCritChance + active SPELL_CRIT +
momentum.spellCritPoints, COMBAT_CEILINGS.SPELL_CRIT_CHANCE)`; one `random()` draw is made only when
that chance is above 0; a crit multiplies the base by the caller's `critDamage` argument (1.5 when
null) *before* `modSpellDmg`. Code: `src/lib/engine/core/spells.js`.

`R` is the target's spell resistance. **Two engine paths differ**:

| Path | `R` | Where |
|---|---|---|
| Live client progress loop | `mob.spellResist` only | `L1074783` |
| Shared engine copy (`simulateFight`) | `spellResist + damageReduction` | `L1088301-1088303` |

The cap 60 is `SOFT_CAPS.SPELL_RESIST.hard` (`L1090884-1090890`). Which path the
server uses for dungeons / bosses is **[UNRESOLVED]**. Spell damage is not
subject to the negate roll, double hit, or lifesteal.

### §10.3 Spell lifesteal ("Spell Vamp") `L1090989-1091045`

```
vamp = min(spellVamp + buff SPELL_VAMP + momentum, 80)
heal = floor(damage * healingMult * vamp/100)            // healingMult = 1 outside Oblivion
if enemy wound/heal-reduction r > 0: heal = max(1, round(heal * (1 - r/100)))
```

### §10.4 Heal spells

`heal = max(1, floor(maxHp * healPercentPerTick/100))`, reduced by the same wound
factor; `refillsShield` spells push the amount into the shield (§13);
`healsMinion` routes it to the minion (§12). The heal base is `healBaseMaxHp` (arg18) when
above 0, else `maxHp`; PVP passes `rawMaxHp` (`L1453940-1453990`). A BUFF with an HP_PERCENT
effect and a TRANSFORM both heal `floor((hp > 0 ? hp : maxHp) * value/100)` on cast; that heal
is not wound-reduced and emits no event (`L1091814-1091839`, `L1092451-1092476`).

### §10.5 Other spell effects

DoT DAMAGE spells (`isDoT`) apply SLOW / WOUND / CRIT_DOWN at cast from their `slow`,
`wound` and `critDown` fields (duration `durationMs`, 1 stack; `L1092079-1092190`). Direct
damage spells can also apply paralyze / silence / fear via `paralyzeMs`, `silenceMs` and `fearMs`
(`L1092042-1092077`). Blind is `blindOnTick`, checked on each DoT tick (`L1091236`); there is no
`blinds` field. DEBUFF spells push `{type: debuffType, config: spell.debuff}` (`L1091685-1091700`);
the debuffType is WOUND, BLEED or POISON, and the bleed/poison tick uses
`debuff.damagePerTickPercent`. selfHealPercent heals the caster for a share of the damage. A DoT damage tick is `floor(attack * attackPercent/100)` whenever `attackPercent`
is set, `damagePerTick` otherwise, with its own crit roll per tick; the first tick lands on the
tick after the cast (`L1091150-1091172`). Transform spells ("Chrono Flux") fire when `flux` reaches the max
(`CHRONO_FLUX.MAX`, `L1089079-1089104`). Per-spell numbers `see sigils.md`. The transform's
owner heal is applied as `hp = hp + granted` (granted comes through the heal-budget consumer, scaled
for Oblivion) with NO clamp to max HP, unlike the spell-pass heal which is `min`'d with the buffed
max HP, so HP can exceed max after a transform fires (`L1089094-1089130`). Its events are logged
immediately (`L1089135-1089170`), i.e. before the tick's own swing events are appended
(`L1089186`). **[CODE]**

### §10.6 Transform timing: shared engine vs live progress loop — **[CODE]**

- **Shared engine** (step 8 of §2): the bar charges from this tick's events and a full bar fires
  the transform in the same tick, after the swings, with the unclamped heal of §10.5
  (`L1089035-1089180`). It has no `hp > 0` guard, so a bar that fills on the tick the player dies
  fires at `hp = 0`, and an `HP_PERCENT` transform heals `floor(maxHp * value/100)` and revives the
  player.
- **Live progress loop** (the campaign): a full bar fires the transform at the **top of the next
  tick**, before `processSpellsTick` (`L1074747-1074773`). Its heal is added to the spell pass's
  `ownerHpDelta` and clamped with it to the buffed max HP, and the combined delta feeds the shield
  refill (`L1074900-1074930`). On the tick it fired the bar stays at 0; while a transform is active
  the bar does not charge (`L1076680-1076700`). A lethal tick therefore ends the level at the
  end-of-tick death check before the transform can fire. **[DERIVED]** from the order above.

## §11 Stack mechanics and thorns — **[CODE]** `L1078983-1080177`

Stack sigils are driven by the tick events (`createStackCombat` `L1079785-1080125`;
event wiring `L1089200-1089300`). Config per equipped sigil `see sigils.md`.

| Stack | Gains | Loses | Effect |
|---|---|---|---|
| Bulwark | +1 on an `attacker_block` event (the player blocked) | `stackLossPerHit` (default **2**) on each `defender_hit` (unblocked hit taken) | per stack: `+hpPercent`, `+drPercent` (DR capped at 75), `+thornsPercent` |
| Elusive | +1 on `attacker_miss` (player dodged) and on `defender_blind` (enemy swing wasted by Blind) | same loss rule as Bulwark | per stack: `+attackPercent`, `+critChancePercent`, `+lifestealPercent`, `+attackSpeedPercent` |
| Sunder (Siegebreaker is the fallback when no Sunder is equipped) | +1 on every `attacker_hit` / `attacker_crit` event (a double-hit event counts too) | `decayPerSecond` (default **2**/s) | per stack the enemy loses DR, Block, Miss, Blind and HP Regen (§9.3) |

Bulwark and Elusive share one stack counter (`slot4`); Sunder and Siegebreaker share
the other (`slot5`). `resetTarget` (new mob) clears only the Sunder/Siegebreaker counter (stacks and `decayAccumMs`, `L1080101-1080110`); the Bulwark/Elusive counter is not reset. Only Bulwark and Elusive are gated on `active`; Sunder and Siegebreaker are always built. Both Bulwark and Elusive shed `stackLossPerHit` of the shared def `bulwarkDef ?? elusiveDef` (catalogue: Elusive 2, Bulwark 1; engine default 2), and `thornsFor` returns 0 when damage <= 0. The engine default `decayPerSecond` is 2 when a def has none (catalogue Sunder 1.75).
`applyElusiveBuff`: attack `round(a*(1+p/100))`; crit and lifesteal additive with
ceilings; attack speed `x*(1+p/100)` capped at 4.5 (`L1079667-1079740`).

**Thorns.** Two sources add into one `thorns_reflect` event dealt to the enemy
(`L1089306-1089397`; the enemy can die from it):
- Bulwark: `round(damage * thornsPercent/100)` where `thornsPercent = stacks * perStack`,
  evaluated on `defender_hit` (damage taken) and on `attacker_block` (the event's
  damage field, which is the pierced amount and so 0 on a clean block)
  (`thornsFor` `L1080008-1080041`).
- Iron Bastion buff / glyph thorns (`activeBuffThornsPercent`): `round(damage * pct/100)`
  on each `defender_hit` (`L1089311-1089358`).

## §12 Minions (Necromancer) — **[CODE]** `L1094190-1095536`

```
createMinion(def, owner, totals):
  maxHp  = max(1, floor(owner.maxHp  * def.hpPercent/100     * (1 + totalMinionHealth/100)))
  attack = max(1, floor(owner.attack * def.attackPercent/100 * (1 + totalMinionAttack/100)))
  attackSpeed = minionAttackSpeed(owner.attackSpeed, totalMinionAttackSpeed)   // sheet + softCapGainFromSheet(.., SOFT_CAPS.MINION_ATTACK_SPEED), ceiling 4.5
  critChance = totalMinionCritChance      critDamage = owner.critDamage
  lifesteal  = totalMinionLifesteal       soulLink   = totalSoulLink
minion swing: its own timer, interval = round(1000/attackSpeed)  (frenzy raises attack, speed, lifesteal)
  hit = attack ; crit -> round(attack*critDamage) ; mob DR applied via mitigateMinionHit (same formula as §5)
  no negate roll, no double hit
while the minion is alive, ENEMY SWINGS HIT THE MINION, not the player:
  enemy crit roll, no DR/Block/Miss for the minion, damage = min(minion.hp, dmg)
  dead minion: respawnMs = respawnCooldownMs ; resummon on timer
soulLinkHeal: minion heals floor(owner damage dealt * soulLink/100)
minion lifesteal: floor(minion damage * lifesteal/100) to the minion
```

**[CODE]** Further rules: `minionSwing` returns at most one swing per call (the timer subtracts
one interval only); minion crit damage is `round(attack * critDamage)` with the player's
`critDamage` inherited unchanged. Attack and attack speed are computed once at `createMinion`
from the player's stats at that moment; later player buffs do not change an existing minion.
`killMinion` sets `respawnMs` to 0 (no auto-respawn); `damageMinion` sets it to
`respawnCooldownMs`; `advanceMinionRespawn` counts a pending `respawnMs > 0` down each tick and
summons at <= 0 (`L1094614-1094646`); `elapseMinionRespawn(m, ms)` counts it down, floored at 0,
without summoning (`L1094648-1094675`); `resummonIfDead` summons a dead minion only when **no**
respawn is pending (`respawnMs` not > 0), and leaves a pending countdown alone (`L1094677-1094700`).

**Who summons [CODE].** `createMinion` returns a dead minion (`hp 0`, `respawnMs 0`). Nothing in
`simulateDungeonStep` calls `summonMinion`: it creates the minion (`L1671066`) and hands it to
`simulateFight`, whose opening calls `resummonIfDead` (`L1087850`). When that summons, the opening
emits `minion_summoned` with `summonReadyMs = start + window`, moves the clock forward by the window
`openingSummonWindowMs` (the largest `summonCastMs`, 1 500 ms for both summon sigils, see
sigils.md), and caps each swing timer with `openingSwingTimerStart(round(1000 / attackSpeed),
window, timer) = window > 0 ? min(timer, interval - 400) : timer` (`L1094757-1094789`, callers
`L1087856-1087909`; `OPENING_FIRST_SWING_MIN_MS` = 400 ms, `L1095530`). The live progress loop calls
`resummonIfDead` and opens the same summon window at the start of every mob (`L1074420-1074440`). So
every fight with a fresh minion starts with the cast window.

**Between mobs [CODE].** The live progress loop leaves the minion as it is (hp, swing timer,
empower, frenzy); a dead one comes back through the next opening's `resummonIfDead` or its pending
countdown. `simulateDungeonStep` calls `elapseMinionRespawn(minion, 500)` before every mob, the first
included (`L1671080-1671084`, §14). Only `simulateBossFight` calls `carryMinionIntoNewFight`
(`L1863431`), which ends empower and frenzy and resummons a living minion at full HP.

**Enemy hits on the minion [CODE].** The enemy rolls a crit draw when hitting the minion (`L1087238-1087245`) even at 0 % crit and never
rolls Block/Miss against it. Enemy lifesteal is `floor(dmg*ls/100)` clamped to `enemy.maxHp`
with no heal budget; its base is the damage the minion actually took (`L1087270`) or
`round(effectiveDamage)` against the player.

The player is untouched while a minion lives. Minion cast times and per-species
numbers: see sigils.md.

## §13 Shield — **[CODE]** `L1095542-1095712`, `L1085790-1085855`

- A SHIELD spell sets `shieldMax = floor(maxHp * hpPercent/100)` where `hpPercent`
  is the spell value times `(1 + shieldPowerPercent/100)`; the shield starts full
  (`buildShield` `L1073206-1073236`).
- `absorbWithShield(shield, dmg, m)` with mitigation `m` as a fraction, not a percent. The shared
  `simulateFight` reads only `player.shieldMitigation ?? 0` (`L1087021`, `L1087146`) and
  `createPlayerEntity` never sets it, so the 0.5 comes from the caller: the dungeon fight setup
  stamps `DUNGEON_CONSTANTS.SHIELD_MITIGATION` unless the shield spell carries its own
  `mitigation` (`L1670985-1671018`, constant `L1062719`) and the live progress loop passes
  `PROGRESS_CONSTANTS.SHIELD_MITIGATION` (`L1076145`, `L1085224`). The world boss mode tables carry
  `shieldMitigation: 0` (`L1153433-1153447`) and nothing in that module reads it. The raid constants
  (`L1064866`) and the Oblivion dungeon config (`L1706694`) carry no `SHIELD_MITIGATION`. A caller that
  sets nothing gets 0 (plain 1:1 absorb). **[CODE]**:

```
if dmg <= 0 or shield <= 0: no absorb
if m > 0:
    cost = dmg * (1 - m)
    if shield >= cost: shield -= cost ; hpDamage = 0
    else: hpDamage = dmg - shield/(1 - m) ; shield = 0
else: absorbed = min(shield, dmg) ; shield -= absorbed ; hpDamage = dmg - absorbed
```

At `m = 0.5` every shield point absorbs **2** damage. **[DERIVED]**

The app stamps the value per mode (`engine/pve/fight.js` `PVE_MODES`): campaign and dungeon 0.5
(client constants), World Boss the affinity record's 0; raid, Oblivion and custom mobs 0.5, the
dungeon value, labelled as an assumption because the server fight is **[SERVER]**.
- The live progress loop applies the shield after `processCombatTick`, by walking
  the returned events (`L1076008-1076190`); shield refills from lifesteal / regen
  only if the spell sets `vampAlwaysRefills` / `regenAlwaysRefills`
  (`shieldRefillAmount`, `regenShieldRefillAmount` `L1085857-1085898`).

## §14 Fight end and outcome

- **Shared engine** (`simulateFight`): runs while both HP > 0 and
  `elapsed < 1 200 000 ms`; returns `{ticks, endTime, attackerWon}`. Timeout
  returns `attackerWon = false` **[CODE]** (`L1087922`, `L1089456-1089468`; the
  outer flag is never reassigned in the loop).
- **Progress (client)**: a level is 3 mobs in sequence. The player's HP **carries**
  between mobs of the same level; HP regen only runs while FIGHTING. When the 3rd
  mob dies the level completes (`LEVEL_COMPLETE`), the client calls
  `/progress/complete`, and the next level starts with a full heal. When the player
  dies the phase is `LEVEL_FAILED` and the **same level restarts** after
  `WALK_IN_MS` (idle retry; no punishment shown in code). No timeout was found in
  the progress loop. `L1077281-1077640`, `L1653437-1653782`.
- Phase timings (**[CODE]** `L1085224`): walk-in 2500 ms before mob 1, mob enter 800 ms,
  mob-defeated pause 2000 ms, walk-off 1800 ms, level transition 600 ms. These
  only affect farming throughput, not combat.
- First clear of a level grants its `influenceReward` (§15); `highestChapter` /
  `highestLevel` advance if beaten (`L1077297-1077336`).
- `simulateDungeonStep` runs mobs sequentially; a failed mob ends the step and returns
  `totalDuration` = that fight's `endTime` (`L1671071-1671135`). Before **every** mob, the first
  included, it calls `elapseMinionRespawn(minion, 500)` and `resetTarget()` on the stack runtimes, and
  starts the fight at `previous endTime + 500` (the first at 500): `r31 = r8 + r9`, `r9 = 500`
  (`L1671080-1671084`). Each `simulateFight` has its own 20-minute cap, counted from that fight's
  start (`elapsed - startMs < cap`, `L1088006-1088009`), so a step of three 8-minute mobs is a win.
  The tick is `DUNGEON_CONSTANTS.TICK_INTERVAL_MS` (10 ms) and the shield mitigation
  `DUNGEON_CONSTANTS.SHIELD_MITIGATION` unless the shield spell carries its own (`L1670985-1671018`).
  **[CODE]**
- The app runs dungeon, raid and Oblivion sequences this way (per-mob cap, 500 ms gaps, respawn
  aged), the campaign with the live loop's rules (no gap, minion untouched, a per-mob 20-minute
  safety stop reported as a timeout since the loop itself has none), and keeps one shared window
  only when the caller gives one (dps and survival windows, World Boss, custom mobs).
- Dungeon / raid / boss outcomes are **[SERVER]**; the replay ends with
  `defender_dead` (mob) or `attacker_dead` (player).

## §15 Enemy stat generation (campaign)

### §15.1 Formula — **[CODE]** `makeMob` `L1084790-1084837`, `buildChapterLevels` `L1084840-1084931`

```
GLOBAL_MULTIPLIER = 2                                           L1085224
mob.hp          = round(template.baseHp  * levelMultiplier * 2)
mob.attack      = round(template.baseAtk * levelMultiplier * 2)
mob.attackSpeed = template.baseSpd
mob.penetration = template.penetration (if present)
level i (0..9) of a chapter fights 3 mobs, in order:
    templates[i % 3], templates[(i+1) % 3], templates[(i+2) % 3]   each scaled by levelMultiplier[i]
```

Campaign mobs set no `damageReduction`, `blockChance` or `missChance` (all 0
via §3.2) and never crit. Each chapter has 10 levels (`LEVELS_PER_CHAPTER`).

### §15.2 Hard chapters — **[CODE]** `hardChapterVariant` `L1084972-1085017`, assembly `L1085452-1085511`

Chapters 12-22 (display 1-11, `HARD_CHAPTER_OFFSET = 11`, `isHardChapter(c) = c > 11`):

```
template'.baseHp  = round(template.baseHp  * hpScale[chapter])
template'.baseAtk = round(template.baseAtk * atkScale[chapter])
template'.penetration = penetration[chapter]                 // 50, 52, ... 70 (+2 per chapter)
level multipliers (all hard chapters) = [1, 1.05, 1.11, 1.16, 1.22, 1.28, 1.34, 1.4, 1.45, 1.62]
then makeMob as above (x2).
```

`hpScale`/`atkScale` are very large (e.g. chapter 12: 304 000 / 264 000; chapter 22:
139 000 / 140 600; `L1085414-1085434`). The `[DERIVED]` per-level mob stats for all
22 chapters are in the JSON.

### §15.3 Normal chapter table — **[CODE]** `L1085307-1085411`

| # | Chapter | Mob templates (baseHp / baseAtk / baseSpd) | Pen | Level multipliers |
|---|---|---|---|---|
| 1 | Rat Warrens | Giant Rat 60/5/1.3, Sewer Slime 90/8/1.1, Sewer Crocodile 130/12/1.0 | - | 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2 |
| 2 | Orcish Outpost | Orc Wolf 350/30/1.0, Orc Warrior 500/48/0.8, Orc Berserker 750/70/0.6 | - | 1.2, 1.6, 1.8, 2.2, 2.6, 3, 3.4, 3.4, 3.8, 4.1 |
| 3 | Warlord's Pass | Orc Warrior 2500/180/0.8, Ogre Brute 4500/320/0.6, Orc Shaman 3500/250/0.7 | - | 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2 |
| 4 | Wraith Hollows | Skeleton 8000/550/0.7, Crypt Ghoul 12000/800/0.5, Shadow Wraith 10000/680/0.6 | - | 1, 1.2, 1.4, 1.6, 1.9, 2.2, 2.5, 2.8, 3.2, 3.6 |
| 5 | Golem Depths | Stone Golem 25000/1600/0.7, Iron Colossus 35000/2400/0.5, Runeforged Guardian 30000/1000/0.8 | - | 1, 1.2, 1.4, 1.6, 1.8, 2, 2.3, 2.6, 2.7, 2.9 |
| 6 | Frozen Catacombs | Frost Skeleton 60000/4000/0.5, Ice Witch 80000/5500/0.8, Frozen Revenant 70000/4800/0.7 | - | 1.1, 1.2, 1.4, 1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 2.7 |
| 7 | Glacial Abyss | Frozen Revenant 150000/10000/0.8, Glacial Beast 180000/14000/0.7, Ice Witch 200000/18000/0.6 | - | 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2 |
| 8 | Infernal Summit | Fire Drake 350000/25000/0.7, Infernal Demon 500000/38000/0.6, Magma Hound 400000/30000/0.8 | - | 1, 1.2, 1.4, 1.7, 2, 2.3, 2.7, 3.1, 3.6, 4.2 |
| 9 | Abyssal Rift | Abyss Stalker 1.3M/125000/0.7, Rift Challenger 1.9M/160000/0.6, Void Devourer 1.75M/140000/0.8 | 18 | 1, 1.3, 1.6, 2, 2.4, 2.4, 2.8, 3.2, 3.7, 4.3 |
| 10 | Divine Gate | Sanctum Warden 2M/150000/0.8, Halo Stalker 1.45M/175000/1.5, Radiant Seer 1.6M/210000/1.1 | 40 | 2.4, 2.9, 3.3, 3.7, 4, 5.2, 6, 6.4, 7.2, 8.2 |
| 11 | Chrono Sanctum | Chrono Wraith 2.5M/240000/1.5, Fractured Sear 3.2M/320000/1.0, Eonbound Colossus 5M/480000/0.45 | 48 | 3.2, 3.8, 4.4, 5, 5.6, 6.2, 6.7, 7.2, 7.9, 8.6 |

`hp = baseHp * mult * 2`; e.g. chapter 11 level 10, Colossus: 5 000 000 * 8.6 * 2 =
86 000 000 HP, attack 480 000 * 8.6 * 2 = 8 256 000, speed 0.45. **[DERIVED]**

### §15.4 JSON schema (`data/combat-pve.json`)

`source` (module 3962 and line citations), `progressConstants`, `hardChapterOffset`,
`hardLevelMultipliers`, `mobDefaults`, `chapters[11]` and `hardChapters[11]`, each
`{chapter, name, mobTemplates[3], levels[10]}`; a level is
`{level, levelMultiplier, influenceReward, mobs[3]}` and a mob is
`{id, name, hp, attack, attackSpeed, penetration?}` (derived by §15.1). Hard
chapters add `displayChapter`, `basedOnChapter`, `hpScale`, `atkScale`,
`penetration`. `influenceReward` is the first-clear currency per level
(`hardInfluence` `L1084932-1084971`: `((chapterIdx*10 + i)*5 + 500) + 25 on the
last level`); it is not a combat value.

### §15.5 What the mob numbers mean for a build

- Campaign mobs deal `attack` per swing at `attackSpeed`; against the player that
  is `round(attack*(1-DR))` after Block. A Block roll against a mob with
  Penetration lets `round(attack*pen/100)` through (the player must have Miss 0
  for the pierce to apply, §5.4). From chapter 9 and in every hard chapter this
  makes Block less valuable.
- There is no level scaling against *player* level in the campaign client
  data. Dungeon / raid / Oblivion / crusade enemy tables and scaling
  `see pve-content.md`; the crusade boss entity is
  `maxHp = round(hp * playerCountHpMult * bossStatMultiplier * (bossHpMultiplier ?? 1) * mythicPlusMult)`
  with attack scaled the same way and all defensive stats 0 (`L1862677-1862771`).

## §16 World boss — **[CODE]** module 4146 `L1152855-1153517`

| Item | Value | Cite |
|---|---|---|
| Unlock level | 30 (`UNLOCK_LEVELS.WORLD_BOSS`) | `L668649` |
| Tokens | 3 per day, max 3, reset hour 0 | `L1153423` |
| Fight | 60 000 ms, tick 100 ms, `METEOR_START_MS` 57 000 | `L1153423` |
| Boss | Elder Dragon, `hp 20 000 000 000` | `L1153478` |
| Affinity | picked per 2-session cycle by a hash with a no-immediate-repeat rule | `L1152862-1152990` |

Three affinities (**[CODE]** config `L1153433-1153449`, English text `L910735-910739`):

| Affinity | Config | In-game text |
|---|---|---|
| NONE ("Dormant") | block 0, spell resist 0, no attacks, 60 s | "The dragon does not block and does not hit back. You have 60 seconds." |
| FORTIFIED ("Adamant Scales") | `blockChance 80`, `bossSpellResist 30`, `penetrationPiercesSpellResist true` | "blocks 80% of your hits and resists 30% of spell damage. Only Penetration gets through its scales." |
| ENRAGED ("Rising Wrath") | `hitDamagePctOfMaxHp 18`, `baseAttackSpeed 1`, `frenzyStartMs 20000`, `damageRampPerSec 0.03`, `attackSpeedRampPerSec 0.08`, `maxAttackSpeed 6`, `avoidedReboundPct 28`, `lethal true`, `maxFightDurationMs 300000` | "hits back for 18% of your max HP and gets faster and stronger every second. 28% of every hit you block or dodge is dealt back to it. There is no timer: the fight ends when you die." |

The fight itself is **[SERVER]**. The client receives `combatLog` (an encoded tick
list, same event fields as §17) and replays it. The ramp formulas, whether the boss
rolls a Block with the same single roll as §5, how `penetrationPiercesSpellResist`
applies, and the Enraged damage interval are **[UNRESOLVED]**: nothing in the client
executes them. Rewards, brackets and participation scaling `see pve-content.md`.

## §17 Event stream the client replays

**[CODE]** `processCombatTick` events and `mapTickType` `L1670711-1670925`; world
boss log fields `L1153677-1153927`, `L1154165-1154357`.

Common fields: `timestamp`, `type`, `damage`, `attackerHp(After)`, `defenderHp(After)`.
Optional: `doubleHit`, `isCrit`, `spell {name, icon, species}`, `spellIndex`,
`debuffStacks`, `debuffMaxStacks`, `debuffPermanent`, `damagePerTick`, `paralyzeMs`,
`fearMs`, `staggerStacks`, `bulwarkStacks`, `sunderStacks`, `momentumStacks`,
`chronoFlux`, `attackerShieldHp(After)`, `minionHp(After)`, `minionMaxHp`,
`minionRespawnMs`, `summonReadyMs`.

Types: `attacker_hit`, `attacker_crit`, `attacker_regen`, `defender_hit`,
`attacker_block`, `attacker_miss`, `defender_block`, `defender_miss`,
`defender_blinded`, `defender_blind`, `defender_paralyzed`, `defender_paralyze`,
`defender_silenced`, `defender_staggered`, `defender_feared`, `defender_fear`,
`thorns_reflect`, `attacker_instability`, `attacker_dead`, `defender_dead`,
`minion_summoned|hit|crit|damaged|heal|dead|buff|buff_end`, `spell_cast`,
`spell_damage`, `spell_dot_tick`, `spell_heal_tick`, `spell_buff_start`, `spell_end`,
`spell_debuff_applied|stack|tick|expired`, `debuff_applied`, `debuff_stack_added`,
`debuff_tick`, `debuff_expired`. In the engine's naming **attacker = the player,
defender = the enemy** (`attacker_hit` is the player hitting; `defender_hit` is the
enemy hitting). The UI maps them to `player_*` / `mob_*`; `defender_miss` is shown
as `mob_block`.

## §18 Unlock levels (combat content) — **[CODE]** `L668649`

PROGRESS 1, DUNGEON_1 5, RAID_1 10, WORLD_BOSS 30, CRUSADE 35, CELESTIAL_TRIAL 40
(hard 60), MYTHIC_CRUSADE 52, SIGILS 25 (Mystic 17), AMPLIFICATION 50. Class forms
that unlock disruption `see classes.md`.

## §19 Reading of the previous model (verdicts)

For maintainers: how the code compares with `combat-model.md`. "Confirms",
"refutes" and "replaces" refer to the code values above.

| Old claim (tag) | Verdict |
|---|---|
| 400 ticks/s clock (ASSUMED) | **Replaced**: 100 ms (client/world boss) or 10 ms (server) delta-time ticks, §2 |
| Swing every `40000/speed` ticks, first on tick 1 (ASSUMED) | **Replaced**: `round(1000/AS)` ms with carried remainder; player's first swing after one full interval, mob's after half its interval (progress), §4 |
| Speed clamped to >= 100 (ASSUMED) | **Not found** in the engine; AS is a free multiplier (mobs 0.45-1.5), §4 |
| Boss is a pure dummy / PVE fight 60 s (ASSUMED/OBSERVED) | **60 s confirmed for Dormant only**; Fortified blocks 80%, Enraged hits back and has no 60 s timer, §16 |
| Double hit cannot crit (RULED) | **Confirms**, §5.1 |
| Penetration can crit (RULED) | **Confirms**, §5.4 |
| Separate Miss roll then Block roll; Miss stops penetration (ASSUMED) | **Replaced** in this engine: one roll vs `block+miss`; penetration only when defender Miss is exactly 0, §5.4-5.5 |
| Blind is a counter; blinded swing deals 0 (ASSUMED) | **Replaced**: boolean flag, swing consumed, no re-roll while blinded, §6 |
| Procs roll on blocked-with-pen hits (ASSUMED) | **Refuted**: no proc rolls on any negated swing, §5.4 |
| Paralyze 2 s (OBSERVED tooltip) | **Conflict**: tooltip 2 s, code `PARALYZE_DURATION_MS = 1000`, §8.1 |
| Sigil first hit at 1 s (OBSERVED) | **Confirms** for DAMAGE and DEBUFF spells; other types start at 0, §10.1 |
| Attack % buffs add into the Attack % total (RULED) | **Refuted by code**: multiplicative on final Attack, §9.1 |
| Regen `maxHp * regen/100/400` per tick, clamped at max (ASSUMED) | **Replaced**: 100 ms pulse, `max(1, round(maxHp*regen/1000))`, clamped, §7 |
| Lifesteal = share of damage dealt (ASSUMED) | **Confirms**, with `floor` and missing-HP clamp (overheal not credited), §5.3 |
| Spell damage: Spell Damage % up, target Spell Resist down, then chain (ASSUMED) | **Confirms** the shape; live loop uses Spell Resist only, shared copy adds DR, cap 60, §10.2 |
| Spell casts unblockable and un-dodgeable, no lifesteal (ASSUMED) | **Confirms**: spells skip the negate roll and `lifesteal`; Spell Vamp is separate, §10.3 |
| Thorns reflect (OBSERVED) | **Confirms** shape: `round(dmg*thorns%/100)` on mob hits, §11 |
| Sunder/Bulwark stacks max 8, shed 1.75/s (OBSERVED) | **Values are config**: engine defaults are loss 2 per unblocked hit and decay 2/s; the 8 / 1.75 come from sigil data `see sigils.md` |
| `PVP_HEALTH_MULTIPLIER` 8, duel 60 s (PATCH/OBSERVED) | Constants present in arena config `L667970` (`PVP_HP_MULTIPLIER 8`, `FIGHT_DURATION_MS 60000`); rules `see combat-pvp.md` |
| `REF_*`, `REF_FIGHT_SEC`, `REF_SPELL_SHARE`, `REF_ENEMY_SWINGS_PER_SEC`, `PARALYZE_SEC` (INVENTED/ASSUMED) | **Not game constants**: no counterpart in the client; they stay modelling choices |
| Tank "block negates the entire hit in PVE; mob penetration unknowable, assumed 0" (ASSUMED) | **Refuted for data**: mobs carry Penetration (campaign ch 9+: 18/40/48; hard 50-70; dungeon 6-10+), §15 |
| Audit F4 overheal bias | The game clamps heals at missing HP (§5.3, §7); the remaining three biases (timing, conditionality, summing) are modelling issues, not game facts |
| Audit F6, F15, F19, F28, F29 | Search / calibration findings about the optimiser; the game code has no bearing on them |

## §20 Celestial Trial: the party fight

The Celestial Trial fight is **[SERVER]**: the start response carries `celestialResult.ticks` and the
client only replays them. No Celestial fight simulator exists in the bundle. The config (boss tables,
level bands, the four boss spells, tactics) is **[CODE]** and summarised in `pve-content.md §6`. Every
rule below that is not config was read from **five server logs of 2026-10-15** (HARD L85 win at 145 s,
NORMAL L85 win at 75.3 s, HARD L85 loss with Overload at 72.57 s, NORMAL L85 win at 71.49 s, HARD L95
win at 307.63 s; fixtures `src/lib/__fixtures__/real/celestial-*.json`). Those rules are **[DERIVED]
from the 2026-10-15 server logs**: driven by each log's rolls, the app's engine
(`engine/pve/celestial.js`) reproduces every logged event (14 008 of 14 008), every damage, boss HP,
add HP, Block Fury, stack, Chrono Flux and Burden value, and 28 014 of 28 016 player HP values (the
two misses are §20.9's unexplained tick). MYTHIC is not covered: its party-power HP scaling is
**[SERVER]**.

### §20.1 Clock and per-tick order

**[DERIVED] from the 2026-10-15 server logs.** The clock starts at 500 ms with one `burden_update`
per player (0 adds) and runs on 10 ms ticks. Every swing timer starts at 0 at 500 ms and gains 10 ms
per tick; a swing fires when it reaches `round(1000 / attackSpeed)` and keeps the remainder (boss
swing k lands at `ceil((500 + k*I)/10)*10`: 526 ms on HARD, 667 ms on NORMAL). A player's interval is
recomputed every tick from the current attack speed. One tick, in order:

```
0  clocks: Block Fury decays, the boss's paralysis counts down, Judgment's timer advances (frozen while paralyzed)
1  Halo Breach: an add spawns at 500 + k*interval -> add_spawn, burden_update per player, overload_start
2  each living player in party order:
   a  regen pulse (timestamps on the 100 ms grid)
   b  the player's spell pass (casts, buff start and end, debuff application)  boss HP logged after the batch
   c  the player's auto-attack (boss or add, by tactics) -> blind / paralyze procs, add_death + burden_update
3  each player's DoTs on the boss (spell_debuff_tick / _expired)                boss HP logged after the batch
4  enemy phase: boss swing, Judgment Strike, each add's swing (oldest first)
5  one thorns_reflect with the tick's summed thorns
6  end of tick: Chrono Flux charges, an Ancient transform fires, Sunder decays
```

`blockFuryStacks` and HP are running values; `bulwarkStacks`, `sunderStacks` and `chronoFlux` are the
end-of-tick values on every row of the tick. A lifesteal heal shows from the next row on.

### §20.2 Scaling level and enemy stats

**[DERIVED] from the 2026-10-15 server logs:** the scaling level is the party's highest level
(`highestLevel`; the L95 log's party was L85 + L95 and scaled at 95). With it the client's
`getCelestialBossStats` / `getCelestialAddStats` **[CODE]** give the logged values exactly:

| Difficulty, level | Boss HP | Boss attack | Add HP | Add attack |
|---|---|---|---|---|
| HARD 85 | 8 388 341 867 | 266 866 | 419 417 093 | 53 373 |
| HARD 95 | 33 935 521 328 | 477 916 | 1 696 776 066 | 95 583 |
| NORMAL 85 | 2 461 903 877 | 147 715 | 61 547 597 | 29 543 |

The boss never crits. Adds swing once per 1000 ms; an add's first swing comes 30-990 ms after it
spawns (about 50 samples, consistent with a uniform draw on the 10 ms grid; the rule itself is
**[UNRESOLVED]**). Spawning continues whatever the living count (a 7th add came with 6 alive). Add ids
count from 1.

### §20.3 Gatekeeper's Burden

The per-add config is **[CODE]** (`pve-content.md §6`). How it applies is **[DERIVED] from the
2026-10-15 server logs**, with n the number of living adds (the logged `burdenStacks`):

| Effect | Rule |
|---|---|
| Max HP base | `M0 = round(sheetHp * (1 - hpPerAdd*n))`; every `burden_update` (rise and fall) sets `HP = min(HP, M0)`, ignoring every bonus max HP |
| Bonus max HP | `cap = floor(M0 * (1 + (buff HP% + Bulwark HP%)/100))` (Iron Bastion 44.4 %, Earthwarden 100 %, Bulwark 8 % per stack) |
| Regen | a 100 ms pulse of `round(sheetHp * regen%/1000 * (1 - hpRegenPerAdd*n))`, from the **sheet** max HP, only while `HP < cap` |
| Healing | lifesteal `floor(dmg * ls/100 * max(0, 1 - healingReductionPerAdd*n))`; Iron Bastion's cast heal `floor(HP*0.444) * max(0, 1 - healingReductionPerAdd*n)`, not floored again (HP becomes fractional) |
| Damage taken | `round(A * m * (1 - D/100) * (1 + damageTakenPerAdd*n) * ovl)`, one rounding; `D = min(sheet DR + buff DR + Bulwark DR, 75) * (1 - damageReductionPerAdd*n)` |
| Avoid | `(min(block + buff, 85) + miss) * (1 - blockChancePerAdd*n)` |
| Player attack | NORMAL `round(atk * (1 + attackPerAdd*n))`; HARD has no per-add attack term |

### §20.4 Player side

**[DERIVED] from the 2026-10-15 server logs.**
- **Targets.** The run's tactics `{focus, holdCount}` pick auto-attack targets: HOLD with holdCount H
  hits the oldest living add while more than H live, else the boss. `getCelestialMaxHoldCount`
  **[CODE]** bounds H to `[1, min(maxAlive, addsThreshold)]`. Spells and DoTs always hit the boss.
- **Damage.** `A = round(atk' * (1 + 0.12 f))` on HARD (f = Block Fury), where `atk'` is the attack
  after buffs (`floor`: Warborn Fury, Earthwarden) and Elusive stacks (`round`). A crit is
  `round(A * critDamage)`. Double hits, Blind and Paralyze proc only on boss-targeted swings; the
  second hit never crits. An add's HP floors at 0 and `add_death` names the last hitter.
- **Spells** (the `§10.2` shape): `curAtk = round(sheetAtk * M)`, M the same Fury or per-add factor,
  then `max(1, floor(floor(curAtk*pct/100) * (1 - bossSpellResist/100)))`; the boss's spell resist is
  45 on HARD and 0 on NORMAL **[CODE]**. DoT stacks snapshot at cast.
- **Block Fury (HARD).** A float party stack: +1 per block by the **tank** (not by another player's
  avoid, not by blinds or paralyses), cap 60, minus 0.015 per tick (repeated subtraction, floored at
  0), logged rounded. It keeps multiplying the survivor's attack after the tank dies.
- **Death.** A dead player stays at 0 HP: no regen, swings, spells or Burden HP change.

### §20.5 Enemy side

**[DERIVED] from the 2026-10-15 server logs.**
- **Targets.** The boss, the adds and Judgment Strike hit `tankIndex`. When the tank dies every enemy
  swings at the survivor from its next swing on, timers kept. The killing hit is logged as
  `player_death` with its full damage.
- **Boss swing.** Paralyzed (1000 ms per proc): `boss_paralyze`; else blinded (one swing):
  `boss_blind`; else the target rolls its avoid. Add swings ignore the boss's blind and paralysis.
- **Judgment Strike** fires at `500 + 30000k + 990 * (paralyses before it)` (its timer freezes while
  the boss is paralyzed), with `m = attackMultiplier` (5.5 HARD, 3 NORMAL **[CODE]**). It is never
  avoided (0 of 16), takes DR including Bulwark's, burns no Bulwark stack, reflects no thorns, and
  counts as a hit taken for Chrono Flux.
- **Celestial Overload** starts in the spawn tick that brings the living adds to `addsThreshold`
  (7 on HARD **[CODE]**), logged `overload_start` after that tick's Burden updates. While it is
  active only the boss auto-attack is multiplied, by `1 + attackBuffMultiplier` (6 on HARD); add
  swings are not.
- **Avoids** of a player who is not the tank are logged `player_block` / `add_block` too.

### §20.6 HP caps and transforms

**[DERIVED] from the 2026-10-15 server logs.**
- The bonus-HP clamp (`HP = min(HP, cap)`, with the stacks at the start of the enemy phase) runs only
  on a tick where an enemy swing resolves against the player (hit, avoid or Judgment), before that
  swing. A Bulwark stack lost to a hit does not clamp at once.
- Iron Bastion's end clamps HP to `M0` when no other HP bonus is active (the shared engine's rule,
  `§10`); Earthwarden's end with Bulwark stacks up does not.
- Earthwarden (Ancient transform) adds no HP when cast; its attack is `floor(atk * 1.3)` and its Block
  is the soft-capped gain on the sheet's Block (`§10.6`).

### §20.7 The stack player, thorns and Chrono Flux

**[DERIVED] from the 2026-10-15 server logs.**
- Stack sigils (Bulwark of Thorns, Elusive Supremacy, Sunder Mark, Siegebreaker) run for **one**
  player per fight; the logged `bulwarkStacks` / `sunderStacks` are that player's. The client's
  unused `simulateCrusadeFight` **[CODE]** has the same shape (one `sigilState`, `stackPlayerIndex`,
  one `createStackCombat`, `L1868835-1868870`). In all five logs it was the player who started the run
  (player 0 in four; the L95 tank, who started it by autoStart, in the fifth). Another player's
  Bulwark and Iron Bastion glyph thorns do nothing.
- Bulwark: +1 per avoid, -1 per unblocked boss or add hit, DR +4 and max HP +8 % per stack, read at
  the start of the enemy phase. Thorns per unblocked hit are `round(damageTaken * 7 * stacks / 100)`
  with the running stacks (before this hit's loss); a tick's thorns are summed into one
  `thorns_reflect` on the boss, even when an add was the attacker.
- Elusive: +1 per own avoid; a hit burns stacks; per stack +3 % attack and +3 % attack speed.
- Sunder: +1 per landed auto-attack of the stack player on the boss (hits on adds and the other
  player's hits add none), decaying per tick (1.4/s with the Epic Enduring Brand glyph). It has no
  effect here: the boss has no DR, block, miss or blind to strip.
- Chrono Flux, per player and event: own landed hit `+(Flame + Dark)`, hit taken (Judgment included)
  `+0.7*(Earthen + Dark)`, own avoid `+(Earthen + Dark)`, divided by `3^(transforms fired)`, no gain
  while the transform runs, cap 7000. A full bar fires the Ancient at the end of the tick and resets.

### §20.8 Fight end

**[DERIVED] from the 2026-10-15 server logs.** A win ends on the killing tick with `boss_death`
(`totalDuration` is that tick; the killing damage is not clamped). A loss ends on the tick the last
living player dies (`success false`, `timedOut false`). `timeLimitMs` is 240 000 on NORMAL and
360 000 on HARD **[CODE]**; no log timed out, so whether the limit counts from 0 or from 500 ms is
**[UNRESOLVED]**. Dust ranges use the scaling level (`pve-content.md §6`).

### §20.9 Open items

**[UNRESOLVED]** (none of the five logs settles them):
- Judgment Strike under Overload: no Judgment fell inside an Overload.
- When Overload ends (`overload_end` exists as a tick type and was never logged), and whether the x6
  drops at once.
- Overload on NORMAL (threshold 5, never reached).
- Who the stack player is in general: "the player who started the run" fits all five logs and is
  unproven.
- How many Elusive stacks one hit burns (one case: 1 to 0).
- Whether a non-tank's avoid is a block or a miss (its label is `player_block` / `add_block`).
- `controlFuryFraction` 0.7 (HARD config): neither a non-tank's avoid nor a blind paid any Fury.
- Block Fury and `attackPerAdd` together (no difficulty has both).
- The add first-swing phase rule (random-looking; 30-990 ms seen).
- Whether adds are immune to Blind and Paralyze or simply never proc them (0 procs on 660
  add-targeted swings).
- Judgment Strike's target after the tank dies, the target choice with 3+ players, and whether the
  tank keeps aggro when the other player dies first.
- Whether spawning stops at `maxAlive` 12 (never reached).
- The time-limit origin (0 or 500 ms) and key use on a loss.
- One unexplained tick: in the L95 log Earthwarden fired at 66 790 ms in a tick where two add hits
  (2 x 35 844) landed on the tank, and the cast rows, and every later row, carry the HP from before
  those hits. The replay check lists the two cast rows and resets the HP after that tick.

The app's engine fills the open items it needs with labelled assumptions (`CELESTIAL_ASSUMPTIONS`;
`simulation.md` Target fidelity).
