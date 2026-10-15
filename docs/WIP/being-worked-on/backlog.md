# Backlog: features the user asked for

> **Order:** quickest first (2026-10-15). Section numbers are stable IDs that other files cite, not the order. Sizes are rough agent time: XS under an hour, S one to two hours, M about half a day, L a day or more.

| Order | Item | Size | Status |
|---|---|---|---|
| 1 | §15 Fortress boss fight from the server log | M | Built on rebuild2/F2, not merged |
| 2 | §11 Celestial Trial Optimiser target | S | Built on rebuild2/C2, not merged |
| 3 | §6 Results say which pet, mount or glyph | S | Queued |
| 4 | §1 Optimiser step list | S | Merged |
| 5 | §3 Setup estimates | M | Merged |
| 6 | §9 Stat weights chart | M | Not started |
| 7 | §2 Rankings profiles as PVP opponents (and Celestial partners) | M | Not started |
| 8 | §10 Arena reward weighting | S | Needs §2 |
| 9 | §7 PVE replay check | L | Not started; needs dungeon logs |
| 10 | §10 Crusade (solo) | L | Not started |
| 11 | §5 Let the Optimiser change stones, board, Awakening and relics | L | Not started |
| - | §12 follow-up: a progress tolerance for builds that never win | S | Not started (see §12 open item) |
| - | §11 Celestial open questions | - | Waits for more server logs |
| Done | §10 Push, Fortress shield fix; §12 highest chance to win; §13 glyph pruning; §14 mount pruning; §4 win-rate goal; §8 imports moved to Settings; §10 retired kill time and survival, Combat Power and its guard, Fortress boss target; §11 Celestial engine | - | Merged |

## 10. Optimiser objectives: trim, fix the target range, add Push, a Power guard and Crusade

**Status (2026-10-15).** Done: retire kill time and survival, target range (slice O1); Combat Power and the Power guard (O2); Fortress boss target (O3). Fortress shield fix (O3b): two server siege snapshots show the shield divides alive defenders by the server's clan cap (30 on server 5), not the defending clan's size; merged. Push (O4): merged (§Push in simulation.md). Not started: Crusade (solo), Arena reward weighting.

**Ask** (2026-10-15): the user agreed to this review of the objectives.

**Remove** (DONE 2026-10-15, slice O1; `simulation.md` §Objectives):
- **Kill time (median and p90).** No content the app simulates pays for kill speed. Dungeon, raid
  and Oblivion mobs each have a 20-minute cap that never runs out, chapters have no timer, and
  hunting is a server roll with no fight (`combat-pve.md` §1, §14). Kill time also moves in steps of
  about 3% (one swing), so races between near-equal builds run long. Win rate already rewards speed
  where it matters, because a faster kill means less damage taken.
- **Survival** on chapter, dungeon, raid, Oblivion and World Boss targets. With caps that never run
  out, it equals win rate, and World Boss pays for damage, not for staying alive. Keep it for
  custom mobs only.

**Change** (DONE 2026-10-15, slice O1). Let the win-rate target go down to 10% and show "about N tries per clear" (1 / p) next to
the rate. A loss costs no key or reward on most content: a failed chapter level restarts
(`combat-pve.md` §14), an Oblivion floor keeps its key on defeat, and the dungeon text says only a
clear spends a key (`pve-content.md` §4, §11). The default stays 95%.

**Add, in this order:**
1. **Push** (DONE 2026-10-15, slice O4; `simulation.md` §Push). Finds the deepest dungeon step, Oblivion floor, raid step or chapter level the build
   clears at τ or better, and the build that does it. Difficulty only goes up with depth, so: start
   at the current step, climb while the target is met, then bisect. Reuse each step's runs.
