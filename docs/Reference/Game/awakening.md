# Awakening

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

Awakening is a character-wide, permanent specialisation unlocked at level 45. The player picks one of two paths (Shadow = offence, Radiant = defence). Each Awakening point ("Awaken" action, one per level from 45 to 59, max 15) adds a fixed per-level stat bundle. Bonuses are strictly linear in points and depend on path, class and, for Shadow, specialisation. There is no node tree, no cost currency (other than the gem cost of a reset) and no per-level table. Points spent and path are stored server-side; the client only computes the bonus. Citations are to `decompiled.js`.

## §1 Unlock and points

- Constants `UNLOCK_LEVEL = 45`, `FIRST_POINT_LEVEL = 45`, `MAX_POINT_LEVEL = 59`. **[CODE]** L1222241
- Available points: **[CODE]** L1222198-1222229
  ```
  if playerLevel < 45: 0
  else max(0, min(playerLevel, 59) - 44 - awakeningLevel)
  ```
  So max total = 59-44 = 15 points; the `-44` is `FIRST_POINT_LEVEL - 1`.
- UI text: "You earn 1 Awakening point per level starting at level 45", "You gain 1 Awakening Point per level (up to level 59)", "At level 45 you unlock Awakening ... Choose between two paths". **[CODE]** strtab.txt L14550, L24970, L11738
- Quest "Awakened" (`awaken_path`) completes when `awakeningLevel >= 1`. **[CODE]** L2140593-2140604
- "Awakening level" (`awakeningLevel`/`level`) = number of points spent. **[DERIVED]** from `getAvailableAwakeningPoints(playerLevel, awakeningLevel)` subtracting it.

## §2 Server API

Client service (module 3851) **[CODE]** L934635-934829:
- `GET /awakening` (getInfo)
- `POST /awakening/choose-path` body `{path}` (choosePath)
- `POST /awakening/awaken` no body (spends one point; response includes `newlyCompletedQuests`) L2194250-2194270
- `POST /awakening/reset` (resetPath)

Validation (path choice only once, point availability, level gating) is **[SERVER]**. Client exposes: path enum `SHADOW`/`RADIANT` (L669993-669996), state fields `path`, `level`.
- Choosing a path is described as "permanent"; switching: "You can switch paths for 50 Gems. This resets your Awakening level back to 0." and "This costs {{cost}} Gems and resets your path and all awakening levels." **[CODE]** strtab L24958, L24418. The 50 is in UI text only; the live `{{cost}}` is **[SERVER]**.

## §3 Bonus formula

`calculateAwakeningBonuses(state{path,level}, playerClass = WARRIOR, spec = null)` **[CODE]** L1221780-1221985:
```
if !state.path or state.level <= 0: return zeroed bundle (17 keys, all 0)
per = getAwakeningBonusPerLevel(path, class, spec)
bonus[k] = parseFloat((per[k] * level).toFixed(d))   d = 2 for attackSpeedFlat, else 1
spellResist/spellDamage/spellCritChance/spellVamp: per[k] ?? 0
```
Keys: attackPercent, hpPercent, attackSpeedFlat, critChanceFlat, critDamageFlat, hpRegenFlat, lifestealFlat, damageReductionFlat, blockChanceFlat, penetrationFlat, missChanceFlat, blindChanceFlat, paralyzeChanceFlat, spellResistFlat, spellDamageFlat, spellCritChanceFlat, spellVampFlat. **[CODE]** L1221997

Rounding: result is rounded to 1 decimal (0.01 for attack speed) after multiplying. With the current values this only matters for 0.6/pt Penetration (0.6x15=9.0, exact) and 0.7 Regen. **[DERIVED]**

Per-level lookup `getAwakeningBonusPerLevel` **[CODE]** L1222046-1222121, precedence:
```
spec override (path.specOverrides[spec].bonusPerLevel)   // whole bundle replaces
 else class override (path.classOverrides[class].bonusPerLevel)  // whole bundle replaces
 else path.bonusPerLevel
```
Overrides REPLACE the whole bundle, not merge. Spec is checked before class. **[CODE]**

