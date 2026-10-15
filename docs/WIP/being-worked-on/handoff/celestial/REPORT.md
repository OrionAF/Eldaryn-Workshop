# Celestial Trial log analysis: Level 85, HARD and NORMAL, same party

## 1. Summary

Both logs are explained almost fully. Every checked event matches a rule with no exceptions:

- **Timing:** HARD 274/274 boss, 425/425 OrionAF and 257/257 Oria swings. NORMAL 112/112, 220/220 and 133/133.
- **Damage taken:** HARD 528 hits exact, NORMAL 159 hits exact.
- **Damage dealt:** HARD 636/636 hits exact, NORMAL 420/420.
- **HP bookkeeping:** HARD 3157/3157 ticks exact, NORMAL 1123/1123.
- **Block Fury:** HARD 3143/3143 ticks exact.

Only a few items are approximate or untested. Celestial Overload never triggered.

Most important rules:

1. **Burden is the core mechanic.** n is the number of adds alive. It scales max HP, regen, healing, damage taken, DR, block and attack. The HARD and NORMAL configs differ, as the table shows.
2. **Everything targets the tank (Oria).** The boss, the adds and Judgment Strike never hit OrionAF.
3. **Tank damage formula.** `round(A * m * (1 - D/100) * (1 + dmgTakenPerAdd*n))`, with one rounding at the end. Sheet DR plus buff DR is capped at 75 first, then drained by `(1 - drPerAdd*n)`.
4. **The fight clock starts at 500 ms and runs on 10 ms ticks.** The swing interval is `round(1000/AS)`. Judgment Strike has its own 30 s timer, which freezes while the boss is paralyzed.
5. **Players target the oldest living add when more than 4 adds are alive, otherwise the boss.** Spells and DoTs always hit the boss. Double hit never procs on adds.
6. **HARD Block Fury.** It is a float stack count: +1 per tank block, capped at 60, decaying 1.5/s in 10 ms steps. Both players' attack is multiplied by `1 + 0.12*f`.
7. **Bulwark of Thorns and thorns are inert in Celestial.** No Bulwark stacks, no Iron Bastion glyph thorns.

## 2. Rules table

