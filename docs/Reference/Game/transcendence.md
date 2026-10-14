# Transcendence

> Source: Eldaryn 2.7.0 client (decompiled.js) · Extracted 2026-10-14

Transcendence is a character-wide, permanent node board unlocked at level 55 ("the path beyond Awakening"). The player spends **Mythic Ichor** (earned from Mythic Crusade clears) to allocate nodes outward from a free central **Awakened Core**. Each node adds a small flat stat; the board is a fixed 279-cell grid (1 core, 255 common, 14 uncommon, 7 glyph sockets, 2 ancient sigils) whose stat content depends on class (and, for Mystic and Necromancer, on specialisation). Cost per node rises with the number of slots already filled. The final bonus is a plain sum over allocated nodes, fed into the shared stat pipeline as the `transcendence` source (`see stats.md`). Allocation, Ichor balance and validation are server-side; the client holds the board, a cost predictor and the bonus summation. Citations are to `decompiled.js`.

Provenance of the board data: the board is not stored as a literal list. It is generated at load time by `buildBoard` from small constant tables (rows, stat pools, notable definitions, overrides). The machine-readable result in `data/transcendence.json` was **[DERIVED]** by running those client tables through a re-implementation of `buildBoard` (module 4299, L1218021-1221319). Sanity check: for Sentinel the derived board reproduces the existing app transcription (`transcendenceData.js`) cell for cell (278 non-core nodes), differing only in the Attack Speed unit (§6). The match holds under a coordinate offset: the existing transcription is 1-indexed with 25 rows and no core cell, its (col, row) maps to board `(col-14, row-26)`, and its start cell `14:25` is board `n_0,-1`.

## §1 Unlock, naming, currency

- Unlock level `TRANSCENDENCE = 55`; `TRANSCENDENCE_PRESETS = 58`. **[CODE]** L668649 (UNLOCK_LEVELS), also `TRANSCENDENCE_CONSTANTS.UNLOCK_LEVEL` L1220187.
- Unlock text: "The path beyond Awakening opens. Spend Mythic Ichor (earned from Mythic Crusade clears) to climb a vast node board. Ascend through 5 tiers from the Awakened Core ..." **[CODE]** L668837. (The same text says Glyph Sockets and Ancient Sigils "await in a future update"; stale, see §7.)
- Currency: **Mythic Ichor**. Earned by Mythic Crusade clears (text only). **[CODE]** L668837; the earn rate is **[SERVER]**, `see pve-content.md`.
- Ichor is a capacity, not a pool that presets split: the number shown is `mythicIchor` = still free on the open board out of `mythicIchorEarned`. Every preset can spend the full earned total separately; a new preset starts empty with all Ichor free. **[CODE]** i18n `guide.capacityDesc`, `bonuses.capacityShared` (L909380 region); server payload fields `mythicIchor`, `mythicIchorEarned` L1164849-1165325 (`applyTranscendenceResult`).

## §2 Board geometry

- Cells are `(col, row)` integers. Core at `(0,0)`. Rows run `0` (bottom) to `-25` (top); cols `-13..13` (27 wide, 26 tall). `CELL = 80` (render pixels). **[CODE]** row table `_closure1_slot23` (rows 0..-25) L1220780 and `TRANSCENDENCE_CONSTANTS` L1220187, module 4299.
- Row 0 holds only the core; row -1 holds one cell (`0,-1`); widths grow to 21 cells at row -17 then narrow to 2 at row -25 (the two sigils at `(-13,-25)` and `(13,-25)`). Per-row cell counts: **[DERIVED]** from the row table (see JSON `boards.*.nodes`).
- Node ids: `core`; `n_<col>,<row>` common; `not_<col>,<row>` uncommon (notable); `soc_<col>,<row>` glyph socket; `sig_<col>,<row>` sigil. **[CODE]** `buildBoard`.
- Links: two cells are linked if orthogonally adjacent (`col+1,row` or `col,row+1` exists; no diagonals). Links are undirected and include sockets and sigils. **[CODE]** `buildBoard` link loop; neighbour map `TRANSCENDENCE_NEIGHBORS` built at L1221232.
- The five visual tiers are row bands. `n`, name, rows: 1 ASCENDANT 0..-5, 2 EXALTED -6..-11, 3 RADIANT -12..-17, 4 MYTHIC -18..-22, 5 TRANSCENDENT -23..-25. **[CODE]** `TRANSCENDENCE_TIERS` (rowMin/rowMax stored as wrapped uint32; tier 5 `rowMin` decodes to -60, i.e. "everything below -22"). `tierOf(row)` returns the first band containing the row, else the last.
- Cell makeup per board **[DERIVED]**: 1 core, 255 common, 14 uncommon, 7 glyph sockets, 2 sigils = 279, of which 271 are allocatable (all but the core and the 7 sockets); all 271 are reachable from the core by breadth-first search with sockets excluded. Per tier: T1 24 common + 1 uncommon (+core); T2 59 + 3; T3 92 + 5 + 7 sockets; T4 62 + 5; T5 18 + 2 sigils. Offense/defense split of common+uncommon on Warrior: 134 / 135.
- Socket cells (7): `-9,-13  9,-13  0,-14  -5,-14  5,-14  -9,-16  9,-16`. **[CODE]** `_closure1_slot30`.

