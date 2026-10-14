# Classes, Levels and Class Abilities

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

All line numbers are `decompiled.js L<n>`. Tags: **[CODE]** read from client, **[DERIVED]** computed from CODE, **[SERVER]** decided server-side, **[UNRESOLVED]** not determined.

## Overview

The client has **4 classes** and **8 specializations** (2 per class). The client does not compute a character's base stats or per-level stat growth: it shows whatever the server returns as `computedStats`. What the client does fix is the class list, the spec-to-class mapping, the XP curve, the level cap, which secondary stats each class can roll, the Attunement ban bonus, sigil unlock levels, and the Necromancer minion formulas.

For a gear optimiser the class contributes four things:
1. The set of secondary stats that can appear on gear (§5).
2. Class-keyed bonuses owned by other systems (talents, sigils, awakening, relics, transcendence).
3. Necromancer minion scaling from player stats (§7).
4. Level gating of other systems (§6).

## §1 Classes and specializations

- `PlayerClass` enum has exactly 4 values: `WARRIOR`, `SENTINEL`, `MYSTIC`, `NECROMANCER`. [CODE] L665454-665464
- Spec to class mapping: [CODE] `talent_trees_v1.json` (extracted from the client talent tables; `class` field per tree) and UI spec lists L2039513-2040151.

| Class | Spec (UI name) | Tree key | Role tag |
|---|---|---|---|
| Warrior | Protection | `WARRIOR_TANK` | TANK |
| Warrior | Arms | `WARRIOR_DPS` | DAMAGE |
| Sentinel | Marksmanship | `SENTINEL_MARKSMANSHIP` | DAMAGE |
| Sentinel | Disruption | `SENTINEL_DISRUPTION` | CONTROL |
| Mystic | Mage (tree named "Arcanum") | `MYSTIC_MAGE` | ARCANE |
| Mystic | Druid (tree named "Wildshape") | `MYSTIC_DRUID` | WILD |
| Necromancer | Deathlord | `NECROMANCER_DEATHLORD` | SUMMONER |
| Necromancer | Doomweaver | `NECROMANCER_DOOMWEAVER` | CURSE |

- Class selection screen: all four classes have `locked: false`. [CODE] L2039513 onward
- Selection-screen ratings (UI only, 1-5), `v` = value, `vMax` = upper value for classes with two paths. [CODE] L2039480-2040400

| Class | Survivability | Damage | Control | Difficulty label |
|---|---|---|---|---|
| Warrior | 5 | 3 | 1 | EASY |
| Sentinel | 2 | 5 | 4 | HARD |
| Mystic | 2 (max 5) | 3 (max 5) | 3 (max 4) | VERY_HARD |
| Necromancer | 2 (max 4) | 4 | 2 (max 4) | UNKNOWN |

- Spec choice is made through the server: `POST /talents` `chooseSpec(specialization, set)`; spec choice happens in the Talents screen. [CODE] L887103-887500 (module 3609). The talent tree unlock level is `UNLOCKS.TALENTS` = 15. [CODE] L668649. For tree contents see `talents.md`.
- New character defaults: `class: WARRIOR`, `level: 1`, `xp: 0`, `skin: 'default'`, `formSkins {bear:'default', wolf:'default'}`. [CODE] L664434-664460
- Referral hint in the create-character UI: "you both get 150 gems when you reach level 21". [CODE] L910982 (UI text, gem amount decided by server)

## §2 Base stats and per-level growth

- Client-side initial `baseStats` of the player slice: `attack 10, hp 100, attackSpeed 1 (BASE_ATTACK_SPEED), critChance 0, critDamage 1.5 (BASE_CRIT_DAMAGE)`. Same for every class. [CODE] L664445-664458, L670527. Using them unchanged reproduced a real server sheet exactly (Warrior L72, `profile-warrior-l72.json`, 35 keys): confirmed on one sample; other classes unchecked.
- The same defaults seed `computedStats` (`totalAttack 10, totalHp 100, totalAttackSpeed 1, totalCritChance 0, totalCritDamage 1.5`). [CODE] L1137820-1137835
- These are placeholders before the server responds, but the same constants are what the server's sheet is built on (confirmed on one real Warrior L72 sample, see stats.md §1). Real values come from server responses (`stats` field copied into `computedStats`, e.g. L670751, L1066392). [CODE]
- Per-class base stats, per-level growth, and the level-up stat formula: **[SERVER]**. The client contains no class-keyed base-stat table and no `perLevel` growth table (searched for `baseHp`, `baseAttack`, `perLevel`, `growth`, `statsForLevel`, `BASE_*` usage). The `LEVEL_UP` event (L665887) is only an event name.
- Consequence for the optimiser: class/level base stats must be measured from the in-game Character screen; they cannot be reconstructed from the client.

