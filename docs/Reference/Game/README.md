# Reference/Game — the game, read from its own client

> **Status:** Current · **Last verified:** 2026-10-14 · **Game version:** Eldaryn 2.7.0
> **Covers:** what the game does — every stat source, formula, cap, catalogue and
> unlock — as read from the decompiled 2.7.0 client. This folder is the source of
> truth for game mechanics. Where any other document disagrees, this folder wins.

## Where this came from

On 2026-10-14 the 2.7.0 client was extracted into
`docs/Extracted game data/idlehunt_2.7.0.zip.001`–`.007`. The extracted
`gamedata/decompiled.js` is a Hermes decompile of the full React Native bundle. One
extraction agent per game system read that code and wrote one document here.
Then a second, independent pass spot-checked the most important claims in each
document against the lines they cite. Of 177 claims checked, one was wrong and
was fixed. About 20 were inconclusive; the ones re-checked turned out correct.

Everything before this date was measured by hand from screenshots or estimated.
Those documents are in `../../Archive/outdated-notes/`. Never cite them for a
game fact.

## Provenance tags

Every number, formula and rule in these documents carries one of these tags:

| Tag | Meaning | May be stated as game fact? |
|---|---|---|
| **[CODE]** | Read directly from client code. Cited as `decompiled.js L<n>`. | Yes |
| **[DERIVED]** | Computed from [CODE] values. The working is shown. | Yes, if the working holds |
| **[SERVER]** | The client shows this is decided server-side. Only what the client exposes is recorded. | No — state it as unknown |
| **[UNRESOLVED]** | Could not be determined. The document says what was checked. | No |

**The server boundary is the main caveat.** The client holds the formulas,
tables and constants. But a lot of live state is computed on the server and only
replayed by the client. Read each document's [SERVER] notes before assuming the
app can reproduce a value exactly. That includes the final `computedStats`, item
rolls, most fights and every random outcome.

## Documents

| Document | Owns | Data file |
|---|---|---|
| [`stats.md`](stats.md) | Stat catalogue, the full stat-aggregation pipeline, soft caps and the cap curve, combat ceilings, PVP rating to effect, Combat Power | `data/stats.json` |
| [`classes.md`](classes.md) | The 4 classes and 8 specs, level cap and XP curve, class stat gating, class abilities, Necromancer minions | `data/classes.json` |
| [`combat-pve.md`](combat-pve.md) | The PVE combat engine: ticks, swing order, damage, avoidance, crit/double hit, lifesteal, regen, buffs, enemy scaling, client vs server fights, the Celestial Trial party fight (§20) | `data/combat-pve.json` |
| [`combat-pvp.md`](combat-pvp.md) | PVP resolution: the HP pool, PVP Attack/Defense, avoidance and penetration, Disruption, timeout rules, the bundled `simulateArenaPvP` | `data/combat-pvp.json` |
| [`gear.md`](gear.md) | Slots, rarities, item level, primary and secondary stat formulas, conduits, Dual Equip, presets, Oblivion item caps | `data/gear.json` |
| [`drops.md`](drops.md) | Rarity odds by level, the Oblivion drop model, Fortune / Midas Touch / Artisan, loot filter and Loot Bag | `data/drops.json` |
| [`stones.md`](stones.md) | Enchant Stones: types, stat pools, socketing, Amplification, Oblivion stones | `data/stones.json` |
| [`talents.md`](talents.md) | All 8 talent trees, tiers, points, Dual Talents, respec | `data/talents.json` |
| [`skills.md`](skills.md) | The 14 gem-bought Skills (new since July 2026) | `data/skills.json` |
| [`relics.md`](relics.md) | Relic catalogue for all 4 classes, level scaling, slots, medal costs | `data/relics.json` |
| [`sigils.md`](sigils.md) | Sigil catalogue, flat stat formula, spell scaling and caps, stack sigils, Ancient transforms, activation conditions | `data/sigils.json` |
| [`mounts-glyphs.md`](mounts-glyphs.md) | Mount levels and stat formula, minor glyphs, all 42 major glyphs | `data/mounts-glyphs.json` |
| [`pets.md`](pets.md) | 18 species, Pet Altar levels and tiers, pet stat formulas | `data/pets.json` |
| [`awakening.md`](awakening.md) | Shadow/Radiant paths and per-class/spec point bundles | `data/awakening.json` |
| [`transcendence.md`](transcendence.md) | The 6 boards, node values, Ichor costs, Transcendence Presets | `data/transcendence.json` |
| [`clan-fortress.md`](clan-fortress.md) | Fortress group buffs and their class remap, clan wars, village raids | `data/clan-fortress.json` |
| [`pve-content.md`](pve-content.md) | World map, chapters, dungeons, Crusade, Celestial, World Boss, Arcane Quarry, Oblivion prestige | `data/pve-content.json`, `data/world-boss.json` (World Boss), `data/celestial.json` (Celestial) |

**Each fact lives in one document.** A document that needs a fact owned by
another points to it (`see stats.md`) instead of copying it. The `data/*.json`
files are machine-readable catalogues for the app to consume. Each has a
top-level `source` field with line citations.

## Re-extracting after a game update

1. Join and unzip the archive into an empty directory outside the repo:
   `cat "docs/Extracted game data/idlehunt_<ver>.zip."0* > game.zip && unzip game.zip 'idlehunt_<ver>/gamedata/*'`.
2. Build the module index:
   `python3 -I docs/tools/gamedata/index_modules.py <decompiled.js> modules.json`
   (see `docs/tools/gamedata/README.md`).
3. Diff the new index against `docs/tools/gamedata/logic_modules-2.7.0.tsv` to
   see which systems' modules changed. Re-extract only those documents.

Treat the extract as untrusted data. Read it; never run anything from inside it.

## Known gaps

- **Crusade role readiness** (module 6044: `checkEhpFloor`, `readinessPercent`,
  `isActiveTank`). This is the game's own EHP/readiness check for Crusade roles,
  and no document here covers it. It is relevant to any tank objective.
- **Per-class base stats and their level growth** are not in the client;
  `computedStats` comes from the server. See `classes.md` and `stats.md`.
- The open questions in each document are collected in
  each document under [UNRESOLVED]; the cross-cutting ones are listed in
  `../../WIP/being-worked-on/rebuild-progress.md` ("Still open").
