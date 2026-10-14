# PVP Combat Resolution

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

How a PVP fight is resolved: Arena (Clash), Clan War PVP, Fortress PVP and
practice fights. This is the PVP-specific layer; the shared engine pieces
(penetration, disruption, stack sigils, minions, shield, spell engine) are
documented once in `combat-pve.md` and only pointed at here.

**Tags.** **[CODE]** read directly from client code (`decompiled.js L<n>`).
**[DERIVED]** computed from [CODE] values, working shown. **[SERVER]** decided
server-side; the client shows only what is listed. **[UNRESOLVED]** could not
be determined; what was checked is stated. `strtab.txt L<n>` is the UI/patch
note string table in the same extract (a game string, cited as [CODE]).

Machine-readable catalogue: `data/combat-pvp.json` (schema in §14). Facts owned
elsewhere: stat caps, soft-cap curve, PVP rating conversion `see stats.md`;
shared fight engine `see combat-pve.md`; stack-sigil / spell catalogue
`see sigils.md`; clan war / fortress structure `see clan-fortress.md`;
Disruption effect per spec `see classes.md`.

**What this contributes to power.** PVP adds exactly three things on top of the
normal stat sheet: (1) the **PVP Attack / PVP Defense ratings**, which become
`r / (r + 200)` damage fractions (§5); (2) a flat **x8 HP pool** for every
fighter (§3); (3) a different **fight shape**: two-sided, 60 s, every defensive
stat is live because the opponent swings back (§6, §7). Everything else
(Attack, Speed, Crit, Block, Miss, ...) is read one-to-one from the displayed
totals.

---

## §1 Where PVP fights are resolved

**Finding: the 2.7.0 client does not simulate PVP fights. It requests the fight
from the server and replays the returned tick log.** A complete PVP simulator
(`simulateArenaPvP`) ships inside the bundle but nothing calls it.

| Mode | Request | Replay hook | Notes |
|---|---|---|---|
| Arena (Clash) | `POST /arena/fight {opponentId}` `L1101943` | `useArenaCombat` `L1609792-1610459`; plays `result.ticks` | 60 s countdown `ARENA_CONSTANTS.FIGHT_DURATION_MS` |
| Clan War PVP | `POST /clan-war/pvp/roll` `L1397178`, `/fight` `L1397218`, `/forfeit` `L1397257` | `useClanWarCombat` `L1636304-1637094`; `result.ticks` | countdown also `ARENA_CONSTANTS.FIGHT_DURATION_MS` `L1555724` |
| Fortress PVP | `POST /fortress/attack-defender` `L1399525` | `useFortressPvpCombat` `L1637977-1638545`; adapter `{id:'fortressPvp', timeUpTerminal:true}` `L1639154` | countdown `L1579082` |
| Practice fight | `POST /leaderboard/practice-fight {opponentId}` `L934198` | `usePracticeStageDirector` (module 6525) | no rewards in the request path; see §12 |
| Final Battle duels (clan war) | server-compiled battle log, protocol v1 | module 6479 `L2092240-2092934` | §12 |

**[CODE]** The Arena response carries `result.{ticks, totalDuration,
attackerWon, attackerMaxHp, defenderMaxHp, attackerHpRemaining,
defenderHpRemaining, attackerShieldMax, defenderShieldMax,
attackerShieldVariant, defenderShieldVariant}` (consumed in `useArenaCombat`:
`ticks` `L1610173`, max HP / shield fields `L1610186-1610200`). The Clan War and
Fortress hooks read the same fields (`L1636789-1636809`, `L1638118-1638147`). The client's win/lose screen is
`attackerWon ? FIGHT_WON : FIGHT_LOST` `L1609914-1609922`; the tick-replay
terminal is `type !== 'attacker_dead'` -> won `L1610062-1610072`. So the
**player is the "attacker"** (the initiator) in every PVP mode.

**[CODE]** The bundled simulator `simulateArenaPvP` (module 5399
`L1454718-1457623`) returns exactly that shape (`ticks, totalDuration,
attackerWon, attackerMaxHp, defenderMaxHp, attackerHpRemaining,
defenderHpRemaining, attackerShieldMax, ... ShieldVariant` `L1457545-1457620`).
Only module 5398 (`ArenaBuffIndicator`) imports module 5399, and it calls
`getPvpHpMultiplier` only (module deps `L1452297`; grep for
`simulateArenaPvP` finds just the definition). **[DERIVED]** The server very
probably runs this same code (shared bundle, identical output shape), so §3-§9
are the best available statement of the live rules. **[UNRESOLVED]** Server
source is not in the client; identical behaviour on the live server is an
inference, not a reading. What was checked: every importer of module 5399, all
callers of `simulateArenaPvP`/`processAttack`/`applyPvpHpBuff`.

