# Talent Trees

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

Talents are a small per-spec tree of linear-rank passives. The player spends
one point per rank; points come 1-per-level from level 15 to 43 (29 total).
Every talent grants a flat additive stat bonus (some grant two). Two
independent talent sets (A/B) exist once Dual Talents is bought, and only the
**active** set's bonuses feed the character's stats.

Line numbers are `decompiled.js L<n>`. Tags: **[CODE]** read from code,
**[DERIVED]** computed from [CODE], **[SERVER]** decided server-side,
**[UNRESOLVED]** not determined.

Full catalogue (8 specs, 159 talents): `data/talents.json` (schema in §9). Not
duplicated here.

**Contribution to power.** `calculateTalentBonuses` returns a stat-delta
object that the character stat aggregator adds to the other sources (`see
stats.md` for how it is summed and soft-capped). Talents never multiply
anything themselves; they only add to `attackPercent`, `hpPercent`, `*Flat`
stats (§5).

Related: levels and classes `see classes.md`; summing/curves `see stats.md`;
Awakening points are a separate pool `see awakening.md`; gems are spent on
respec/Dual (gem economy `see drops.md`).

---

## §1. Specs and class mapping

Each class has exactly two specs; a character picks one spec per talent set.

**[CODE]** `getSpecsForClass` (module 3971, L1097011-1097091):

| Class | Spec enum | Display name | Spec id prefix |
|---|---|---|---|
| WARRIOR | WARRIOR_TANK | Protection | `tank_` |
| WARRIOR | WARRIOR_DPS | Arms | `dps_` |
| SENTINEL | SENTINEL_MARKSMANSHIP | Marksmanship | `marks_` |
| SENTINEL | SENTINEL_DISRUPTION | Disruption | `disrupt_` |
| MYSTIC | MYSTIC_MAGE | Arcanum | `mage_` |
| MYSTIC | MYSTIC_DRUID | Wildshape | `druid_` |
| NECROMANCER | NECROMANCER_DEATHLORD | Deathlord | `death_` |
| NECROMANCER | NECROMANCER_DOOMWEAVER | Doomweaver | `doom_` |

Spec enum strings are the literal names (L665830-665850). Display names and
descriptions: `data/talents.json` (`specs.<SPEC>.name`), L1096870 block, spec
header literals L1097434-1097909. `getActiveSpecialization(setIndex, specA,
specB)` returns the stored spec only if it is a valid enum value, else `null`
(L1096623-1096661). **[CODE]**

UI-only: the screen colours each spec (`pathColor`) and shows three highlight
words (`specHighlights`, L1184810-1184880), e.g. Protection "Defense /
Vitality / Regen", Arms "Power / Crits / Speed", Marksmanship "Power / Crits /
Lifesteal", Disruption "Blind / Evasion / Control", Arcanum "Arcane / Burst /
Shields", Wildshape "Forms / Fury / Guard", Deathlord "Minions / Vitality /
Crits", Doomweaver "Curses / Fear / Spell Crits". **[CODE]** Cosmetic only.

## §2. Constants

**[CODE]** `TALENT_CONSTANTS` and `DUAL_TALENTS_CONSTANTS`, L1097092-1097104;
`UNLOCK_LEVELS` table L668649.

| Constant | Value | Notes |
|---|---|---|
| `UNLOCK_LEVELS.TALENTS` (= `UNLOCK_LEVEL`) | 15 | talents screen/points start |
| `FIRST_TALENT_LEVEL` | 15 | first level that grants a point |
| `LAST_TALENT_LEVEL` | 43 | last level that grants a point |
| `TOTAL_TALENT_POINTS` | 29 | **[DERIVED]** = 43 - 15 + 1 |
| `MAX_ALLOCATABLE_POINTS` | 31 | defined but **never referenced** anywhere else in the bundle (grep) |
| `TIER_THRESHOLDS` | [0, 5, 10, 15, 20, 25] | points that must already be spent to unlock tier 1..6 |
| `RESPEC_COST` | 10 | gems, per set |
| `UNLOCK_LEVELS.DUAL_TALENTS` | 38 | |
| Dual `COST_GEMS` | 200 | gems, one-time |

`TOTAL_TALENT_POINTS` (29) is not used by `getAvailableTalentPoints`; the
cap emerges from the level clamp (§3). **[CODE]**

## §3. Points per level

**[CODE]** `getAvailableTalentPoints(level, spent)`, L1096580-1096620:

```
if level < 15: return 0
earned = min(level, 43) - (15 - 1)        # 1 at lvl15 ... 29 at lvl43+
return max(0, earned - spent)
```

One point per character level 15..43, nothing after 43. **[DERIVED]** from the
above. The same pool is reused by the tab badge, which adds
`getAvailableAwakeningPoints` (L1180020-1180060): the badge number is
talent-points-available plus awakening-points-available, but they are separate
pools (`see awakening.md`).