2. **Combat Power guard.** (DONE 2026-10-15, slice O2: `engine/power.js` exact on two real profiles,
   `stats.md` §8; the guard is in `simulation.md` §Build space.) Power has an exact client formula (`stats.md` §8). Crusade Hard, Mythic
   and Mythic+ entry is gated on it: Mythic+N needs `round(13000 * 1.18^N)` (`pve-content.md` §5).
   Show the Power change on every result row, and add an optional "keep Power ≥ X" whose default is
   the user's current Mythic+ gate. It needs no simulation.
3. **Crusade, solo.** The only content where kill speed decides the result: 300 s for the whole
   run of 3 bosses, and a Mythic+ full clear guarantees 3 enchant stones, while a partial clear
   rolls a smaller table (`pve-content.md` §5). The client ships `simulateCrusadeFight` (L1868835,
   never called), so this is a port like the dungeon fight, labelled server-run. Objectives: full
   clear rate, and expected stones per run.
4. **Fortress boss** (clan war). A 60 s damage race like World Boss, with its stats in the client
   (`clan-fortress.md` §1.4). The boss shield (alive defenders) is an input.
5. **Arena reward weighting**, after the Rankings import (§2). Beating someone 3 places above pays
   30 influence, 3 places below pays 5 (`combat-pvp.md` §13).

**Spec and role.** The `spec` block only switches to the character's other talent set, and only
when "Spec" is on under Allowed to change. It never respecs, which costs 10 gems. For solo content,
picking Fury over Protection is a valid answer when it clears more often, because solo fights have
no roles. Party content is different (the boss hits the tank holder), and the solo objectives cannot
express that. See §11.

## 13. Optimiser: glyph dominance pruning

**Ask** (2026-10-15): "If I have 4 minor glyphs that give attack speed, 11%, 10%, 10% and 5%, never try a build with the 5% one, and never replace a 10% glyph with another 10% one."

**Rule.** A minor glyph adds one secondary stat, and more of a stat never hurts, so these cuts are exact:
- Within a stat, a row that uses m glyphs of that stat uses that stat's top m by value.
- Glyphs with the same stat and value are interchangeable, so a swap between them is never raced.
- A socket is never left empty while a usable glyph remains.
- For majors, only the best copy of each type counts.

For the user's Sentinel this cuts about 378 minor-glyph rows per visit to about 80. It replaces the earlier single-socket idea (branch `rebuild2/S1-wip`, now dropped). It follows §14's measured result: mount pruning alone cut the mounts from 11 to 2, but the Fortress run still did not finish in 10 minutes.

**Status:** done (slice G1, branch `rebuild2/G1-r1`). Measured on the user's Sentinel (L85, active preset, 13 usable minors): the `minorGlyphs` domain fell from 377 rows to 78 (378 to 78 counting the baseline). The `majorGlyphs` domain stays at 3 there, since only a few majors act for the spec and running sigils. All 42 major tables are monotone in rarity (a catalogue test checks it), so major pruning is exact for every type. The mount inner ascent and the spec block use the same domains; nothing else enumerates glyph subsets.

## 12. PVE goal: highest chance to win

**Ask** (2026-10-15): "Find me a build which gives me the highest % chance to win."

**Plan.**
- A new goal, "Highest chance to win", becomes the default for content you clear. It ranks on clear rate, and ties go to the fewest changes. "Reach a win rate" stays as an option, with its minimum lowered to 1%.
- Fast decisions at low rates. When the leading build has wins, builds with none are dropped quickly. Only when no build wins does how far each one gets decide, and the result then says so plainly.
- Measured problem: on Hard Forsaken Mines step 2, a race of 299 sigil sets ran 306,208 fights and dropped none.

**Status:** done (slice W3), on branch `rebuild2/W3`. The goal, the exact discordant bounds and the verdicts are in simulation.md §Win rate.

Measured on the user's Sentinel (`profile-sentinel-l85-oct15b.json`), Hard Forsaken Mines, Standard effort, sigils only, seed 1. Each run has one race of 299 sigil sets. "Old" is main before W3 with "Reach a win rate" at 95%.

