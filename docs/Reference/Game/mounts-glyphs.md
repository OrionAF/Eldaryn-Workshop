# Mounts and glyphs

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

Tags: **[CODE]** read from client code (`decompiled.js L<n>`), **[DERIVED]** computed from CODE values, **[SERVER]** decided server-side, **[UNRESOLVED]** not determined. All line numbers refer to `decompiled.js`. The full catalogue is in `data/mounts-glyphs.json` (schema in §14).

## §1 Overview and contribution to character power

- A character owns **mount instances** (`ownedMounts`), one is **active** (`activeMountId`). Each instance has a rolled `baseHp`, `baseAtk` (both in **percent points**), a `level` (1..5), `xp`, and a socket board `glyphs = {minor[3], major[2], mythic[1]}` of glyph ids. [CODE L1071356-1071632 mapMount; L1072667 sockets]
- **Stat contribution**: only the **active** mount counts. It adds `attackPercent += effAtk` and `hpPercent += effHp` (see §5), plus every **minor** glyph socketed on it adds one random secondary stat (§9). [CODE L1224937-1225023]
- **Major glyphs** give no stat. They retune one parameter of one sigil spell (cooldown, damage %, thorns, paralyze, bleed stacks, ...) and only act when that sigil is equipped and the glyph is on the active mount (§10). [CODE L1080717-1080870, L1080871-1081190]
- **Mythic glyphs** (2 in the catalogue) have only descriptive text; no code applying them was found (§11).
- Mounts also cut **world-map travel time** by a rarity-based percentage (§6). This does not affect combat.
- Mounts unlock at **character level 40** (`UNLOCK_LEVELS.MOUNTS = 40`). [CODE L668649]

## §2 State shape (client)

| Field | Meaning | Tag |
|---|---|---|
| `mountState.ownedMounts[]` | `{id (uuid), species, rarity, baseHp, baseAtk, level, xp, glyphs, createdAt}` | [CODE L1071356-1071632, L1072449-1072493] |
| `mountState.altar` | `{tier (rarity), tierSummons, totalSummons}`; initial tier Common | [CODE L1072632-1072640] |
| `mountState.activeMountId` | id of ridden mount or null | [CODE] |
| `glyph` (inventory, separate API `/glyphs`) | `{id, glyphType, rarity, sealed, secondary:{stat,quality}}` | [CODE L1224994, L1080838+] |
| `preset.mountId` | each loadout preset snapshots a mount id | [CODE L1144135-1144141]; UI text "Tap a mount to ride it with this preset" |

The client never mutates this: all changes go through `/mounts`, `/mounts/summon`, `/mounts/upgrade-altar`, `/mounts/set-active`, `/mounts/socket-glyph` (mountId, tier, index, glyphId), `/mounts/unsocket-glyph`, `/glyphs`, `/glyphs/unlock`, `/glyphs/transmute`, `/glyphs/reforge` and the response state replaces local state. [CODE L1348901-1349235, L1362041-1362273] Summon, XP award, drops and rolls are therefore [SERVER]; §3/§4/§7 give the client's mirror helpers.

## §3 Mount catalogue and stat roll

13 species, 5 rarities (Common..Legendary). Fields `weight` (summon weight inside a rarity) and `bias`. [CODE L1072669-1072773]

| Species | Rarity | Weight | Bias |
|---|---|---|---|
| Night Wolf | Common | 55 | attack |
| Frostfang Wolf | Common | 45 | hp |
| Crystal Beast | Uncommon | 35 | hp |
| Scorpion Hound | Uncommon | 35 | attack |
| Thundermaw | Uncommon | 30 | balanced |
| Void Stalker | Rare | 30 | attack |
| Infernal Hellhound | Rare | 30 | attack |
| Abyss Crawler | Rare | 20 | hp |
| Bonecrawler | Rare | 20 | hp |
| Storm Roc | Epic | 50 | attack |
| Crystal Drake | Epic | 50 | hp |
| Celestial Moth | Legendary | 50 | hp |
| Bone Wyvern | Legendary | 50 | attack |

Rarity stat range `RARITY_STAT_RANGE` (percent points, base values at level 1). [CODE L1072841-1072862]
Common [6,11], Uncommon [14,19], Rare [24,29], Epic [34,39], Legendary [44,49].

