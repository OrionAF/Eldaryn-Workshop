# Sigils

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

Tags: **[CODE]** read directly from client code · **[DERIVED]** computed from [CODE] values (working shown) · **[SERVER]** decided server-side · **[UNRESOLVED]** not determined (what was checked is stated).
All `L<n>` citations are lines of `decompiled.js`. Full catalogue: `data/sigils.json` (schema in §12).

## Overview

Sigils are a collectible, levelled, equippable power source unlocked at character level 25 (Warrior, Sentinel) or 17 (Mystic, Necromancer). They are forged with Honors at the Sigil Altar/Forge, merged into levels with duplicate fragments, and equipped into up to 3 slots (plus one class-specific utility slot).

What they contribute to a character:

1. **Flat Attack and Health** from every equipped sigil, by rarity, level and Sigil Altar tier (§4). This is the bulk of their passive power.
2. **Aura (passive) percent stats** from Common aura sigils (Attack%, HP%, Attack Speed, Miss, HP Regen, Spell Damage) (§5, §6).
3. **Active spells**: damage, DoT/bleed/poison, heal, timed stat buffs, shields, summons, forms (§6). Their numbers scale with sigil level, not with Altar tier.
4. **Stack sigils (Legendary)** and **Ancient transform sigils** that change combat behaviour (§6, §9).

Stat sheet integration: the client sums flat Attack/HP and aura percents in `calculateSigilBonuses` (§4); the server returns the authoritative `computedStats` when equipment changes (§11).

---

## §1 Class availability and unlock levels

| Rule | Value | Tag / cite |
|---|---|---|
| Sigils unlock level, Warrior and Sentinel | 25 (`UNLOCK_LEVELS.SIGILS`) | [CODE] L668649; class map L668912-668928 |
| Sigils unlock level, Mystic and Necromancer | 17 (`UNLOCK_LEVELS.SIGILS_MYSTIC`) | [CODE] L668649, L668923-668928 |
| Sigil Activation Conditions unlock | level 54 (`SIGIL_CONDITIONS`) | [CODE] L668649; popup text L668833 |
| `getSigilsUnlockLevel(class)` fallback when class unknown | 25 | [CODE] L668388-668407 |
| Sigils catalogue per class | Warrior 12 forge + 2 Ancient (Flameborn, Earthwarden); Sentinel 12 forge + 2 Ancient (Stormcaller, Flameborn); Mystic 21 entries (druid-only and mage-only mixed); Necromancer 10 entries | [CODE] Warrior L1068994-1069232, Sentinel L1069233-1069466, Ancient L1069467-1069552, Mystic L1069570-1070318, Necromancer L1070319-1070528 |

All four classes' sigils are in `data/sigils.json` (see §8).

## §2 Slots

| Rule | Value | Tag / cite |
|---|---|---|
| Max equipped (generic) | `MAX_EQUIPPED` = 3 | [CODE] L1068802 |
| Slot unlock levels, Warrior/Sentinel | slot 1 at level 25, slot 2 at 28, slot 3 at 32 | [CODE] `SIGIL_SLOT_UNLOCKS` L1068809-1068813 |
| Slot unlock levels, Mystic/Necromancer | slot 1 at 17, slot 2 at 28, slot 3 at 32 | [CODE] `SIGIL_SLOT_UNLOCKS_MYSTIC` L1068815-1068821 |
| `getMaxSigilSlots(level, class)` | `slots` of the last table row whose `level <= playerLevel`, else 0 (loop body elided by decompiler; reading is the obvious one) | [CODE] L1067168-1067210, behaviour [DERIVED] |
| Utility slot (extra, dedicated) | Necromancer: SUMMON sigil. Mystic Mage: SHIELD sigil. Mystic Druid: FORM sigil. Warrior/Sentinel: none | [CODE] `getUtilitySlotSpellType` L1066498-1066537 |
| Utility slot state fields | `utilitySlotSpecies`, `druidUtilitySlotSpecies`; druid generic slots in separate `druidEquippedSpecies` | [CODE] slice defaults L1065846, `getActiveEquippedSpecies` L1067436 |
| Only one Ancient may be equipped | UI blocks a second Ancient (`sigil.notify.oneAncient`) | [CODE] L1323568 (module 4596) |
| Whether an Ancient consumes one of the 3 generic slots | UI string says "Equip it alongside your sigils"; the equipped-count filter used for the slot counter excludes Ancients | [UNRESOLVED] checked L1324790-1324830 and L1323500-1323560; counter excludes Ancient but slot-consumption on equip is server-validated |
| Class gating of species | `isSigilSpeciesActiveForSpec`: Mystic Mage sees every non-druid-only sigil; Mystic Druid sees druid-only sigils, form sigils, and base sigils that have a `druidVariant`; Ancients are always active | [CODE] L1066710-1066770 |