Opponent selection, rewards, token spend, anti-cheat and the RNG seed are
**[SERVER]**.

---

## §2 Fight constants

All **[CODE]**.

| Constant | Value | Where |
|---|---|---|
| `FIGHT_DURATION_MS` | 60000 | `ARENA_CONSTANTS` `L667970` |
| `TICK_INTERVAL_MS` | 10 | `L667970` |
| `PVP_HP_MULTIPLIER` | 8 | `L667970`, read by `getPvpHpMultiplier` `L1452741-1452746` |
| `PVP_SHIELD_BASE_MULTIPLIER` | 2 | `L667970` |
| `PVP_RATING_K` | 200 | module 3959 slot4 `L1080517`; getter `L1080410` |
| Regen pulse period | 100 ms | module 5399 slot9 `L1457661-1457662` |
| Regen pulses per second divisor | 10 | slot10 `L1457663-1457664` |
| `PARALYZE_DURATION_MS` | **1000** | module 3963 slot11 `L1089579`, getter `L1087493` |
| `FEAR_DURATION_MS` | 1000 | slot10 `L1089578` |
| `DISRUPTION_SILENCE_MS` | 3000 | slot7 `L1089572-1089573` |
| `STAGGER_STACKS_TO_STUN` | 3 | slot8 `L1089574` |
| `STAGGER_STUN_MS` | 2000 | slot9 `L1089575-1089576` |
| Slow cap (sum of SLOW stacks) | 50 % | module 3966 slot1 `L1093996-1093999` |
| Arena tokens / day | 5 (reset hour 0) | `L667970` |
| Free "second chance" / day | 1 | `L667970`; `POST /arena/second-chance {fightId}` `L1101984`; strtab L92972 ("Arena escape: one free escape a day") |
| Clan War PVP tokens / day | 3, `WP_FOR_WIN` 30, `WP_FOR_LOSS` 0 | `L1063264` |
| Arena unlock level | 18 | `UNLOCK_LEVELS.CLASH` `L668649`; strtab L92971 |
| Sigil activation conditions unlock | 54 | `UNLOCK_LEVELS.SIGIL_CONDITIONS` `L668649` |

Per-mode HP multiplier: Arena and Clan War PVP show the x8 badge
(`ArenaBuffIndicator` is used by the Arena, Clan War and classic-stage scenes
`L1433529, L1491647, L1556915, L1559792`); strtab L25024 "Your HP is multiplied
by {{mult}} in Arena and Clan War fights", L104307 "The buff applies to Clan
War PvP and practice fights too". **[UNRESOLVED]** Fortress PVP: the Fortress
scene never renders the badge and no string names it; whether the server
multiplies HP there is not visible. Final Battle duels use a separate 36x
multiplier (§12).

---

## §3 Fighter set-up

**[CODE]** `createPlayerEntity(stats)` `L1087500-1087588` copies the displayed
totals one-to-one: `maxHp=totalHp`, `rawMaxHp=pvpBaseHp ?? totalHp`,
`hp=totalHp`, `attack, attackSpeed, doubleHit, critChance, critDamage,
lifesteal, hpRegen, damageReduction, blockChance, missChance, blindChance,
paralyzeChance, penetration, disruptionChance` (+ `disruptionEffect`, default
`SILENCE`), **`pvpAttack=totalPvpAttack`, `pvpDefense=totalPvpDefense`**,
`spellDamage, spellResist, spellCritChance, spellVamp`, `shieldHp=shieldMax=0`.
Percent stats are in percent units (40 = 40 %); `critDamage` and `attackSpeed`
are multipliers / swings per second.

**HP pool.**
```
applyPvpHpBuff(stats, mult):                       // L1454678-1454713
    if stats.pvpBaseHp is undefined and mult != 1:
        copy.totalHp   = floor(stats.totalHp * mult)
        copy.pvpBaseHp = stats.totalHp             // pre-multiplier HP
mult = ARENA_CONSTANTS.PVP_HP_MULTIPLIER = 8
```
So every fighter has `floor(Health * 8)` HP and `rawMaxHp = Health`.
**Healing is sized off `rawMaxHp`, not the x8 pool** (regen, §7). **[CODE]**.
Where `applyPvpHpBuff` is called is server-side (no client caller).