Roll (client mirror `rollMountStats(rarity, bias)`, `rollRange(a,b)` = uniform integer in [a,b] inclusive) [CODE L1071942-1072034, L1072956-1072970]:
```
[lo,hi] = RARITY_STAT_RANGE[rarity]
lowLo = round(lo*0.7); lowHi = round(hi*0.7)         # JS Math.round
mid   = round((lo+hi)/2);  lowMid = round((lowLo+lowHi)/2)
bias 'attack':   baseHp = rollRange(lo, mid);  baseAtk = rollRange(lowMid, lowHi)
bias 'hp':       baseHp = rollRange(mid, hi);  baseAtk = rollRange(lowLo, lowMid)
bias 'balanced': baseHp = rollRange(lo, hi);   baseAtk = rollRange(lowLo, lowHi)
```
[DERIVED] Level-1 envelopes for all 13 species are in the JSON (`level1Roll`). They reproduce every star-1 HP/ATK range in the app's `mountsData.js` (e.g. Night Wolf hp [6,9], atk [6,8]; Thundermaw hp [14,19], atk [10,13]), which strongly confirms the formula. Whether the real server uses exactly this roll is [SERVER]; the client never calls `generateMount`/`rollMountStats` (no call sites found), so treat the match as evidence, not proof.

## §4 Level and XP

- `MOUNT_MAX_LEVEL = 5` [CODE L1072863]; `MOUNT_LEVEL_STAT_BONUS = 0.1` [CODE L1072865].
- XP needed to leave level L: `[4, 30, 100, 300][L-1]` for L = 1..4; level 5 is max (Infinity). [CODE L1072867, L1072036-1072059]
- Duplicate mount XP: `mountDuplicateXp() = 1` for any input. [CODE L1072517-1072521]
- `applyMountXp(level, xp, gain)` carries overflow across levels and zeroes xp at level 5. [CODE L1072581-1072631]
- What grants XP (duplicate summons?) is [SERVER]; the helper name suggests a duplicate summon gives +1 XP but that is inference [UNRESOLVED].

The app's "star" (1..5) is this level. [DERIVED] The app's star-2/3 envelopes equal `round(base * (1 + 0.1*(L-1)))` (e.g. Storm Roc star3 hp [43,44] lies inside [41,44] from base [34,37]).

## §5 Stat contribution formula

```
factor   = 1 + 0.1 * (level - 1)                      # L1072522-1072546
effHp    = round(baseHp  * factor)                    # percent points
effAtk   = round(baseAtk * factor)
bonuses.hpPercent     += effHp                        # active mount only
bonuses.attackPercent += effAtk                       # L1224937-1224960
```
[CODE L1072522-1072546, L1224876-1225023]. Level 5 = x1.4. The result is a flat percent addition into the character totals: in `calculateTotalStats` the mount bundle's `attackPercent` is added to the attack-percent accumulator, and `hpPercent` and `healthPercent` are both added to the same HP-percent accumulator [CODE L1215735, L1216797-1216808]. How those percent pools combine with other sources is owned by `see stats.md`.

If no mount is active (or `activeMountId` unresolved) the bundle is all zeros (`EMPTY_MOUNT_BONUSES`, 27 keys). [CODE L1225037]

## §6 Mount speed and travel time

- `MOUNT_SPEED_PCT` by rarity: Common 40, Uncommon 60, Rare 100, Epic 220, Legendary 400 (percent). `MOUNT_SPEED_ON_FOOT_PCT = 0`. [CODE L1072776-1072797 (keys are written in rarity order, decompiler lost key names), L1072238] Species within a rarity are identical; level does not matter. [CODE L1072252-1072303 playerMountSpeedPct reads active mount rarity]
- Travel: `speedFactor(pct) = 1 + max(0,pct)/100`; `seconds = round(baseMinutes*60 / speedFactor)`. [CODE L1919031-1919072]
- `baseMinutes(a,b)`: if different zones, sum of `ZONE_LEG_MINUTES[i]` for `i` from `min(zoneIdx)` to `max-1` with `[180,360,480,600,720]`; if same zone, `INTRA_ZONE[zoneId]` = ironhold_outpost 120, verdant_necropolis 150, wardens_hollow 180, frostmaw_crypt 210, infernal_summit 240, divine_gate 270. Zone order: those six ids. [CODE L1918980-1919030, L1919143-1919145, L1056505]
- Example [DERIVED]: Legendary mount, ironhold intra-zone: 120*60/5 = 1440 s = 24 min.