## §3 Ownership, Forge, Altar (Honors economy)

| Rule | Value | Tag / cite |
|---|---|---|
| Forge cost per sigil | `PURCHASE_COST` = 10 Honors x `TIER_XP_MULT`^(altarTier-1) = 10 x 2^(tier-1) | [CODE] constants L1068802; cost expression in UI module 4596 L1324199-1324215 (`PURCHASE_COST * pow(TIER_XP_MULT, altarTier - 1)`, with the subtracted constant `r63 = 1`) [DERIVED]. The Arcane Bargain skill (`skill_sigil_discount`, level 32) discounts forging; see skills.md |
| First forge | free: `TUTORIAL_FREE_HONORS` = 10 | [CODE] L1068802 |
| Forge animation | 5000-8000 ms (cosmetic) | [CODE] `SIGIL_FORGE_CONSTANTS` L1068806 |
| Altar progress | every forge adds 1 to `totalSigilsPurchased` | [CODE] `applySigilPurchase` L1065908; UI text "Every sigil you forge charges the Altar" |
| Altar level cost | `need(L, tier) = Math.round(6 + 0.5*L) * 2^(tier-1)` forges to go L to L+1 | [CODE] L1066838-1066889 |
| Altar level resolve | start level 1, subtract `need` while `level < 30` and `forges >= need` | [CODE] `resolveSigilAltar` L1066891-1066974 |
| Altar max level | 30 | [CODE] `MAX_LEVEL` L1068838 |
| Forges to reach Altar level 30 at tier 1 | 399 (sum of `round(6+L/2)`, L=1..29; JS `Math.round` half-up) | [DERIVED] `data/sigils.json` `altarForgesToNextLevel` |
| Evolve Altar | allowed when Altar level 30 and `tier < EVOLVE_TIER_CAP` (3). Destroys every owned sigil, keeps `floor(honors x 0.75)`, resets Altar progress | [CODE] `EVOLVE_TIER_CAP`=3, `EVOLVE_HONOR_KEEP_RATIO`=0.75 L1068838; evolve modal `EVOLVE_HONOR_KEEP_RATIO` use L1322409 (module 4596); UI text "Evolving will permanently DESTROY every sigil you own" |
| Max tier constant | `MAX_TIER` = 8 but evolve is capped at 3 | [CODE] L1068838 |
| What survives evolve | "Only the permanent power stays". The unique Ancient sigil is never lost | [CODE] UI strings (strtab); `unique` flag via `isUniqueSigilSpecies` L1068370 |
| Forge odds | per Altar level, banded ease curves (below). Drop odds are tier-independent except Legendary needs `tier >= LEG_UNLOCK_TIER` (2) | [CODE] L1066976-1067034, bands L1068942-1068949, `easeBand` L1068951 |
| Actual roll / duplicate / fragment grant | decided on the server; client only receives `{sigil, isNew, companion}` | [SERVER] `applySigilPurchase` L1065908-1065990 |

Forge odds (weights; Common = remainder):

```
easeBand(band, L):
  if L < band.from: return 0
  t = min(1, (L - band.from) / (30 - band.from))
  return band.start + (band.peak - band.start) * t ^ band.ease
uncommon:  {from 2, start 2,   peak 42, ease 1}
rare:      {from 5, start 1,   peak 23, ease 1.5}
epic:      {from 8, start 0.3, peak 5,  ease 2.4}
legendary: {from 1, start 0,   peak 3,  ease 2.6}   (only if altarTier >= 2)
common = 100 - uncommon - rare - epic - legendary
```
[CODE] L1068942-1068949, L1068951-1069000. Table per Altar level 1..30 in `data/sigils.json` `forgeOddsByAltarLevel` [DERIVED]. At level 30: Uncommon 42, Rare 23, Epic 5, Legendary 3 (tier 2+), Common 27 (tier 2+) or 30 (tier 1). UI: "Tier I only forges up to Epic. From Tier II onward, brand-new Legendary sigils finally begin dropping." [CODE] strtab.
[UNRESOLVED] The weight call passes six arguments to a five-parameter helper (`pw`); the sixth (Altar level) lands in an unused optional slot. I read the odds as uncommon/rare/epic/legendary/0. Checked L1067031 and `pw` L1068840-1068940.

### Sigil levels and fragments

