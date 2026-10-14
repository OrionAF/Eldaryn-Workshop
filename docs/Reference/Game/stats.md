# Stat System Core

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

What a character's stats are, how the client sums them, how the soft-cap curve
squeezes them, the separate in-combat ceilings, the PVP rating conversion and
the client-side "Combat Power" formula. Everything below is read from the
Hermes decompile; line numbers are `decompiled.js L<n>`. Patch-note and UI text
cited as `strtab.txt L<n>` comes from `strtab.txt` in the same extract.

**Tags:** **[CODE]** read directly from code. **[DERIVED]** computed from
[CODE] values (working shown). **[SERVER]** decided server-side; the client
only shows the result. **[UNRESOLVED]** could not be determined.

Machine-readable catalogue: `data/stats.json` (schema in §12).

**What this contributes to power.** Stats are the output of the whole build.
The client sums ~10 sources additively into *raw* totals, then bends each
capped stat through one diminishing-returns curve (§4). Attack and HP are the
only two stats that use a flat × percent product. A *separate* number,
Combat Power (§8), is **not** computed from stats at all: it is a weighted sum
of progression items (gear, sigils, stones, pets, ...).

Systems that own the inputs: `see gear.md`, `see talents.md`, `see pets.md`,
`see mounts-glyphs.md`, `see sigils.md`, `see stones.md`, `see awakening.md`,
`see transcendence.md`, `see relics.md`, `see clan-fortress.md`,
`see classes.md` (forms, base growth). How a stat is *used* in a fight:
`see combat-pve.md`, `see combat-pvp.md`.

---

## §1 Stat inventory

### §1.1 Primary stats

- **Attack** and **HP** are the primary stats. They come from equipment base
  values; secondary stats "roll on Rare+ items and also come from Talents,
  Pets, Enchant Stones, and Awakening" — **[CODE]** UI text, `strtab.txt L25055`.
- Base character (client): `attack 10, hp 100, attackSpeed 1, critChance 0,
  critDamage 1.5` — **[CODE]** `L664443-664456` (initial player),
  `L1138564-1138568` (re-applied on every state load), constants
  `BASE_ATTACK_SPEED 1, BASE_CRIT_CHANCE 0, BASE_CRIT_DAMAGE 1.5` in
  `GAME_CONSTANTS` `L670527`. The same `{attack:10, hp:100}` is also the
  default `computedStats` placeholder (`totalAttack 10, totalHp 100`) —
  **[CODE]** `L1137824`.
- The client never scales base stats with level (no level term in
  `calculateTotalStats`). The server does not override `player.baseStats`:
  **confirmed on one real sample** (Warrior L72, `profile-warrior-l72.json`),
  where the client formula with these default constants reproduces all 35 server
  `computedStats` keys exactly (golden test `real.test.js`). Other classes are
  unchecked (the loader at `L1138564` hard-codes the constants). `MAX_PLAYER_LEVEL 100` — **[CODE]** `L670527`.

### §1.2 Secondary stats (`SecondaryStatType`, 29 members)

**[CODE]** `L665656-665713` (module 3130). In enum order:

`ATTACK_SPEED, DOUBLE_HIT, CRIT_CHANCE, CRIT_DAMAGE, HP_REGEN, LIFESTEAL,
HEALTH_PERCENT, ATTACK_PERCENT, DAMAGE_REDUCTION, BLOCK_CHANCE, MISS_CHANCE,
BLIND_CHANCE, PARALYZE_CHANCE, PENETRATION, PVP_ATTACK, PVP_DEFENSE,
SPELL_DAMAGE, SPELL_RESIST, SPELL_CRIT_CHANCE, SPELL_VAMP, DISRUPTION_CHANCE,
FEAR_CHANCE, MINION_ATTACK, MINION_HEALTH, MINION_CRIT_CHANCE,
MINION_LIFESTEAL, SOUL_LINK, MINION_ATTACK_SPEED, OBLIVION_POWER`

Gear can only roll 26 of these (not PVP_ATTACK, PVP_DEFENSE, OBLIVION_POWER) —
**[CODE]** the roll table has 26 entries, `L678209-678417`; ranges belong to
`see gear.md`. PVP ratings reach a character via stones and fortress buffs
(§3.2), OBLIVION_POWER via gear/stones.

Non-secondary totals the sheet also shows:

- **Dominion** (Necromancer only) and the three **Conduit** totals
  (Flame / Earthen / Dark) — §3.5.
- Sheet labels (English): Attack, Health, Attack Speed, Crit Chance, Crit Spell
  %, Crit Damage, Double Hit, Spell Damage, Lifesteal, Spell Vamp, Spell
  Resist, HP Regen, Dmg Reduction, Block Chance, Miss Chance, Blind Chance,
  Paralyze Chance, Disruption, Fear Chance, Minion Attack, Minion Health,
  Minion Crit, Minion Lifesteal, Soul Link, Minion Atk Speed, Dominion,
  Penetration, PVP Attack, PVP Defense, Flame/Earthen/Dark Conduit —
  **[CODE]** `L911269`. Short bonus-list labels differ (`Block`, `Armor Pen`,
  `Crit Spell`, `Max HP`, ...) — **[CODE]** `STAT_LABELS` `L2203903-2203956`.