`spent` is the **per-set** `talentPointsSpent` (`talentSets[activeTalentSet]`,
L1180010-1180020): each of Set A/B has its own spent counter, but the level
allowance is the same for both, so each set can independently use all 29
points. **[CODE]** (UI reads `talentSets[set].talentPointsSpent`; the server's
`availablePoints` field overrides it after each response, see §7.)

## §4. Allocation rules

**[CODE]** `canAllocateTalent(talentId, spec, allocation, spent, level)`,
L1096762-1096860. A point may be spent iff all hold:

```
getAvailableTalentPoints(level, spent) > 0
talent exists in spec's tree (found by id across tiers)
(allocation[talentId] ?? 0) < talent.maxRank
spent >= tier.pointsRequired         # total points spent in the WHOLE set, not per-tier
```

- Cost is always **1 point per rank**; there is no rank-dependent cost.
- Tier gating counts all points already spent in the set (including points in
  higher/same tier), threshold = `TIER_THRESHOLDS[tier-1]` = tier's
  `pointsRequired`. The UI (L2188990-2189010) computes `tierLocked = spent <
  threshold` and `pointsNeeded = max(<local floor>, threshold - spent)` (floor value held in a closure slot, not resolved) for the "N MORE
  NEEDED" label (`talents.moreNeeded`).
- There are **no prerequisite links** between talents inside a tier or across
  tiers: any talent in an unlocked tier can be bought in any order. **[CODE]**
  (no parent/requires field in any talent literal.)
- Points cannot be refunded individually; only a full set respec (§6).
- Because 29 points < sum of maxRank (48-74, see §5 table), the player must
  choose. Tier 6 needs 25 points spent, so it is reachable with 4 spare.
  **[DERIVED]**

## §5. Talent effects and magnitudes

**[CODE]** each talent literal: `{id, name, description, icon, tier, maxRank,
bonusPerRank: {stat, valuePerRank}, secondaryBonusPerRank?: {stat,
valuePerRank}}`, tree literals L1097106-1097925 region (spec headers at L1097434-1097909) (per-talent line in
`data/talents.json`).

```
calculateTalentBonuses(spec, allocation):          # L1096663-1096759
  out = copy of zeroed stat object (26 keys, L1096863)
  for tier in tree.tiers: for t in tier.talents:
     r = allocation[t.id] ?? 0
     if r > 0:
        out[t.bonusPerRank.stat] += t.bonusPerRank.valuePerRank * r
        if t.secondaryBonusPerRank:
           out[t.secondaryBonusPerRank.stat] += t.secondaryBonusPerRank.valuePerRank * r
  return out
```

So a talent at rank r gives `valuePerRank * r`: strictly **linear**, no
per-rank table. **[CODE]** The returned object keys (all start at 0) are:
`attackPercent, hpPercent, attackSpeedFlat, critChanceFlat, critDamageFlat,
hpRegenFlat, lifestealFlat, damageReductionFlat, blockChanceFlat,
missChanceFlat, blindChanceFlat, paralyzeChanceFlat, penetrationFlat,
spellDamageFlat, spellVampFlat, spellCritChanceFlat, disruptionChanceFlat,
spellResistFlat, fearChanceFlat, minionAttackPercent, minionHealthPercent,
minionCritChanceFlat, minionLifestealFlat, soulLinkFlat,
minionAttackSpeedFlat, dominionFlat`. `penetrationFlat`,
`minionAttackSpeedFlat` and `dominionFlat` are not granted by any tree in 2.7.0
(**[DERIVED]**: not present in any literal).

**Units.** `valuePerRank` is in percentage points for every stat **except**
`attackSpeedFlat` / `minionAttackSpeedFlat`, which are fractions: 0.02 means
2%. The talent UI formatter `formatTalentValue` (L1184625-1184680) renders
those two as `(v*100).toFixed(0)` and every other stat as the integer string or
`toFixed(1)`. **[CODE]** Consequence: `Combat Frenzy` etc. at 0.025/rank are
really 2.5 / 5 / 7.5 % but display as "3 / 5 / 8" (JS `toFixed(0)` rounds
half up). Maintainers transcribing from screenshots get rounded values.
**[DERIVED]**

Dual-stat talents (the only two per spec, both at tier 6): the displayed text
is `"<v1>% + <v2>"` via `formatTalentRankValue` (L1184884-1184916). **[CODE]**

| Talent (tier 6) | Primary / rank | Secondary / rank | maxRank |
|---|---|---|---|
| Heart of the Great Bear (Wildshape) | hpPercent 3 | damageReductionFlat 1 | 3 |
| Fury of the Dire Wolf (Wildshape) | attackPercent 3 | attackSpeedFlat 0.02 (=2%) | 3 |
| Demonic Supremacy (Deathlord) | minionAttackPercent 4 | minionCritChanceFlat 1 | 3 |
| Undying Bulwark (Deathlord) | minionHealthPercent 4 | minionLifestealFlat 0.5 | 3 |