| Step | Rule | Race fights | Arms dropped | Fights per arm | Whole run |
|---|---|---|---|---|---|
| 2 | Old | 377,856 | 298 | 233 at 1,024, 64 at 2,048, 2 at 4,096 | 382,976 fights |
| 2 | Highest chance | 376,832 | 298 | 234 at 1,024, 63 at 2,048, 2 at 4,096 | 381,952 fights |
| 3 | Old | 745,472 | 298 | 234 at 2,048, 65 at 4,096 | 751,616 fights |
| 3 | Highest chance | 741,376 | 298 | 236 at 2,048, 63 at 4,096 | 747,520 fights |
| 6 | Old | 745,472 | 296 | 234 at 2,048, 65 at 4,096 | 761,856 fights |
| 6 | Highest chance | 612,352 | 0 (all tied) | 299 at 2,048 | 1,555,456 fights |

- The 306,208 fights above are 299 arms at 1,024 fights plus the 32-fight screen: a snapshot at the first full look, before any arm could leave. Both rules drop the zero-win arms at that look or the next.
- On step 2 the leader wins 0.9%, so the old Tango interval already ruled the zero-win arms out at 1,024 fights. The new bound changes nothing there.
- On step 6 almost nothing wins. Every arm ties with the leader within 1 point by 2,048 fights and the race ends there, cheaper than the old race. No build won on the minimise and confirm fights either, so those contrasts compare progress and run towards maxN in minimise (523,264 fights) and confirm (419,824 fights). The whole run costs twice the old one (368 s against 200 s).
- Open: progress contrasts between builds that never win run to maxN when their progress is close. A progress tolerance (a δ for the margin) would stop them early.

## 15. Fortress boss fight from the server log

**Finding** (2026-10-15, a real `/fortress/boss-fight/start` log, fixture `fortress-boss-top-fight.json`): the server runs this fight with the Arena duel vocabulary (the player is the attacker, the boss the defender). The boss swings every 1 s for 500 ±15%, and the player's misses work (35 of 60 dodged). Elusive Supremacy never raised attack or speed: all 171 swings came at a steady 349 ms, and every hit was exactly the sheet attack. The real fight dealt 22.6M per second, against about 42M in the app's PVE-engine model. The app's Fortress sigil advice was therefore wrong.

**Plan:** rebuild the fight on the right engine and replay-check it against the log tick by tick, then re-rank sigil sets for this target.

**Status: built on rebuild2/F2, not merged.** The fight now runs on the arena duel engine with the Fortress rules the log shows (Game/clan-fortress.md §1.4; simulation.md, Fortress boss). The replay check (`engine/pve/fortressReplay.js`) passes every rule on the log. The app's dps for the logged attacker went from 41.7M to 22.2M; the log's 22.6M sits inside the model's one-fight range.