### §1.3 Units (read this before parsing anything)

Internal values use two conventions **[CODE]**:

| Convention | Stats | Example |
|---|---|---|
| **multiplier** (1.0 = 100%) | Attack Speed, Crit Damage, Minion Attack Speed | base Crit Damage `1.5` = 150% |
| **percent points** (12.5 = 12.5%) | everything else | Crit Chance `50` = 50% |

- `SOFT_CAPS` and `COMBAT_CEILINGS` are in the same unit as the stat they
  cap: Attack Speed caps are `2 / 4` (200% / 400%), ceiling `4.5`; Crit Damage
  `3 / 7`. `L1080443-1080515`.
- The sheet multiplies Attack Speed, Crit Damage and Minion Attack Speed by
  `displayMult 100` for display. `L1210470-1210473,1210492,1210624`.
- Sources named `…Flat` (talents, transcendence, awakening) hold percent
  points for **every** stat except Attack Speed, which is a multiplier delta;
  `critDamageFlat` is **divided by 100** before it is added to Crit Damage.
  `L1216241,1216323,1216519`. Display of these bonuses (`formatStatValue`):
  `attackSpeedFlat` and `minionAttackSpeedFlat` are multiplied by 100,
  rounded to 1 dp (integers shown plain), `%` suffix on everything except
  `dominionFlat`. `L2203837-2203887`.
- Gear Attack Speed rolls are therefore fractions (the roll table has
  `minValue 0.03, maxValue 0.2`, 2 dp) and Crit Damage rolls `0.05-0.3`
  (2 dp) — **[CODE]** `L678209,678234`. "Attack speed is now displayed as a
  percentage everywhere" — `strtab.txt L71868`.
- Flat stat (Attack, HP) display uses `toLocaleString()` — **[CODE]**
  `L1211367-1211370,1211419-1211422`. So the "." thousands separator in the
  game's screenshots is the **device locale**, not a game rule
  **[DERIVED]** from that call; a differently-localised phone shows `,`.
  Percent bonuses use `toFixed(1)` + `%` (`+X.X%`). `L1211375-1211387`.

---

## §2 Where the live numbers come from

- The stat sheet reads `computedStats` from the game store
  (`useComputedStats`, `L1173002-1173014`).
- `computedStats` is **assigned from `result.stats` in server responses**
  (equip, switch set, relic equip/upgrade/sell and many further action
  results; about 45 assignment sites, e.g. `L1065625-1066392`,
  `L1071139-1071612`, `L1163320-1165745`): `applyEquipResult`
  `L670766-670862`, `applySwitchSetResult` `L670736-670764`, relic actions
  `L1165477-1165757`, `setComputedStats` `L1141366-1141382`. So the
  authoritative total is **[SERVER]**. (Only the equip/switch/relic sites
  were read in detail; the others are assumed to follow the same pattern.)
- The client function `calculateTotalStats` (§3) is called from exactly one
  place: the stat sheet's "(Set N preview)" for the *other* equipment set
  (`L1209833-1209948`, label `L911268`). It gives the best available
  description of the formula, but it **omits relic bonuses** (no relic
  argument exists) and any other server-only source. Relics are added as plain
  points of their stat (HP_PERCENT into `healthPercent`, etc.): **confirmed on
  one real sample** (Warrior L72, `profile-warrior-l72.json`; all 35 server keys
  match exactly, `real.test.js`), not read from client code.
- Before the first server response the store holds
  `totalAttack 10, totalHp 100` and `null` for attack speed / crit chance /
  crit damage. `L1137824`.

---

## §3 `calculateTotalStats` (the client pipeline)

**[CODE]** function `L1215735-1217872`, module 4297. Call site and argument
construction `L1209833-1209948`.

### §3.1 Arguments

```
calculateTotalStats(base, equipment, talents, pet, sigils, stones,
                    awakening, <unused>, fortress, transcendence, mounts,
                    {playerClass, formConfig, activeSpec})
```