## §7 Summoning altar

- Unlocks with mounts (level 40); currency Celestial Dust from the Celestial Trial. [CODE L668801; UI text strtab "The Summoning Altar is open!..."]
- `ALTAR_TIERS` = Common..Legendary; `ALTAR_MAX_LEVEL = 10`. [CODE L1072797-1072816]
- Tier config: `{dust, legendaryDust, mythicDust, summonsToMax}`. [CODE L1072817-1072838]

| Altar tier | Celestial dust | Legendary dust | Mythic dust | summonsToMax |
|---|---|---|---|---|
| Common | 1 | 0 | 0 | 20 |
| Uncommon | 4 | 0 | 0 | 30 |
| Rare | 10 | 0 | 0 | 50 |
| Epic | 20 | 3 | 0 | 60 |
| Legendary | 35 | 6 | 6 | 80 |

- Per-level requirement: `altarSummonsRequired(tier, level) = level >= 10 ? Infinity : max(1, round(summonsToMax/9))` -> Common 2, Uncommon 3, Rare 6, Epic 7, Legendary 9 summons per level. [CODE L1071769-1071797] [DERIVED] values.
- `getAltarProgress(tier, tierSummons)` starts at level 1 and subtracts requirements until summons run out. `canUpgradeAltar` needs altar level 10 and a next tier. [CODE L1071799-1071849, L1072369-1072392]
- Success chance: `clamp(0.6 + bonus, 0, 1)` with `SUMMON_BASE_SUCCESS = 0.6`. [CODE L1072404-1072433; base 0.6 at L1072839] The merchant skill "Summoner's Pact" lists effects `[60,70,80,90,100]` (% summon success, max level 5, costs [100,200,400,700]); at max "every summon succeeds". [CODE L885974-885985] `see skills.md`. A failed summon still raises the altar (UI string "The altar still grew stronger. Try again.").
- Summon rolls species by weights among the altar tier's rarity (`rollMountSpecies`). The summon itself is [SERVER]. Upgrading the tier is server-side; whether it wipes mounts is [UNRESOLVED] (the pet altar does wipe, see `pets.md`).

## §8 Glyph architecture

- Tiers: `MINOR`, `MAJOR`, `MYTHIC`. Sockets per mount: **3 minor, 2 major, 1 mythic** (`MOUNT_GLYPH_SOCKETS`). [CODE L1072667] Sockets are on the mount instance (`mount.glyphs`), so glyph effects follow the ridden mount. Inventory is a separate pool; a socketed glyph must be unlocked (not sealed).
- **The same glyph instance may be socketed on several mounts at once.** Evidence **[DERIVED]**: on the real server profile `src/lib/__fixtures__/real/profile-warrior-l72.json` the glyph `8b414c47-17f7-4d73-b5ce-2a103b2320f1` (Block Chance) sits in the minor sockets of three mounts including the ridden one, and the server's `computedStats` (all 35 keys) is reproduced exactly only when the ridden mount counts it (golden test `src/lib/__fixtures__/real/real.test.js`). The client enforces nothing: `socketGlyph`/`unsocketGlyph` only POST `{mountId, tier, index, glyphId}` to `/mounts/socket-glyph` and `/mounts/unsocket-glyph` (L1349051-1349210, caller L1347887), so the rule is **[SERVER]**. Whether one mount may hold the same glyph in two of its own sockets is **[UNRESOLVED]**; the app allows it once per mount.
- Rarity ladder for minor/major/mythic glyphs: Common, Uncommon, Rare, Epic, Legendary, Mythic (`GLYPH_RARITY_LADDER`). Highest rarity reachable by transmute: minor Mythic, major Legendary, mythic-tier Legendary. [CODE L1225044-1226109; slot10/15]
- **Sealed**: new glyphs drop sealed (`sealed: true`). "Tap any glyph to unlock it and roll its secondary stat." (`POST /glyphs/unlock`, `glyphIds`.) Sealed glyphs do nothing. [CODE L1224994, L1080838+ filter `sealed === false`; strtab]
- Catalogue (`GLYPH_CATALOG`): 12 minor types + 42 major types (generated from the sigil modifier tables, §10) + 2 mythic types. [CODE L1225044-1226109] Minor types have a fixed rarity; major and mythic types have `rarity: null` (rarity is per instance). `getGlyphTypes(tier, rarity, class)`: tier must match; for non-major, rarity must match if given; for major, class must match `sigilMod.playerClass` if given. [CODE L1225076-1225130]
- Minor types (id, name, rarity): g-swift Swift Edge C, g-quick Quickstep C, g-keen Keen Eye U, g-spark Spark U, g-tough Tough Hide R, g-riven Riven Fang R, g-storm Stormcall E, g-vital Vital Surge E, g-tempest Tempest Fang L, g-bulwark Bulwark Heart L, g-cataclysm Cataclysm Edge Mythic, g-aegis Eternal Aegis Mythic. The type name carries no stat; the stat is rolled at unlock (§9). [CODE L1225900-1225960]