## §3 Node kinds and stat values

- `kind`: `start` (core), `minor` (UI "Common Node"), `notable` (UI "Uncommon Node", big), `socket` ("Glyph Socket"), `sigil` ("Ancient Sigil"). **[CODE]** `buildBoard` L1218446-1219085, i18n `nodeSheet`.
- Allocatable kinds are exactly `minor`, `notable`, `sigil`. The core is free and pre-owned; sockets are not allocatable (UI state `soon`; toast "Coming soon"). **[CODE]** `isAllocatableKind`; `stateOf`/`allocate` handlers in `useTranscendence` (module 6608, L2198418-2199653).
- Side (`attack` / `defense`) of a minor or socket cell **[CODE]** `flavorSide(col,row)` L1218327:
  ```
  if col != 0:
      side = (col < 0) ? 'defense' : 'attack'
      if (abs(col)*3 + abs(row)) % 4 == 0: side = opposite(side)
  else:
      side = (abs(row) % 2 == 0) ? 'attack' : 'defense'
  ```
- Common node stat: one entry from the board's pool for its side. Counters `atkIdx` and `defIdx` start at 0 and increment once per minor cell **in build order** (rows `0,-1,-2,...`; within a row, column order of the row table; sigils, sockets, notables and core do not increment). Stat = `pool[idx % pool.length]`. **[CODE]** `buildBoard` L1218446. Dominion cells (§5) still consume an index.
- Uncommon node: two stats, each `base[stat] * NOTABLE_STAT_MULTIPLIER (2)`, plus a name, icon and effect line; fixed positions (§4). **[CODE]** `notableStat`, `NOTABLE_STAT_MULTIPLIER = 2`.
- Sigil node: no stats; carries a name/effect and grants an Ancient Sigil on allocation (grant itself is **[SERVER]**: result field `grantedSigil`, `revokedSigilSpecies`; client merges it into `sigilState.ownedSigils`). **[CODE]** `applyTranscendenceResult` L1164849-1165325. Species mapping: `see sigils.md`.
- Stat units: values are in the same units as the shared `...Flat`/`...Percent` bundle. All are percent points except `attackSpeedFlat` and `minionAttackSpeedFlat`, which are stored as fractions and shown x100 (`0.01` displays as `1%`). **[CODE]** `formatStatValue` (module 6613, L2203826+). Base per-stat values below.

Base values per common node **[CODE]** (`_closure1_slot22`, derived from the pool tables):

| stat | value | stat | value |
|---|---|---|---|
| attackPercent | 0.8 | hpPercent | 1 |
| attackSpeedFlat | 0.01 (=1%) | hpRegenFlat | 0.6 |
| critChanceFlat | 0.4 | damageReductionFlat | 0.4 |
| critDamageFlat | 1.4 | blockChanceFlat | 0.4 |
| penetrationFlat | 1 | missChanceFlat | 0.8 |
| lifestealFlat | 0.5 | blindChanceFlat | 0.4 |
| spellDamageFlat | 0.8 | paralyzeChanceFlat | 0.2 |
| spellCritChanceFlat | 0.4 | spellVampFlat | 0.5 |
| minionAttackPercent | 0.8 | disruptionChanceFlat | 0.15 |
| minionHealthPercent | 1.5 | minionCritChanceFlat | 0.4 |
| minionLifestealFlat | 0.5 | soulLinkFlat | 0.2 |
| minionAttackSpeedFlat | 0.01 | dominionFlat | 1 (Dominion nodes) |