| # | Source | Producer (system) | Fields it can add |
|---|---|---|---|
| a0 | base | `player.baseStats` | attack, hp, attackSpeed, critChance, critDamage |
| a1 | equipment | one item per `EquipmentSlotType` (12 slots, see gear.md) | `primaryStats.attack/hp`, `secondaryStats[]` `{type,value}`, `conduit {type,value}` |
| a2 | talents | `calculateTalentBonuses` (talents.md) | `…Percent` / `…Flat` set incl. minion%, `dominionFlat` |
| a3 | pet | `calculatePetBonuses` (pets.md) | flatAttack, flatHp, attackSpeed, doubleHit, critChance, critDamage, hpRegen, lifesteal, healthPercent, attackPercent, DR, block, miss, blind, paralyze, penetration, spell*, disruption, fear, minion*, soulLink |
| a4 | sigils | `calculateSigilBonuses` (sigils.md) | flatAttack, flatHp, attackPercent, hpPercent, attackSpeed, missChance, hpRegen, spellDamage |
| a5 | stones | `calculateEnchantStoneBonuses` (stones.md) | same fields as pet **plus** pvpAttack, pvpDefense, oblivionPower |
| a6 | awakening | `calculateAwakeningBonuses` (awakening.md) | `…Flat` set, no minion/dominion; spellResist/spellDamage/spellCrit/spellVamp nullable → 0 |
| a7 | *(unused)* | `undefined` at the only call site | full set incl. pvpAttack/pvpDefense |
| a8 | fortress | `calculateFortressBonuses` (clan-fortress.md) | attackPercent, hpPercent, attackSpeed, DR, crit, critDamage, hpRegen, lifesteal, block, miss, blind, penetration, pvpAttack, pvpDefense |
| a9 | transcendence | `calculateTranscendenceBonuses` (transcendence.md) | same `…Flat` set as talents, incl. `dominionFlat` |
| a10 | mounts | `calculateMountBonuses` (mounts-glyphs.md) | percent / chance / minion fields, **no** flat Attack/HP and **no** PVP |
| a11 | context | store | `playerClass`, `formConfig` (equipped sigil form), `activeSpec` |

Field-level accumulation: `L1216223-1216304` (a2), `L1216305-1216387` (a9),
`L1216389-1216474` (a3), `L1216476-1216501` (a4), `L1216503-1216574` (a6),
`L1216578-1216670` (a5), `L1216672-1216754` (a7), `L1216756-1216799` (a8),
`L1216801-1216883` (a10). a7's contents and purpose — **[UNRESOLVED]**
(never populated by the only caller).

### §3.2 Order of operations

**[CODE]** Everything is summed **additively**; there is no per-source
multiplier except the three form multipliers in step 4.

```
1. acc = base                      attack, hp, attackSpeed, critChance, critDamage
2. for each equipment slot:        L1215825-1215905
     attack += item.primaryStats.attack
     hp     += item.primaryStats.hp ;  gearHp += item.primaryStats.hp
     conduit: flame/earthen/dark += conduit.value   (by conduit.type)
     for each secondaryStats {type,value}: acc[type] += value   (switch, L1215912-1216210)
3. add the other sources a2..a10 field-by-field (additive)         L1216223-1216883
     critDamage += critDamageFlat/100  (talents, transcendence, awakening)
     pet/stone/mount/sigil values are added as stored
     the HP% bucket is fed by `hpPercent` (talents, sigils, awakening, fortress,
       transcendence), by `healthPercent` (pets, stones) and by BOTH fields for
       mounts (a10)                                                  L1216604,L1216804-1216811
4. class / form rules (see §3.3), in this order:
     Mystic: DR = block = 0 unless formConfig.unlocksBlockAndDr         L1216903-1216916
     Mystic and activeSpec != MYSTIC_MAGE: spellCrit = 0                L1216917-1216935
     if formConfig: attackSpeed *= formConfig.attackSpeedMult           L1216937-1216941
     disruption += fear                                                 L1216975-1216976
     disruptionEffect string is also decided here: default SILENCE; Mystic
       BEAR form STAGGER, WOLF form FEAR; Necromancer FEAR   L1216943-1216988, L1217116-1217133
     formConfig.passiveEffects: add {stat,value} for ATTACK_SPEED, CRIT_CHANCE,
       HP_REGEN, LIFESTEAL, MISS_CHANCE, BLIND_CHANCE, PENETRATION,
       DAMAGE_REDUCTION, BLOCK_CHANCE (DR/block only if class != Mystic OR
       unlocksBlockAndDr)                                               L1216990-1217110
     Necromancer: critChance = lifesteal = penetration = 0 ;
                  dominion = (talents.dominionFlat + transcendence.dominionFlat) + 1   L1217116-1217133
5. Attack / HP                                                          L1217135-1217177
     attackMult  = formConfig?.attackMult  ?? 1
     gearHpMult  = formConfig?.gearHpMult  ?? 1
     totalAttack = floor( attackFlat * (1 + attackPercent/100) * attackMult )
     totalHp     = floor( (hpFlat + gearHp*(gearHpMult - 1)) * (1 + hpPercent/100) )
6. softcap each capped stat (§4), then round for output                 L1217178-1217394
7. emit rawX = parseFloat(raw.toFixed(n)) only when raw > soft cap; n = 2 for
   Attack Speed and Crit Damage, 1 for the rest (raw 50.25 -> 50.3)    L1217495-1217870
```

Important consequences **[DERIVED]** from the above:

- Sources are not applied in tiers: a +10 from a pet and a +10 from a gear
  roll are interchangeable until the single curve in step 6.
- `formConfig.attackSpeedMult` multiplies the **raw** attack speed *before*
  the curve and *before* the passive-effect additions of step 4.
- Necromancer/Mystic zeroing happens *after* summation, so the stat is lost
  entirely rather than being "capped".

### §3.3 Class and form rules

- **Class-unique and excluded secondary stats** (what gear can roll and what
  the sheet shows) — **[CODE]** `L1213512-1213562` (predicate),
  `L1213731-1213862` (tables):

| Class | Unique stats | Excluded |
|---|---|---|
| WARRIOR | DAMAGE_REDUCTION, BLOCK_CHANCE, DOUBLE_HIT | — |
| SENTINEL | MISS_CHANCE, BLIND_CHANCE, PARALYZE_CHANCE, DOUBLE_HIT | — |
| MYSTIC | DAMAGE_REDUCTION, BLOCK_CHANCE, SPELL_CRIT_CHANCE, SPELL_VAMP, DISRUPTION_CHANCE | — |
| NECROMANCER | SPELL_CRIT_CHANCE, SPELL_VAMP, FEAR_CHANCE, MINION_ATTACK, MINION_HEALTH, MINION_CRIT_CHANCE, MINION_LIFESTEAL, SOUL_LINK, MINION_ATTACK_SPEED | CRIT_CHANCE, LIFESTEAL, PENETRATION |

  Predicate: `available(stat, class) = !excluded[class].has(stat) && (stat is
  not unique to any class || unique[class].has(stat))`; default class is
  WARRIOR. A stat not in any unique list (Attack%, HP%, Attack Speed, Crit
  Chance, Crit Damage, HP Regen, Lifesteal, Penetration, Spell Damage, Spell
  Resist, OBLIVION_POWER) is available to every class not excluding it.
  "Control" stats = MISS, BLIND, PARALYZE, DISRUPTION, FEAR (`L1213840-1213855`).
- **Disruption / Fear.** There is one `totalDisruptionChance =
  softcap(disruption + fear)`. The effect carried with it:
  Mystic → `SILENCE` (mage), `STAGGER` (Bear form), `FEAR` (Wolf form);
  Necromancer → `FEAR`. Included in the output only when not `SILENCE`
  (`disruptionEffect`). `L1216943-1216988,1217395-1217404`. Text: Mage ·
  Silence "cannot cast Sigil spells for 3s"; Bear · Stagger "stack, at 3
  stacks stunned for 2s"; Wolf · Fear "cowers for 1s" — `L911271-911273`.
- **Mystic block/DR** exist only in forms that set `unlocksBlockAndDr`;
  **Mystic spell crit** only while specialised MYSTIC_MAGE. Forms themselves —
  `see sigils.md`.

### §3.4 Output keys and rounding

**[CODE]** `L1217178-1217490`. `computedStats` keys:
`totalAttack, totalHp, totalAttackSpeed, totalDoubleHit, totalCritChance,
totalCritDamage, totalHpRegen, totalLifesteal, totalHealthPercent,
totalAttackPercent, totalDamageReduction, totalBlockChance, totalMissChance,
totalBlindChance, totalParalyzeChance, totalPenetration, totalPvpAttack,
totalPvpDefense, totalSpellDamage, totalSpellResist, totalSpellCritChance,
totalSpellVamp, totalDisruptionChance, (disruptionEffect), totalMinionAttack,
totalMinionHealth, totalMinionCritChance, totalMinionLifesteal,
totalSoulLink, totalMinionAttackSpeed, totalDominion, totalOblivionPower,
totalFlameConduit, totalEarthenConduit, totalDarkConduit`, plus
`rawAttackSpeed, rawDoubleHit, rawCritChance, rawCritDamage, rawHpRegen,
rawLifesteal, rawDamageReduction, rawBlockChance, rawMissChance,
rawBlindChance, rawParalyzeChance, rawPenetration, rawSpellResist,
rawSpellCritChance, rawSpellVamp, rawDisruptionChance, rawMinionCritChance,
rawMinionLifesteal, rawSoulLink` (each only when raw > soft cap; none is
emitted for Minion Attack Speed).

- Attack Speed and Crit Damage totals: `parseFloat(x.toFixed(2))` of the
  *multiplier* (i.e. 1 percentage point of precision).
- Other capped % totals and uncapped % totals (HP%, Attack%, Spell Damage,
  Minion Attack/Health): `toFixed(1)`. Minion Attack Speed: `toFixed(2)`.
- `totalPvpAttack/Defense`, `totalDominion`, `totalOblivionPower`, conduits:
  `Math.round`. `totalAttack/totalHp`: `Math.floor`.
- Uncapped (no curve, no ceiling): Attack, HP, Attack%, HP%, Spell Damage,
  Minion Attack, Minion Health, PVP Attack/Defense, OBLIVION_POWER.

### §3.5 Dominion and conduits