## §9 Minor glyph secondary stat

`rollGlyphSecondary(rarity, class)` runs at unlock (server-side authoritative; client mirrors): [CODE L1225362-1225470]
```
pool    = filterStatDefsForClass(SECONDARY_STAT_POOL, class)   # see stats.md; default class WARRIOR
stat    = pool[floor(random()*pool.length)]                    # uniform; weightExponent and minRarity NOT used here
band    = QUALITY_BAND[rarity]                                  # fallback Common
quality = clamp(band[0] + random()*(band[1]-band[0]), 0, 1)
```
`getGlyphSecondaryValue({stat,quality})` [CODE L1225432-1225546]:
```
value = parseFloat( (minValue + (maxValue-minValue)*quality).toFixed(decimals) )
```
Quality bands [CODE L1225980-1226017]: Common [0.1,0.2], Uncommon [0.2,0.35], Rare [0.35,0.6], Epic [0.6,0.8], Legendary [0.8,1], Mythic and above [1,1] (always max).

Only MINOR glyphs roll a secondary (`glyphRollsSecondary(tier) = tier === MINOR`). [CODE L1225050-1225060] The lookup matches `SECONDARY_STAT_POOL` entries on the `SecondaryStatType` enum name (`type === secondary.stat`, L1225432-1225546). Applied to the active mount bundle by adding `value` to the stat's key (`applyGlyphSecondary`, 27 keys: attackSpeed, doubleHit, critChance, critDamage, hpRegen, lifesteal, healthPercent, attackPercent, damageReduction, blockChance, missChance, blindChance, paralyzeChance, penetration, spellDamage, spellResist, spellCritChance, spellVamp, disruptionChance, fearChance, minionAttack, minionHealth, minionCritChance, minionLifesteal, soulLink, minionAttackSpeed). [CODE L1224588-1224875] Note `ATTACK_PERCENT`/`HEALTH_PERCENT` secondary go into `attackPercent`/`healthPercent`; mount base goes into `attackPercent`/`hpPercent` (both reach the same totals, §5).

Which glyph counts: ids from `getSocketedGlyphIds(normalizeMountSockets(mount.glyphs))` of the **active** mount (mythic + major + minor), glyph found in inventory, `!sealed`, has `secondary`. [CODE L1224960-1225023]

Secondary pool ranges (`minValue`-`maxValue`, decimals) are in the JSON `glyphSecondaryPool` (26 stats, all `minRarity` RARE which glyphs ignore). Units follow stats.md. Examples: ATTACK_PERCENT 1.8-14, HEALTH_PERCENT 2-15, CRIT_CHANCE 0.6-5, ATTACK_SPEED 0.03-0.2 (2 dp), LIFESTEAL 1-8. [CODE L677317-678505] Class eligibility (`CLASS_UNIQUE_SECONDARY_STATS`, module 4293 L1213507-1213879): Warrior-only DAMAGE_REDUCTION/BLOCK_CHANCE/DOUBLE_HIT etc.; exact per-class lists live in `see stats.md`; I did not fully decode the second restriction set [UNRESOLVED].

## §10 Major glyphs (sigil modifiers)

Each major type is a `SigilGlyphModifier`: `{id sg-*, name, playerClass, requiredSpec?, sigil (SigilSpecies), effect:{kind, <field>:[5 values]}}`. The 5-value arrays are indexed by the glyph's rarity index (Common 0 .. Legendary 4); values are **deltas/absolutes as per kind**, not absolute totals. [CODE L1083900-1084786]

Counts: Warrior 12, Sentinel 13, Mystic 17 (10 `MYSTIC_MAGE`, 7 `MYSTIC_DRUID`, gated by `requiredSpec`; the `requiredSpec` assignments are at L1084461-1084738), Necromancer 0. Full list in the JSON (`majorGlyphModifiers`). [CODE L1084092-1084733; Necromancer array empty L1084751]