## §4 Per-class boards

Board key `boardFlavor(class, spec)` **[CODE]**: Necromancer -> `DEATHLORD` if spec is Deathlord else `DOOMWEAVER`; Mystic -> `DRUID` if spec is Druid else `MAGE`; Warrior and Sentinel -> `MAGE` (a cache key only). Boards are cached per `class|flavor`; changing specialisation swaps the board (allocated ids that do not exist on the new board contribute nothing, see §6 bonus step). **[CODE]** L1218021-1221319.

Geometry (§2) is identical on every board. What differs is the stat pools, the 14 uncommon nodes, the two sigil names, and Deathlord's Dominion cells.

Stat pools (order matters, see index rule in §3). "Arcane board" = Necromancer Doomweaver and Mystic Mage. Classes exclude pool entries whose `SecondaryStatType` is in `CLASS_EXCLUDED_SECONDARY_STATS[class]`; only Necromancer excludes anything: `CRIT_CHANCE, LIFESTEAL, PENETRATION`. **[CODE]** pool selection `atkPoolFor` L1218220 / `defPoolFor` / `withoutClassExcluded`; exclusion table module 4293 (decompiler lost its keys; Necromancer is the only non-empty one, its list is [CODE] L1213760 region, class attribution **[DERIVED]** from the order of assignment).

| Board | Attack pool (in order) | Defense pool (in order) |
|---|---|---|
| Warrior | attackPercent, attackSpeedFlat, critChanceFlat, critDamageFlat, penetrationFlat, lifestealFlat | hpPercent, damageReductionFlat, blockChanceFlat, hpRegenFlat |
| Sentinel | same as Warrior | hpPercent, missChanceFlat, blindChanceFlat, paralyzeChanceFlat, hpRegenFlat |
| Mystic Mage (arcane) | attackPercent, attackSpeedFlat, critChanceFlat, critDamageFlat, penetrationFlat, lifestealFlat, spellDamageFlat, spellCritChanceFlat | hpPercent, hpRegenFlat, spellVampFlat, disruptionChanceFlat |
| Mystic Druid | attackPercent, attackSpeedFlat, critChanceFlat, critDamageFlat, penetrationFlat, lifestealFlat, spellDamageFlat | hpPercent, damageReductionFlat, blockChanceFlat, hpRegenFlat, disruptionChanceFlat |
| Necromancer Doomweaver (arcane, minus excluded) | attackPercent, attackSpeedFlat, critDamageFlat, spellDamageFlat, spellCritChanceFlat | hpPercent, hpRegenFlat, spellVampFlat, disruptionChanceFlat |
| Necromancer Deathlord (minus excluded) | minionAttackPercent, attackPercent, minionCritChanceFlat, critDamageFlat, soulLinkFlat, spellDamageFlat, attackSpeedFlat, spellCritChanceFlat | minionHealthPercent, hpPercent, minionLifestealFlat, hpRegenFlat, spellVampFlat, disruptionChanceFlat |

Pool tables **[CODE]** `_closure1_slot8..16`; full per-node results in the JSON.

Deathlord attack-side substitution **[CODE]** `deathlordMinorMeta` L1218111: on the Deathlord board, for attack-side commons, if the pool entry is `attackSpeedFlat` and `floor(idx / poolLen) % 2 == 1`, or the entry is `spellCritChanceFlat` and `floor(idx / poolLen) % 2 == 0`, the node becomes `minionAttackSpeedFlat 0.01` ("Minion Atk Speed") instead.

Uncommon (notable) nodes: 14 fixed positions, same on every board, with per-board names/stats:
`0,-3  -4,-7  4,-7  0,-10  -5,-13  5,-13  0,-15  -7,-17  7,-17  0,-18  -6,-19  6,-19  -7,-22  7,-22`. **[CODE]** `_closure1_slot25` L1220842 (base set, also used by Warrior), overrides `notableOverridesFor`: Sentinel (`_closure1_slot26`), Mystic Mage/Druid (`_closure1_slot27`), Doomweaver (`_closure1_slot28`; = Mage set but `7,-17` becomes "Soulrend"), Deathlord (`_closure1_slot29`). Names, effect text and two stats per node are in `data/transcendence.json` (`notableBase`, `notableOverrides`). Stat per notable stat = base value x 2 (e.g. Warrior `0,-3` "Onslaught": attackPercent 1.6, attackSpeedFlat 0.02). The "effect" line is flavour text; no separate mechanical effect exists in the client beyond the two stats.

