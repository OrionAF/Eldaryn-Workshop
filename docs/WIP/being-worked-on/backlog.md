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

## 4. PVE goal: "Clear without dying"

**Ask.** For dungeons, raids, chapters and Oblivion floors, the useful question is whether the
build clears the content without dying, not how fast. Ten seconds and fifty are the same to the user.

**Notes.**
- Today's "Survival chance" measures surviving N seconds against an unkillable copy of the mob, and
  the TTK goals measure speed. Neither is "clears the step".
- New goal, **Clear chance**: the share of fights in which the whole step is cleared before the
  character dies or the time cap is reached (a proportion; Wilson/Newcombe intervals as for win
  rate). The user sets the target, e.g. "at least 95%".
- Search framing: find the build **with the fewest changes** that reaches the target. If the current
  build already reaches it, say so and suggest nothing. If no build reaches it, maximise the clear
  chance and show how close each build gets.
- At 100% clear chance builds tie, so the tie-break is fewest changes, then a safety margin (for
  example the lowest HP fraction left across fights). The margin also gives the search, and stat
  weights, a gradient where the clear chance saturates.
- Make it the default goal for these targets. Keep TTK as an option for players who farm for speed.