The bundle feeds the shared stat pipeline as the `awakening` source alongside enchant stones, fortress, transcendence and mounts (L1209917-1209933). How each field is added into final stats (percent vs flat, multiplicative or additive) is owned by `see stats.md`. Awakening values appear to be additive percentage points / flat stat values. **[UNRESOLVED]** (consumer `calculateTotalStats` not read; no field named awakeningBonus found by grep.)

## §4 Per-level values (per point)

All **[CODE]** L1222246-1222304.

Shadow Path (`SHADOW`), highlights Attack / Crit / Penetration:
| Stat | Default (Warrior, Sentinel, Mystic non-Mage) |
|---|---|
| attackPercent | 2 |
| critChanceFlat | 0.5 |
| critDamageFlat | 2 |
| penetrationFlat | 0.6 |

- Spec override `MYSTIC_MAGE` (highlights Spell Damage / Crit Spell / Spell Vamp): critDamageFlat 2, spellDamageFlat 2, spellCritChanceFlat 0.5, spellVampFlat 0.4. No attack%, crit chance or penetration. Applies even though the spec is only Mystic Mage (not Druid).
- Class override `NECROMANCER` (both specs; highlights Attack / Crit Spell / Spell Vamp): attackPercent 2, critDamageFlat 2, spellCritChanceFlat 0.5, spellVampFlat 0.4. No crit chance or penetration.

Radiant Path (`RADIANT`), highlights HP / Regen / Defense:
| Class | hpPercent | hpRegenFlat | damageReductionFlat | blockChanceFlat | missChanceFlat | blindChanceFlat | paralyzeChanceFlat | spellResistFlat |
|---|---|---|---|---|---|---|---|---|
| Warrior (default) | 2.5 | 0.5 | 0.5 | 0.5 | - | - | - | - |
| Sentinel | 2.5 | - | - | - | 1 | 0.5 | 0.2 | - |
| Mystic | 2.5 | 0.7 | - | - | - | - | - | 0.5 |
| Necromancer | 2.5 | 0.7 | - | - | - | - | - | 0.5 |

Sentinel highlights: HP / Evasion / Control; Mystic and Necromancer: HP / Regen / Spell Resist. Radiant has no spec overrides. Radiant default is also used for any class with no override (only Warrior in practice). **[CODE]**

Maximum (15 points) **[DERIVED]**: Shadow default Attack +30%, Crit +7.5, CritDmg +30, Pen +9; Radiant HP +37.5%.

Enums: classes WARRIOR/SENTINEL/MYSTIC/NECROMANCER (L665457-665464); specs WARRIOR_TANK, WARRIOR_DPS, SENTINEL_MARKSMANSHIP, SENTINEL_DISRUPTION, MYSTIC_MAGE, MYSTIC_DRUID, NECROMANCER_DEATHLORD, NECROMANCER_DOOMWEAVER (L665830-665845).

Unit meaning of the `...Flat` keys (percentage points of the named stat vs raw value) is not stated in this module. **[UNRESOLVED]** see stats.md.

## §5 UI behaviour

- Awakening tab under Character > Talents. First visit with no path shows `AwakeningChoiceModal` (onChoose -> `choosePath`). **[CODE]** L2194344-2194362
- The view previews the next point by calling `calculateAwakeningBonuses` with `level + 1` and shows delta vs current. **[CODE]** L2194369-2194377 (`r33 + r13`, r13 presumed 1; **[DERIVED]**)
- Awaken success triggers a quest-complete check and a scale animation. L2194250-2194294

## §6 Static data

Small enough to live here; no JSON file.

## Appendix: modules
3851 (service), 4301 (bonus calc), 4302 (paths, constants, point calc), 3136 (spec enum), plus the AwakeningView component (~L2194110+). Modules 4644, 5420, 6520 are image/animation assets only.