Effect kinds and application (`applySigilGlyphMods`, mods applied per equipped sigil spell via `spell.species`; sigil not equipped => no effect): [CODE L1080871-1081190]

| Kind | Fields (per rarity) | Effect on the sigil spell |
|---|---|---|
| COOLDOWN | cooldownSeconds | `cooldownMs = max(1000, cooldownMs - delta*1000)` (`MIN_SIGIL_COOLDOWN_MS = 1000` L1081205-1081239) |
| DAMAGE | damagePercent | on damage spells: attackPercent, maxAttackPercent, baseDamage, damagePerTick each x(1 + p/100), rounded |
| THORNS | thornsPercent | Iron Bastion thorns % (read via `ironBastionThornsPercent`) |
| PARALYZE | paralyzeSeconds | adds ms to `paralyzeMs` on DEBUFF/DAMAGE spells |
| PARALYZE_EXTEND | paralyzeSeconds | Thunderbind paralyze duration extension; accumulates into the same `paralyzeMs` field as PARALYZE |
| BLEED_BOOST | maxStacksBonus, stackDamagePercent | debuff `maxStacks = (maxStacks ?? 1) + bonus`; `damagePerTickPercent` and `maxDamagePerTickPercent` x(1 + p/100), rounded |
| BULWARK_THORNS | thornsPerStackPercent, maxStacksBonus | Bulwark of Thorns thorns per stack and stack cap |
| SUNDER_DECAY | decayPerSecond | **absolute** new decay rate (Sunder Mark, Siegebreaker Mark); min is taken |
| ATTACK_SPEED_BUFF | attackSpeedPercent | adds an ATTACK_SPEED effect (+p/100) to BUFF spells |
| POISON_STACK | maxStacks | **absolute** permanent poison stack ceiling (Venom Wound); max is taken |
| ELUSIVE_BUFF | attackSpeedPerStackPercent, attackPerStackPercent, burnPerHitOverride | Elusive Supremacy per-stack bonuses; stack loss per hit forced to 1 at Epic and Legendary |
| SHIELD_POWER | shieldPowerPercent | shield power bonus (Void Aegis); `applySigilGlyphMods` only accumulates it as `shieldPowerPercent`, the shield builder consumes it (§6 of sigils.md) |
| CC_EXTEND | ccSeconds | adds ms to existing `paralyzeMs` and `fearMs` (only if already > 0) |

Resolution (`resolveSigilGlyphMods`, `getActiveMajorGlyphs`) [CODE L1083530-1084000, L1080717-1080838]:
1. Take the active mount's `major` socket ids; map to inventory glyphs; keep `tier === MAJOR` and `sealed === false`.
2. Deduplicate by `glyphType`, keeping the **highest rarity** instance (two copies of one type do not stack).
3. Keep entries whose `playerClass` equals the player's class and whose `requiredSpec` is null or equals the active spec.
4. Accumulate per sigil species: cooldown, damage %, thorns, paralyze, bleed fields **add**; decay takes the **min**; poison stacks take the **max**; elusive burn override takes the min.

[DERIVED] Matches the app's `glyphsData.js` for the 17 families it has (e.g. Enduring Brand 1.7..1.3 decay; Warhaste Emblem -1 s per rarity; Ironclad Tempo -1.5 s per rarity; Emberhoard Sigil tick +10% per rarity: 40%*(1.10)=44%). Base sigil numbers (base cooldowns, 8-stack base) belong to `see sigils.md`.

## §11 Mythic glyphs