**Shield pool** (shield sigils only, `see sigils.md` / `combat-pve.md` §13):
```
shieldBaseFor(e) = (e.maxHp > e.rawMaxHp) ? e.rawMaxHp * 2 : e.rawMaxHp   // L1455714-1455733
shieldMax        = floor(shieldBaseFor(e) * shieldCfg.hpPercent / 100)     // L1455738-1455753, 1455776-1455792
shieldHp         = shieldMax
```
**[DERIVED]** In PVP the shield base is `2 x rawMaxHp` while the HP pool is
`8 x rawMaxHp`, so a given shield-percent covers a quarter of the share of
total HP that it covers in PVE (where base = rawMaxHp = maxHp).

**Max-HP buffs** (Bulwark stacks, buffs) use `getBuffedMaxHp(maxHp, pct) =
floor(maxHp * (1 + pct/100))` `L1085767-1085789`; `rawMaxHp` is unchanged.

---

## §4 The tick loop (`simulateArenaPvP`)

**[CODE]** `L1454718-1457623`, clock `L1456045-1457310`, tail `L1457456-1457545`.

```
t = 0 ; horizon = FIGHT_DURATION_MS (60000) + openingSummonWindowMs   // window = 0 unless a Necromancer minion exists
swingTimerA = swingTimerD = 0                                         // L1455933-1455936 (no minions)
while a.hp > 0 and d.hp > 0 and t < horizon:
    t += 10                                                           // TICK_INTERVAL_MS
    (minion respawn timers)                                           // L1456105-1456165
    swingTimerA += 10 ; swingTimerD += 10
    paralyzedMs, silencedMs, fearedMs  -= 10 (floor 0) on both        // L1456166-1456265
    cast attacker spells, then defender spells   (processArenaSpells) // L1456306-1456420
    tick attacker-held debuffs on defender and vice versa (DoTs)      // L1456488-1456788
    if a.hp <= 0 or d.hp <= 0: end fight                              // L1456790-1456796 (no swings this tick)
    apply timed buffs; compute regen with debuff reductions           // L1456797-1456888
    regen pulse for A then D (applyRegen, §7)                         // L1456889-1456988
    A swings if swingTimerA >= round(1000 / slowed(A.attackSpeed))    // L1456990-1457000
        -> processAttack(A, D); then A's minion strikes
    D swings likewise (AFTER A, same tick)                            // L1457111-1457121
        -> processAttack(D, A); then D's minion strikes
    if a.hp <= 0 or d.hp <= 0: end fight                              // L1457269-1457275
```
Consequences (**[DERIVED]** from the above):
- **Resolution order inside a tick is fixed: attacker (the player) swings
  first, defender second, and the defender still swings if the attacker's hit
  killed it** (no death check between the two swings). That is the mutual-kill
  path.
- A fighter killed by a spell or DoT in a tick does **not** swing that tick
  (check at `L1456790`).
- Swing interval is `round(1000 / attackSpeed')` ms where `attackSpeed'` is the
  Elusive-buffed (`L1456990`) then slow-reduced (`slowedAttackSpeed`
  `L1093904-1093945`: `speed * (1 - slow%/100)`, slow capped at 50 %) value.
  The timer carries its remainder (`timer -= interval`), so the average rate
  is exact; at most **one swing per fighter per tick**.
- **First swing happens when the timer first reaches one interval** (no minions:
  timers start at 0, e.g. 2.0 swings/s -> t = 500 ms), not on tick 1.
- The last processed tick is `t = 60000` (loop continues while the new `t <
  horizon` before processing; `L1457307`).

---

## §5 PVP Attack / PVP Defense

**[CODE]** `pvpRatingToFraction(r) = r > 0 ? r / (r + PVP_RATING_K) : 0`,
`K = 200` `L1452748-1452763`, `L1080517`. UI percent form `100 * r / (r + 200)`
`L1080410-1080428`. Totals are `Math.round` of the summed rating with **no
soft cap** (`totalPvpAttack/Defense` `L1217336-1217340`).

**[DERIVED]** `r=200 -> 50 %`, `r=303 -> 60.2 %`, `r=283 -> 58.6 %` (matches the
old observation); the fraction never reaches 100 %.

**Where each rating applies** (grep of `pvpAttack|pvpDefense` in module 5399):