### Tree shape per spec

**[CODE]** 6 tiers each; thresholds 0/5/10/15/20/25. **[DERIVED]** counts and
the "all ranks maxed" stat totals (sum of valuePerRank x maxRank) from
`data/talents.json`:

| Spec | Talents | Sum maxRank | Max-everything totals (unreachable; 29 points only) |
|---|---|---|---|
| Protection | 14 | 50 | hp% 35, dmgRed 15, regen 7, block 15, lifesteal 4.5, atk% 9 |
| Arms | 14 | 50 | atk% 62, atkSpd 22.5%, crit 13.5, critDmg 74, lifesteal 1.5 |
| Marksmanship | 14 | 48 | atk% 40, lifesteal 9, atkSpd 30%, crit 10.5, critDmg 50 |
| Disruption | 15 | 55 | miss 25.5, blind 8.4, paralyze 3.9, atkSpd 13.5%, atk% 25, lifesteal 1.5 |
| Arcanum | 17 | 59 | atk% 37, spellDmg 70, spellVamp 15, spellCrit 21, critDmg 65, disruption 3.9 |
| Wildshape | 22 | 74 | hp% 46, dmgRed 12, atk% 34, atkSpd 19.5%, block 24, regen 4.5, crit 10.5, lifesteal 4.5, critDmg 54 |
| Deathlord | 19 | 73 | minionAtk% 57, minionHp% 57, atk% 6, minionCrit 13.5, minionLifesteal 6, soulLink 4.5, hp% 25, critDmg 54 |
| Doomweaver | 18 | 62 | atk% 25, spellDmg 70, spellVamp 9, spellCrit 21, critDmg 65, fear 5.7, spellResist 9 |

Talents per tier (T1..T6): Protection 3/3/3/2/2/1; Arms 3/3/3/2/2/1;
Marksmanship 3/3/3/2/2/1; Disruption 3/3/3/3/2/1; Arcanum 3/4/3/3/3/1;
Wildshape 4/4/4/4/4/2; Deathlord 3/4/3/4/3/2; Doomweaver 3/4/3/3/3/2. **[CODE]**