Two catalogue entries, `rarity: null`, tier MYTHIC, one socket per mount: g-wrath "Celestial Wrath" (+25% Crit Damage, rising to +40% against targets below 30% HP) and g-astral "Astral Bond" (+20% to all of the mount's stats while it is deployed in battle). [CODE L1225965-1225975] Only the descriptive `effect` strings were found; no combat or stat code referencing these ids exists in the bundle, and `glyphRollsSecondary` excludes them. How (or whether) they are applied is [UNRESOLVED] (likely server-side or not yet implemented; the glyph UI also shows a "GLYPH SOCKET: COMING SOON" string).

## §12 Acquiring, transmuting, reforging glyphs

- Source: Celestial Trial drops. Per difficulty `glyphDrops` lists `{tier, chanceAnchors[{level, chances{rarity:p}}]}`; the chance is linearly interpolated between anchors by boss level (`getGlyphRarityChances`). Normal drops MINOR; Hard drops MINOR and MAJOR. [CODE L1157088-1157200, L1160345-1160420] Numeric anchors were obscured by register reuse in the decompile [UNRESOLVED]; `see pve-content.md`. UI: "No sealed glyphs. Clear the Celestial Trial for a chance at one."
- **Transmute (Ascend)** `POST /glyphs/transmute`, `glyphIds`: fuse N unlocked, unsocketed glyphs of the same tier and rarity into one glyph a rarity higher; result type is random among that tier/rarity (`rollGlyphType`). [CODE L1225199-1225237, L1225580-1225610; strtab]
  ```
  cost(rarity, tier) = (nextRarity != null && nextRarity == TOP[tier]) ? FINAL[tier] : 3
  TOP   = {MINOR: Mythic, MAJOR: Legendary, MYTHIC: Legendary}
  FINAL = {MINOR: 5, MAJOR: 4, MYTHIC: 3}
  ```
  So 3 glyphs per step; the last step costs 5 (minor to Mythic), 4 (major to Legendary), 3 (mythic tier to Legendary). Transmute is allowed only if the target rarity is <= TOP and glyph types exist at that rarity. [CODE L1225199-1225237, L1225580-1225610, L1225980-1226015]
- **Rarity weight** (value of a glyph in base glyphs): `weight[r]` is the running product of costs below it. [DERIVED] MINOR: 1,3,9,27,81 (Legendary), 405 (Mythic); MAJOR and MYTHIC tier: 1,3,9,27,108 (major, Legendary) / 81 (mythic tier). [CODE L1225238-1225290]
- **Reforge** `POST /glyphs/reforge`: trade `GLYPH_REFORGE_COST = 2` same-tier/rarity glyphs (3 when the rarity is Legendary or Mythic) for a different glyph type of the same rarity. "No power gained, you are rerolling which effect you get." Allowed when there is more than one type (always for MINOR). [CODE L1225600-1225720; strtab]

## §13 What the app should model (gaps)

See the discrepancy list returned with this extraction. Short form: mount "star" = level 1..5 with `factor = 1+0.1(L-1)`; 13 species (two Legendary missing in app); base rolls derive from bias + rarity range; minor glyphs are `catalogue type + rolled secondary` with quality bands; major catalogue is 42 types over three classes (app has 17); stack bonuses are rarity-indexed (`maxStacksBonus [1,1,2,2,3]`) not flat; sealed state and per-mount sockets; max-rarity dedupe; mythic glyphs exist.

## §14 JSON schema (`data/mounts-glyphs.json`)

- `source`: line citations.
- `mountSpecies[]`: `{species (enum), name, rarity, summonWeight, bias, speedPct, level1Roll:{hp:[min,max], atk:[min,max]}}` (level1Roll [DERIVED] from §3).
- `mountRarityStatRange`, `altarTiers`: tables from §3/§7.
- `minorGlyphTypes[]`, `mythicGlyphTypes[]`: §8/§11.
- `glyphQualityBands`, `glyphSecondaryPool[]` (`stat` camelCase, `statEnum`, `minValue`, `maxValue`, `decimals`, `line`): §9.
- `majorGlyphModifiers[]`: `{id, name, playerClass, requiredSpec|null, sigilSpecies, sigilName, effectKind, perRarity:{field:[Common..Legendary]}, line}` (42 entries). The `perRarity` keys are the client's camelCase effect field names (§10) **lower-cased** (`cooldownseconds`, `damagepercent`, `maxstacksbonus`, `thornsperstackpercent`, `attackspeedperstackpercent`, `burnperhitoverride`, `shieldpowerpercent`, `ccseconds`, ...); readers must use the lower-case keys.

## §15 Unresolved

- Server rules: summon outcome/duplicate handling, XP source, altar-tier-upgrade side effects, glyph drop RNG and transmute result selection (client only shows request shapes).
- Celestial Trial glyph chance anchors (register aliasing).
- Mythic glyph effect implementation.
- Class restriction of the secondary pool beyond the unique-stat lists (module 4293).
- Whether duplicate species can be owned as separate instances (the data model is an instance array with uuid; `mountDuplicateXp` suggests merging).