| Damage source | PVP Attack (attacker) | PVP Defense (target) | Defender DR |
|---|---|---|---|
| Normal swing, crit, double hit | yes `L1452963-1452978` | yes `L1452981-1452999` | yes |
| Penetration through a block | yes `L1453447-1453462` | yes `L1453464-1453481` | yes |
| Sigil spell damage / spell DoT ticks | **no** | **yes** `L1454121-1454146` | **no** (spell resist instead) |
| Debuff DoT ticks (Bleed etc.) | **no** | **yes** `L1456502-1456531`, `L1456653-1456682` | **no** |
| Minion strikes | **no** | **yes** `L1455596-1455612` | yes (`mitigateMinionHit`) |
| Thorns reflect | no | no | no (straight to shield/HP) |

Spell vs DR: no `damageReduction` read exists in the spell engine's damage path
(module 3964 only mentions it in the buff-modifier aggregate `L1090278`);
strtab L96371 "Spell Resist softens incoming spell damage", L96715
"Penetration does nothing for spells". **[DERIVED]** from that absence.

Sources of the ratings (gear, relics, stones, fortress buffs) `see stats.md`,
`gear.md`, `relics.md`, `stones.md`, `clan-fortress.md`. Patch history:
strtab L73492 "PVP Attack and PVP Defense reworked from flat percentages to a
rating system with diminishing returns"; L83423 fortress buffs updated (TOP
+15 PVP Attack, BOTTOM +15 PVP Defense, CORE +25/+25); L94566 enchant-stone PVP
ranges adjusted.

---

## §6 One swing: `processAttack(atk, def, t, atkIsAttacker, maxHp, defMinion)`

**[CODE]** `L1452841-1453843`. Order of checks:

```
1. if atk.paralyzedMs > 0:   event X_paralyze (dmg 0); swing lost            // L1452886-1452892, 1453817-1453841
2. elif atk.fearedMs  > 0:   event X_fear;            swing lost             // L1452895-1452901, 1453788-1453816
3. elif atk.blinded:         atk.blinded = false;     event X_blind; lost    // L1452903-1452905, 1453755-1453787
4. elif def has a living minion:  the swing (and its double hit) hits the
        minion instead; no avoid roll, no DR/PVP; minion death events        // L1452906-1452912, 1453570-1453754
5. else:
   avoid = def.blockChance + def.missChance
   if avoid > 0 and random()*100 < avoid:       -> AVOIDED path (below)       // L1452914-1452927
   else -> HIT path
```
Order of statuses is paralyze > fear > blind; a blinded attacker that is also
paralyzed/feared keeps the blind until it actually gets a swing. **[DERIVED]**.

**HIT path** (`L1452929-1453400`):
```
roll = rollAttackDamage(atk):                                                // L1085998-1086047
    isCrit      = random()*100 < atk.critChance
    damage      = isCrit ? round(atk.attack * atk.critDamage) : atk.attack
    isDoubleHit = atk.doubleHit > 0 and random()*100 < atk.doubleHit
    doubleHitDamage = isDoubleHit ? atk.attack : 0                           // uncrit, base attack

mitigate(x):                                                                 // L1452937-1453003
    if def.damageReduction > 0: x = max(1, round(x * (1 - def.damageReduction/100)))
    if atk.pvpAttack       > 0: x = round(x * (1 + pvpFrac(atk.pvpAttack)))
    if def.pvpDefense      > 0: x = max(1, round(x * (1 - pvpFrac(def.pvpDefense))))
    return x

dmg = mitigate(roll.damage)
{shieldHp, hpDamage} = absorbWithShield(def.shieldHp, dmg)                   // min(shield, dmg); L1085790-1085856
def.shieldHp = shieldHp ; def.hp -= hpDamage
lifesteal(dmg)                                                               // L1453004-1453045
event X_hit / X_crit {damage: dmg}                                           // L1453059-1453095
if roll.isDoubleHit and def.hp > 0:                                          // L1453096-1453141
    d2 = mitigate(roll.doubleHitDamage) ; shield/HP ; lifesteal(d2) ; event X_hit {doubleHit:true}
```
Notes (**[CODE]** unless tagged):
- **Rounding is integer at every step and DR / PVP Defense floor at 1**; PVP
  Attack has no floor. Crit multiplies *before* mitigation.
- **The double hit never re-rolls the avoid check, never crits, and only
  happens on a swing that was not avoided.** It uses plain `atk.attack`.
- **Lifesteal** `L1453004-1453045`: only if `atk.lifesteal > 0`, `atk.hp > 0`
  and `atk.hp < maxHp`; heal = `floor(dmg * lifesteal/100)` where `dmg` is the
  post-mitigation damage **including the part the shield absorbed**; HP capped
  at max.
