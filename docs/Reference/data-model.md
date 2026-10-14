# The Data Model — canonical reference

> **Status:** Current · **Last verified:** 2026-07-28
> **Covers:** the persisted shape (Roster → Character → Preset and friends),
> the character-wide / per-preset / per-mount split, normalisation, and the
> totals aggregation rules.

**This is the source of truth for the domain shape.** `model.js` and
`totals.js` implement it and cite this file; they no longer describe it.

Companion documents: `combat-model.md` (what the numbers *mean* once summed,
including the cap pipeline) and `Notes/big-rework-v1-notes.md` (why mounts,
glyphs, sigils and pets are shaped the way they are).

---

## 1. The shape

```
Roster      = { characters: Character[], currentId }

Character   = { id, name, class: 'Warrior' | 'Sentinel' | null,
                loadouts:     [Loadout, Loadout],        // gear only
                talentSets:   [TalentSet, TalentSet],    // Set A / Set B
                pets:          PetEntry[],               // shared collection
                petAltar:     { tier, level },           // ONE tier+level for every pet
                relicLevels:   Record<defId, level>,
                sigilValues:   Record<sigilId, SigilValues>,
                sigilForgeTier: number,                  // 1..3, tiers every sigil at once
                mounts:       { entries },               // fixed to MOUNT_DEFS
                glyphs:       { entries },                // inventory; equip state lives on the mount
                stoneInventory: StoneEntry[],
                awakening:    { path, points },
                transcendence:{ unlockedPositions },
                presets:       Preset[],                  // minimum TWO
                activePresetId: string | null,
                drop:          DropState | null,
                dropGoal:     { kind, ehpWeight } }

Preset      = { id, name, loadout: 0|1, talentSet: 0|1,
                petId:    string | null,
                mountId:  string | null,                  // which MOUNT_DEFS mount this preset rides
                relicIds: string[],                       // max PRESET_RELIC_CAP (4)
                sigilIds: string[],                       // max PRESET_SIGIL_CAP (3)
                manualTotals: boolean, manualStats: OffensiveStats,
                fortressBuffs: { top, bottom, core },
                goal: PresetGoal | null,
                linked: boolean }

Loadout     = { name, gear: Record<Slot, OffensiveStats>,
                socketedStones: Record<Slot, stoneId | null> }

TalentSet   = { spec: specKey | null, allocation: Record<talentId, rank> }

PetEntry    = { id, name, rarity, companionId: string | null,
                secondaries: [{ statKey, value }], stats: OffensiveStats }

StoneEntry  = { id, type: 'verdant'|'crimson'|'azure'|'eldaryn'|'mythic',
                quality: number, rolledKeys: string[], stats: OffensiveStats }

SigilValues = { level, tier, passive: Record<statKey, number>,
                active: Record<statKey, number>, damage, tickDamage }

DropState   = { slot, piece: OffensiveStats }
```

### Field notes that are not obvious from the shape

**`Loadout.socketedStones`** holds *ID references* into `Character.stoneInventory`,
never stat blocks. Replacing a slot's gear never touches this map, so a socketed
stone survives a gear swap. The same stone id may appear in both loadouts at
once (one slot each) but at most once within a single loadout —
`rosterStore.socketStone` auto-moves it.

**`TalentSet` has no `name`.** Set A / Set B are fixed labels derived from index
(`talentSetLabel`), not user-renamable. Tree *content* is static code data
(`talentTreeData.js`), not persisted.

**`PetEntry.companionId` selects one of two resolution paths.** Set → catalogue
pet: Attack/Health come from `petsData.js`'s companion curve at the
character-wide altar's tier/level, plus `secondaries`; `stats` is unused and
`rarity` mirrors the catalogue. Null → custom/legacy pet: uses the hand-entered
`stats` block and keeps its own rarity. `petStats(pet, altar)` resolves either.
**A pet has no tier or level of its own** — the altar levels the whole
collection together.

**`StoneEntry.quality`** is display-only (same principle as gear not tracking
item level). **`rolledKeys`** records which stat keys are actually on the stone,
because a 0-value stat is otherwise indistinguishable from "not rolled". Type
and `rolledKeys` are fixed at creation (`stonesData.js` `STONE_TYPES`); only
quality and rolled values are editable afterwards.

**`Preset.fortressBuffs`** — `top`/`bottom` are mutually exclusive
(`setPresetFortressBuff` clears the other); `core` is independent. The fixed
stat contribution of each is `FORTRESS_BUFF_STATS` in `totals.js`.