- Dominion — Necromancer only: `talents.dominionFlat +
  transcendence.dominionFlat + NECROMANCER_BASE_DOMINION (1)`; all other
  classes 0. `L1216304,1216387,1217116-1217133,1217465-1217469`;
  `NECROMANCER_BASE_DOMINION = 1` `L1080519-1080520`. UI text: "starting at 1 …
  It never comes from gear" — `strtab.txt L25059`.
- Conduit totals: sum of equipped items' `conduit.value` by `conduit.type`
  (`FLAME`, `EARTHEN`, `DARK`), rounded. `L1215856-1215901`. What they do
  (Chrono Flux charging, `MAX 7000`) — `see sigils.md`
  (`L1094180`).

---

## §4 Soft caps (diminishing returns)

### §4.1 The curve

**[CODE]** `applySoftCap(x, {soft, hard})` `L1080181-1080222`;
`SOFT_CAP_CURVE_EXPONENT = 2` `L1080442,1080516`:

```
applySoftCap(x, soft, hard):
    if x <= soft:            return x
    K = hard - soft
    if K <= 0:               return min(x, hard)
    over = x - soft
    return soft + K * (1 - (2K / (over + 2K)) ** 2)
```

- Never reaches `hard` (asymptote), so there is no dead stat.
- **[CODE]** inverse `rawFromSoftCapped(e)` `L1080224-1080265`:
  `e <= soft → e`; `K <= 0` or `e >= hard → Infinity`; else
  `soft + 2K / sqrt(1 - (e - soft)/K) - 2K`.
- **[CODE]** `softCapEfficiency(raw)` `L1080367-1080400` =
  `1` below the soft cap, else `(2K / (over + 2K)) ** 3` — the marginal
  value of the next raw point (derivative of the curve: `8K³/(over+2K)³`).
- **[CODE]** `softCapGainFromSheet(sheetEffective, delta, caps)` `L1080334-1080366`
  = `max(0, applySoftCap(rawFromSoftCapped(sheetEffective) + delta) - sheetEffective)`
  (0 if `delta <= 0` or the inverse is non-finite). Used when a sigil
  transform/buff stat is credited on top of the sheet value: Miss, Block and
  Penetration `L1089965-1090073` (module 3964). "Transformations last almost
  the whole fight, so their stat now counts like gear (before the soft cap)"
  — `strtab.txt L82902`.

### §4.2 Cap table (`SOFT_CAPS`)

**[CODE]** `L1080443-1080485`. Units per §1.3.

| Stat | Soft | Hard | | Stat | Soft | Hard |
|---|---|---|---|---|---|---|
| ATTACK_SPEED (x) | 2 | 4 | | SPELL_RESIST | 30 | 60 |
| CRIT_CHANCE | 50 | 90 | | SPELL_VAMP | 40 | 70 |
| CRIT_DAMAGE (x) | 3 | 7 | | DISRUPTION_CHANCE | 10 | 20 |
| DOUBLE_HIT | 60 | 90 | | FEAR_CHANCE | 10 | 20 |
| LIFESTEAL | 40 | 70 | | MINION_CRIT_CHANCE | 50 | 90 |
| HP_REGEN | 40 | 60 | | MINION_LIFESTEAL | 40 | 70 |
| DAMAGE_REDUCTION | 30 | 60 | | SOUL_LINK | 40 | 70 |
| BLOCK_CHANCE | 40 | 80 | | MINION_ATTACK_SPEED (x) (see below) | 2 | 4 |
| PENETRATION | 30 | 70 | | **MISS_CHANCE** | 50 | **85** |
| BLIND_CHANCE | 30 | 50 | | SPELL_CRIT_CHANCE | 50 | 90 |
| PARALYZE_CHANCE | 8 | 18 | | | | |

`calculateTotalStats` never calls `applySoftCap` for Minion Attack Speed: the
total is `parseFloat(x.toFixed(2))` of the raw sum, i.e. effectively uncapped
on the sheet (`L1217458-1217464`) **[CODE]**. The 2 / 4 row is applied elsewhere: `createMinion` uses
`SOFT_CAPS.MINION_ATTACK_SPEED` (`combat-pve.md` §12), then the combat ceiling 4.5 (below).

No entry (no curve): Attack, HP, Attack%, HP%, Spell Damage, Minion Attack,
Minion Health, PVP Attack/Defense, OBLIVION_POWER. The Fear total has no
separate cap use (it joins Disruption, §3.3).

### §4.3 Verification against the game's own text — [DERIVED]

- Patch note (Soft caps raised): "Block at 80% raw was 60% effective and is
  now 62.2%; at 120% raw it went from 66.7% up to 70%" — `strtab.txt L82887`.
  Block soft 40 / hard 80, K = 40: raw 80 → `40 + 40(1 - (80/120)²)` =
  **62.22**; raw 120 → `40 + 40(1 - (80/160)²)` = **70.00**. Exact match.