- **On-hit procs** roll once per swing (not per double-hit strike), after the
  double hit (`L1453143-1453400`), and only on a HIT-path swing:
  - Blind: `atk.blindChance > 0`, target not already blinded, `def.hp > 0`,
    `random()*100 < blindChance` -> `def.blinded = true` (a boolean, not a
    stack) `L1453143-1453191`.
  - Paralyze: `atk.paralyzeChance > 0`, target `paralyzedMs <= 0`, alive,
    roll -> `def.paralyzedMs = PARALYZE_DURATION_MS = 1000` `L1453193-1453246`.
    Cannot be re-applied while already paralyzed.
  - Disruption: `atk.disruptionChance > 0`, target alive ->
    `rollDisruption` `L1086073-1086166` (SILENCE 3000 ms unless already
    silenced; FEAR 1000 ms unless already feared; STAGGER +1 stack, at 3 stacks
    reset and `paralyzedMs = max(paralyzedMs, 2000)`) `L1453248-1453400`.
    Details `see combat-pve.md` §8.3.

**AVOIDED path** (`L1453403-1453569`):
```
if atk.penetration > 0 and def.missChance === 0:        // exactly zero      L1453403-1453413
    base = round(atk.attack * atk.penetration / 100)
    base = round(base * rollPenetrationCritMult(atk))    // crit? critDamage : 1   L1086048-1086072
    then DR -> PVP Attack -> PVP Defense -> shield -> lifesteal as above           L1453430-1453528
    // no double hit, no blind / paralyze / disruption procs
event label: def.missChance > 0 ? X_miss : X_block        // L1453530-1453550
```
Key rules:
- **One roll decides avoidance: `random()*100 < Block + Miss`.** It is not a
  Miss roll followed by a Block roll. **[DERIVED]** `P(avoid) = (Block+Miss)/100`
  (not capped at 100 here; the stat/combat ceilings are the only limit).
- **Penetration only works if the defender's Miss is exactly 0.** Any Miss at
  all turns every avoided hit (including the Block share) into a zero-damage
  event. Corroborated by strtab L92168 "Miss is the one defense that switches
  off Penetration".
- The avoid event label is **`miss` whenever the defender has any Miss stat,
  otherwise `block`**, regardless of which of the two "caused" it. This label
  drives stack sigils (§9). **[CODE]**, `L1453530-1453550`.
- What slips through a block can crit (strtab L96718).

Worked example (**[DERIVED]**): defender Block 40, Miss 0; attacker Pen 30:
40 % of swings are avoided, each deals `0.30 * attack` (crit-eligible). Defender
Block 40, Miss 50: 90 % of swings deal nothing and Pen is irrelevant.

---

## §7 Regen, shields, healing

**HP Regen** `applyRegen` `L1452765-1452839`, called each tick with an
accumulating timer:
```
if timer < 100: return                                   // no pulse
timer -= 100
if hpRegen <= 0: return
amount = max(1, round(rawMaxHp * hpRegen/100 / 10))      // per 100 ms
if hp < buffedMaxHp:  hp = min(buffedMaxHp, hp + amount); healed = hp - old
overflow = amount                                        // when already at max
shield refill (regenShieldRefillAmount): alwaysRefills ? amount : amount - healed
```
**[DERIVED]** regen per second = `rawMaxHp * hpRegen/100` (the *pre-x8* HP), i.e.
an 8x pool regenerates 1/8 as fast in relative terms. Regen is reduced before
the pulse: Wound `regenReductionPercent` (sum, cap 100 %), Siegebreaker mark
`hpRegenReductionPercent` as flat percentage points, floor 0 `L1456834-1456884`.
Combat ceiling for HP Regen is 70 `L1080486`.

**Lifesteal**: §6. **Spell Vamp / spell heals** `see combat-pve.md` §10.3-10.4;
in PVP they refill `shieldHp` only when `shieldVampAlwaysRefills` or by the
overflow `L1454010-1454043`.

**Shield**: `absorbWithShield(shield, dmg, mitigation=0)`: with no mitigation
argument (PVP never passes one) it is `min(shield, dmg)` to the shield and the
remainder to HP `L1085790-1085856`. (PVE passes `SHIELD_MITIGATION`; see
`combat-pve.md` §13.)

---

## §8 Spells, debuffs and activation conditions in PVP