| Rule | Value | Tag / cite |
|---|---|---|
| Max sigil level | 30 (`MAX_SIGIL_LEVEL`) | [CODE] L1068802 |
| Fragments to level up from L | `L + 1` (no cap shown at L=30; UI guards `level >= 30`) | [CODE] `sigilFragmentsRequired` L1067494 |
| Cumulative fragments to reach L | `L*(L+1)/2 - 1` | [CODE] L1067512 |
| Fragment source and the level-up action | server (duplicates). Client stores `{species, rarity, level, fragments, createdAt, activationCondition}` | [SERVER] `mapSigil` L1137671-1137690 |
| Ancient sigils | stay level 1 ("no duplicates to forge with") | [CODE] UI string (strtab) |
| Form sigils (Druid) | level fixed at 1 in the app | [UNRESOLVED] the client's level lock was not traced; the app pins them to level 1 (`model/legality`) |

## §4 Passive stats: flat Attack and Health

For each equipped, active sigil (including utility slot, Ancients and every spell type):

```
tierMult(tier)      = TIER_STAT_MULT ^ max(0, tier - 1)              // 3^(tier-1)
sigilAttack(L,tier) = floor( baseAttack * (1 + (L - 1) * 0.1) * tierMult(tier) )
sigilHp(L,tier)     = floor( baseHp     * (1 + (L - 1) * 0.1) * tierMult(tier) )
flatAttack += sigilAttack ; flatHp += sigilHp
```
[CODE] `sigilTierStatMult` L1066773-1066807, `getSigilBonusAttack` L1067546-1067583, `getSigilBonusHp` L1067584-1067621 (evaluation order: `base * (1 + (level-1)*STAT_GROWTH)` then `* tierMult`, then `Math.floor`), summed in `calculateSigilBonuses` L1095765-1096000. `tier` = the player's Altar tier (`altarTier`, default 1).

Base values by rarity (identical for every sigil of that rarity) [CODE] definition literals L1068994-1070528:

| Rarity | baseAttack | baseHp |
|---|---|---|
| Common | 166 | 1300 |
| Uncommon | 426 | 2912 |
| Rare | 1140 | 8400 |
| Epic | 3600 | 23200 |
| Legendary | 9000 | 58000 |
| Ancient | 6000 | 40000 |

Notes and consequences:

- **The tier multiplier is uniform for every rarity.** There is no "Legendary starts its x3 ladder at tier 2" rule in the stat code. Legendary appears from tier 2 only because the forge cannot roll it at tier 1 (`isSigilLegendaryUnlocked`, L1066809). [CODE]
- **The old "14 unexplained level-5 Health rows" are floating-point.** `1300 * (1 + 4*0.1)` is `1819.9999999999998` in IEEE doubles, so `floor` gives 1819 at L5. Same effect at L14 and L19 (Common and Epic Health, plus Ancient Attack at L14). The old doc's `Math.floor` finding stands. [DERIVED] reproduced in double precision: 18 Health cells for Common/Epic at L5/14/19 over tiers 1-3, plus Ancient Attack at L14 over tiers 1-3 (`6000 * (1 + 13*0.1)` is `13799.999999999998`, floor gives 13799; 21 cells in all). Ancients stay level 1, so the Attack cell has no gameplay effect.
- Percent-based aura sigils also add flat Attack/Health: every sigil carries both. [CODE]
- The Ancient's stats follow the same formula at level 1: `6000 * tierMult` Attack, `40000 * tierMult` Health. [DERIVED]
- Whether the client formula equals the server's authoritative `computedStats` is not provable here. [SERVER] (see §11)

## §5 Spell and aura value scaling

All spell numbers are stored at level 1 with a `max*` cap, and scaled by `getSigilSpellScaled(spell, level)`:

```
scale = 1 + (level - 1) * SPELL_GROWTH_PER_LEVEL          // 0.08
scaledField = min( parseFloat( (field * scale).toFixed(1) ), maxField )
```
[CODE] L1067622-1068264 (scale at L1067628-1067632; per-type branches below). `toFixed(1)` rounds the exact binary value to 1 decimal (half-up on ties in JS).

Per spell type, which fields scale [CODE] L1067622-1068264:

| spellType | Scaled fields (with their cap) | Not scaled |
|---|---|---|
| AURA | `bonusValue` (no cap; `toFixed(2)` instead of 1 when `bonusStat == ATTACK_SPEED`) | |
| DAMAGE | `baseDamage` (floored unconditionally, so a spell with no `baseDamage` would give NaN; every catalogued DAMAGE spell has 0), `attackPercent` (cap `maxAttackPercent`), `damagePerTick` (floored), `slow.attackSpeedReductionPercent`, `wound.regenReductionPercent`, `critDown.critChanceReduction` (each with its own `max*`) | cooldown, duration, tick interval, paralyze/fear/silence ms |
| DEBUFF | `initialAttackPercent` (cap; scales uncapped when no max), `debuff.regenReductionPercent` and `debuff.damagePerTickPercent` (each scaled only when its `max*` sibling exists, otherwise left at the level-1 value; the shipped catalogue has all the maxes) | cooldown, duration, maxStacks, tick interval |
| BUFF | each `effects[i].value` (cap `maxValue`, `toFixed(1)`), `thornsPercent`, `minionEmpower.*`, `minionFrenzy.*` | duration, cooldown |
| HEAL | `healPercentPerTick` (no cap) | tick interval, duration, cooldown |
| SHIELD | `shieldHpPercent` (cap `maxShieldHpPercent`) | |
| TRANSFORM | each `effects[i].value` (cap if `maxValue` present; Ancient transforms have none, so they scale uncapped, but Ancients stay level 1) | duration |
| SUMMON | `attackPercent` and `hpPercent` (caps) | respawn, cast ms |
| STACK, FORM, DEFENSE | nothing (constant at all levels) | everything |

So **cooldowns and durations never scale with sigil level**, and **sigil magnitudes never depend on Altar tier**. [CODE] (no tier argument reaches `getSigilSpellScaled`).

Consequences worked through (script `agent-scripts/sigils/scale.py`, all [DERIVED]):

- Caps bind early (level 6-14) for almost every stat, e.g. Warborn Fury Attack% caps at L10, DR at L8; Iron Bastion Block caps at L20 (25); Phantom Veil Miss caps at L10 (25); Sanguine Rush Lifesteal caps at L10 (25); Blinding Mark caps at L10 (50); Withering Touch regen reduction caps at L7 (85).
- **Attack Speed in BUFF effects is a 0.2-base value rounded to ONE decimal**, which makes the "step" the old doc recorded. Sanguine Rush AS by level: 0.2 (L1-4), 0.3 (L5-10), 0.4 (L11-16), 0.5 (L17-22), 0.6 (L23-29), 0.7 (L30); cap 0.8. [DERIVED]
- Hawk Focus (aura AS 0.1) uses `toFixed(2)`: 0.10, 0.11, 0.12, 0.13 (L5), 0.17 (L10), 0.25 (L20), 0.33 (L30). [DERIVED] Whether the displayed unit is x100 percent (10%, 11%, ...) is the UI's concern; the stored unit is a fraction. [CODE] the `attackSpeed` bonus is added as stored to the raw attack-speed accumulator before the form multiplier and soft cap, see `stats.md` §3.2 (L1216476-1216501).

## §6 Sigil types and what each does

Types (`SigilSpellType`): AURA, DAMAGE, BUFF, HEAL, DEBUFF, TRANSFORM, SHIELD, STACK, SUMMON, FORM, DEFENSE. [CODE] L1067622-1067700 (DEFENSE exists in the enum and in `getSigilSpellScaled` but no sigil in 2.7.0 uses it).

- **AURA**: permanent while equipped. `bonusStat` in {ATTACK_PERCENT, HP_PERCENT, ATTACK_SPEED, MISS_CHANCE, HP_REGEN, SPELL_DAMAGE}; `bonusValue` is added to that stat accumulator. Level-scaled (§5). [CODE] `calculateSigilBonuses` L1095765-1096000. Auras have no cooldown/duration; they never go through the combat spell list. [CODE] L1096025-1096225 (`getActiveCombatSpells` excludes AURA, STACK, SHIELD, FORM, SUMMON).
- **DAMAGE**: hit for `floor(playerAttack * attackPercent / 100)` if `attackPercent` is set (else `baseDamage`), then through `modSpellDmg`: `max(1, floor(x * (1 + (SPELL_DAMAGE stat + buffs + spellDamagePercent)/100) * k))` where `k` is the target's spell-resist factor (see combat-pve.md §10.2). [CODE] `processSpellsTick` L1090474-1092345: base L1091965-1091975, `modSpellDmg` L1090892-1090930. The 5th argument at the call site (L1074777-1074830) is `attacker.attack`. The crit path and `k` are in combat-pve.md. `isDoT: true` sigils repeat the hit every `tickIntervalMs` for `durationMs`.
- **DEBUFF**: an initial hit `initialAttackPercent` plus a status: WOUND (reduces enemy HP regen/healing by `regenReductionPercent`), BLEED (stacking, `damagePerTickPercent` x stacks every tick), POISON. Bleed/poison tick damage per stack scales with level and caps. Hemorrhage/Ember Curse/Arcane Corruption stack up to 8 with duration 0 (permanent); Venom Wound is a single 10s poison. [CODE] defs L1069150-1069191, L1069368-1069425, Arcane Corruption in L1069570-1070318.
- **BUFF**: timed list of stat effects (`stat`, `value`, `maxValue`) for `durationMs`, then cooldown `cooldownMs` (cooldown starts at activation, no level scaling). [CODE]
- **HEAL**: `healPercentPerTick` of max HP every `tickIntervalMs` for `durationMs` (Rejuvenation 8%/s for 6s, Aether Renewal 25% instant + refills shield). [CODE]
- **SHIELD** (Mystic utility slot): start-of-fight shield of `shieldHpPercent` (of max HP) x `(1 + shieldPowerPercent/100)` where `shieldPowerPercent` comes from glyph mods. `vampAlwaysRefills`/`regenAlwaysRefills` flags decide whether Spell Vamp/HP Regen refill it while wounded. [CODE] `getEquippedShieldConfig` L1095542-1095764.
- **SUMMON** (Necromancer utility slot): minion (`SKELETON` or `REAPER`) with `attackPercent` and `hpPercent` of the owner's stats, respawn 10s, cast 1.5s. [CODE] `getEquippedSummonConfig` L1096227-1096330.
- **FORM** (Mystic Druid utility slot): `gearHpMult`, `attackMult`, `attackSpeedMult`, `unlocksBlockAndDr` plus a bonus stat list that "counts like gear" (soft cap applies). Ursine/Dire Ursine unlock Block/DR for the Tank goal; the UI says "Tank requires the Ursine Form sigil equipped in your form slot. Without the bear, your Damage Reduction and Block Chance count for nothing." [CODE] defs L1070200-1070318, strtab.
- **STACK** (Legendary): see below.
- **TRANSFORM** (Ancient): see §9.