| Mechanic | Rule | Status | Evidence | Source | In app engine? |
|---|---|---|---|---|---|
| Tank damage taken | `round(A*m*(1-D/100)*(1+dmgTakenPerAdd*n))`. A = boss attack, or add attack `round(0.2*boss)`. m = Judgment multiplier (5.5 HARD, 3 NORMAL). D = `min(sheet DR + buff DR, 75)*(1-drPerAdd*n)`. Sheet DR is the soft-capped 35.3. HARD: dmgTakenPerAdd 0.1, drPerAdd 0. NORMAL: 0.2 and 0.13 | exact | HARD boss 163/163, add 361/361, Judgment 4/4. NORMAL 73/73, 84/84, 2/2. Draining before the cap gives 132943 instead of 184791 | Burden config L1159894 (NORMAL), L1159927 (HARD); `combat-pve.md` buff DR cap | No. The DR cap exists; the Burden terms and Judgment do not |
| Targeting (enemy side) | Boss, adds and Judgment all hit `tankIndex` (Oria) | exact | All 807 HARD and 219 NORMAL enemy-hit ticks have playerIndex 1 | Logs; `pve-content.md` §6 | No |
| Boss swing timing | Interval `round(1000/aspd)`: 526 ms HARD, 667 ms NORMAL. Swing k lands at `ceil((500+k*I)/10)*10`. Blind and paralyze keep the cadence | exact | HARD 274/274, NORMAL 112/112 | Logs; `pve/tick.js` | Yes, except the 500 ms start offset |
| Player swing timing | Interval `round(1000/AS)` (340 ms OrionAF, 562 ms Oria). Remainder kept. Retargeting does not reset the timer | exact | HARD 425/425 and 257/257, NORMAL 220/220 and 133/133 | `combat-pve.md` §3 | Yes |
| Add spawns | Spawn at `500 + k*interval` (10 s HARD, 20 s NORMAL). Add HP is `round(bossMaxHp*fraction)` (0.05 HARD, 0.025 NORMAL). Not paused by paralyze | exact | HARD 14 spawns, NORMAL 3. HP 419417093 and 61547597 | Halo Breach config L1159880, L1159911-1159925 | No |
| Add swing timing | Every 1000 ms. The first swing comes 40-820 ms after spawn, apparently random | approx | The gap is 1000 for every add. First offsets: 600, 780, 740, 250, 710, 290, 820, 330, 650, 40, 530, 820, 270, 670 (HARD); 120, 90, 690 (NORMAL) | Logs | No |
| Judgment Strike timing | Fires at `500 + 30000*k + 990*(paralyses before it)`. The timer freezes while the boss is paralyzed. Always on the tank, never crits | exact | 6/6: 31490, 62480, 92480, 123470 (HARD); 32480, 63470 (NORMAL) | Judgment config L1159900 | No |
| Boss Blind and Paralyze (from OrionAF) | Blind 4.5% sets a flag and wastes the next boss swing. Paralyze 1.5% wastes every boss swing for 1000 ms (the tooltip says 2 s). Paralyze is checked before blind. Procs only on boss swings, never on adds | exact | Every `boss_blinded` is followed by one `boss_blind` (17/17 HARD, 12/12 NORMAL). 0 of 152 add swings procced | `combat-pve.md` §5 | Yes, except add immunity |
| Tank block | Full avoid. Chance `min(26.7 + 14.8 while Iron Bastion is up, 85)*(1-blockChancePerAdd*n)`. The drain is 0.13 on NORMAL and 0 on HARD | approx | HARD without Iron Bastion 27.5% (expected 26.7%). With Iron Bastion 49.7% vs 41.5% expected. NORMAL drain is multiplicative | Burden config; `sigils.md` §8 | Roll yes; Burden drain no |
| Block Fury (HARD) | Float f. +1 per tank block (`player_block` and `add_block`), capped at 60. Minus 0.015 every 10 ms tick, floored at 0. Log shows `round(f)`. Blind and paralyze add nothing | exact | 3143/3143 ticks. Adding `add_block` fixes 617 hit mismatches. Adding 0.7 for blinds breaks about 2400 ticks | HARD Burden config L1159927; UI text L909779 | No |
| Player hit damage | `A = round(atk'*M)`. atk' is `floor(totalAttack*1.197)` while Warborn Fury is up. M is `1+0.25*n` on NORMAL, `1+0.12*f` on HARD. Crit is `round(A*critDmg)`. The second hit of a double never crits. Penetration has no effect | exact | HARD 636/636, NORMAL 420/420. Floor instead of round on A gives 338 and 62 mismatches | Burden configs; `sigilScale.js` | Warborn buff yes; Burden attack no |
| Target selection (player side) | Both players hit the oldest living add while more than 4 are alive, else the boss. Spells and DoTs always hit the boss. Switching is instant | exact | HARD: 10 switches at the 5th add, all returns at 4 alive. NORMAL never reached 5 | Logs; tactics `holdCount` L1159520 | No |
| Double hit | Procs only on boss swings, never on adds. Same pre-crit damage, never a crit | exact | Boss 93/273 (34%). Adds 0/152 | `combat-pve.md` §4 | No-crit yes; no-double-on-adds is new |
| Crit chance | Sheet `totalCritChance` per swing | approx | OrionAF 54.4%/54.1% (expected 54.4%). Oria 19.1%/17.3% (expected 15.7%, about 1.5 sigma high) | Logs | Yes |
| Warborn Fury L9 | +19.7% Attack, multiplicative and floored. 5 s up, 15 s cooldown, first cast at 510 ms. Applies to hits on adds too | exact | 396803 = floor(331498*1.197) | `sigils.md` | Yes |
| Burden max HP | `maxHp_n = round(sheetHp*(1-hpPerAdd*n))`. hpPerAdd 0.04 HARD, 0.1 NORMAL. On `burden_update` HP is clamped to `min(HP, maxHp_n)`, ignoring Iron Bastion. When n falls, HP stays | exact | OrionAF caps 2752013, 2637346, 2522678 and so on. Oria 3319724 to 2273480 at 30500 HARD | Burden configs | No |
| Regen pulse | Every 100 ms while HP < cap. Amount `round(sheetHp*hpRegen%/100/10*(1-hpRegenPerAdd*n))`, always from the unbuffed sheet max. hpRegenPerAdd 0.05 HARD, 0.07 NORMAL. Healing reduction does not apply | exact | Oria 59162, 56204, 53246 at n=0,1,2. Also 59162 during Iron Bastion | `combat-pve.md` §7 | Diverges: app uses buffed `maxHp`, has no Burden |
| Lifesteal | `floor(dmg*ls/100*max(0,1-healRedPerAdd*n))`, capped at the cap. healRedPerAdd 0.2 HARD, 0.25 NORMAL. Applied after the hit's snapshot, so it shows on the next tick | exact | HARD 601/601, NORMAL 337/337. Floor-then-multiply gives 74 mismatches | `combat-pve.md` §5.3 | Floor yes; healing reduction no |
| Iron Bastion in Celestial | Cap = `floor(maxHp_n*1.444)`. On cast: HP += `floor(HP*0.444)*max(0,1-healRed*n)`, not floored. At end: `HP = min(HP, maxHp_n)`. 6 s duration, 26.5 s cooldown with glyph | exact | Casts +1147074, +633184.8, +165664.2, 0 at n≥5. All 9 end clamps match | `sigilScale.js`; `buffs.js` | Cap yes; heal flooring and Burden base no |
| Spell hits (Venom Wound, Ember Curse) | `floor(floor(curAtk*pct/100)*(1-R/100))`. R = 45 HARD, 0 NORMAL. curAtk includes Burden and Fury. No spell crit | exact | HARD 30/30, NORMAL 16/16 | `combat-pve.md` §10 | Formula yes; Celestial attack modifiers no |
| DoT stacks and ticks | Snapshot per stack at cast. Ember Curse: max 8, FIFO at max, never expires. Venom Wound: 10 s, 9 ticks. First tick at T+interval-10 | exact | NORMAL 89/89 ticks, HARD 170/170 | `combat-pve.md` §9.2 | Yes |
| Spell cast timing | Buffs cast at 510. Damage and debuff spells cast at 1500 (1000 ms opening delay). Then every cooldown | exact | HARD 46 casts and NORMAL 24 casts all fit | `combat-pve.md` §10.1 | Yes |
| Bulwark of Thorns and thorns | Inert. `bulwarkStacks` stays 0, no DR, HP or thorns. Iron Bastion glyph thorns (2%) deal nothing | exact | 0 on every tick despite 256 HARD and 43 NORMAL blocks. Boss HP never changes on enemy-hit ticks | `sigils.md` §6 | Diverges: app grants stacks and thorns |
| Chrono Flux | +427 per landed hit event, capped at 7000. No effect without an Ancient sigil | exact | 3149/3153 ticks (the 4 misses are double-hit first events) | `sigils.md` §9 | Yes |
| Fight end | Ends on the killing-blow tick. `totalDuration` is absolute (145000 HARD, 75300 NORMAL). Killing damage is not clamped | exact | Both logs | Difficulty table L1160337 | Kill yes; time limit no |
| Dust and glyph drops | Dust uniform in `[max(1,floor(avg)), max(1,ceil(avg))]`, split randomly across the party. Legendary dust is HARD and MYTHIC only | approx | NORMAL 24 in [24,24]; HARD 28 in [27,28]; legendary 7 in [7,8] | L1160477, L1157498 | No |