Engine detail `see combat-pve.md` §9-§10, catalogue `see sigils.md`. PVP-specific
facts:

- `processArenaSpells` `L1453857-1454667` runs `processSpellsTick` for each
  caster with `target.spellResist` (+ buff resist) and the target's
  `pvpDefense` multiplier. Spell and DoT damage then pass **PVP Defense only**
  (§5).
- **Activation conditions apply to Damage and Debuff sigils only in PVP**:
  PVE fires them on cooldown; Buff / Heal conditions apply everywhere.
  `isConditionMet` `L1089843-1090050` supports `ENEMY_HP_BELOW_{80,60,40,20}`
  and `MY_HP_BELOW_{80,60,40,20}` (HP percentages, `<=` threshold; the
  `MY_HP_*` family has a bypass flag). The call-site gate is `L1091440-1091533`.
  strtab L29216-29217 states the rule. Unlock: level 54.
- Silence stops casting (`silencedMs` is passed to the tick `L1453962`); Fear
  and Paralyze stop swings only, not spells (they only gate `processAttack`).
  **[DERIVED]** from where the flags are read.
- Debuff modifiers `computeDebuffModifiers` `L1093240-1093868` (WOUND regen cut
  summed, cap 100; SLOW attack-speed cut summed, cap 50; CRIT_DOWN flat
  crit-chance points `critDownChance` `L1093869-1093903`). Applied to the
  swinger each swing.
- Withering Touch (Warrior epic): cooldown 15000 ms, WOUND 8000 ms, regen
  reduction 60 % (max 85 %) `L1069150-1069167`; Hemorrhage BLEED `L1069168-1069185`.

---

## §9 Stack sigils in PVP

Catalogue numbers `see sigils.md` (values in `data/combat-pvp.json`
`stackSigilDefs`). Engine in PVP (`reactToAttack` `L1454929-1455277`, module
3958 `L1078983-1080177`):

| Sigil | Gains a stack when | Loses | Effect |
|---|---|---|---|
| Bulwark of Thorns (Warrior) | its owner's **`block`**-labelled avoid | 1 per unblocked hit taken | per stack +8 % max HP, +4 % DR, +7 % thorns (max 8) `L1069204` |
| Elusive Supremacy (Sentinel) | its owner's **`miss`**-labelled avoid, or an enemy swing wasted by Blind | 2 per unblocked hit | per stack +3 % Attack, Crit, Lifesteal, Attack Speed `L1069436` |
| Sunder Mark (Warrior) | each hit **it lands** | decays 1.75/s | per stack target loses 4 % DR, Block, Miss, Blind `L1069223` |
| Siegebreaker Mark (Sentinel) | each hit it lands | decays 1.75/s | per stack target loses 3 % HP Regen, 3 % Block, 4 % Miss, 4 % Blind `L1069455` |
| Druid Bear / Wolf | as Bulwark (4 % HP, 2 % DR, 5 % thorns, -2 per hit) / as Siegebreaker | | `L1070141-1070167` |

- Bulwark/Elusive trigger on **event labels** (§6): a defender with any Miss
  stat never gains Bulwark stacks from avoids. **[DERIVED]**.
- Target-debuff stacks (Sunder/Siegebreaker) are applied to the defender's
  stats **only for the duration of that swing** and restored after
  (`applyStackToTarget` `L1454739-1454814`; module-3958 side `applySunderToTarget` `L1079741-1079784`, `createStackCombat` `L1079785-1080125`); Elusive/Bulwark DR are applied to
  the swinger/defender the same temporary way. Bulwark DR is limited by the
  combat ceiling 75 `L1080486`, `applyBulwarkDr` `L1079643-1079666`.
- **Thorns** (`reactToAttack` `L1455018-1455277`): reflect =
  `round(eventDamage * thornsPercent/100)` where `eventDamage` is the
  **post-mitigation** damage of the hit that landed (or the pierced amount on a
  block, so 0 on a clean block). Iron Bastion buff thorns add the same way.
  Reflect goes through the reflected target's shield then HP, with **no DR or
  PVP rating** applied, and logs `*_thorns_reflect`.
- **Combat ceilings** (module 3959 `L1080486`): Miss 90, Blind 60, DR 75, Block
  85, Crit 95, Lifesteal 80, Attack Speed 4.5, Penetration 80, Spell Crit 95,
  Spell Vamp 80, HP Regen 70 (minion/soul-link values in the JSON). These clamp
  buffed values (stack buffs, Elusive); strtab L92168, L92929, L92948.

---