### Stack sigils (Legendary), constant at all levels

| Sigil | Trigger | Per stack | Max | Loss | Cite |
|---|---|---|---|---|---|
| Bulwark of Thorns (Warrior) | each **blocked** hit | +8% Max HP, +4% DR (cap 75%), +7% Thorns | 8 | an unblocked hit burns **1** stack | [CODE] L1069192-1069212 |
| Sunder Mark (Warrior) | each landed hit marks the enemy | enemy loses 4% DR, 4% Block, 4% Miss, 4% Blind | 8 | enemy decays 1.75 stacks/s (catalogue value; the engine default when a def has no `decayPerSecond` is 2/s) | [CODE] L1069213-1069232 |
| Elusive Supremacy (Sentinel) | each dodged or Blind-fizzled hit | +3% Attack, +3% Crit Chance, +3% Lifesteal, +3% Attack Speed | 8 | unblocked hit burns **2** | [CODE] L1069426-1069444 |
| Siegebreaker Mark (Sentinel) | each landed hit | enemy loses 3% HP Regen, **3%** Block, 4% Miss, 4% Blind | 8 | decays 1.75/s | [CODE] L1069445-1069466 |
| Primal Instinct (Mystic Druid) | bear: blocked hits; wolf: landed hits | bear Ironhide: +4% HP, +2% DR, +5% Thorns, burns 2; wolf Rend: -3% regen, -4% Block/Miss/Blind, 1.75/s | 8 | | [CODE] L1070149-1070200 |

Elusive effect on stats: `attack = round(attack * (1 + stacks*3/100))`, `attackSpeed = attackSpeed * (1 + pct/100)` (multiplicative), crit chance and lifesteal added then clamped by the combat ceiling. [CODE] `applyElusiveBuff` L1079667-1079730 (the per-stack total percent is passed in). Bulwark DR is clamped by the DR ceiling (75). [CODE] `applyBulwarkDr` L1079643-1079665. Per-hit stack bookkeeping happens in the combat engine (see combat-pve.md). Glyph overrides for stack counts/thorns/decay: `stackGlyphOverrides` L1080527-1080700, owned by mounts-glyphs.md.

## §7 Sigil Activation Conditions (new in this version)

[CODE] enum values L669501-669520, options per type `getAvailableConditions` L1068673-1068800, check `isConditionMet` L1089843-1089960, unlock popup L668833.

- Default and fallback condition: `ON_COOLDOWN` (cast as soon as off cooldown). `applySigilSetCondition` stores `ON_COOLDOWN` when the condition is null. [CODE] L1066045-1066098
- Options by spell type:
  - DAMAGE, DEBUFF: `ON_COOLDOWN`, `ENEMY_HP_BELOW_80/60/40/20`.
  - BUFF, HEAL, DEFENSE: `ON_COOLDOWN`, `MY_HP_BELOW_80/60/40/20`.
  - AURA, TRANSFORM, STACK, SHIELD, FORM, SUMMON: `ON_COOLDOWN` only.
  - `getAvailableConditions` (L1068673-1068800) takes one spell type. A form-conditional sigil can be a different family per form (Withering Brand is a buff in BEAR form and a debuff in WOLF form), so the two forms' option sets differ. [UNRESOLVED] which type the client passes for such a sigil; the catalogue's top-level `spellType` is only one of the two.