**`SigilValues.passive.attack` / `.health` are DERIVED**, not stored — they
read 0 in storage and are computed from level/tier via `sigilStat`. Every other
passive/active value stays user-entered. Passive values feed `totals.js`;
active values and damage feed the simulators via `sigilEffects.js`. Sigils never
feed `dps.js`'s closed-form swap math.

**`Preset.goal`** — see `combat-model.md` §8 for what each goal kind scores.
`'tank'` is Warrior-only; PVP weights renormalise to sum 100.

---

## 2. The three scopes

This split is deliberate and load-bearing. Moving a field across it changes the
meaning of the app, so don't do it casually.

| Scope | Meaning | Members |
|---|---|---|
| **Character-wide** | One value shared by every preset | Mounts, the glyph inventory, Awakening, Transcendence, the pet collection, `petAltar`, `sigilForgeTier`, relic levels, `stoneInventory` |
| **Per-preset** | The preset chooses | Which loadout, talent set, pet, mount, relics and sigils are equipped; manual-totals mode; goal |
| **Per-mount** | Neither of the above | Glyph *equip* state (`mount.glyphIds`), reached per-preset via `preset.mountId` |

Glyphs are the case that breaks the binary: the inventory is character-wide,
but which glyphs are equipped lives on the mount (3 minor / 2 major / 1 mythic),
and one glyph may sit on any number of mounts. `totals.js` therefore sums them
inside `mountContribution`, not through the generic equipped-entries path.

Awakening and Transcendence being character-wide predates the preset redesign
and was kept deliberately.

---

## 3. Constraints the code enforces

- **Two-preset minimum.** `newCharacter` seeds two, `normaliseCharacter` tops up
  old saves, and `deletePreset` refuses below two. Never write a loop that
  deletes "down to one preset" — it spins against the guard.
- **`mount.star === 0` means not owned.** There is no `owned` flag.
- **Changing the pet altar's *tier* wipes the collection.** That is the game's
  behaviour; `setPetAltarTier` nulls every `preset.petId`. Always confirm with
  the user first.
- Caps: `PRESET_RELIC_CAP` 4, `PRESET_SIGIL_CAP` 3, `TALENT_TOTAL_POINTS` 29.

---

## 4. Normalisation

**Persisted state always goes through `normaliseRoster` / `normaliseCharacter`.**
Never trust a loaded or imported object's shape directly — everything from
`localStorage` and every JSON import is arbitrary data.

When adding a persisted field:

1. Add its default and validation alongside the existing ones in `model.js`.
2. Validate it against any static data it references — normalisation **drops**
   any saved reference that no longer resolves (e.g. a talent id after a class
   change, a glyph id no longer in the catalogue).
3. If it replaces an older shape, handle the legacy migration — see
   `isLegacyCharacter` / `migrateLegacyCharacter` for the pattern.

Static domain data (`talentTreeData.js`, `awakeningData.js`, `relicsData.js`,
`transcendenceData.js`, `glyphsData.js`, `sigilsData.js`, `mountsData.js`,
`petsData.js`, `stonesData.js`, `constants.js`) is **code, not state**. Only
allocations, levels and selections referencing it are saved.

Persistence is one `localStorage` key, `eldaryn_optimiser_state_v1`, via
`storage.js`, routed through `normaliseRoster` on load and import so corrupt or
old data cannot crash the app.

---

## 5. Totals aggregation

`totals.js` sums a preset's gear + socketed stones + talents + pet + relics +
sigil passives + ridden mount (with its glyphs) + fortress buffs + every
character-wide source into one stat set.

**Additive-only, deliberately.** Summing many sources at once is a different
operation from `dps.js`'s two-item swap delta, which has its own
additive-vs-multiplicative switch. This sum treats *every* field — including
Speed and Crit Mult — as a straight additive stack onto its base from
`STAT_FIELDS` (Speed 100, Crit Mult 150, Attack/Health 10, everything else 0).

**Attack and Health are the one exception:** flat contributions are summed
separately from percentage contributions, then recombined once via the same
`finalAttack()` used throughout `dps.js`.

The additive sum is the **raw** total (`computePresetRawTotals`). The soft-cap
curve is applied once, at the end, to produce the **effective** total
(`computePresetTotals`). That pipeline, and the rule about which functions take
raw versus effective input, is `combat-model.md` §1 — read it before touching
anything that adds stats to a build.

**Number format gotcha, inherited from the game's own UI:** flat stat values use
`.` as a **thousands** separator while percentage stats use `.` as a **decimal**
point. Keep it straight when parsing or summing any new stat source
(`format.js` handles this — `parseStat` / `formatStat` dispatch on the field's
kind).