## §10 End of fight and the winner

**[CODE]** `L1457269-1457545`, dead-by-swing tails `L1457311-1457455`.

```
fight ends when a.hp <= 0 or d.hp <= 0 (checked after spells and after swings)
if both alive when t reaches the horizon (60000 + minion window):
    clamp each hp to its maxHp
    event 'time_up'
    attackerWon = a.hp > d.hp                  // RAW HP, strict >      L1457456-1457524
    (emit defender_dead if attackerWon else attacker_dead)
else:
    if a.hp > 0:                 attackerWon = (d.hp <= 0)          // = true
    elif d.hp > 0:               attackerWon = false
    else (both <= 0):            attackerWon = a.hp > d.hp          // unclamped HP   L1457525-1457543
```
Consequences:
- **Timeout is decided on absolute remaining HP, not percentage; a tie goes to
  the defender** (`attackerWon` is false when equal). There is no draw in this
  engine. Confirmed by the patch notes: strtab L82770 "when an Arena or Clan
  War fight runs out of time, the winner is the one with more HP left in RAW
  numbers, not by percentage ... that change was reverted before release";
  L92978 "Arena timeout now awards victory to the player with higher absolute
  HP (instead of HP percentage)".
- **Mutual kill is not an automatic loss**: the player (attacker) wins iff its
  unclamped HP is strictly higher than the defender's (both are negative or
  zero). **[DERIVED]** the HP-bar log clamps to 0 (`Math.max(0, hp)` in every
  event), so both bars "drop to 0" visually either way.
- The 8x multiplier "cannot shift who is ahead at the bell" (same strtab
  L82770 note); it does scale healing relatively down (§7).
- With a Necromancer minion the horizon is extended by the longest
  `summonCastMs` (`openingSummonWindowMs` `L1094791-1094825`, horizon
  `L1456046-1456047`). **[CODE]**.

Rewards, rank, token refund and the "second chance" (lose, watch a video, keep
the token with no loss recorded) are **[SERVER]**; the client sends
`fightId` `L1101984`.

---

## §11 What the server tick log exposes (event model)

**[CODE]** Event types emitted by the bundled simulator (and consumed by the
replay) are `{attacker|defender}_{hit,crit,miss,block,blind,blinded,paralyze,
paralyzed,fear,feared,silenced,staggered,regen,thorns_reflect,
minion_summoned,minion_hit,minion_crit,minion_damaged,minion_dead,minion_heal,
spell_*,debuff_*}`, plus `attacker_dead`, `defender_dead`, `time_up`. Every event
has `timestamp` (ms), `damage`, `attackerHpAfter`, `defenderHpAfter` (clamped
>= 0), optional `isCrit`, `doubleHit`, `spell`, `debuffStacks`,
`attackerShieldHpAfter`, `defenderShieldHpAfter`, minion HP snapshots
(`L1455280-1455346`, `L1452937-1453095`). A blind-wasted swing logs `damage 0`
(strtab L92975 "logs blinded hits as a \"0\"").

**[DERIVED]** The server model therefore is: a full RNG-driven two-sided
simulation at 10 ms resolution, producing the log and the final
`attackerWon`; the client never recomputes outcomes. Opponent builds are
looked up server-side from the stored profile (`opponentClass`,
`opponentSpec`, `opponentForm`, `opponentSkin`, `opponentPetSpecies` arrive with
the response `L1610170-1610230`).

---

## §12 Other duel shapes

**Practice fights** use the same replay stack (`result.ticks`) via
`/leaderboard/practice-fight`. **[CODE]** strtab L104307 says the x8 HP buff
applies to practice fights.

**Clan War PVP** (3 tokens/day, reroll, forfeit costs 1 token (strtab L1918),
30 WP per win) uses the Arena engine's tick log; client state
`clanWarPvp` in the slice (`L1163458-1164358`), `warPointsAwarded` comes back
with the result. **[CODE]** for the constants, **[SERVER]** for matchmaking.

**Fortress PVP**: "Fight a random alive defender" (strtab L15951), each kill
weakens the boss shield and gives a +5 % clan damage bonus, up to 2.0x
(strtab L23498). The adapter treats `time_up` as terminal
(`timeUpTerminal: true`, `L1639154`; `isTerminal` `L1592871-1592920`).
**[UNRESOLVED]** what "time up" means for the outcome there (attacker loses vs
compared HP): the client only reads the returned result. Structure
`see clan-fortress.md`.