- Evaluation: `ENEMY_HP_BELOW_X` is met iff `enemyHpPct <= X`. `MY_HP_BELOW_X` is met iff `flag || myHpPct <= X` (an optional 4th boolean argument short-circuits it to true; its meaning is unresolved). [CODE] L1089843-1089960
- Scope: "Damage & debuff spells: conditions apply only in PvP (Arena). In PvE they always fire on cooldown (DAMAGE and DEBUFF skip `isConditionMet` when `processSpellsTick`'s arg9 is false, as in both PvE callers, L1091462-1091542; only PvP passes true). Buff & heal spells: conditions apply everywhere (PvE & PvP)." [CODE] popup text L668833. Condition is stored per owned sigil (`activationCondition`) and returned by `getActiveCombatSpells` L1096025-1096225.
- Minimum cooldown after glyph reductions: `MIN_SIGIL_COOLDOWN_MS` = 1000. [CODE] L1080869-1081230; applied in `applySigilGlyphMods`.

For an optimiser: in PvE, damage/debuff conditions are ignored (always on cooldown), so only buff/heal conditions can change PvE output. [DERIVED]

## §8 Catalogue (summary; full data in `data/sigils.json`)

IDs in the JSON are kebab-cased names (`berserk-stance` is species `BERSERK_STANCE`). All numbers are level-1 values with the cap in parentheses. Cooldown/duration in seconds.

### Warrior (12 forge + Earthwarden + Flameborn) [CODE] L1068994-1069232, L1069467-1069523

| Sigil | Rarity | Type | Level-1 effect (cap) | CD / dur |
|---|---|---|---|---|
| Berserk Stance | Common | Aura | +4 Attack% | passive |
| Defense Stance | Common | Aura | +8 HP% | passive |
| Blade of Judgment | Common | Damage | 80% (120) of Attack | 8 / - |
| Arrowstorm | Uncommon | DoT | 60% (90) per 2s tick | 10 / 6 |
| Warborn Fury | Uncommon | Buff | Attack% 12 (20), Penetration 15 (20), DR 20 (30); DR ceiling 75 while up | 15 / 5 |
| Rejuvenation | Uncommon | Heal | 8% max HP per second (uncapped) | 12 / 6 |
| Cataclysm | Rare | Damage | 180% (240) | 10 / - |
| Iron Bastion | Rare | Buff | HP% 30 (50), DR 20 (35), Block 10 (25); ceilings DR 75, Block 85 | 28 / 6 |
| Withering Touch | Epic | Debuff (Wound) | 210% (300) hit, enemy regen -60% (85) for 8s | 15 / 8 |
| Hemorrhage | Epic | Debuff (Bleed) | 80% (120) hit, 40% (55) per stack per 2s, max 8 stacks, permanent | 10 / - |
| Bulwark of Thorns | Legendary | Stack | see §6 | - |
| Sunder Mark | Legendary | Stack | see §6 | - |
| Earthwarden | Ancient | Transform | Attack% +30, HP% +100, Block +16 (soft cap), 60s | on full Chrono Flux; re-arms (§9) |
| Flameborn | Ancient | Transform | Attack% +80, HP% +50, Penetration +12 (soft cap), 60s | on full Chrono Flux; re-arms (§9) |

### Sentinel (12 forge + Stormcaller + Flameborn) [CODE] L1069233-1069466, L1069524-1069552

| Sigil | Rarity | Type | Level-1 effect (cap) | CD / dur |
|---|---|---|---|---|
| Hawk Focus | Common | Aura | +0.1 Attack Speed (fraction, `toFixed(2)`) | passive |
| Mist Veil | Common | Aura | +8 Miss Chance | passive |
| Wild Renewal | Common | Aura | +5 HP Regen | passive |
| Crimson Arrow | Uncommon | Damage | 120% (170) | 9 / - |
| Phantom Veil | Uncommon | Buff | Miss 15 (25); Miss ceiling 90 | 16 / 8 |
| Sanguine Rush | Uncommon | Buff | Attack Speed 0.2 (0.8), Lifesteal 15 (25) | 14 / 6 |
| Blinding Mark | Rare | Buff | Blind 30 (50); Blind ceiling 60 | 12 / 5 |
| Venom Wound | Rare | Debuff (Poison) | 120% (180) hit, 40% (80) per 1s for 10s, 1 stack | 13 / 10 |
| Thunderbind | Epic | Damage | 150% (220), paralyze 2s | 12 / - |
| Ember Curse | Epic | Debuff (Bleed) | 80% (120) hit, 40% (55) per stack per 2s, max 8 | 10 / - |
| Elusive Supremacy | Legendary | Stack | see §6 | - |
| Siegebreaker Mark | Legendary | Stack | see §6 | - |
| Stormcaller | Ancient | Transform | Attack% +60, HP% +70, Miss +20 (soft cap), 60s | on full Chrono Flux; re-arms (§9) |