Sigil nodes: `sig_-13,-25` (defense side) and `sig_13,-25` (attack side). Default names Earthwarden (left) and Flameborn (right). Overrides: Sentinel left = "Stormcaller"; Mystic left/right keep Earthwarden/Flameborn with caster-flavoured effect text. **[CODE]** `_closure1_slot31` L1221070, `_closure1_slot32` L1221086. See `sigils.md` for what the sigil does.

Druid-only note: on the Druid board, `damageReductionFlat` and `blockChanceFlat` are flagged "URSINE ONLY" ("Damage Reduction and Block only work while you are in Ursine form"). **[CODE]** `isUrsineOnlyStat` (L2203790-2203825, set at L2203899) and i18n `ursineOnly`. The effect on actual combat is `see classes.md` / `combat-pve.md`.

## §5 Dominion nodes (Necromancer Deathlord)

On the Deathlord board, four commons are replaced by "Dominion" nodes at `0,-2  0,-5  0,-12  0,-17`: stat `dominionFlat +1`, text "Tighten your grip on the grave: +1 Dominion level. Dominion unlocks stronger forms of your summoning Sigils." **[CODE]** `_closure1_slot17/18` L1220352, `buildBoard`. Four Dominion nodes = +4 Dominion at full allocation **[DERIVED]**. Their ichor cost is that of a normal common. `dominionFlat` is added to the base Dominion in stat calc: `see stats.md` and `classes.md`.

## §6 Cost model (client predictor)

Ichor cost uses a **global slot counter**, not the tier numbers in §2. **[CODE]** `commonNodeCostAtCount`, `slotWeight`, `nextNodeCost` L1219229, `setTotalCost`, `TRANSCENDENCE_COST_BRACKETS`.

```
price(n)  for the n-th filled slot (1-indexed):
  n 1-4: 1   5-9: 2   10-16: 3   17-26: 5   27-41: 8
  42-61: 12  62-86: 18  87-116: 26  117-156: 38  157-206: 55  207+: 80
slotWeight(kind): minor 1, notable 3 (NOTABLE_COST_MULTIPLIER), sigil/other 0
nextNodeCost(count, kind):
  sigil -> 30   (SIGIL_ICHOR_COST, flat, does not advance count)
  else  -> sum_{k=1..weight} price(count + k)
setTotalCost(ids): count = 0; total = 0
  for id in ids (skip core): total += nextNodeCost(count, kind(id)); count += slotWeight(kind(id))
allocCost(current, id) = setTotalCost(current + [id]) - setTotalCost(current)
removeRefund(current, id) = setTotalCost(current) - setTotalCost(current without id)
```