**Clan War Final Battle duels** (squad vs squad) are a *different engine*:
`CLAN_BATTLE_*` config `L1533919`: `DUEL_DURATION_MS 120000`, `PVP_HP_MULTIPLIER
36`, `PVP_SHIELD_BASE_MULTIPLIER 2`, `TICK_MS 10`, `SWING_LEAD_MS 400`,
`LOW_HP_THRESHOLD_PCT 25`, `TICK_ORDER 'alternate'` (differs from the Arena
engine's fixed attacker-first order; its exact meaning was not traced). The compact log (protocol v1, module 6479) has end reasons
`WIPE 0, MUTUAL_WIPE 1, TIMEOUT_SURVIVORS 2, TIMEOUT_HP 3, TIMEOUT_DRAW 4,
WALKOVER 5` (`L2092872-2092890`) and end extras `winner, reason, survivors[2],
hpBp[2]` where HP is **basis points** (`TIMEOUT_HP` is a percentage-style
comparison there). strtab L15033/L12561/L13653: ties on duels and heroes are
broken on remaining HP, otherwise a draw with no bonus (L11976, L22921).
The percentage rule that the old doc attributed to Arena belongs to this mode.
Squad rules `see clan-fortress.md`.

---

## §13 Arena ladder (brief, all [SERVER] matchmaking)

**[CODE]** Static tables in module 3144 `L666669-668382`, in `data/combat-pvp.json`.

- 3-day sessions anchored at 2026-01-21 00:00 UTC (`SESSION_DURATION_DAYS 3`,
  `L667970-667979`); 5 tokens/day; ladder positions, `FIGHT_RANGE = 3`
  (opponents within 3 places above/below), `DOWNRANK_MIN_POOL_SIZE 5`.
- Ranks: Initiate, Vanguard, Elite, Champion, Conqueror, Overlord, Warmaster,
  Warlord, Immortal, Transcendent; 28 influence thresholds from 0 to 200000
  (`rankThresholds`).
- Per-fight influence/honors by ladder offset: beating an opponent 3 places above
  = 30 influence / 6 honors down to 5 / 1 for 3 places below
  (`fightRewardByPositionOffset`, offset logic `getVirtualOffset`
  `L667700-667760`); scaled by a per-rank multiplier up to 12x influence / 6x
  honors (`rankFightMultipliers`). End-of-session rewards per rank x position
  tier multiplier 1.6 (1st) ... 0.5 (31+) (`sessionRewardsByRank`,
  `positionTiers`).
- Whether a loss also pays influence, and anything about the rating algorithm,
  is **[SERVER]/[UNRESOLVED]** (only the reward tables are in the client).

---

## §14 Data file schema

`data/combat-pvp.json`: top-level `source`, `schema`, then sections
`{line|lines, values, note?}`: `arenaConstants`, `ranks` (10),
`rankThresholds` (28), `fightRewardByPositionOffset` (6),
`sessionRewardsByRank` (10), `rankFightMultipliers` (10), `positionTiers` (6),
`pvpRatingK`, `combatCeilings`, `engineStatusConstants`, `clanWarPvp`,
`clanBattleDuel`, `stackSigilDefs` (6). Keys camelCase except enum names that
keep the game's identifiers (e.g. `TOKENS_PER_DAY`).

---

## §15 Unresolved

- Server code is not in the client; identity of the live resolver with
  `simulateArenaPvP` is inferred from the identical output shape (§1).
- Live-server behaviour on mutual kill / equal HP at timeout (the bundled sim
  says: higher unclamped HP wins; tie -> defender). The old note of an
  observed "Defeated" on mutual kill (`docs/IMG_7384.png`) is consistent with
  the sim only when the player took the larger overkill.
- Fortress PVP: x8 HP, outcome at time up (§2, §12).
- Disruption effect per spec (Mage SILENCE / Bear STAGGER / Wolf FEAR per
  `combat-pve.md` §8.3); not re-derived here.
- Last argument of `processSpellsTick` (receives `1 - pvpDefenseFraction`
  twice from `processArenaSpells` `L1453990-1453991`); what it scales inside
  the spell engine was not traced (module 3964 is 3000+ lines). The
  *observable* effect used above (PVP Defense applied once to spell damage via
  `targetHpDelta`) is read directly.
- Spell opening delay and cooldown start (old doc: enemy-targeting sigils first
  fire at 1 s) `see combat-pve.md` §10.1; not re-measured.
- Ladder: points on a loss, bracketing (`assignBrackets` exists but strtab
  L73986 says Arena has no brackets).