Mystic (21 entries incl. druid variants/forms, Mage and Druid share the 3 generic slots but have different utility slots) and Necromancer (10 entries, Common to Rare only in 2.7.0) are fully tabulated in the JSON. Notable: Aether Renewal is a 25% instant heal that also refills the shield; Arcane Momentum stacks to 30 Momentum (+1.2% Spell Damage, +0.4% Spell Crit, +0.4% Spell Vamp each, first 15 stacks build twice as fast, resets per fight). [CODE] L1069570-1070528 (Arcane Momentum near L1070102).

## §9 Ancient sigils and Chrono Flux

- Acquired from the Transcendence board, not the Forge. Node ids: top-left `sig_-13,-25`, top-right `sig_13,-25`. Default mapping: top-left Earthwarden, top-right Flameborn. Sentinel override: top-left Stormcaller (top-right stays Flameborn). [CODE] `ANCIENT_SIGIL_BY_TRANSCENDENCE_NODE` L1069553-1069569, `getAncientSigilForNode` L1068346-1068375. Costs and unlocking: see transcendence.md (UI: flat Ichor cost for both corner nodes).
- Transform: `durationMs` = 60000 (`TRANSFORM_DURATION_MS`). Effects: ATTACK_PERCENT and HP_PERCENT apply directly; PENETRATION, BLOCK_CHANCE, MISS_CHANCE go through `softCapGainFromSheet` (diminishing against the character sheet's current value, "counts like gear"). [CODE] `resolveTransformEffects` L1089965-1090085; stat values above in §8. Soft-cap curve itself: see stats.md.
- Charge: Chrono Flux bar max 7000; Per event the bar gains `conduit value x weight`: attacker hit or crit = Flame x 1; defender block = Flame x 0.7; defender hit = Earthen x 0.7; attacker block = Earthen x 1. The Dark conduit value is added to both Flame and Earthen; if Flame+Dark and Earthen+Dark are both <= 0 the gain is 0. The sum is divided by `3^max(0, transformFireCount)` (`CHRONO_FLUX_RECHARGE_FACTOR` = 3, so each transform fired this fight cuts later gain by a further factor 3). The bar is clamped to 0..7000, and the caller skips accrual while a transform is active (L1089052-1089081). [CODE] L1094006-1094178 (`chronoFluxGainDivisor`, `chronoFluxFromEvents(events, flame, earthen, dark, transformFireCount)`) "When it maxes out, it awakens your equipped Ancient Sigil's transform." [CODE] L1094180 (`MAX 7000, FLAME_HIT 1, FLAME_BLOCKED 0.7, EARTHEN_HIT 0.7, EARTHEN_BLOCKED 1`); gear conduit source: see gear.md.
- No cooldown (no `cooldownMs` on the spell). The transform re-arms when its 60s effect ends and fires again once Chrono Flux refills to 7000; the bar resets to 0 when it fires and does not accrue while the transform is active; each later gain is divided by 3^(fires this fight). [CODE] `hasPendingTransform` L1092524-1092548, PVE loop L1089040-1089110, patch note L1960459. The in-game "once per fight" description (L1961432) is stale. [CODE]
- Unique: only one of each can exist, stays level 1, survives Altar evolve. Only one Ancient equipped at a time. [CODE] strtab / `sigil.notify.oneAncient`.
- [SERVER] Whether an equipped Ancient is active when its Transcendence board does not allocate its node is not shown by client code. The app treats it as inactive when the resolved board lacks the node; that is a policy choice, not a client fact.
- The Transcendence popup still says "the two Ancient Sigils await in a future update" (stale text), but the species, node mapping and equip UI are present in 2.7.0. [CODE] L668837 vs L1069553.

## §10 Combat ceilings that cap sigil buffs

`COMBAT_CEILINGS`: Miss 90, Blind 60, Damage Reduction 75, Block 85, Crit 95, Lifesteal 80, Attack Speed 4.5, Penetration 80, Spell Crit 95, Spell Vamp 80, HP Regen 70, Minion Crit 95, Minion Lifesteal 80, Soul Link 80, Minion Attack Speed 4.5. [CODE] L1080486. Several sigil descriptions state the same cap ("Damage Reduction cannot exceed 75% while it is up"). Their use in the general stat pipeline: see combat-pve.md.

## §11 Server-side items

- Forge roll, rarity, duplicate/companion drops, fragment grants, level-up, Altar evolve, equip validation. The client applies results (`applySigilPurchase`, `applySigilBatchPurchase`, `applySigilEquip`, `applySigilUnequip`, `mergeForgedSigil`). [SERVER] L1065753-1066474
- Authoritative `computedStats` is returned with equip/unequip (`applySigilEquip` stores `stats`). The client formula in §4 is what the client uses for display and local combat. [SERVER] L1066099-1066180
- Sync payload: `ownedSigils[]` (`species, rarity, level, fragments, createdAt, activationCondition`), `equippedSpecies`, `druidEquippedSpecies`, `utilitySlotSpecies`, `druidUtilitySlotSpecies`, `totalSigilsPurchased`, `altarTier`, `sigilsUnlocked`. [CODE] `mapSigilFromServer` L1137671-1137690, L1139600-1139690.

## §12 Data file schema (`data/sigils.json`)

Top level: `source`, `extracted`, `schema`, `rarityBase` (baseAttack/baseHp per rarity), `constants` (all numeric constants cited here), `forgeOdds.bands`, `forgeOddsByAltarLevel[30]`, `altarForgesToNextLevel[29]`, `altarCumulativeForgesToLevel30`, `catalogue[58]`.
Catalogue entry: `id, species, name, class, rarity, baseAttack, baseHp, spellType, spell{...}` plus optional `druidVariant`, `requiredSpec`, `transcendenceNode`, `classes`, `unique`. Spell fields are level-1 values; scaling and caps per §5. A base `spell` carries no type; its type is the entry's `spellType`.

`druidVariant` is the Mystic Druid's version of the sigil, in the client's shape: `{name, spell?, formSpell?: {BEAR, WOLF}}`. Eleven species have one: Arcane Shard, Arcane Empowerment, Primal Awakening, Runic Affliction, Arcane Burst, Arcane Surge, Blinding Affliction, Withering Brand, Arcane Barrage, Aether Renewal, Primal Instinct. [CODE] L1069570-1070178
- Every `druidVariant.spell` and `formSpell[BEAR|WOLF]` stores the client's own `spellType`, which can differ from the entry's (for example Withering Brand: BEAR is a BUFF, WOLF a DEBUFF; Aether Renewal is a HEAL for the Mage and a BUFF in both forms). [CODE] each variant's `SigilSpellType` assignment, L1069587-1070168
- `getSigilDefinitionForSpec` gives a Druid `formSpell[form]` when `formSpell` exists (form null reads BEAR), else `druidVariant.spell`; `druidVariant.spell` is dropped from the file where `formSpell` exists, except for Arcane Empowerment, Primal Awakening and Primal Instinct, because the client never reads it there. A Druid with no form skips any sigil with a `formSpell` (`getFormConditionalSpells`). [CODE] L1066606-1066708
- The client keys each form spell by `SigilFormKind.BEAR` / `.WOLF` directly. [CODE]
- Primal Awakening: BEAR casts +15% HP (max 25), WOLF +8% Attack (max 14) and +0.05 Attack Speed (max 0.1), both lasting 8000 ms with a 12000 ms cooldown (module constants r12 = 8000 at L1068805, r22 = 12000 at L1069104). [CODE] L1069679-1069715

## §13 Pointers to other systems

- Mount glyph effects that retune sigils (cooldown reduction, damage bonus %, shield power, stack overrides, thorns): see `mounts-glyphs.md`.
- Soft caps, combat ceilings and the damage pipeline that consumes sigil buffs: see `stats.md`, `combat-pve.md`, `combat-pvp.md`.
- Honors, Arcane Bargain discount: see `skills.md`, `pve-content.md` (Honors sources are PvP/Clan: `combat-pvp.md`).
- Ancient sigil unlock via Transcendence nodes: see `transcendence.md`. Eternal gear conduits: see `gear.md`.
- Item/character power rating: sigil term is `SIGIL_RARITY_POWER[rarity] * min(level,30)/30 * 3^(altarTier-1)` with Uncommon 300, Rare 700, Epic 1500, Legendary 2900, Ancient 1000 (Common value not resolved). [CODE] L1187360-1187380, L1187738-1187745. It is a display score, not a combat input.

## §14 Optimiser-facing summary

1. A sigil's flat Attack/HP depends on rarity, level and Altar tier only (§4); not on class or sigil identity.
2. Spell magnitudes depend on sigil level only, are capped, and are percentages of the player's Attack or max HP (§5, §6), not user-entered flat numbers.
3. PvE-relevant activation control exists only for BUFF/HEAL (§7).
4. Legendary and Ancient are not equip-gated by tier in client code (§4); the only tier gate is that Legendary cannot be forged below Tier 2.