## §3 Level cap and XP curve

- `MAX_PLAYER_LEVEL = 100`. [CODE] L670527 (`GAME_CONSTANTS`)
- Oblivion realm uses a separate level axis (`OBLIVION_MAX_LEVEL`) and prestige constants; see `pve-content.md`. [CODE] L1189403-1189710 (selectors)
- XP needed to go from level `L-1` to `L`:

```
xpRequiredForLevel(L):
  if L <= 1: return 0
  base = 100 * L^1.8
  if L <= 7: base *= 0.7
  m = (first match, top to bottom)
      L >= 91 : 34 + (L - 90) * 8.118
      L >= 85 : 34
      L >= 80 : 30
      L >= 75 : 26
      L >= 70 : 22
      L >= 65 : 18
      L >= 60 : 12
      L >= 55 : 10
      L >= 50 : 8
      L >= 40 : 6.5
      L >= 30 : 3.5 + (L - 30) * 0.3
      L >= 28 : 2.2
      L >= 25 : 1.5
      else    : 1
  return floor(base * m)
```
[CODE] L1050354-1050608 (the multiplier ladder is checked from L>=91 downward).

- `levelFromXp(xp)`: total XP is cumulative from level 1; start at level 1, repeatedly spend `xpRequiredForLevel(level+1)` while `cum + need <= xp` and `level < 100`. Returns `{level, currentLevelXp, nextLevelXp, progress}`; at the cap `nextLevelXp = 1`, `progress = 1`. Non-finite or negative xp is treated as 0. [CODE] L1050354-1050608
- Examples [DERIVED] (script `agent-scripts/classes/xp.py`): L2 = 243, L7 = 2,324, L8 = 4,222, L25 = 49,247, L40 = 497,303, L50 = 914,610, L91 = 14,149,537, L100 = 45,853,983. Total XP from 1 to 100 = 504,553,241.
- Full table (levels 2-100): see `data/classes.json`, schema `xpTable[] {level, xpToReach, cumulativeXp}`.
- Hunt XP reward (client formula, probably used for display or offline estimates): `xpRewardForHunt(a) = max(1, 30 + 5*a + (floor(random()*20) - 10))`. [CODE] L1050354-1050608. What `a` is (likely monster level) and whether the live reward uses this: [UNRESOLVED], the awarded XP is applied by the server.
- XP boosters: Mastery skill (`+% XP`, max level 5) is owned by `skills.md`; realm "XP boost" labels exist in the server picker UI (L910982-911110). Values: [SERVER].

## §4 Class passives

- The client defines no class-intrinsic passive table. The class-specific "passive" behaviour comes from (a) which secondary stats the class can roll (§5), (b) spec talent trees (`talents.md`), (c) class-keyed sigil lists (`sigils.md`), and (d) class-keyed Awakening/Relic/Transcendence data (`awakening.md`, `relics.md`, `transcendence.md`, app already uses `character.class` for these).
- Class descriptions from the UI (flavour, not mechanics): Warrior "Unique Damage Reduction & Block Chance"; Sentinel "Unique control: Dodge, Blind & Paralyze"; Mystic Mage "burst damage & magical shields", Druid "beast forms for damage or tanking"; Necromancer "Unique Fear", "Spell Vamp turns every curse into healing". [CODE] L910990-911010
- Necromancer crit tooltip: "Your minions inherit your Critical Damage, but not your Spell Crit chance." [CODE] L911271 (`critMultNecro`)
- Dominion (Necromancer): "Your level of mastery over the dead, starting at 1. Higher Dominion levels unlock stronger forms of your summoning Sigils. It never comes from gear." [CODE] L911271. How Dominion is gained: [SERVER]/[UNRESOLVED].

## §5 Class secondary-stat gating (what gear can roll)

Module 4293, L1213507-1213879.