**Sigil sets re-ranked** (the user's Sentinel, `profile-sentinel-l85-oct15b`, active preset, TOP 5 stars; every sigil set the sigil block can try, 299 sets, 200 fights each on common random numbers, seed 1; `src/lib/__fixtures__/real/fortressSigilRank.test.js`, run with `FORTRESS_RANK=1`). Dps is raw damage per second, before the clan multipliers.

| Sigil set | Old engine (PVE) | New engine (duel) |
|---|---|---|
| Elusive Supremacy + Blinding Mark + Mist Veil | **#1** 34.98M | #188 22.14M |
| Elusive Supremacy + Blinding Mark + Phantom Veil | **#2** 34.04M | #180 22.19M |
| Ember Curse + Elusive Supremacy + Blinding Mark | **#3** 33.36M | #19 24.42M |
| Elusive Supremacy + Mist Veil + Phantom Veil | **#4** 32.30M | #200 22.01M |
| Venom Wound + Elusive Supremacy + Blinding Mark | **#5** 32.22M | #60 23.52M |
| Venom Wound + Ember Curse + Elusive Supremacy (current) | #15 28.62M | **#1** 25.63M |
| Venom Wound + Ember Curse + Siegebreaker Mark | #41 26.43M | **#2** 25.63M |
| Venom Wound + Ember Curse + Hawk Focus | #45 26.09M | **#3** 25.30M |
| Ember Curse + Elusive Supremacy + Siegebreaker Mark | #21 28.03M | **#4** 25.25M |
| Ember Curse + Elusive Supremacy + Hawk Focus | #24 27.67M | **#5** 25.00M |

The old engine's pick (Elusive Supremacy, Blinding Mark, Mist Veil) is the set the user fought the logged fight with. The new engine scores it 22.14M, close to the log's 22.6M. The optimiser itself (sigils only, Standard, seed 1) now keeps the current set ("No change measured better"); the old engine moved to that #1 set (+20%). Elusive Supremacy and Siegebreaker Mark tie because stack sigils do nothing here. Caveat: the new top sets lean on Venom Wound and Ember Curse damage. The boss's resist is a plain 20% (the game's "20% Spell resist", the engine's x0.8), but the log had no spell damage to check the rest of the spell path against. A Fortress log with a damage sigil would test it.

## 11. Celestial Trial (party of 2), and party roles

**Status (2026-10-15).** The Celestial engine is merged (slice C1), replay-checked against five server logs. The Optimiser target (C2: partner from my other characters or my opponents, or solo; tank; starter; tactics; difficulty; level) is built on rebuild2/C2, not merged (simulation.md §Celestial Trial). Follow-up: Push on Celestial (the deepest level cleared at a target rate). Open questions (Overload end and Judgment, NORMAL Overload, stack-player rule) wait for more logs.

**Ask** (2026-10-15): can the Celestial Trial be simulated? The user supplied one server fight log
(Hard, level 85, the user plus a tank partner). It stays outside the repo because it names another
player. Facts and the log check are in `Game/pve-content.md` §6.

**What we have.** The full client config per difficulty: boss tables, level bands, time limits,
spell resist, and the four spells with their Hard overrides. The log matches it exactly on boss HP,
add HP and timing, the Judgment Strike rhythm and the time limit. The log also has every tick, so a
port can be checked tick by tick, like §7.

**What's missing.**
- There is no Celestial simulator in the client. The fight would be built from the config plus
  the shared engine, then fitted to logs, so it carries a "built from logs" label and is less certain
  than the client ports.
- We need several more logs: other levels, Normal, and other partners.
- The partner's build. The Rankings import (§2) gives their loadout and server sheet, so the pair
  can be simulated.
- Mythic's party-power HP scaling is server-side.

**Objective.** Party clear rate within 360 s, with the user's build as the variable and the
partner fixed. This is where tank versus damage spec gets judged properly. If the user is the
tank, the boss and Judgment Strike hit them, and Block Fury matters. Crusade groups would use the
same party machinery later.

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

**Status: built on rebuild2/STEPS, not merged.** Progress carries `searchSteps` (simulation.md §Progress), the result `search.steps`, a saved run `steps`. The list is a `StepList` (design-system.md §4.17) on the Optimiser page, in the Jobs tray and in a run's Details. Push shows its rungs as before and has no block list.

## 3. Optimiser setup: estimates before you run

**Ask.** A section of the setup shows the estimated time, the number of builds to try and the number
of fights to simulate.

**Notes.**
- It builds on the speed calibration (fights per second on this device, per fight kind).
- Builds: the space size per enabled block, exact when the space is enumerated, an estimate
  otherwise. Fights: a range from the race rules (the least when every arm resolves at the first
  look, up to the cap at maxN). Time: fights divided by the calibrated speed and the worker count.
- Label every number as an estimate (decision Q5), and update it live as the setup changes.

**Status.** Built on rebuild2/EST, not merged (2026-10-15). `search/estimate.js` `estimateRun` and the
Estimate section of the setup (`components/optimiser/SetupEstimate.svelte`); it replaces the old
interpolated Optimiser line under Effort. What is exact and what is assumed: simulation.md §Estimates.
Push estimates the start rung's build search only.

## 9. Stat weights chart (like the v1 one)

**Ask** (2026-10-15): bring back the old stat-weight display, one chart that ranks every stat, not a
weight table per piece of content.

**What v1 did** (`src/lib/statWeights.js` and `SimulationScreen.svelte` before `f486ffc`): it added one
game-sized step to each stat in turn (+100 Attack, +1 point of Attack %, +1% Crit, +10% Crit
Multiplier...), re-scored the preset with the closed-form expected DPS, and drew the gain as a bar
per stat, largest first. The tank and PVP goals added the defensive stats. The ranking came from a
formula, not from fights.

**Plan.**
- The engine has no closed form now, so measure the weights in the client port. Use mean damage per
  second against the training dummy (`metrics.js` `dpsVsDummyAsync`, the one Drop Check uses) and
  common random numbers. The mean over a fixed duration is smooth, so it avoids the median-TTK
  steps the 2026-10-15 experiment hit.
- Defensive stats rank on survival against one fixed reference enemy (`survivalAsync`). Show it as a
  second chart, because damage and survival are different units.
- Probe the raw totals and apply the caps once (the rule v1 learned the hard way), so a stat past its
  cap shows about 0. Use the v1 step sizes.
- Each bar shows its interval. A stat whose interval spans 0 reads "no measurable effect", never a
  rank.
- It runs as a job, on the Character Stats page or in Tools, for the selected preset.

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

## 14. Optimiser: never try a mount another owned mount beats

**Ask** (2026-10-15): the Optimiser should never test Common mounts when Epic ones are owned.

**Rule.** A mount only adds attack % and HP % (each `round(base * (1 + 0.1*(level-1)))`), and every mount has the same sockets. So a mount that another owned mount matches or beats on both values can never help. This is pruned by Pareto dominance, not by rarity, because a level-5 Rare (up to 41 HP / 28 attack) can beat a level-1 Epic (34-39 / 24-27). For the user's Sentinel it cuts 11 mounts to 2.

**Status:** done (slice M1, merged 828af25). The mount list dropped from 11 to 2. Measured on the Fortress run, 10-minute caps: 8,762 builds before vs 6,484 after; neither finished. The minor glyphs are the bigger cost (§13).

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

## 8. Easier imports without HTTP Toolkit (phone-only capture guide)

**Status (2026-10-15): replaced.** The capture-guide idea is dropped. Instead every import entry point
moved to Settings > Data > Import, behind one disclaimer: importing is possible but finicky, it needs
another app (HTTP Catcher on iPhone) or a PC with HTTP Toolkit, Android usually needs root, and this
app's own backups always import. The notes below stay as the research record.

**Ask** (2026-10-15): can users capture the profile and fight JSON from their phones without HTTP
Toolkit? Can the app ask the game server for it?

**Findings.**
- The game client talks to `https://api.eldaryn.solmeron.com` with the player's login token
  (`Authorization: Bearer …`). Own state: `GET /player/full-state`. Another player:
  `GET /leaderboard/player/<id>`. `/arena/fight` is a POST that starts a real fight.
- Calling it from this app would mean handling the user's token, getting past the browser's
  cross-site block (it would need a proxy), and very likely breaking the game's Terms of Service.
  Rejected.
- There is no web version of the game: eldaryn.live is the wiki, so DevTools capture is out.

**Plan.**
1. **Phone-only capture guide** inside the Import dialog. On iPhone, an on-device HTTPS capture app
   (Proxyman for iOS, HTTP Catcher, Stream) lets you trust its certificate, open the profile or
   fight in game, and share the response to Files, with no computer. Android needs root or a
   computer (apps ignore user certificates since Android 7), so say that plainly. Keep the steps
   short, with screenshots.