- Penetration rework note: two top builds move "from about 42% to roughly 51%
  effective" — `strtab.txt L69539`. A raw of **66.08** gives 51.0 under
  30/70 and 42.47 under the old 25/50 caps (working: `d² = 1 - 21/40`,
  `over = 80/d - 80`). Both numbers reproduced, so the same curve shape was
  in force before the buff.
- Old observation (Block raw 56.4 → 52.5%, "57% GAIN"): 52.452 and
  `(80/96.4)³ = 0.5715` → **57%**. Matches.
- UI summary text — `L911277-911281`: "Every % stat has a soft cap. Below it,
  every bonus counts in full. Past it, each extra point adds less and less.
  Your items keep their printed numbers, the curve only squeezes their
  combined total." The curve is applied once to the summed raw (§3.2).

### §4.4 How the sheet presents it

- Big number = effective ("REAL stat, the value combat actually uses");
  `RAW x` = pre-curve sum, shown only when raw > soft cap (the `raw*` keys,
  §3.4); `N% GAIN` = `round(100 * softCapEfficiency(raw))`.
  `L911277-911281`, `L1215133-1215176`. The row set per class is gated by the
  §3.3 predicate (`gate` field, `L1210470-1210632`).
- GAIN colour: `t = clamp((1 - gain)/0.75, 0, 1)` and the text colour is the
  linear mix from `rgb(250,204,21)` (t=0, yellow) to `rgb(239,68,68)` (t=1,
  red); gain ≤ 0.25 is fully red. `L1214806-1214853`.

---

## §5 Combat ceilings (separate from soft caps)

**[CODE]** `COMBAT_CEILINGS` `L1080486-1080515`, `applyCombatCeiling(v, c) =
min(v, c)` `L1080297-1080308`. `PERCENT_COMBAT_CEILINGS` = the same table
without the two Attack Speed entries.

| Stat | Ceiling | | Stat | Ceiling |
|---|---|---|---|---|
| MISS_CHANCE | 90 | | LIFESTEAL | 80 |
| BLIND_CHANCE | 60 | | ATTACK_SPEED (x) | 4.5 |
| DAMAGE_REDUCTION | 75 | | PENETRATION | 80 |
| BLOCK_CHANCE | 85 | | SPELL_CRIT_CHANCE | 95 |
| CRIT_CHANCE | 95 | | SPELL_VAMP | 80 |
| HP_REGEN | 70 | | MINION_CRIT_CHANCE | 95 |
| MINION_LIFESTEAL | 80 | | SOUL_LINK | 80 |
| MINION_ATTACK_SPEED (x) | 4.5 | | | |

- Because the soft-cap output is always `< hard`, the ceiling only matters
  when in-combat buffs are **added** to the sheet value. Patch note: "Attack
  stats got ceilings too: Crit Chance 95%, Lifesteal 80%, Attack Speed 450%
  and Penetration 80%. Stacking legendaries could previously reach 98.9% crit
  and 105.7% lifesteal" — `strtab.txt L86111`.
- Applied in: `applyBuffsToEntity` `L1085543-1085694` (module 3963): `attack =
  floor(attack * (1 + buff.attackPercent/100))` if > 0; each of attackSpeed,
  lifesteal, blockChance, missChance, blindChance, critChance,
  damageReduction, hpRegen, penetration = `min(sheet + buff, ceiling)`;
  critDamage `+ buff/100` (no ceiling); spellResist `+ buff` (no ceiling).
  Also Bulwark DR (`applyBulwarkDr` `L1079643-1079666`, ceiling 75), Elusive
  buff (`L1079667-1079740`: attack `round(a*(1+p/100))`, crit/lifesteal
  additive with ceilings, attack speed `x*(1+p/100)` capped at 4.5),
  spell crit / spell vamp (`L1090933-1091008`), minion attack speed /
  lifesteal / soul link (`L1094193-1094377`). How each buff is triggered —
  `see combat-pve.md`, `see sigils.md`.

---

## §6 PVP Attack / PVP Defense rating

- `PVP_RATING_K = 200`; `pvpRatingToPercent(r) = r <= 0 ? 0 : 100 * r/(r+200)`
  — **[CODE]** `L1080410-1080429`; PVP engine twin
  `pvpRatingToFraction(r) = r/(r+200)` `L1452748-1452764`.