```
CLASS_UNIQUE_SECONDARY_STATS[class]:
  WARRIOR     : DAMAGE_REDUCTION, BLOCK_CHANCE, DOUBLE_HIT
  SENTINEL    : MISS_CHANCE, BLIND_CHANCE, PARALYZE_CHANCE, DOUBLE_HIT
  MYSTIC      : DAMAGE_REDUCTION, BLOCK_CHANCE, SPELL_CRIT_CHANCE, SPELL_VAMP, DISRUPTION_CHANCE
  NECROMANCER : SPELL_CRIT_CHANCE, SPELL_VAMP, FEAR_CHANCE, MINION_ATTACK, MINION_HEALTH,
                MINION_CRIT_CHANCE, MINION_LIFESTEAL, SOUL_LINK, MINION_ATTACK_SPEED
CLASS_EXCLUDED_SECONDARY_STATS[class]:
  WARRIOR, SENTINEL, MYSTIC : (none)
  NECROMANCER : CRIT_CHANCE, LIFESTEAL, PENETRATION
CONTROL_SECONDARY_STATS = {MISS_CHANCE, BLIND_CHANCE, PARALYZE_CHANCE, DISRUPTION_CHANCE, FEAR_CHANCE}

available(stat, class):          # default class WARRIOR when omitted
  if stat in EXCLUDED[class]: return false
  if stat not in UNION(all UNIQUE lists): return true      # shared stat
  return stat in UNIQUE[class]
```
[CODE] L1213616-1213879. `filterStatDefsForClass`, `filterStatTypesForClass`, `getBannableSecondaryStats` apply `available` to the secondary-stat pool.

- Attunement ban slots: `getMaxExcludedStats(level, class) = effects[max(1, level) - 1] (0 if missing) + CLASS_ATTUNEMENT_BONUS[class]`. [CODE] L885740-885760. Skill text: "Each level grants one ban slot", max level 4, unlock level 19. [CODE] L885992, L668649. `effects` is null in the static definition, so per-level counts are [SERVER]/[UNRESOLVED].
- `CLASS_ATTUNEMENT_BONUS` = Warrior 0, Sentinel 0, Mystic 1, Necromancer 1 (`getClassAttunementBonus(class)` returns 0 when class is falsy or unknown). [CODE] L668410-668430, L668930-668943. Confidence note: the two numeric values are loaded from registers `r7=0` and `r6=1` set at L668636-668640, which the decompiler reuses; no intervening reassignment was found (L668630-668943), but the literal is not shown beside the assignment.
- Double Hit is only rollable by Warrior and Sentinel; Spell Crit and Spell Vamp only by Mystic and Necromancer; Damage Reduction and Block Chance by Warrior and Mystic.

## §6 Level gates tied to progression (not class-specific unless stated)

`UNLOCK_LEVELS` [CODE] L668649: Progress 1, Loot filter 2, Loot bag 4, World 5, Dungeon 5, Pets 6, Skills 8, World map 9, Village raids 10, Events 11, Fortune 12, **Talents 15**, Quests 16, Clash 18, Attunement 19, Vitality 20, Relics 22, Market 22, **Sigils 25 (Warrior, Sentinel)**, **Sigils 17 (Mystic, Necromancer)**, Pet discount 26, Dual equip 28, World boss 30, Mastery 31, Sigil discount 32, Midas/Artisan 33, Crusade 35, Dual talents 38, Arcane quarry 39, Celestial trial 40, Mounts 40, Presets 41, Mining charges 42, Awakening 45, Crusade discount 46, Amplification 50, Mythic crusade 52, Sigil conditions 54, Transcendence 55, Key save 56, Transcendence presets 58, Celestial trial hard 60, Chronoforge 74, Ascension 78. `SKILLS_UNLOCK_GEMS = 80` is a separate constant (name suggests a gem cost; meaning [UNRESOLVED]). Oblivion prestige `UNLOCK_LEVEL = 95` (L669119).
- Class-keyed sigil unlock: `SIGILS_UNLOCK_LEVEL_BY_CLASS` Warrior and Sentinel -> 25, Mystic and Necromancer -> 17 (fallback 25). [CODE] L668915-668929
- Systems that own the feature details: talents (`talents.md`), sigils, relics, mounts, awakening, transcendence, skills.

## §7 Class abilities and forms that affect stats

Sigil spells are the class "abilities". Definitions (cooldowns, coefficients, scaling) belong to `sigils.md`; resolution belongs to `combat-pve.md`. Class-bound pieces found here:

- **Sigil lists are class-keyed**: `SIGILS_BY_CLASS` (app already uses this).
- **Necromancer minion** (built only when `player.class === NECROMANCER`; `buildMinion` L1073238-1073270, `createMinion` L1094500-1094612). With `p` = player combat stats from `computedStats` and `d` = equipped summon sigil config:

```
minion.maxHp   = max(1, floor( p.maxHp  * d.hpPercent     / 100 * (1 + totalMinionHealth / 100) ))
minion.attack  = max(1, floor( p.attack * d.attackPercent / 100 * (1 + totalMinionAttack / 100) ))
minion.attackSpeed = minionAttackSpeed(p.attackSpeed, totalMinionAttackSpeed)
                   = applyCombatCeiling(p.attackSpeed + softCapGainFromSheet(p.attackSpeed, totalMinionAttackSpeed, SOFT_CAPS.MINION_ATTACK_SPEED), COMBAT_CEILINGS.MINION_ATTACK_SPEED)
minion.critChance = totalMinionCritChance;  minion.critDamage = p.critDamage
minion.lifesteal  = totalMinionLifesteal;   minion.soulLink = totalSoulLink
respawnCooldownMs = d.respawnCooldownMs;    summonCastMs = d.summonCastMs
```
[CODE] L1094190-1094612. Swing interval `= round(1000 / x)` ms, where `x = applyCombatCeiling(attackSpeed * (1 + frenzy.attackSpeedPercent/100), COMBAT_CEILINGS.MINION_ATTACK_SPEED)` only when `frenzy.attackSpeedPercent > 0`; with no frenzy or a percent of 0/missing, `x` is raw `attackSpeed` with no ceiling; current attack `= floor(attack * (1 + frenzy.attackPercent/100))`; lifesteal and soul link are ceilinged by `COMBAT_CEILINGS.MINION_LIFESTEAL` / `SOUL_LINK`. [CODE] L1094190-1094420. Ceiling and soft-cap values: see `stats.md`.
- Summon sigil minion percents seen: SKELETON `attackPercent 20..40`, `hpPercent 60..120`, respawn 10000 ms, cast 1500 ms; REAPER `attackPercent 60..120`, `hpPercent 30..60`, same respawn and cast. [CODE] L1070329, L1070442. How the min..max range is interpolated (sigil level): see `sigils.md`.
- Soul Link: part of damage dealt heals the active minion. [CODE] L911271
- **Stack mechanics** (Bulwark, Sunder, Elusive, Momentum) are sigil species with runtime modifiers (`bulwarkModifiers` hp/dr/thorns percent per stack; `sunderModifiers` reductions on target; `elusiveModifiers` attack/crit/lifesteal/attack-speed percent), modules 3956-3958, 3964. They are sigil-owned; see `sigils.md` and `combat-pve.md`. [CODE] L1078983-1080177
- **Druid forms**: Mystic Druid has `bear` and `wolf` forms (`formSkins`), chosen through a Druid utility sigil slot (`druidUtilitySlotSpecies`, `useShapeshiftForm`). The form's stat effect comes from the equipped FORM sigil's spell object `{spellType, form, gearHpMult, attackMult, attackSpeedMult, unlocksBlockAndDr, passiveEffects}` (e.g. the bear: gearHpMult 1.6, attackMult 0.9, unlocksBlockAndDr; `L1070195-1070262`), which `calculateTotalStats` applies as `formConfig` (`stats.md` §3.2); no class-level multiplier exists outside it. [CODE] L664437, L1439831-1440481, L1440482-1440558. Sigil effect values: see `sigils.md`.
- `useActiveSpecialization` reads `specialization` from state; the client uses it for UI branching (Druid, Arcanum board, etc.). [CODE] L2199654-2199722
- Avatar/skin selection (`avatarId`, `selectedAvatarId`, `unlockedAvatarIds`) is cosmetic. [CODE] L664581. Skins do not affect stats (`skinOwnershipKey`, `getSkinsForClass`, L1046561-1047130).

## §8 Discrepancies with the app

The app models all four classes and eight specs. Remaining gaps: no XP curve ([SERVER], §9).

## §9 Unresolved list

- Per-class base stats, per-level growth, level-up stat gains: [SERVER].
- Attunement `effects` array (ban slots per level): static definition has `effects: null`.
- Meaning of the `xpRewardForHunt` argument and its use on the live path.
- How Dominion is acquired and its level cap.
- Class-keyed `getClassAttunementBonus` numeric literals rely on register reuse (§5).