- Brackets (upTo, cost): (4,1) (9,2) (16,3) (26,5) (41,8) (61,12) (86,18) (116,26) (156,38) (206,55) (inf,80). **[CODE]** `_closure1_slot42` L1221238-1221263 (the final bracket's cost is the register holding `80`, set at L1220188 next to `CELL = 80`; **[DERIVED]** by tracing that register).
- Derived `TRANSCENDENCE_ALLOC_TIERS`: 11 rows `{tier, fromCount, toCount, cost}` (fromCount of the next row = previous toCount + 1; last row toCount null). **[CODE]** forEach at L1221263-1221313; see JSON `allocTiers`.
- Order independence **[DERIVED]**: because every node takes consecutive slot indices, `total = prefixSum(S) + 30 * sigilCount` where `S = commons + 3 * uncommons`. Allocation order does not change the total; a node's marginal price does depend on how many slots are already filled.
- Full-board cost **[DERIVED]**: `S = 255 + 3*14 = 297`; `prefixSum(297) = 4+10+21+50+120+240+450+780+1520+2750 + 91*80 = 5945 + 7280 = 13225`; plus 2 sigils (60) = **13285 Ichor**. Without sigils 13225.
- The per-node `cost` field produced by `buildBoard`/`nodeCost` (tier cost 1-5, x3 for notable) is a legacy display value; the UI's `costOf` and affordability checks use `allocCost` (module 6608 `costOf`, `stateOf`). **[CODE]** / the "legacy" label is **[DERIVED]**.
- The client checks `remainingIchor >= allocCost` before calling `POST /transcendence/allocate {nodeId}`; the server is authoritative. **[CODE]** `useTranscendence` allocate handler; endpoint list module 6534.

## §7 Allocation rules

- Reachability **[CODE]** `isReachable(id, allocatedSet)` L1219780: core is always reachable; any other node is reachable iff at least one linked neighbour is the core or in the allocated set. Sockets cannot be allocated, so they never carry a path.
- Allocate handler order **[CODE]** (module 6608): already allocated -> ignore; kind not allocatable -> toast "Coming soon"; not reachable -> toast "Allocate an adjacent node first"; `remainingIchor < allocCost` -> "Not enough Mythic Ichor"; otherwise optimistic update, then `POST /transcendence/allocate`.
- Removal **[CODE]** `canRemoveNode` L1219820: the core cannot be removed; removal is allowed only if every other allocated node is still connected to the core through allocated nodes (flood fill from core through the allocated set). Otherwise toast "Can't remove: it would strand connected nodes". Refund = `removeRefund` (§6) applied to the remaining ordering-independent total. Endpoint `POST /transcendence/remove {nodeId}`.
- `validateAllocation(ids)` **[CODE]** L1219953: all ids must be allocatable kinds, all connected to the core; returns total cost or null.
- Reset: `POST /transcendence/reset` clears the active board and frees its Ichor; no gem cost appears in the client strings. **[CODE]** module 6534, i18n `reset`. Whether the server charges anything: **[UNRESOLVED]** (checked client strings and handlers only).
- Progress UI: `sideProgress(side, allocatedSet)` returns `{got, total}` of allocatable nodes on that side. **[CODE]**.
- Spent counter in UI: "`{count}` nodes - `{spent}` Ichor in use". Highlight filter groups stats into OFFENSE / DEFENSE / CONTROL for display only. **[CODE]** i18n `bonuses`, `filter`, module 6612 image classes.

## §8 Bonus calculation

```
calculateTranscendenceBonuses(allocatedNodeIds, playerClass = WARRIOR, spec):
  total = { attackPercent:0, hpPercent:0, attackSpeedFlat:0, critChanceFlat:0, critDamageFlat:0,
            hpRegenFlat:0, lifestealFlat:0, damageReductionFlat:0, blockChanceFlat:0, missChanceFlat:0,
            blindChanceFlat:0, paralyzeChanceFlat:0, penetrationFlat:0, spellDamageFlat:0,
            spellVampFlat:0, spellCritChanceFlat:0, disruptionChanceFlat:0, spellResistFlat:0,
            fearChanceFlat:0, minionAttackPercent:0, minionHealthPercent:0, minionCritChanceFlat:0,
            minionLifestealFlat:0, soulLinkFlat:0, minionAttackSpeedFlat:0, dominionFlat:0 }
  board = nodeById(playerClass, spec)
  for id in allocatedNodeIds, id != 'core':
      node = board[id]; if node: for s in node.stats: total[s.stat] += s.value
  return total
```
**[CODE]** module 4298, L1217888-1218020 (function L1217901-1217995; zero template L1218014). Pure additive sum; unknown ids are silently skipped (so a spec swap drops nodes that do not exist on the new board). The result is the `transcendence` source consumed by `calculateTotalStats`; how each field is combined (percent vs flat, additive vs multiplicative) is `see stats.md` (source `a9`). Spent Ichor for display: `calculateSpentMythicIchor(ids) = setTotalCost(ids)`. **[CODE]** L1217888-1218020.

Full-board stat ceilings **[DERIVED]** (sum of all 255 commons and 14 uncommons; `...Flat` percent points, attack speed shown as the stored fraction):

| Board | Totals |
|---|---|
| Warrior | hp 44, DR 16, atk 25.6, atkSpd 0.25, block 14.4, regen 21.6, crit 10, critDmg 37.8, pen 23, lifesteal 11.5 |
| Sentinel | hp 26, miss 27.2, atk 25.6, atkSpd 0.29, blind 14.4, paralyze 6.2, crit 10, critDmg 37.8, regen 15, pen 23, lifesteal 11.5 |
| Mystic Mage | hp 44, regen 24, atk 12.8, atkSpd 0.2, spellVamp 20, disruption 5.1, spellDmg 22.4, crit 6.4, critDmg 22.4, pen 18, lifesteal 8, spellCrit 9.2 |
| Mystic Druid | hp 38, DR 12.8, atk 23.2, atkSpd 0.22, block 12, regen 17.4, crit 8.8, critDmg 33.6, disruption 4.05, pen 20, lifesteal 10, spellDmg 14.4 |
| Necro Doomweaver | hp 44, regen 24, atk 20.8, atkSpd 0.3, spellVamp 20, disruption 5.1, spellDmg 29.6, critDmg 37.8, spellCrit 13.2 |
| Necro Deathlord | minionHp 43.5, hp 30, dominion 4, atk 14.4, minionLifesteal 12.5, regen 16.2, minionAtk 20, minionCrit 8.8, critDmg 26.6, spellVamp 10, disruption 3.45, soulLink 4, spellDmg 12.8, atkSpd 0.08, minionAtkSpd 0.18, spellCrit 2.8 |

Cost to reach these: 13285 Ichor (§6). Power score contribution: `see stats.md` (it states `transcendence = 100 * transcendenceNodeCount`).

## §9 Transcendence presets

- Unlock level 58. Constants: `FREE_SLOTS 1`, `MAX_PRESETS 4`, `NAME_MAX 18`. Slot gem price by slot number `[0, 1000, 1500, 2000]` (slot 1 free, slot 2 costs 1000 Gems, slot 3 1500, slot 4 2000). **[CODE]** module 4132, L1144314-1144320; `getTranscendencePresetSlotCost(n) = n <= 1 ? 0 : costs[n-1]`; `getNextTranscendencePresetCost(count) = count >= 4 ? null : cost(count + 1)`.
- Icons: sword, shield, bolt, flame, crown, star, heart, gem, skull, eye, drop, core. **[CODE]** same module.
- A preset is `{ id, name, icon, allocatedNodeIds, isDefault }`. The default preset has id `'default'`, name `DEFAULT`, icon `core`. **[CODE]** `makeDefaultTranscendencePreset`.
- Each preset is its own board; all presets spend from the same earned total independently (see §1). Switching presets costs nothing. UI text: "{owned}/{total} slots - switch anytime". **[CODE]** i18n `presets`.
- Endpoints: `POST /transcendence/presets/buy`, `/activate {presetId}`, `/update {presetId, ...fields}`, `/delete {presetId}`; `GET /transcendence`. Client store keeps `transcendencePresets`, `activeTranscendencePresetId`, `transcendencePresetsUnlocked`, `nextTranscendencePresetCost`. **[CODE]** modules 6534, 4158.
- Linking to build presets: a build preset (game "Presets", level 41) can store a `transcendencePresetId`; linking is allowed only when player level >= 58 and more than one transcendence preset exists (`canLinkTranscendencePreset(level, count)`); `resolveTranscendenceLink(presets, linkedId)` returns `{preset, index, idToSave}` with `idToSave = linkedId` if found, else the first preset's id (when any exist), else null. **[CODE]** module 6535, L2137034-2137133; `transcendencePresetId` field L1144175, L2128103. How build presets work: `see` the build-presets owner (not in this extraction list).
- Deleting a preset deletes its allocations; other presets untouched. **[CODE]** i18n `deleteBody`.
- Purchase validation (gem balance, max count) enforced server-side; client pre-checks `gems >= nextCost` and shows "Not enough Gems". **[CODE]** module 6533.

## §10 Unknowns and server-side items

- **[SERVER]** Ichor earned per Mythic Crusade clear; the authoritative `mythicIchor`/`mythicIchorEarned`; validation of allocate/remove; sigil grant/revoke (`grantedSigil`, `revokedSigilSpecies`); preset purchase.
- **[UNRESOLVED]** Whether reset has a hidden gem or Ichor cost (no client string or arg shows one).
- **[UNRESOLVED]** Whether Glyph Sockets will do anything: the client has the 7 socket cells and text "Socket an Uncommon Glyph here to empower the surrounding nodes", but they are not allocatable in 2.7.0 (kind not in `isAllocatableKind`; UI state `soon`).
- Sigils are allocatable in the code (`isAllocatableKind` includes `sigil`) even though the unlock popup and the in-board status strings (`statusSigilSoon`) still say "coming soon" (stale strings, L668837 and i18n `nodeSheet`). `see sigils.md` for the species.
- Doomweaver row for the exclusion table: the decompiler lost the class keys of `CLASS_EXCLUDED_SECONDARY_STATS`; attribution to Necromancer is inferred from assignment order (the only non-empty entry). Treated as **[DERIVED]**.