- Examples **[DERIVED]**: 50 → 20%, 100 → 33.3%, 200 → 50%, 500 → 71.4%,
  1000 → 83.3%. The game's own text: "50 rating = 20% effectiveness, 100 = 33%,
  200 = 50% - no hard cap, but returns diminish naturally" (`strtab.txt
  L72524`) and "PVP Attack and PVP Defense reworked from flat percentages to a
  rating system with diminishing returns" (`L73492`).
- No soft cap / ceiling applies to the rating. Sheet shows
  `round(rating)` and the converted percent in the bonus slot
  (`L1212950-1213078`); the row only appears when the rating > 0.
- Use in arena PvP damage (module 5399, `mitigate` `L1452937-1453003`):
  `d1 = defender.damageReduction > 0 ? max(1, round(d*(1 - DR/100))) : d`;
  `d2 = attacker.pvpAttack > 0 ? round(d1*(1 + f(attackerRating))) : d1`;
  `d3 = defender.pvpDefense > 0 ? max(1, round(d2*(1 - f(defenderRating)))) : d2`
  with `f(r) = r/(r+200)`. Full duel rules — `see combat-pvp.md`. This means
  the ratings are **live combat inputs**, not display-only.
- Sources of rating: stones (a5) and fortress buffs (a8) in the client
  pipeline (§3.1). Fortress values — `see clan-fortress.md`.

---

## §7 Stat meaning (game text, for the optimiser)

**[CODE]** English tooltips `L911271-911273`:

- Crit Damage: "Damage multiplier on critical hits. 200% = 2x damage."
  Necromancer minions "inherit your Critical Damage, but not your Spell Crit
  chance".
- Double Hit: "Chance for an attack to land a second strike right after. The
  follow-up deals normal damage but **cannot crit or be blocked**."
- Penetration: "When your attack is blocked, this percentage of your base
  damage (pre-crit) still goes through." (a `rollPenetrationCritMult`
  symbol also exists, `strtab.txt L42600` — whether pierced damage can crit
  is **[UNRESOLVED]** here; `see combat-pvp.md`.)
- Block: "Chance to fully block an attack, negating all damage, unless the
  attacker has Penetration." Miss: "dodge … Penetration cannot pierce a dodge."
- Blind: next enemy attack deals 0. Paralyze: stun 2 s. Fear: cower 1 s,
  bosses resist.
- HP Regen: "Percentage of max HP regenerated per second in combat."
- Lifesteal: "Percentage of damage dealt that heals you."
- Minion Attack Speed: "They inherit your Attack Speed, and Minion Atk Speed
  adds on top of it under the same soft cap."

---

## §8 Combat Power (client formula)

- "Combat Power" gates content on the client (`useTotalPower` compared with
  `getCrusadePowerRequirement`, `L1822887-1822892`; Mythic+/Hard entry text
  `strtab.txt L82419`). Hook `useTotalPower` `L1186678-1187190` →
  `calculateTotalPower(input).power` → `calculatePowerBreakdown`
  `L1187242-1187617` with `TOTAL_POWER_CONFIG` `L1187673-1187818`
  (modules 4207/4208).
- **It is not derived from stat totals.** It is a sum of progression terms
  **[CODE]**:

```
power = round( equipment + sigils + enchants + transcendence + pet + mount
             + relics + talents + awakening + level )

equipment = sum over equipped slots of
    EQUIP_RARITY_POWER[rarity]
  * (1 + 0.6  * ascensionEffectiveLevel(itemStatLevel(item)) / 100)
  * (1 + 0.35 * quality / 100)
sigils    = sum over equipped sigils of
    SIGIL_RARITY_POWER[rarity] * min(level, 30)/30 * 3^max(0, sigilAltarTier-1)
enchants  = sum over ACTIVATED stones in the active enchant slots of
    600 * (0.4 + 0.6 * max(0, quality)/100) * (1 + 0.06 * max(0, amplifyLevel))
