# Backlog: features the user asked for

> **Status:** queued. Start these after the current speed work (worker pool, engine speed pass,
> CPU profile and calibration, the race's futility stop, and the stat-weight surrogate decision).
> Added 2026-10-15.

## 1. Optimiser: list the search steps

**Ask.** Clicking the Search segment, or a button beside it, shows the steps the run has done and the
one it is on, e.g. "1. Gear set: done · 2. Talents: done · 3. Pets: done · 4. Relics: in progress".

**Notes.**
- The search walks the build-space blocks (`search/space.js` `BLOCKS`). Progress already reports the
  current block ("Search, talents: 1,782 builds tried").
- Extend the progress message with one row per block: status (queued, running, done, skipped because
  the user turned it off), builds tried, fights, and whether it found an improvement. Multi-start runs
  pass over the blocks more than once, so show the pass number too.
- UI: an expandable step list under RunProgress on the Optimiser page and in the Jobs tray
  (design-system.md §4.17).
- The run history keeps the final list.

## 2. Import other players' profiles as PVP opponents

**Ask.** Import the profile JSON that the game returns when you open another player from Rankings,
and save it as a PVP opponent.

**What the file holds** (a sample is outside the repo; commit only a sanitised copy as a fixture):
- class, level, `activeSpec` and realm;
- `equipment` per slot (rarity, item level, primary and secondary stats);
- `equippedPet` (species, rarity, level, tier, secondaries) and `activeMount` (species, rarity,
  level, base rolls);
- `equippedSigils` with levels, `utilitySigil`, `sigilAltarTier`, `activeMajorGlyphs`;
- `equippedRelics` with levels, `enchantSlots`, `socketedStones`, and `awakeningPath` (no level);
- the full server-computed `computedStats`.

It has no talent allocation, Transcendence nodes, mount glyphs or awakening level.

**Notes.**
- `computedStats` is the server's own sheet, so it becomes the opponent's stat sheet exactly, with no
  model gaps. The loadout (spec, sigils with levels, utility, major glyphs, Druid form) supplies the
  mechanics the PVP resolver needs (`features/duel.js`, opponent model `model/opponents.js`).
- The import dialog (`lib/importPlan.js`, kind detection) gets a new kind, "player profile
  (opponent)". It is told apart from the user's own profile because it has `equippedPet`,
  `activeMount`, `computedStats` and `arenaRank` instead of whole collections.
- Re-importing the same `playerId` updates that opponent instead of adding a duplicate.
- Strip player and clan identifiers from any committed fixture.

## 3. Optimiser setup: estimates before you run

**Ask.** A section of the setup shows the estimated time, the number of builds to try and the number
of fights to simulate.

**Notes.**
- It builds on the speed calibration (fights per second on this device, per fight kind).
- Builds: the space size per enabled block, exact when the space is enumerated, an estimate
  otherwise. Fights: a range from the race rules (the least when every arm resolves at the first
  look, up to the cap at maxN). Time: fights divided by the calibrated speed and the worker count.
- Label every number as an estimate (decision Q5), and update it live as the setup changes.

## 4. PVE goal: win rate ("clear without dying")

**Ask.** For dungeons, raids, chapters and Oblivion floors, the useful question is whether the
build clears the content without dying, not how fast. Ten seconds and fifty are the same to the user.

**Notes.**
- Today's "Survival chance" measures surviving N seconds against an unkillable copy of the mob, and
  the TTK goals measure speed. Neither is "clears the step".
- New goal, **Win rate** (the user confirmed 2026-10-15: "basically the win rate"; same name and
  intervals as PVP win rate): the share of fights in which the whole step is cleared before the
  character dies or the time cap is reached (a proportion; Wilson/Newcombe intervals as for win
  rate). The user sets the target, e.g. "at least 95%".
- Search framing: find the build **with the fewest changes** that reaches the target. If the current
  build already reaches it, say so and suggest nothing. If no build reaches it, maximise the win
  rate and show how close each build gets.
- At a 100% win rate builds tie, so the tie-break is fewest changes, then a safety margin (for
  example the lowest HP fraction left across fights). The margin also gives the search, and stat
  weights, a gradient where the win rate saturates.
- Make it the default goal for these targets. Keep TTK as an option for players who farm for speed.

## 5. Optimiser: let it change more than the loadout

**Ask.** Today the optimiser only switches things the user owns (sets, sigils, relics, pet, mount,
board choice, glyph sockets) and keeps gear, stones, levels, Awakening and pet/mount rolls fixed. Add
options to:

| Option | What it searches | Cost in game | Default |
|---|---|---|---|
| Re-slot stones | Which owned enchant stones sit in which gear slots, per gear set | Free | On |
| Re-arrange Transcendence | A new node allocation for a board, within its point budget and the graph rules | Reset is free; a 2nd board is expensive | On |
| Reset Awakening | Path and point allocation | Very expensive | Off |
| Upgrade owned relics | Higher levels for relics already owned | Costs resources | Off |
| Buy new relics | Relics the character does not own yet | Costs resources | Off |

**Notes.**
- Stones: check `Reference/Game/stones.md` for which stone types each slot and realm accepts. The
  search is an assignment of stones to slots. Most of a stone's value is stats, so the stat-weight
  surrogate can order it, with simulation to confirm.
- Transcendence: use the board-graph rules in `src/lib/transcendence.js`, the point budget, and the
  Ancient sigil's node (decision Q3). Search an allocation, not only the saved boards. Applying it
  re-allocates that board, which every preset linked to it shares, so show the side effects. Never
  suggest buying a second board.
- Awakening, relic upgrades and relic purchases cost resources. Each result row shows what it would
  cost, in the game's own currency, from the catalogue where the client has the cost, and the results
  keep free changes apart from paid ones. Relic levels respect the class pool and level caps
  (`Reference/Game/relics.md`).
- Each option is a toggle under "Allowed to change". The scope chips and Apply review say exactly
  what gets written: stones per set, the board shared by presets, the character-wide Awakening, relic
  levels and ownership.

## 6. Optimiser results: say exactly which pet, mount or glyph

**Ask.** Pets of the same species share a name, so "Pet: Iron Golem → Iron Golem" does not say which
Iron Golem to equip. Show the suggested pet's secondary stats.

**Notes**, from the same screenshot (Rank 1, dungeon, TTK median):
- **Name owned instances unambiguously.** Wherever a result names something the user owns several of,
  show what tells them apart:
  - pet: rarity, level and secondary stats;
  - mount: level and rolls;
  - glyph: rarity and stat;
  - stone: type and stats.
  Apply this to change rows, the Apply review and the "Show full build" drawer. When two owned copies
  are identical, say so ("either of your 2 identical copies").
- **Raw stat keys leak** in the full-build drawer ("Quickstep (Common) healthPercent 4.5",
  "critDamage 0.09"). Use the shared stat label formatter ("Health +4.5%", "Crit damage +9%").
- **Talent changes list the whole allocation twice.** Show only the points that moved, e.g. "Essence
  Siphon 2 → 0, Focused Casting 0 → 3".
- **A baseline with no value shows "n/a".** On TTK the current build had no median because it
  rarely wins, and the axis then reads "−0.00 s … 0.00 s". Say why instead: "Rarely clears: 18% win
  rate; compared by win rate". Draw the axis on the basis actually used. Backlog §4 (Win rate)
  removes most of these cases.

## 7. PVE replay check against server dungeon logs

**Ask** (from a real dungeon log the user captured, 2026-10-15). The PVP side already has a replay
check against a real `/arena/fight` log (`engine/pvp/replayCheck.js`). Build the same for PVE dungeon
runs.

**What one log shows** (a Mystic with Void Aegis; 3 mobs; died on mob 3 at 58.56 s):
- 10 ms ticks: a DOT tick lands at 1,510 ms after the cast at 1,500 ms;
- a 720 ms player swing and a ~1,665 ms mob swing;
- spell cadence: Barrage every 1 s, Burst every 3 s, and the Runic Affliction cycle;
- HP regen pulses of 461 every 100 ms;
- heals land in the same tick as the cast, HP first;
- with Void Aegis (`vampAlwaysRefills`) the WHOLE vamp heal also refills the shield, not just the
  overflow;
- regen pulses refill the shield while HP is full;
- the shield cap (`playerShieldMax` 175,626).

**Notes.**
- Only attack rows carry `playerShieldHp`. Spell rows carry `playerHpAfter` (the end-of-tick value),
  so a checker has to reconstruct the shield between attack rows.
- The rules to check: timing, swing intervals, spell cadence, heal → HP → shield, regen pulses, the
  shield cap, and mob-to-mob transitions. Damage values can be checked too once the fight is run with
  the logged character's stats.
- Commit the log as a fixture next to `arena-fight-warrior.json`. It holds fight values only, no
  player identifiers; check before committing.