## 3. Unexplained or approximate items

- **Celestial Overload (unexplained).** HARD triggers at 7 or more adds alive, NORMAL at 5 or more, with boss attack x(1+5). It never fired: max adds alive was 6 on HARD and 3 on NORMAL. Hypothesis: the boss, add and Judgment damage all get x6. Unknown whether it applies to all three.
- **Add first-swing offset (approx).** It is 40-820 ms. Hypothesis: the add's swing timer starts at `random()*1000`, uniform over 0-1000 ms.
- **Iron Bastion block bonus (approx).** HARD windows show 49.5-49.7% against 41.5% expected, about 2.2 sigma high. Hypothesis: noise. The alternative is a +25 bonus (the sigil's max value) instead of +14.8.
- **`controlFuryFraction` 0.7 (untested).** The lanes disagree on the trigger. One says the tank's own Miss or Blind. The other says a CONTROL-role player. I could not resolve this. Both agree that OrionAF's blinds on the boss do not trigger it.
- **Block Fury and attackPerAdd stacking (unknown).** Each difficulty has only one of the two non-zero, so we cannot tell if they add or multiply.
- **Hold threshold (approx).** The fit is "attack adds when alive > 4". The client's recommended tactics are holdCount 1 (NORMAL) and 3 (HARD), so this party used a custom setting. Hypothesis: the rule is `alive > holdCount`, with holdCount 4 here. NORMAL never reached 5, so it is untested there.
- **Who gets credit for an add kill (unknown).** All 10 add kills were OrionAF's last hit.
- **Judgment Strike blocked or blinded (unknown).** 0 of 6 were. If it were blockable at 26.7%, that has p=0.16. Hypothesis: it is unblockable.
- **Add immunity to Blind and Paralyze (approx).** 0 of 152 add swings procced, against about 9 expected. Hypothesis: adds are immune. The server may also just not log it.
- **Tank death and retargeting (unknown).** No tank died.
- **Burden clamp under Iron Bastion.** The clamp ignores the Iron Bastion HP bonus. It is exact in these logs, but we cannot tell whether it is intended.
- **Spell attack on HARD (minor, likely resolved).** The spells lane saw spell attack differ from the neighbouring auto-attack by a few percent, and top out at 8.1676x rather than 8.2x. The player lane reproduces all 30 HARD spell hits exactly with the float stack count and its decay. The difference is most likely fractional f changing between the cast tick and the auto-attack tick. I took the player lane's result because it has tick-level evidence.
- **Warborn rounding (minor).** The lanes differ on the second rounding step. I used floor on the Warborn step, then round with Burden or Fury. This is what the 636/636 and 420/420 matches used.
- **Spell resist path (unknown).** The boss has 0 DR here, so `bossSpellResist` alone cannot be told apart from resist plus DR.
- **Elusive Supremacy, spell crit/vamp, and Oria's `spellDamage` 20.2.** Untested here. OrionAF is never attacked, and the party has no spell-crit or vamp source.
- **Time limit counting (unknown).** It is unclear whether `timeLimitMs` counts from 0 or from 500, because no fight timed out.
- **Doc divergence.** `combat-pve.md` §7 says the regen pulse reads the buffed max HP. In Celestial it uses the sheet max, even under Iron Bastion.

## 4. Logs to capture next (priority order)

1. **A HARD log that reaches 7 or more adds alive** (high holdCount, or low DPS). This settles Overload: the multiplier, the targets it applies to, and whether spawns stop at maxAlive 12.
2. **A NORMAL log that reaches 5 or more adds alive** (longer than 100.5 s). This settles Overload on NORMAL, the add-focus threshold, and the NORMAL block drain.
3. **A log where the tank is a different class or has Miss/Blind.** For example an Oria-like tank with Miss. This settles the `controlFuryFraction` trigger and thorns in Celestial, and Elusive Supremacy.
4. **A log with OrionAF as tank, or a log where the tank dies.** This settles retargeting, Burden on a dead player, and tank selection.
5. **A log with a CONTROL-role player.** This settles the 0.7 Block Fury credit.
6. **Another level (for example 60 or 100) or Mythic.** This checks the dust ranges, scaling, and whether attackPerAdd and Block Fury stack.
7. **Logs with a known tactics setting.** For example holdCount 1 and 3, plus the lobby payload. This confirms `alive > holdCount`.
8. **A log where Oria lands the kill on an add.** This settles `add_death.playerIndex`.
9. **More HARD logs with Iron Bastion.** About 500 attacks inside its windows would settle the block bonus. Each log also adds add first-swing offsets and Judgment block/blind samples.
10. **A timed-out run.** This settles the time-limit origin and the timeout result shape.
11. **A log where the DPS player takes hits.** This tests OrionAF's lifesteal and Elusive Supremacy.
12. **A log with a Mystic (spell crit or vamp) or an Ancient transform sigil.** This tests spell crit, vamp and the transform.

## 5. What a Celestial port needs beyond the existing PVE engine

**New mechanics**
- A party loop with 2 players, each with their own swing, regen and spell timers.
- An enemy list of boss plus adds, with spawn timers, add HP, add swings and a random first-swing phase.
- The Burden system: n-scaled max HP, regen, healing, damage taken, DR, block and attack. Per difficulty config: HARD (hpPerAdd 0.04, regen 0.05, heal 0.2, damage taken 0.1, no DR/block drain) and NORMAL (0.1, 0.07, 0.25, 0.2, DR 0.13, block 0.13, attack 0.25).
- HARD Block Fury: a float party stack, +1 per block, 10 ms decay, 60 cap.
- Judgment Strike: a 30 s timer that freezes during paralysis.
- Celestial Overload: a placeholder until a log shows it.
- The 500 ms start offset and the 10 ms tick.
- The boss spell resist (45 on HARD).
- An add-focus tactic (`holdCount`) for player targeting.
- A result object: dust, glyph drops and key use.
- A time limit (360 s HARD, 240 s NORMAL).

**Engine changes**
- Regen pulses must use the sheet max HP, not the buffed `maxHp`.
- Lifesteal and the Iron Bastion cast heal must take the healing-reduction multiplier. The cast heal must not be floored when reduced.
- The Iron Bastion cap must use the Burden-reduced base.
- The burden-update clamp must ignore the Iron Bastion bonus.
- Cap-then-drain order for DR and block.
- Double hit must not proc on adds.
- Add immunity to Blind and Paralyze.
- Turn off Bulwark stacks and Iron Bastion glyph thorns in Celestial.
- A single final rounding on tank damage.

**Targeting**
- Enemies always target the tank. This needs a tank index.
- Players target the oldest living add while more than `holdCount` adds are alive, else the boss. Spells and DoTs always hit the boss.

**Import**
- The fight loadout must come from `sigilState.equippedSpecies` plus the active mount's glyphs (`activeMountId`), not from the profile presets. The current import picks the wrong sigils, glyphs and attack for OrionAF (2098598 and 1279806 instead of the fight's loadout).

**Validation**
- Use these two logs as golden tests. The checks are already tick-exact: the HP reconstruction, the swing grids and the Block Fury trace.