transcendence = 100 * transcendenceNodeCount
pet       = PET_RARITY_POWER[rarity] * min(altarLevel, 50)/50 * 3^max(0, tier-1)
mount     = MOUNT_RARITY_POWER[rarity] * (1 + 0.1 * max(0, stars-1))    (stars = mount.level, default 1)
relics    = sum of RELIC_TIER_POWER[tier] * (maxLevel>0 ? min(level,maxLevel)/maxLevel : 0)
talents   = 150 * talentPointsSpent
awakening = 350 * awakeningPoints
level     = 40  * playerLevel
```

Where `ENCHANT_QUALITY_FLOOR 0.4` so the quality factor is `0.4 + (1-0.4)*q/100`
(`L1187400-1187409`). Tables:

| Rarity | Equipment | Sigil | Pet | Mount |
|---|---|---|---|---|
| COMMON | 5 | 150 * | 120 | 300 |
| UNCOMMON | 12 | 300 | 280 | 700 |
| RARE | 28 | 700 | 600 | 1500 |
| EPIC | 65 | 1500 | 1200 | 3000 |
| LEGENDARY | 150 | 2900 | 2400 | 5200 |
| MYTHIC | 340 | — | 4400 | — |
| ANCIENT | 750 | 1000 † | 7200 | — |
| DIVINE | 1600 | — | — | — |
| ETERNAL | 3400 | — | — | — |
| OBLIVION | 7000 | — | — | — |

Relic tiers: BRONZE 400, SILVER 900, GOLD 1800. `ALTAR_TIER_BASE 3`,
`SIGIL_MAX_LEVEL 30`, `PET_MAX_ALTAR_LEVEL 50`, `MOUNT_STAR_WEIGHT 0.1`.

Caveats:

- The decompiler collapses object-literal keys, so each rarity key is paired
  with its value by statement order and register tracing. Values marked * (Sigil
  COMMON, and `TALENT_PER_POINT 150`, `ENCHANT_SOCKET_POWER 600`) are assigned
  from registers last loaded for another table (e.g. 150 from the Equipment
  LEGENDARY step), so they are **[DERIVED]** by register tracing, not literal
  constants. † Sigil ANCIENT reads 1000, lower than LEGENDARY 2900 — **[UNRESOLVED]**
  (could be a special-case tier or a decompile artefact; sigil rarities, see
  sigils.md).
- `quality` (gear) = `round(mean over secondary stats of
  calculateStatQuality(type, value, itemStatLevel))` `L677261-677303`
  (module 3177; body of `calculateStatQuality` — `see gear.md`).
- `ascensionEffectiveLevel(L) = L <= 100 ? L : 100 + (L-100)*0.4`
  (`ASCENSION_ABOVE_100_STAT_RATE 0.4`) `L677322-677337,677994-677996`;
  `itemStatLevel(item) = realm == OBLIVION ? itemLevel *
  OBLIVION_PRESTIGE.ITEM_LEVEL_SCALE (0.5) : itemLevel` `L677339-677354,
  677521-677532,669119`.
- Whether the **server** uses the same constants for leaderboards or
  anti-cheat entry checks — **[SERVER]** / **[UNRESOLVED]**; only the
  client-side comparison is visible.
- Stat totals do not appear anywhere in the formula, so a gear-optimiser that
  wants to maximise Combat Power must model rarity/ilvl/quality, not stats.

---

## §9 Client-side build estimators (UI heuristics)

Module 6045 (`L1820760-1821780`, used by the role "readiness" checks) contains
the client's own simplified scorers. They are display heuristics, **not**
combat resolution, but they show what the developer treats as the core
offence formula **[CODE]**:

```
critFactor    = 1 + max(0,critChance)/100 * (max(1,critDamage) - 1)     L1820919-1820938
autoAttackDps = totalAttack * (critFactor + max(0,doubleHit)/100) * max(0,attackSpeed)   L1820940-1820962
spellMult     = (1 + max(0,spellDamage)/100) * (1 + max(0,spellCrit)/100 * (max(1,critDamage) - 1))
spellDps      = sum over damage/debuff/DoT sigils: baseOrAttack%*spellMult / (cooldownMs/1000)  L1820964-1821231
capShare(v, caps, floor=0) = clamp((v - floor)/(hard - floor), 0, 1)   L1820765-1820803
defenseScore  = mean(capShare(block), capShare(DR), capShare(hpRegen))       L1820805-1820829
offenseScore  = mean(capShare(critChance), capShare(critDamage, base 1.5), capShare(doubleHit), capShare(attackSpeed, base 1))   L1820881-1820917
```

Note `autoAttackDps` agrees with the additive double-hit form (double hit
adds a non-crit strike) and takes `attackSpeed` as the multiplier unit.

---

## §10 Server-side items

- **[SERVER]** The live `computedStats` (§2), including everything the client
  preview omits (relics at least; their plain-points contribution matched one real sheet, see §3).
- **[SERVER]** Item drop rolls, upgrade, reroll and skills (`/skills`
  endpoints, `L931910-932140`) — outside this system.
- **[SERVER]** Whether Combat Power (§8) is recomputed server-side for
  leaderboard/gating.

## §11 Unresolved

- a7 argument of `calculateTotalStats` (§3.1): shape known, producer unknown.
- Whether the server applies the same per-source summing and floor/round
  steps as `calculateTotalStats` (the only visible copy is the preview).
- Sigil ANCIENT power value and the register-traced power constants (§8).
- Level scaling of base stats, if any, on the server (§1.1).
- Penetration crit interaction (§7).
- Contribution functions of each source (talents, pets, sigils, stones,
  mounts, glyphs, awakening, transcendence, relics) — owned by their own docs;
  here only the field shapes the pipeline consumes are recorded.

## §12 `data/stats.json` schema

Top-level `source` (file, version, line citations). `schema` (field
glossary). `stats[]` — one object per `SecondaryStatType` (29): `enumName`,
`computedKey`, `rawKey`, `sheetLabel`, `bonusListLabel`, `unit`, `softCap`,
`hardCap`, `combatCeiling` (all in the stat's own unit), `classesAvailable`,
`displayMult`, `roundDigits`, `note`, `citation`. Also `primaryStats[]`
(Attack/HP formulas), `baseStats`, `derivedTotals[]` (Dominion, Conduits),
`softCapCurve`, `pvpRating`, `classStatTables`, `powerConfig` (all
`TOTAL_POWER_CONFIG` constants; see caveats in §8).