Stat-key meanings and how they enter combat (`see stats.md`, `see
combat-pve.md`, `see combat-pvp.md`). Notable: spell stats (`spellDamageFlat`,
`spellVampFlat`, `spellCritChanceFlat`) scale Sigil spells (description text:
"Heal for X% of your Sigil spell damage", "Increases Crit Spell chance"; see
`sigils.md`); minion stats apply to the Necromancer's summons (`see
classes.md`); `soulLinkFlat`, `fearChanceFlat`, `disruptionChanceFlat`
mechanics `see combat-pve.md` / `combat-pvp.md`. **[CODE]** for the text,
mechanics owned elsewhere.

## §6. Respec, Dual Talents, activation

**Respec.** **[CODE]** `handleReset` (L2189803-2189900): requires `gems >=
RESPEC_COST (10)`, else shows "You need {cost} Gems to reset your talents".
Confirmation text: "This resets Set {set}: all its talent points and its path.
You will choose a new path for this set." So respec costs **10 gems per set**,
refunds all points of that set and clears the chosen spec (player re-chooses a
spec, which may be from the same class only). Executed via API
`POST /talents/respec` with `{set}` (module 3609). Spec choice is only offered
when the set has no spec (`ChoosePathSection`, L2188323). **[CODE]**

**Dual Talents.** **[CODE]** `handleBuyDual` (L2189305-2189385): requires
level >= 38 (the UI shows "UNLOCKS AT LEVEL {level}" below it) and gems >= 200
(`COST_GEMS`); confirm text: "Unlock a second talent loadout (Set B)? Each set
has its own path and talent points. Activate whichever build you want live in
battle." `POST /talents/buy-dual`. Each set has its own spec and own
allocation; sets can use different specs. A Set B can only exist after
`dualTalentsUnlocked`; before that `viewedTalentSet` is forced to 1
(L1065541-1065600).

**Activation.** **[CODE]** `handleActivate` -> `enqueueActivate(set)`
(`POST /talents/activate`). The state slice carries `activeTalentSet` (1|2,
default 1) and `viewedTalentSet` (UI tab). Stats are computed from
`talentSets[activeTalentSet]` (StatsList, L1209640-1209850 calls
`calculateTalentBonuses(set.specialization, set.allocation)`), so switching
the active set swaps the whole talent contribution. Activation of a set has no
listed cost or cooldown in client code. **[CODE]** for "no cost in client";
whether the server rate-limits it is **[UNRESOLVED]**.

Talent set is independent of equipment set: separate `activeEquipmentSet` and
`activeTalentSet` fields (L1167815-1167817). **[CODE]**

## §7. Client/server split

**[CODE]** Module 3609 (L887103-887500) wraps `GET /talents` (info),
`POST /talents/choose-spec {specialization,set}`, `POST /talents/allocate
{talentId,set}`, `POST /talents/respec {set}`, `POST /talents/buy-dual`,
`POST /talents/activate {set}`. Module 3948 (L1065405-1065752) is the store
slice: `talentSets: {1,2}: {specialization, allocation, talentPointsSpent}`,
`pendingTalentPoints` (optimistic per-set `{talentId: n}`, `consumeOne` /
`addPendingTalentPoint` decrement-increment), `dualTalentsUnlocked`,
`talentsUnlocked`, `availableTalentPoints`, `talentError`.

- **[SERVER]** The authoritative spent counter, available points and
  allocation. `applyTalentResult` overwrites local state from the response
  (`availablePoints`, `gems`, `stats` -> `computedStats`). The client runs the
  same rules (`canAllocateTalent`) only to enable/disable the button and show
  errors ("Could not spend the talent point. Try again.").
- `talentsUnlocked` is derived client-side: true if the response says so or
  either set has a specialization (L1065660-1065700). **[CODE]**
- Whether the server enforces `level >= 15`, the 29 cap, or tier thresholds
  identically is **[UNRESOLVED]** (server code not in the bundle); the client
  functions are the only evidence.
- `computedStats` returned by the server may differ from client-side
  `calculateTalentBonuses` if the server uses a different table;
  **[UNRESOLVED]** (no server data). The client table is what the UI previews.

## §8. Comparison with the app (`src/lib/talentTreeData.js`, `talentLean.js`)

See §10 of the report summary; discrepancies, by area:

1. **Only 4 of 8 specs modelled.** App `SPECS_BY_CLASS`
   (`constants.js`) lists Warrior and Sentinel only. Mystic (Arcanum,
   Wildshape) and Necromancer (Deathlord, Doomweaver) trees exist in the game
   (L1096870+ blocks).
2. **Attack-speed values rounded.** App stores `speed` ranks `[3,5,8]` for
   every 0.025/rank talent (Combat Frenzy, Rapid Nocking, Flurry Shot, Rapid
   Disruption). True values are 2.5 / 5 / 7.5 (§5). The other 0.02 and 0.03
   talents match exactly.
3. **Everything else in the 4 existing specs matches** (ids, names, tiers,
   thresholds, maxRanks, stat mappings, values), verified by script.
4. **No secondary stats.** App `Talent` has one `statKey` + `ranks[]`; the game
   has `secondaryBonusPerRank` on 4 tier-6 talents (Mystic/Necromancer only,
   so not yet reachable in the app).
5. **New stat keys needed**: spell damage/vamp/crit, disruption, fear, minion
   attack/health/crit/lifesteal, soul link (Mystic/Necromancer trees).
6. **Dual Talents** (level 38, 200 gems, Set A/B, active set) and respec cost
   (10 gems) are not modelled as costs; app only has two sets with a
   `TALENT_TOTAL_POINTS = 29` cap, which matches. The cap also applies
   **per set**, not per character.
7. `talentLean.js` classifies by stat key. Game tree does not tag offence vs
   defence either (no such field); lifesteal/regen/block placement is an app
   choice. Deathlord/Doomweaver would need new keys classified.
8. App ids differ in prefix (`arms_`/`protection_` vs game `dps_`/`tank_`);
   suffixes are identical, so a mapping table is trivial. Game stores spec as
   enum `WARRIOR_DPS`/`WARRIOR_TANK`, app as `arms`/`protection`.

## §9. Data file schema

`data/talents.json` **[CODE]**-derived (verified by re-parsing the literals
against the earlier `talent_trees_v1.json`: identical for all 8 specs):

```
{ source, constants{...}, valueUnits,
  specs: { <SPEC_ENUM>: { class, name, description,
     tiers: [ { tier, pointsRequired, line,
        talents: [ { id, name, description, maxRank,
           bonusPerRank{stat, valuePerRank},
           secondaryBonusPerRank?{stat, valuePerRank}, line } ] } ] } } }
```

`description` contains `{value}` (and `{value2}` for dual-stat talents), which
the UI fills with `formatTalentValue(stat, valuePerRank*rank)`.

## §10. Unresolved

- Server enforcement of allocation/respec rules and the real `computedStats`
  composition (§7).
- Whether talent bonuses are subject to the same soft-cap curves as other
  sources: the stat aggregator (`see stats.md`) owns that.
- Any in-game rank-by-rank displayed value other than `valuePerRank * r`
  (none found; the UI only calls `formatTalentRankValue`).
