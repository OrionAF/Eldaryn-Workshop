# Simulation contracts

How the app measures builds: the statistics every tool shares, the optimiser's search and its
result shape. App contracts only; game facts are in `Game/`. This file is the contract; the code cites it.

## Statistics

Code: `src/lib/engine/stats/` (`tdist`, `intervals`, `multiplicity`, `sequential`), re-exported by
`src/lib/engine/metrics.js`. Every function takes a two-sided `alpha` that is already divided by
its multiplicity family, and returns plain data.

### Sampling unit

Fight *i* of a stage uses `rng = fightRng(seed, i)` (`engine/rng.js`) for every build measured on
that stage (common random numbers, below), so outcomes are paired by fight index and prefix-stable:
raising N extends a sample, never restarts it.

### Common random numbers

`fightRng(seed, i) = laneRng(hashSeed(seed, i))`: a mulberry32 stream that also hands out
independent child streams, `rng.lane(name)`, each seeded from `(seed, name)`. The engine reads one
lane per actor and draw purpose:

| Engine | Lanes |
|---|---|
| PVE tick | `player` → `avoid`, `crit`, `double`, `blind`, `paralyze`, `disrupt`; `minion`; `enemy` → `avoid`, `crit` |
| PVP | `attacker` / `defender` (the swinger's side) → the same sub-lanes; `<side>` → `minion` |
| spells | `spell:<species>` of the caster's lane (PVE: the root) |
| debuffs | `debuff:<species>:<type>` of the caster's lane (PVE: the root) |

Why: with one shared stream every conditional draw (an extra swing from more Attack Speed, a new
proc) shifts all later draws of every actor, so two builds stop seeing the same luck after the
first difference (finding #75). With lanes, a build change only moves the draws of the lanes it
touches. Each lane is uniform and independent, so a fight's distribution is unchanged; `lane(rng,
name)` returns a plain or scripted rng itself, so port tests keep the client's exact draw order.

Measured (`engine/crn.test.js`, the class fixtures, +5 % Attack Speed, same fight seeds; paired sd
of the per-fight difference, lanes vs one stream):

| Case | Reduction |
|---|---|
| time to kill, dungeon_3 step 4 (enemy hits back) | 63-91 % (Warrior 90, Sentinel 63, Mystic 91, Necromancer 12) |
| time to kill, Oblivion floor 20 | 84-95 % (Necromancer, who loses: 32 %) |
| damage on the training dummy (no enemy draws) | about 0 on average: −26 % to +55 % by class, within noise at N = 40-100 |
| PVP win, fixture vs fixture (discordant duels, N = 200) | 40-66 % fewer discordant pairs (e.g. 47 → 16, 81 → 40) |

So the paired intervals are much narrower whenever the opponent draws too; against the dummy
pairing is no better than before (it was already about 4× tighter than independent samples). The
statistics stay valid either way: they use the observed paired sd, never an assumed one.

### Estimates (one build)

| Statistic | Interval | Function |
|---|---|---|
| mean (DPS) | Student-t with the **exact** quantile for every df (inverse regularised incomplete beta, not a table) | `meanInterval` |
| proportion (win, alive) | Wilson score | `wilsonInterval` |
| censored q-quantile (TTK, a loss is +∞) | inverse empirical CDF: the ⌈nq⌉-th smallest of **all** fights, +∞ when fewer than a q share were won. Interval [x(l), x(u)] with B ~ Bin(n, q), P(B < l) ≤ α/2, P(B ≥ u) ≤ α/2 (distribution-free); an unreachable bound is ±∞ | `censoredQuantile`, `quantileInterval` |

Fewer than two samples give null mean bounds (no interval), never a zero-width one.

### Paired contrasts θ(X) − θ(Y)

| Data | Method | Function |
|---|---|---|
| means | paired t on per-fight differences | `pairedT` |
| 0/1 outcomes | **Tango score interval** on the discordant pairs (b = X won and Y lost, c the reverse); p-value = McNemar z. Never a t interval: with no discordant pair at n fights the interval is ±z²/(n+z²) (±0.0566 at n = 64), whatever the concordant split | `pairedProportion` |
| 0/1 outcomes per stratum (PVP matchups, equal weight) | per-stratum Tango limits combined by MOVER (square-and-add); p from the stratified McNemar z | `stratifiedPairedProportion` |
| censored quantiles | paired bootstrap: fight indices resampled (same indices both sides), B = 2 000, seeded `hashSeed('paired-bootstrap', seed, n)`, percentile interval; two equal values (including ∞ and ∞) differ by 0 | `pairedBootstrap`, `pairedQuantileDiff` |

`metrics.pairedDelta(a, b)` (legacy shape, b − a) routes data that is all 0/1 to `pairedProportion`
and everything else to `pairedT`.

Why Tango, not Newcombe's square-and-add (method 10): Newcombe's width depends on the phi
correlation of the concordant pairs, so with no discordant pair and a 50/50 concordant split at
n = 64 it gives ±0.030 (and exactly 0 without the phi continuity correction), under-covering a true
difference of a few points. Tango's limits depend only on the discordant counts and n, are the
score-test inversion (excludes 0 ⇔ McNemar rejects), and are among the intervals recommended by
Fagerland, Lydersen & Laake (2014) for paired binomial proportions.

### Multiplicity

`holm(ps, alpha)` (step-down; `alphaEach[i]` is the level reached by hypothesis i) and
`bonferroni(ps, alpha)`. Families: racing = Bonferroni over arms × looks; confirm = Holm over rows
vs baseline; attribution = Holm within a row's changes; Drop Check = Holm over its metrics.

### Sequential comparator

`compare(getX, getY, {statistic, q, higherIsBetter, delta, deltaKind, alpha, n0, maxN, seed, B})`
(`compareAsync` for async samplers). `getX(n)` returns the first n outcomes.

- Looks at `n0, 2n0, 4n0, …` below `maxN`, then `maxN` (`lookSchedule`). Each look uses the
  two-sided level `alpha / looks` (Bonferroni over looks).
- Verdict of the interval for θ(X) − θ(Y) (`decide`), in this order: `better` / `worse` when it
  excludes 0 (direction by `higherIsBetter`); `equivalent` when it lies inside (−δ, δ); otherwise
  continue; at `maxN` `unresolved`. So the shown interval excludes 0 ⇔ `significant`.
- δ is the indifference zone: `absolute` (points for proportions) or `relative` to |θ(Y)| at
  that look (`deltaAbs`; 0 when θ(Y) is infinite, so equivalence is then impossible). The win-rate
  margin between builds that never won takes δ_progress instead (§Win rate).
- A true effect inside (0, δ) may correctly resolve either `better` or `equivalent`; which one
  comes first depends on the sample path.
- `nNeeded = ⌈((z(1 − α/2) + z(0.8)) · sd / max(|Δ|, δ))²⌉` with the look's α and the per-fight sd
  of the contrast; reported on `unresolved`.

Returned **Contrast**: `{delta, lo, hi, pct, n, seed, alphaAdj, method, verdict, significant,
nNeeded, looks, p, sd, zone}`; `pct = delta / |θ(Y)|`, `zone` = δ in the statistic's units.

Calibration (`stats/calibration.test.js`, 2 000 synthetic replicates): under the null the false
`better` rate is at most α/2 for means and proportions; a δ/2 effect never resolves `worse`
beyond α/2 and reaches `equivalent` in a large share of runs; a 2δ effect is found `better`.

### Numerics

`tdist.js`: regularised incomplete beta and gamma by continued fraction (Numerical Recipes §6.2,
§6.4), Lanczos ln Γ, quantiles by bisection on the CDF; accurate to about 1e-10 relative, far
below Monte-Carlo error.

## Build space

Code: `src/lib/search/space.js` (candidate, canonical form, blocks), `legality.js` (legality oracle),
`effect.js` (effect oracle), `patch.js` + `src/lib/store/apply.js` (the one write path). Design
record: plan §A.3-§A.5, §A.11.

### Candidate

A plain-JSON choice set applied on top of one preset:
`{equipmentSet, talentSet, talentAllocation, petId, mountId, mountGlyphs, relicIds, sigilSpecies,
utilitySigilSpecies, ancientSigilSpecies, transcendencePresetId, sigilConditions}`.

- `talentAllocation` (the chosen set's allocation) and `mountGlyphs` (the chosen mount's sockets)
  are `null` iff equal to the saved value.
- `transcendencePresetId` is the **resolved** board (`resolveTranscendencePreset`), so a null link
  and the board it resolves to are one build; applying keeps a null link while the board is unchanged.
  The Ancient checks use the board the stats run on (`runningBoardOf`, level gates applied).
- `sigilConditions` holds only overrides of the character-wide condition (`sigils.owned[sp].condition`)
  for equipped sigils; `ON_COOLDOWN` is written explicitly.
- Canonical form: list entries kept from the saved preset stay in its order, new ones follow sorted;
  a socket keeps its saved glyph, new glyphs fill free sockets left to right, sorted. Equal choices
  are equal JSON, and the saved preset's candidate writes nothing.

Scopes of the writes: preset (its own fields), character (talent allocation, conditions), mount
(sockets). A character or mount write lists the other presets it also changes (`sideEffects`).

### Blocks

`spec`, `equipmentSet`, `sigils`, `utility`, `ancient`, `conditions`, `relics`, `pet`, `mount`,
`transcendence`, `minorGlyphs`, `majorGlyphs`, `talents`, in that order. `domain(c)` lists every legal
value of the block given the rest of `c` (legalised, canonical, without `c` itself):

- gated by the unlock levels in `model/legality.js` (sigil slots, dual equip 28, dual talents 38,
  mounts 40, conditions 54, board links 58) and the relic slot cap;
- conditions: PVP offers every option of the sigil; PVE only `ON_COOLDOWN` and `MY_HP_BELOW_*`
  (damage and debuff sigils cast on cooldown in PVE);
- the Ancient only on a board that allocates its node (Q3 strict); a board switch drops it;
- majors only those that act for the spec and the running sigils, one per glyph type (and only the best
  instance of a type, see glyph dominance below); minors only as glyph dominance below allows;
- mounts: only owned mounts no other owned mount dominates. A mount adds only `attackPercent += effAtk` and
  `hpPercent += effHp` (`mountEffectiveStats`; Game/mounts-glyphs.md §1, §5) and every mount has the same sockets
  (§8), so (mount stats being realm-independent) a mount another one matches or beats on both stats can never improve any objective: pruning is exact.
  Dominance is on (effAtk, effHp), not rarity (a level-5 Rare can beat a level-1 Epic on HP and lose on attack).
  Of equal twins the ridden one, else the first owned, is kept. The candidate's current mount stays the baseline
  even when dominated, and switching to its dominator stays offered. `space.prunedMounts(c)` lists `{id, by}`;
  the search result's `blocks[mount].pruned` carries it as `space.pruned('mount', c)` (stat dominance item 4 below);
- glyphs (exact, with one exception): a minor glyph adds one secondary stat with a value
  (`glyphSecondaryValue`; Game/mounts-glyphs.md §9) to the ridden mount's bonuses, and every stat of the 26-stat
  pool enters the totals as a sum that only flattens at a cap (Game/stats.md caps). None of them lowers an
  objective except through thorns (the control stats act on the enemy; miss/blind/DR/block only help the
  holder). So more of a stat is never worse, and the pruning is exact unless a thorns source is active (Iron
  Bastion, Bulwark of Thorns, rebound). Thorns grow with the hits the holder takes, so damage reduction, miss,
  block, blind, paralyze, disruption and fear can lower the damage dealt, and the pruning is then a heuristic.
  No test pins the 26-stat claim against the engine: it rests on the code reading in Game/stats.md;
  1. within one stat a row that uses m glyphs of it uses that stat's top-m by value (an 11% / 10% / 10% / 5%
     attack-speed set never races the 5%). `minorGlyphs` therefore enumerates per-stat counts m_s, each stat
     contributing its top-m_s glyphs, not every subset (`space.minorRowsFor`);
  2. glyphs of one stat and value are interchangeable. A row may still use several of them (two 10% glyphs
     add 20%), so they are not collapsed to one representative: they are ordered (socketed one first, else
     lowest id) and a row takes a prefix, so a swap between twins is never offered;
  3. an empty minor socket is dominated by the same row plus any unused usable glyph (a value is always
     > 0), so rows are full: min(3, usable) glyphs. The current row stays the baseline even when partial;
     "usable" means unsealed with a rolled secondary (a glyph without one adds nothing, like an empty socket);
  4. majors: per glyph type only the best unsealed instance (rarity ladder; every perRarity table of
     Game/mounts-glyphs.md §10 improves with rarity: cooldown, damage, thorns, stacks and CC grow, decay
     and the Elusive stack loss shrink, which is the better direction; the Elusive override is absent
     below Epic and 1 from Epic, also better; `glyphDominance.test.js` checks every table of the catalogue) and `activeMajorGlyphs` already keeps
     only the highest rarity of a type; of equal rarity the socketed instance, else the lowest id. The
     one-per-type, sealed and inert-major rules stay. Major rows still allow empty sockets;
  5. the same domains serve the compound mount block's inner socket ascent and the spec block's.
- talents: +1, −1, move 1 or k points between two talents, every redistribution of a tier's points,
  within `talentPointsForLevel`; then the stat dominance filter below;
- relics: full sets only, min(slot cap, owned) relics: every relic bonus is positive and grows with level
  (Game/relics.md §2, §7; `statDominance.test.js` checks the catalogue), so a free slot never beats one more relic.
  The current set stays the baseline even when partial;
- pet: never "no pet" while a pet is owned: a pet adds positive flat Attack and HP plus its secondaries and has no
  ability (Game/pets.md §4);
- stat dominance (exact, under the glyph rule's "more of a stat never hurts"; `search/dominance.js`) on `sigils`,
  `utility`, `conditions`, `relics`, `pet` and `talents`: a value is dropped when the incumbent or another value of
  the same visit gives the engine the same inputs apart from the stats, and matches or beats it on every stat. Both
  are read from the engine's own inputs (`preparePveFighter`, `fighterDuelArgs`, `fortressPlayerDuelArgs`), so a stat
  the mode ignores (PVP ratings in PVE) never blocks a prune, and spells, shield, minion, stack sigils and glyph
  effects must be equal. Conduits, Dominion and Oblivion power are compared for equality (Chrono Flux timing is not
  monotone in them). Of exact twins the incumbent, else the first value, is kept; the incumbent always stays (an
  illegal incumbent, one legality would repair, dominates nothing). Talents are pure linear stat bonuses with no
  negative value (Game/talents.md §5), pets and relics pure stat bonuses, so these blocks prune most;
  1. damage-only targets: when the target cannot hurt the player, two values compare on the attacking side only:
     the stats that only lower damage taken or heal (HP, DR, Block, Miss, Blind, Paralyze, Disruption, Spell
     Resist, Lifesteal, HP Regen, Spell Vamp, PVP Defense, minion HP, minion Lifesteal, Soul Link) are dropped, and so
     are defensive spells (HEAL, or a BUFF of only those stats) and the shield, which makes heal and shield sigils
     interchangeable. It holds per run and per value, never assumed: a PVE target with `enemyDealsDamage` false (the
     training dummy, a custom mob with no attack, World Boss NONE / FORTIFIED); or the Fortress boss while the
     value's HP exceeds the boss's maximum window damage (61 swings at attack x 1.15: it has no crit, double hit or
     spell) and the value has no thorns source, no minion (the boss would hit it, and minion HP follows the
     player's), no Chrono Flux charged by hits taken while a transform runs, and no damage-side spell gated on its own
     HP. Both values of a comparison must pass, else every stat counts. No damage source scales with max HP or a
     defensive stat (Game/combat-pve.md §5, §10, §12, combat-pvp.md §6, §8: swings and spells read Attack, heals and
     minion HP read max HP), so no defensive stat joins the attacking set;
  2. thorns: while the value fights with a thorns source (Iron Bastion's glyph or buff thorns, Bulwark of Thorns,
     Primal Instinct, Primal Retribution) or the Celestial partner does, the hit-taken stats (DR, Block, Miss, Blind,
     Paralyze, Disruption, Spell Resist, PVP Defense) are compared for equality, not as "more is better": the rule
     is skipped for them rather than run as the glyph rule's heuristic, so the pruning stays exact. While a PVP opponent has a thorns source
     every stat is compared for equality (more attack also means more reflected damage);
  3. sigil slots are not filled by rule: an extra sigil can weaken another. Debuffs of one type share one instance
     (`applyDebuff`, Game/combat-pve.md §9.2): a second POISON or BLEED source pushes its own, possibly weaker, stack
     damage over a stronger one at max stacks and resets the duration; Sunder Mark replaces Siegebreaker
     (combat-pve.md §11); a Form sigil changes the stat pipeline. Empty slots stay in the sigil domain;
  4. `space.pruned(block, c)` lists `{id, by, reason: 'dominated'}` (`id`/`by` the block's part of the candidate,
     `by` null when the incumbent dominates; mounts the same, with mount ids); the search result's
     `blocks[i].pruned` carries it for every block that prunes.

`legalise(c)` makes the repairs reconcile would make, drops conditions the spec does not offer, and
takes back changed major glyphs that would be inert. `spec` and `mount` values are compound: the
switch plus its legality bundle; the inner ascent over the new spec's picks or the mount's sockets
is the driver's.

### Combat Power guard

An optional floor (`request.powerFloor`, a positive whole number; setup step IV "Keep Combat Power at or
above") is a legality rule of the build space, not a score: Combat Power gates Crusade entry
(Game/pve-content.md §5), so a suggestion must never drop the player below it.

- A candidate's Power is the client formula (Game/stats.md §8) on the materialised preset in the run's
  realm: `space.powerOf(c)` (`build/power.js presetPower`), memoised by canonical key.
  `space.admissible(c)` is false only when a floor is set and the Power is below it.
- An inadmissible arm is never sampled: the search drops it before any race (its `simulable` check),
  `canonicalise` does not revert a change whose revert falls below the floor, minimise cannot drop such
  a change (it is kept with `keptBecause: 'power-floor'`), and attribution does not measure a change
  added alone when that build is below the floor (`own` null, no remainder for the row). Block domains
  are not filtered, so the talent fill used for starts may pass through low builds; only admissible
  starts are kept.
- I1 also fails a row below the floor; I2 and I3 skip a change whose revert is below the floor (it is
  needed for legality, like a bundle).
- Power counts an equipped Ancient sigil even when its Transcendence node is not allocated (the
  client's `useTotalPower` has no board check), while the candidate's stats ignore that sigil.
- A baseline below the floor cannot run: setup shows a blocker, and `optimize` returns `failed` with
  `baselineViolations: [{gate: 'powerFloor'}]`.
- Turning it on starts at the highest Crusade gate the preset meets (Hard, Mythic or Mythic+N), else
  at its current Power. Quick picks: the current Power, that gate when above Mythic+10, Crusade Hard,
  Mythic and Mythic+1..10 (`game/pveContent.js crusadePowerRequirement`, `ui/optimiserSetup.js`).

### Legality oracle

`legalityOf(character, presetId, cand)` → `{ok, violations, warnings}`: structural checks; round-trip
(`materialise → normaliseCharacter → candidateOf` keeps every choice); `checkPreset` gates with the
Ancient-board entry promoted to a violation; talent points, sigils locked, conditions below 54, and
placed glyphs (sealed, twice on one mount, a major of another class or spec). A board link below 58 is
only a warning (`transcendenceLink`): the build ignores it (`effectiveTranscendencePreset`, data-model.md
§1 Preset), and the board block searches nothing below 58.

### Effect oracle

`engineKey(fighter, mode)` fingerprints what the engine reads: PVE `preparePveFighter(f).inputs` with
the conditions of DAMAGE, DEBUFF and TRANSFORM spells left out (not read in PVE), plus the Oblivion
power in the Oblivion realm; PVP `fighterDuelArgs(f)`. `changesOf(space, B, X)` lists atomic changes
(`spec`, `equipmentSet`, `talents:<set>`, `pet`, `mount`, `relics`, `sigils`, `utility`, `ancient`,
`transcendence`, `condition:<species>`, `glyph:<mountId>:<tier>:<i>`) with scope, owner, side effects
and legality bundle. `canonicalise` reverts every change whose legalised revert keeps the engineKey;
`mergeByEngine` keeps one arm per engineKey (the one with the fewest changes).

## Objectives

Code: `src/lib/search/objectives.js` (targets, PVE objectives, ordering heuristics),
`src/lib/search/pvpObjective.js` (PVP), `src/lib/search/celestialObjective.js` (Celestial Trial),
`src/lib/search/sampler.js` (sample store, contrasts).
Design record: plan §A.6.

### Per-fight outcome, statistic, interval, contrast

One definition per objective: the value ranked is the value shown is the value tested.

**Retired (2026-10-15, backlog §10).** Kill time (`ttk-median`, `ttk-p90`) is gone: no content the app
simulates pays for kill speed (every dungeon, raid and Oblivion mob has a 20-minute cap that never runs
out, chapters have no timer, hunting is a server roll; combat-pve.md §1, §14), and it moved in steps of
about 3 % (one swing), so races between near-equal builds ran long. `survival` stays for custom mobs only:
with caps that never run out it equals win rate on a sequence target, and World Boss pays for damage, not
for staying alive. Drop Check keeps its own survival metric (§Drop Check). A saved setup whose objective is
retired normalises to the target's default; a saved run of a retired goal is kept and viewable, and its
Re-run with settings, Run more and Resume are off with the reason "This goal was retired."
(`goalRetired`, `retiredGoalBlock`). The engine's censored-quantile statistics stay (`engine/stats`),
unused by any objective.

| Objective | Per-fight outcome | Statistic θ | Interval | Paired contrast θ(X) − θ(Y) |
|---|---|---|---|---|
| `dps` | damage / window s; the mob cannot die inside the window | mean | t | paired t (`paired-t`); δ relative |
| `survival` | 1 if alive at the window end | proportion | Wilson | Tango paired proportion; δ absolute |
| `win-chance`, `win-rate` | 1 + HP left / max HP if the whole step is cleared, else the share of the step's enemy HP removed (< 1); the win bit is score ≥ 1. Celestial: the party's HP left over its max HP, and the boss's HP removed (§Celestial Trial) | proportion of wins | Wilson | capped win rate, then the margin (§Win rate); δ absolute |
| `pvp-winrate` | 1 if my build wins the duel, one lane per (opponent, seat) | pooled proportion, equal N per lane | Wilson on the pool | stratified Tango, one stratum per lane; δ absolute |

The PVP row reports per-matchup Wilson intervals, mean duel length and the timeout share. None of these rank anything:
equal statistics are a tie (no effective-HP or duel-length tie-break).

### Windows and compatibility

- A target with its own length (dummy and custom: `seconds`, default 60; World Boss: its affinity's
  fight duration; Fortress boss: 60 s) is the `dps` window and the default `survival` window (custom mobs). A sequence
  target (chapter, dungeon, raid, Oblivion) has none: every mob keeps its own cap. An objective
  `seconds` overrides the survival window.
- `survival` (custom mobs only) is refused for a mob that cannot damage the player (no swing with
  attack > 0 and speed > 0). `objectiveKindsFor(kind, target)` leaves it out of the picker.
- Target kinds and their objectives (the first is the default): dummy `dps`; chapter, dungeon (normal
  and `_hard`), raid, Oblivion `win-chance`, `win-rate`, `push` (§Push); World Boss `dps`; Fortress boss `dps`; custom `dps`, `win-chance`, `win-rate`, `survival`
  (`dps` stays the default); Celestial Trial `win-chance`, `win-rate`, `push` (§Push); pvp `pvp-winrate`. Anything else is a retired goal.

### Win rate

Two goals for content the player clears. 10 s and 50 s are the same; dying or reaching the fight's
time cap (each mob's own cap, or the custom window) is a loss.

- **Highest chance to win** (backlog §12, the default): **the build with the highest clear rate; builds
  within δ of it tie, and the tie goes to the fewest changes**. Spec `{kind: 'win-chance'}`, no target.
  It is the objective below with τ = 1, so g is the plain rate difference. `objective.goal` is `'max'`
  (`'target'` below) and `objective.target` is null.
- **Reach a win rate** (backlog §4): **the build with the fewest changes that clears the step at least a
  target share of the time**. Spec `{kind: 'win-rate', target}`, `target` in [0.01, 1], default 0.95
  (`WIN_RATE_TARGET`). Push keeps its own range [0.1, 1] (`PUSH_TARGET`, §Push).

- **Per fight** one score s: a win scores 1 + HP left / max HP (in [1, 2]), a loss the share of the
  step's enemy HP removed, `damageDealt / (damageDealt + enemyHpLeft)`, kept below 1. The win bit is
  s ≥ 1, so one vector carries both the rate and the margin. `pointOf` (the win bit) puts the
  attribution remainder in win-rate points.
- **Main criterion: the capped rate** g(X, Y) = min(p_X, τ) − min(p_Y, τ). Every build at or above
  τ is equally good on it. Its interval intersects five intervals at a joint level (Bonferroni,
  3 alpha / 4 in all): Tango on p_X − p_Y at alpha / 4, a Wilson interval per build at alpha / 8, and
  an exact one-sided Clopper-Pearson bound U (`binomialUpper`) on each discordant rate at alpha / 8.
  With b fights that only X won and c that only Y won, p_X − p_Y is at most U(b) and at least −U(c).
  Tango needs about z² / δ fights to bound a difference with no discordant pair; the exact bound needs
  about ln(8 / alpha) / δ. Since
  min(·, τ) is monotone and 1-Lipschitz, g lies between 0 and p_X − p_Y and g > 0 needs p_Y < τ, so
  lo = max(L, min(lo_X, τ) − min(hi_Y, τ)) with L = min(lo_Δ, τ − hi_Y) when lo_Δ > 0 and hi_Y < τ,
  0 when lo_Δ > 0 otherwise, else lo_Δ; hi mirrors it. Two builds that both reach τ are therefore
  `equivalent` once the intervals are inside δ, never `better`. `basis: 'win-rate'`, method
  `capped-tango`; the uncapped Tango interval is reported beside it as `winRate: {delta, lo, hi}`.
- **Second criterion: the margin**, mean s, paired t at alpha / 4 (`basis: 'margin'`). The rate takes
  3 alpha / 4 and the margin alpha / 4, so the split stays inside alpha. For a target goal the margin
  is attached only when both builds are confidently below τ (both Wilson upper bounds < τ). For the
  highest chance it is attached only while neither build has won a fight; wins only accumulate, so it
  is never pending (`thenPending` false). The
  comparator reads it only once g is `equivalent`: `better`/`worse` on the margin decide; while it is
  open the comparison continues (a race keeps the arm open until its last look); at maxN the tie on g
  stands (`equivalent`). This gives the search a
  gradient where the rate saturates at 0 (a 0 % build that gets further is better) without letting
  a bigger change win on margin among builds that already reach the target. δ is absolute in both
  units. The combined false-claim rate per look is at most alpha.
- **Progress tolerance δ_progress** (backlog §12 follow-up; `sampler.js` `progressDelta`). When neither
  build won a fight in the sample, the margin is pure progress (each fight's share of the step's HP, in
  [0, 1)) and its indifference zone is δ_progress = √(δ / 2), never below δ: 7.1 points of the step's HP
  at Standard (δ 1 point), 10 at Quick, 5 at Thorough. Why that size: such a score has a per-fight sd of
  at most ½ (and so has a paired difference under common random numbers once the fights correlate at
  ½ or more; step 6 of Hard Forsaken Mines measured 0.03 to 0.11), and the exact discordant bound ties
  the rates of two builds that never win at about n* = ln(8 / alpha) / δ fights. A paired-t interval
  at that n has half-width at most z · ½ / √n* ≤ √(δ / 2), since z² ≤ 2 ln(8 / alpha) at the margin's
  alpha / 4 (one-sided tail alpha / 8 ≤ ½ e^(−z²/2)). So δ_progress is the finest progress gap the
  rate's own fights can settle: two builds whose progress differs by much less tie at the first look
  that decides the rate, instead of buying more fights (up to maxN) for a tie-break. Nothing else changes: `better`/`worse` are
  still read first (an interval that excludes 0 decides, however small the gap), the margin with any
  win in the sample keeps δ, and the rate's own δ, the exact discordant bounds and Push's 10 % floor
  are untouched. A gap inside (0, δ_progress) may resolve either way (§Sequential comparator).
- **Fast drops at low rates.** When the leader has wins and an arm has none, the arm's b is 0, so its
  upper bound against the leader soon falls below +δ and it is `futile`. It is `worse` once the
  leader's own wins (c) push the Tango bound below 0. Either way it leaves on `basis: 'win-rate'`,
  whatever its progress. A futile arm nearer the baseline than the leader stays until it is
  `equivalent` or `worse`. Progress only decides when neither build won (the
  highest chance) or both are below τ (a target goal).
- **Score** (race leader, row order): min(p̂, τ) × 10⁶ + mean s, lexicographic for n ≤ 131 072.
  Racing then picks, among the leader and its ties, the arm nearest the baseline: of the builds that
  reach the target, the one with the fewest changes. `primary` (the capped p̂) orders `better` rows
  first, then fewest changes, then the score.
- **Meets the target** (`meetsTarget(estimate, τ, δ)`): true when the Wilson lower bound is at
  least τ − δ, false when the upper bound is below τ, else null.
- **Already clears**: after the screen look the baseline is checked on S3 at looks n0, 2n0, … maxN,
  Wilson at alpha / looks, until `meetsTarget` resolves. The highest chance checks against τ = 1: the
  Wilson lower bound must reach 1 − δ. A small sample of wins (64 straight wins) never claims
  'already', and the check always ends at maxN. If it meets, the run stops: no search, no
  rows, headline "Already clears at N% (95% CI lo-hi). No change needed." (the decision interval,
  coverage at least 95 %). The baseline is fixed, so checking and reporting on S3 carries no
  selection. Otherwise the search runs as usual and maximises the capped rate; `goal.status` is
  `reached` when a row meets the target (the first such row has the fewest changes) or
  `not-reached`, with the best build's rate in the headline.
- **Highest-chance verdicts** (`search.js` `chanceGoalOf`; `goal.mode` `'max'`, `goal.target` null):
  `already` as above. `best` names the first row whose verdict is `better` on the win rate
  (`basis: 'win-rate'`; a row better only on progress never heads it) ("Best chance to win: N%
  (95% CI lo-hi) with k changes; the current build wins M%."), or the current build when no row is
  better ("No change was shown to raise the chance to win. The current build wins N% (95% CI lo-hi).").
  `no-wins` when no build won a single fight: the rows are then ranked by progress (mean s) and the
  headline says so ("No build won any of N fights; the build that gets furthest (k changes) removes
  P% of the step's HP.").
- **Range.** The target goes down to 1 %: a loss usually costs nothing but time (a failed chapter level
  restarts, an Oblivion floor keeps its key on defeat, and only a dungeon clear spends a key;
  combat-pve.md §14, pve-content.md §4, §11), so a low target is a sensible goal for content the player
  can retry. Every win rate on screen carries "about N tries per clear" = 1 / p (`ui/winRateFormat.js`
  `triesPerClear`: one decimal below 10 tries, whole from 10, p = 1 "clears every try", p = 0 "no
  clears"). A low target resolves faster: a build well above τ is shown to meet it (the Wilson lower
  bound reaching τ − δ) after few fights, and only builds close to τ need the large N.
- Cost: with the exact discordant bounds, two builds that never win (or always win) are equal on the
  rate after about ln(8 / alpha) / δ fights: about 900 at Standard with alpha / 60 per test. Tango alone
  needed z² / δ (4 096 fights per arm in the same race). The measured race is in backlog §12. The cost
  is precision, never a cap.

**On screen** (Optimiser page, `WinRateTarget.svelte`, `OptimiserResults.svelte`): the goal list leads with
"Highest chance to win" for chapters, dungeons, raids and Oblivion (the default; hint "Finds the build
with the best chance to clear this; ties go to the fewest changes. Speed does not matter."), then
"Reach a win rate" with a Target field (percent, 1-100, default 95), then Push. Rows show the win rate
with its 95 % CI and its tries per clear; a target goal adds a Meets / Below target chip (below the
target, how many points short). The table has one axis in win-rate points: every contrast, a change's own
effect included, is drawn as its uncapped `winRate` difference, while the verdict stays the capped-rate or
margin one, and a note under the row names which decided it. `goal.status` 'already' shows a success banner
and no rows; 'not-reached' lists the closest builds with their gaps. The highest chance shows 'already'
("Already clears every try."), 'best' with a better row (success, "Best chance to win: N%" with its CI),
'best' without one (info, "No change raised the chance to win." with the current rate) and 'no-wins'
(warn, "No build won a fight." and that the rows are ranked by how far their fights got). Drop Check and Oblivion Floors offer no
objective choice, so they carry no win-rate goal.

### Target fidelity

Every resolved target carries its engine `mode` (`PVE_MODES` key, or `pvp`), the mode's labelled
`assumptions` (`{id, label, value?}`; the Oblivion output-cut toggle gives `value` 'on'/'off',
default off) and `fidelity`: `server-model` when the fight is server-run (dungeon, raid, Oblivion,
World Boss, Fortress boss, Celestial Trial, PVP), else `client`.

The Celestial Trial (`engine/pve/celestial.js`, mode `celestial`, NORMAL and HARD) is `server-model`
with a stronger footing than the other server-run modes: its rules are read from five server logs
(Game/combat-pve.md §20) and a replay check reproduces all five tick by tick
(`engine/pve/celestialReplay.js`). Its assumptions, each a `CELESTIAL_ASSUMPTIONS` label: the add
first-swing phase is a uniform 10-1000 ms draw; stack sigils and thorns run for one stack player
(default player 0, the one who starts the run); Overload ends when the living adds fall below the
threshold and multiplies Judgment Strike too (the cautious reading of two open items); the time limit
counts from 0; the boss and the adds attack the tank (the "adds target everyone" tactic is not
modelled) and, with the tank dead, the first living player; no add spawns at the
`maxAlive` cap; Block Fury and the per-add attack bonus multiply. MYTHIC is not simulated (its
party-power HP scaling is server-side).

### Celestial Trial

Target `{kind: 'celestial', difficulty: 'NORMAL'|'HARD', level?: whole number from 40 (the unlock level), partner:
null | {source: 'character', characterId, presetId} | {source: 'opponent', opponentId}, tank?: 'auto'|'me'|'partner'
(default 'auto'), starter?: 'me'|'partner' (default 'me'), tactics?: {focus: 'HOLD'|'BOSS'|'SPAWN', holdCount}}`
(`search/celestialObjective.js`). MYTHIC is refused (not simulated, §Target fidelity). `holdCount` is a whole
number from 1 to `celestialMaxHoldCount(difficulty)`; the tactics default to the catalogue's finder tactics for the
difficulty (`CELESTIAL_FINDER_DEFAULT_TACTICS`, Game/pve-content.md §6). `level` defaults to the engine's rule, the
party's highest level, read once at resolve time from my character and a roster partner's Fighter; an opponent
partner's typed sheet has no level, so it never sets the scaling, but one imported from Rankings carries the player's real level (`imported.level`), which does. Tank or starter 'partner' needs a partner.
Label: "Celestial Trial (HARD, L85, with <partner name>)", or "solo". Objectives: the win-rate family
(`win-chance` the default, `win-rate`) and Push; survival is not offered (backlog §11). An explicit `level`
must be at least the difficulty's own unlock level (NORMAL 40, HARD 60, Game/pve-content.md §6 [CODE]).

Push on the Celestial Trial. The ladder (`push.js` `ladderOf`) is the party's scaling level: one rung per whole
level from the difficulty's unlock level to the player level cap 100, labelled `level N` (the result's
`ladder.unit` is 'level', which the Push UI uses in its sentences). The start rung is the target's resolved
level (an explicit `level`, else the party's highest). Rising difficulty holds by the data: every level band of
both difficulties has a positive HP and attack growth per level, so `celestialBossStats` rises on every rung
(tested), and the adds scale with the boss. Each rung is the same target with that `level`; the partner,
tank, starter and tactics stay fixed, so the answer is the highest level the party clears at τ with my build
varied and the partner fixed. A rung's key is the resolved target's, so it carries the level and `partnerKey`:
changing the partner changes every rung key and so every stage seed and the run key. The partner is passed to
every rung's sampler and optimisation (and to pool workers). Push's 10 % floor and all its statistics are
unchanged. A start level outside unlock..100 is an error.

Engine path: `engine/pve/celestial.js` `simulateCelestial`, the party in a fixed order, my build member 0 (as in
every server log) and the partner member 1. `tank` maps to `tankIndex` (me 0, partner 1; 'auto' leaves it to the
engine's `defaultTankIndex` on each candidate's party, since my spec can change with my talents); `starter` maps to
`stackPlayerIndex` (the stack player, combat-pve.md §20.7). Fight i of every build runs on `fightRng(seed, i)` with
the partner prepared once and fixed. Per fight: a clear in time scores 1 + the party's HP left / its max HP, a loss
the share of the boss's HP removed (below 1), so the win bit is the party clear. The search runs in `pve` mode on the
base realm (Celestial members are `preparePveFighter` results), so builds are keyed, canonicalised and merged as in
PVE (`effect.js` `engineKey`), with the PVE condition options; the Power guard and the toggles are unchanged.

Partner. The user's build is the variable; the partner is fixed. A roster partner (another character's preset) is
resolved where the request is built (`ui/optimiserSetup.js` `requestOf`, via `resolveRosterPartner`: the preset
built with `build/fighter.js`) and sent as plain JSON in `request.partner`, since the worker never sees the roster; a
pool worker gets it in its setup. An opponent partner is resolved inside `resolveTarget` from `character.opponents`
(`features/duel.js` `opponentFighter`): its typed sheet is taken as given. The target's assumptions are the
`CELESTIAL_ASSUMPTIONS` labels plus one (`celestial-partner`) saying what the partner is. A Rankings profile (backlog §2) is saved as an opponent (data-model.md §3, Rankings opponents), so it is the
'opponent' source: its server sheet, worn sigils, altar tier and glyphs are taken as given (no talents modelled), its
level sets the party scaling, and the assumption label says "imported from Rankings (level N)".

Keys. The target key carries the resolved level and a hash of the partner's Fighter (`partnerKey`), and the run
echoes `partnerKey` in `request`, so the seeds, the run key and the caches change whenever the partner's build does,
and runs never mix partners. Run more re-resolves the roster partner and refuses a run whose `partnerKey` no longer
matches. A saved setup whose partner (character, preset or opponent) is gone normalises to the same fight solo, with
tank and starter back on their defaults; the picker shows why an unresolvable fight cannot run and never throws.

### Fortress boss

Target `{kind: 'fortressBoss', group: 'TOP'|'BOTTOM'|'CORE', stars?: 1-5 (TOP, BOTTOM; CORE has none and
refuses it), aliveDefenders?: 0+ (default 0), server?: whole number or null (default the character's `server`, else
null, which gives the default clan cap 50; caps per server are in clan-fortress.md §3.1), shieldPercent?: 0-60
(a shield read off the siege screen, used directly instead of the interpolation), kills?: 0+}`. An older spec's
`maxClanSize` is still accepted and stays an explicit cap that overrides the server's. The echoed
`target.fortress` carries `clanCap`. Objective `dps` only (the reward is
the clan's damage). The boss is the table's HP, attack and speed (clan-fortress.md §1.1) in a 60 s
window.

Engine path: the arena duel engine (`engine/pvp/resolver.js` `simulateArenaPvP`), driven by
`engine/pve/fortressBoss.js` `simulateFortressBoss`. The player is the attacker (`fortressPlayerDuelArgs`, the
Fighter's duel arguments) and the boss is the defender (`fortressBossDuelArgs`: the table's HP, attack and
speed, no spells, sigils or shield). The Fortress rules a server log shows (clan-fortress.md §1.4) are the
named `FORTRESS_FIGHT_RULES`, applied to the inputs: no x8 HP, no PVP ratings, no sigil stacks, a boss that
cannot be blinded, the boss's spell resist, and the boss's ±15% per-swing spread. The spread is the
resolver's one Fortress-only option, `defenderDamageVariance`, drawn from its own rng lane. Arena callers
never set it, so the arena duel is unchanged. The search runs in its own `fortress` mode, so builds are merged
by the Fortress duel's inputs (`effect.js` `engineKey`) and the condition options are the PVE ones. The
assumption labelled `fortress-boss-model` says which parts come from the log. A player the boss kills stops
dealing damage. `engine/pve/fortressReplay.js` replays a server response against these rules, rule by rule
(`src/lib/__fixtures__/real/fortressReplay.test.js`).

Credit: the result shows raw damage (dps x 60) and the effective damage the clan is credited,
`round(raw x shield x contribution x star)` (clan-fortress.md §3.1). The multipliers are constant within a
run, so they are display only: they sit in the echoed target (`target.fortress`) and never enter the
sampled statistic, a contrast or a rank. They do change the target key, so a run with other defenders is a
different run.

Deviations of the displayed credit from the client formula (clan-fortress.md §3.1): the app's two-argument
`calculateBossShield(aliveDefenders, clanCap)` takes the client's `startingDefenders` guard as met (the divisor
is the server's clan cap, confirmed by server siege data), and the fatigue factor is taken as 1. Stars come from
the siege screen; the picker defaults to 1. `aliveDefenders` defaults to 0, which is a 0% shield (the
boss at full damage); set it for a realistic defended boss. These only scale the display, never the ranking.

### Residual

The optimiser carries a preset's sheet residual onto candidates only when the sheet's status is
`fresh` (data-model.md §6); an `unverified` or `stale` sheet is not carried and the run gets a
`sheet-unverified` / `sheet-stale` warning (`residualFor`).

### Sample store

A sample set is `{main: number[][], side: Object<string, number[][]>, n}`: one lane per stratum,
each n fights long. `createSampler(objective)` keys entries by `(engineKey, stage)`, a stage being
`{id, seed}`; N is never part of the key. A request for more fights than held simulates only the
missing indices (prefix extension; fight i depends on the stage seed and i alone), and builds with
one engine key share one entry. `compareSets` is the sequential comparator of §Statistics with the
objective's own contrast at each look; `contrastSets` is one fixed-n contrast (confirm,
attribution). Both return the Contrast shape plus `basis` and `higherIsBetter`.

## Search

Code: `src/lib/search/search.js` (driver: `optimize`, `optimizeMore`), `race.js`, `minimise.js`,
`result.js`; worker tasks `optimize` and `optimizeMore` (`src/lib/tasks/optimize.js`). Design record:
plan §A.7-§A.10. Every decision is a paired comparison on common random numbers with a family-wise
level; no proxy ranks anything, N is never lowered and no block is skipped for time, so a run's cost
varies and Effort sets only its precision.

### Effort

| Level | δ relative (DPS, TTK) | δ absolute (proportions) | maxN | n0 (first look) |
|---|---|---|---|---|
| Quick | 1 % | 2 points | 8 192 | 8 |
| Standard | 0.5 % | 1 point | 32 768 | 16 |
| Thorough | 0.25 % | 0.5 point | 131 072 | 32 |

δ and maxN are Drop Check's `DROP_PRECISION` (open decision Q4); n0 is the optimiser's own. N counts
fights per arm and, for PVP, per matchup. α = 0.05 for every family. `resolveEffort(level | {level,
n0, maxN, delta, randomStarts})`: the object form overrides a level (tests and benchmarks). Retired
request keys (`budget`, `maxMs`, `finalMs`, `maxEvals`, `maxPasses`) are ignored.

### Seeds and phases

`S1 = hashSeed('search', seed, target.key)` (screen and search), `S2 = hashSeed('minimise', …)`,
`S3 = hashSeed('confirm', …)` (confirm and attribute), `S4k = hashSeed('more', seed, target.key, k)`
(the k-th Run more). The data that decides is never the data reported. Phases, in order: **screen**
(baseline legality, the baseline's first look), **search**, **minimise**, **confirm**, **attribute**.

### Racing (`race.js`)

All arms are sampled to n0 (every look requests all surviving arms at once, so a worker pool samples
them in parallel; the decision reads them in arm order once all are in); the leader is the best estimate (`objective.score`). At each look
every other arm's paired contrast against the leader, at α / (arms × looks), decides:

- `worse` (the interval excludes 0 on the losing side): the arm leaves (`eliminated`).
- `equivalent` (inside ±δ): a tie; it stays.
- **futile**: the interval's bound on the winning side does not reach δ (higher is better:
  `hi < δ`; lower is better: `lo > −δ`; δ in the statistic's units, `deltaAbs` as for the verdict,
  the win-rate zone on a win-rate fallback), so the arm cannot beat the leader by δ. On the
  lexicographic win-rate objective (§Win rate) the arm must be unable to win on either criterion:
  the capped rate's `hi < δ` and, when the margin contrast is attached, the margin's `hi < δ` too;
  while the margin may still attach at a later look (neither build's Wilson lower bound reaches τ,
  `thenPending`) the arm is not futile. If it is no
  nearer the baseline than the leader (`dist` ≥ the leader's) it leaves at once (`futile`, with
  its contrast); a futile arm nearer the baseline stays until it resolves `equivalent` (a tie it
  then wins) or `worse`.
- otherwise it stays open.

The race stops when no arm is open (every survivor is the leader or `equivalent` to it); arms still
open at maxN are `unresolved`. The winner is the arm nearest the baseline among the leader and its
ties. Before a race the arms are made distinct, simulable (an `EngineInputError` arm is skipped,
warning `arms-not-simulable`) and merged by engine key (`effect.mergeByEngine`).

Why futility keeps the declared precision: Effort promises the winner is within δ of the best arm
(a build better by less than δ is "as good" at this precision). A futile arm's interval says, at the
race's family level, that it is not better than the leader by δ or more, so dropping it can only
lose a gain smaller than δ, which the precision already allows; and because it is no nearer the
baseline it could not win a tie either. A nearer futile arm could win as a tie, so it keeps running:
"fewest changes among equivalent builds" is decided exactly as before. The test reuses the race's
two-sided interval, so its one-sided level is α / (2 × arms × looks), stricter than needed. Before
this rule (A5) an arm only left as `worse` or `equivalent`, so arms a little worse than the leader
(inside δ) ran on towards maxN; on synthetic arms 0.4δ worse the futility stop cuts the fights per
arm by about 5.5× (`race.calibration.test.js`, which also checks over 400 seeded races that a 2δ
better arm wins, and that with all arms equal the baseline-nearest wins, each in at least 1 − α of
races). The guarantee is against the leader at the look that drops the arm: if the leader later
changes to one the dropped arm is nearer than, that arm could have tied it, so in that rare case the
rule can lose a fewest-changes tie (never a gain of δ or more). `effort.futility: false` restores the
old rule (benchmarks only; it is part of the request key and the race step key). In code: a
`sampler.js` contrast that is `unresolved` or `futile` carries `futile` (boolean); `compareSets(..., {futility: true})` also stops with
verdict `futile` (used only by the accept compare below; a race keeps the plain verdicts). Confirm and attribute
are unchanged (strict contrasts on fresh seeds).

### Strategy

- **Exhaustive** when the talents block is off (its domain is a neighbourhood, not every
  allocation) and the joint space (product of the enabled blocks' domain sizes, then the actual
  enumeration) holds at most `EXHAUSTIVE_MAX` = 50 000 builds: one race of every legal canonical build.
- **Local** otherwise. Starts: the baseline; each other spec, inner-optimised; each other gear set;
  a talent fill that spends points one at a time on the best ordering heuristic (`objective.screen`,
  a start only); `randomStarts` (3) seeded random legal starts. From each, coordinate ascent: race
  `[x, ...block.domain(x)]` per block in `BLOCKS` order and accept a winner only when a sequential
  compare on S1 at α / arms says `better` and its canonical form was not visited (that compare also
  stops, not accepted, once the winner is futile against x: it cannot beat x by δ); a full pass that
  accepts nothing is followed by a race of the two-point talent moves (+1 +1, −1 −1). The ascent ends
  when both accept nothing, so it always ends converged; neighbours still open are listed in
  `search.unresolved` and mark their block `unresolved`.
- **Compound blocks**: a `spec` arm is the switched build inner-optimised over sigils, utility,
  ancient, conditions, major glyphs and talents; a `mount` arm is the mount inner-optimised over its
  sockets (memoised per start). An inner ascent reports its optimum (the arm raced) and lists its
  open neighbours in `search.unresolved`; its ties are not finalists, because the outer ascent's last
  pass re-races every block around the final optimum.
- **Finalists**: the distinct optima, plus the ties and unresolved arms of each ascent's last pass
  (the builds as good as the optimum at this precision), each canonicalised (inert changes reverted).

### Minimise and confirm

- **Minimise** (S2, per finalist): for each atomic change c (`effect.changesOf`), compare F against
  F − c (legalised, canonical), Holm over the changes (each test sequential). Every change not found
  `better` is droppable; the one costing least is dropped (bit-identical outcomes first, then the
  smallest gain, then the most disruptive) and the loop repeats. A change legality puts straight back
  cannot be dropped alone (it is in another change's bundle). The set stands only when F is `better`
  than the baseline at α / finalists; otherwise the finalist collapses into the baseline. A change
  dropped while `unresolved` at maxN is listed (warning `change-dropped-unresolved`).
- **Confirm** (S3): every distinct minimised build against the baseline, sequentially, Holm across
  rows. `worse` rows are hidden (`headline.worseHidden`).
- **Attribute** (S3, at the row's confirm n): `own(c)` = (B + c) against B and `needed(c)` = F against
  F − c, each Holm within the row (step-down over fixed-n contrasts: all at α / m, then the rest at
  α / (m − rejected) until a round rejects nothing); `keptBecause` = `own-effect` when `own` is significantly better,
  else `interaction`. The interaction remainder (two or more changes): per fight
  `d_full − Σ d_c`, paired t, for mean and proportion objectives (PVP lanes averaged per fight
  index); a paired bootstrap of θ(F) − θ(B) − Σ(θ(B + c) − θ(B)) (B = 2 000) for quantile objectives.
- **Ranking**: `better` rows by their statistic, then `equivalent` and `unresolved` rows by fewest
  changes. Adjacent `better` rows whose contrast is not significant (Bonferroni over the adjacent
  pairs) share a `tieGroup` (the first one's rank); other rows have `tieGroup` 0 (not resolved apart
  from the baseline).

### Builds equal in effect

Three layers, cheapest first: `canonicalise` reverts changes that leave the engine inputs unchanged;
races merge arms with one engine key (the one nearest the baseline stays); and builds whose outcome
vectors are bit-identical on the same stage are one build for this target (a heal condition or a
defensive relic against the dummy): minimise drops such a change first, and confirmed rows with
identical S3 vectors at the same n keep only the nearest. Distance (`distanceOf`) counts one per
change, except relic and sigil changes (each piece swapped) and talent changes (points moved).
`search.merged` counts the three (`inert`, `engineIdentical`, `sampleIdentical`).

### Invariants

`result.js rowViolations` checks every reported row: **I1** the candidate passes `legalityOf` and a
non-baseline row has changes; **I2** reverting any change alters the engine key (or the change sits
in another change's bundle); **I3** every change was decided `better`-needed on S2 (or is bundled).
Test and development builds throw on a violation; a production run withholds the row with warning
`invariant`.

### Progress, cancel and resume

Progress (throttled to 250 ms, forced at each phase start): `{type: 'progress', jobId, phase,
phases: [{id, label, state: 'done'|'current'|'queued', done, total}], block, counts: {evaluated,
fights, eliminated, merged}, elapsedMs, provisional}`; `provisional` lists the current optima
(`{key, candidate, provisional: true}`) during the search, else null.

**Search steps** (`searchSteps`, present from the start of the search phase; absent in the screen phase and
in a Push run, whose rungs are its `steps`): one row per build-space block, in `BLOCKS` order,
`{id, state: 'queued'|'running'|'done'|'skipped', reason: null|'off'|'nothing-to-try', pass, tried, fights,
improved}`. `id` is the block (the UI names it with the change dimension's label). `skipped` with `off`:
the block is turned off under Allowed to change; with `nothing-to-try`: its domain had no second value
whenever the search reached it. `pass` counts the visits of the block (every sweep of the blocks is one
more; a multi-start run sweeps once per start and more until a sweep accepts nothing), `tried` the builds
raced against the incumbent over those visits (inner ascents of Spec and Mount belong to their block),
`fights` the logical fights they asked for, `improved` whether any visit accepted a better build. A block
shows `running` on every visit, so a second visit reads `running` again with its new `pass`. An exhaustive
search races every open block together: each such row shows the one joint race (`pass` 1, the joint
`tried` and `fights`, `improved` when the winner differs from the current build in that block). The rows
are small plain JSON; the final rows are `search.steps` of the result and `steps` of a saved run.

Every race and comparison is a logged **step** (`kind`, a hash of its inputs, its output and the
sample lengths it requested). A checkpoint is posted after the search, after minimise and on cancel:
`{schema: 'optimiser-checkpoint/1', requestKey, characterKey, phase, seeds, log, frontier: {armsN},
finalists, minimised, confirmed}`. A request with `resumeFrom` replays the log step by step without
simulating (a step whose kind or inputs differ ends the replay), so cancel + resume equals the
uninterrupted run apart from wall-clock fields. A checkpoint of another request or character is
ignored (warning `checkpoint-ignored`). The plan's `frontier: {start, incumbentKey, block, armsN}`
is reduced to `{armsN}` on purpose: replaying the log rebuilds the start, incumbent and block. Fight counts are logical (the highest n requested per build
and stage, times lanes), so they too are identical after a resume. Cancel is soft: sampling stops at
the next yield (every 25 ms), the checkpoint is posted, and the result has `status: 'cancelled'`,
`aborted: true`, provisional rows (values from the fights already held, no contrasts) and
`checkpoint: {jobId, phase, resumable: true}`.

### Run more

`optimizeMore({character, result, rowKeys?, targetN, round?})` re-measures the chosen rows, their
changes' `own`/`needed` and the baseline at exactly `targetN` on `S4k` (k = `round`, default the
next), Holm across the chosen rows, and returns the result with those rows and the baseline updated
and `more: {round, targetN, seed, rowKeys}`. The rows are then re-checked (I1, I2; I3 stands from
the run's minimise), rows now `worse` are hidden (`headline.worseHidden`), and the rest are re-ranked
and re-grouped: a re-measured row is scored on S4k at `targetN`, any other on S3 at its confirm n;
adjacent rows are resolved apart on S4k when both were re-measured, else on S3 at the smaller confirm
n. A character whose snapshot key differs from the run's `request.characterKey` is refused.

### Cost

Measured on the Warrior fixture (one thread, this machine; a 60 s dummy fight costs about 2 ms):

| Space | Effort | Strategy | Builds raced | Fights | Time |
|---|---|---|---|---|---|
| relics + pet | Quick | exhaustive | 62 | 624 | 1.2 s |
| every block | Quick | local (4 starts) | 8 437 | 138 920 | 249 s |

The full run shared four cores with other jobs, and both rows predate the futility stop (A5), so they
are upper figures: since A5 an arm or challenger that cannot beat the leader or incumbent by δ stops
early (about 5.5× fewer fights per slightly-worse arm on synthetic arms, §Racing), and only a
contrast that could still go either way by δ, or a futile arm nearer the baseline than the leader,
runs on towards maxN. Standard and Thorough cost more: n0 doubles. A PVP duel costs several times a dummy fight, per matchup.
The Effort control prints δ, the first look n0 and maxN per level and these measured figures
(`ui/optimiserView.js` `MEASURED_COST`, `effortPlan`); no run is time-capped. The Optimiser page runs as
a session job (U3): Cancel keeps the provisional rows and Resume re-starts the task with the job's
checkpoint as `resumeFrom`. The page sends the character with `runs: []`, so saving a run does not change
`characterKey` (Run more and the staleness marker compare it).

### Estimates

Code: `src/lib/search/estimate.js` `estimateRun(request, {calibration})`; UI: the Estimate section of the
Optimiser setup (`components/optimiser/SetupEstimate.svelte`), recomputed on every setup change. It runs
`prepare` and reads the build space, never simulates, and returns builds, fights and time, each as
`lo` / `likely` / `hi` with its basis. Every figure is shown as an estimate (decision Q5).

- **Builds (exact).** When the search will be exhaustive (§Strategy) and the joint space holds at most
  `LIVE_ENUMERATE_MAX` = 1 000 builds, the count is the search's own list (`search.js enumerateJoint`, the
  domains after legality, glyph and mount dominance) less the builds below the Combat Power floor. It is
  the run's `search.evaluated` unless builds equal in engine inputs merge (§Builds equal in effect). Between
  1 000 and `EXHAUSTIVE_MAX` the product of the block sizes stands in (the list can differ from it).
- **Builds (local, assumed).** One pass of the coordinate ascent races every value of each enabled block
  (`domainSizes` at the current build), a spec or mount switch plus its inner ascent, and the two-point
  talent moves (`twoPointMoves`) once per ascent. `lo` is one start converging in one pass; `likely` every
  start (§Strategy: the baseline, other specs, other gear sets, the talent fill, `randomStarts`) at 3 passes
  with one inner pass; `hi` every start at 8 outer and 8 inner passes. How many passes an ascent takes
  depends on what it finds, so 8 is an assumption, not a bound. Domain sizes are taken at the current build.
- **Fights.** Fights are counted per build, stage and lane (§Progress), so the race rules give the range:
  `lo` = builds `lo` × n0 × lanes (every arm resolved at the first look, no change found, so no minimise or
  confirm), plus the goal check of a win-rate goal; `likely` = builds `likely` × 2 n0 × lanes (§Cost:
  about 2 × n0 per build); `hi` = every comparison at maxN for builds `hi`, the baseline, and every possible
  finalist (exhaustive: every other build; local: each start's last pass) with its minimise builds
  (1 + m(m + 1) / 2) and confirm and attribution builds (2 + 2m), m the most changes the enabled blocks
  allow. PVP lanes are its matchups.
- **Time.** fights / the calibrated speed of the target's fight kind (§Speed calibration). The calibrated
  speed is the whole pool's, so it is not divided by the workers again. Kinds (an assumption, labelled):
  dummy, World Boss and custom mob are dummy-kind windows, scaled by the window over the 60 s calibration
  fight; chapter, dungeon, raid and Oblivion are dungeon-kind; the Fortress boss (duel engine) and PVP
  are duel-kind (an unmeasured duel counts at the slowest measured speed). A target kind not in
  `FIGHT_KIND_OF`, or no calibration, shows builds and fights and says why there is no time.
- **Push** runs this search at its start rung; the estimate covers that one search and says so.

## Push

Code: `src/lib/search/push.js` (`pushCore`, the algorithm over an environment; `push`, wired to the build
space, objectives and `optimize`; `ladderOf`; `pushBlock`). The worker task `optimize` routes a request
whose objective is `{kind: 'push', target?}` here (`optimize()` itself refuses it). Backlog §10 item 1.

**Goal.** For ladder content, the deepest rung the player clears at the win-rate target τ (§Win rate:
same per-fight score, same `meetsTarget`, τ in [0.1, 1], default 0.95), and the build with the fewest
changes from the current one that clears it.

**Ladders** (`ladderOf`; the target the user picks is the start rung). A classic dungeon's steps 1-8
(normal or `_hard`, one id), a village raid's steps 1-8 (one id), Oblivion floors 1-60 (the floor table;
the output-cut toggle carries to every floor), and a campaign track: chapters 1-11 or the hard chapters
12-22, each level 1-10 in order (the track of the start chapter; an app choice, not a game fact: hard
chapter 1 is scaled from normal chapter 1, pve-content.md §3, so the ladder stays inside one track
rather than assume where the hard track sits against the normal one), and the Celestial Trial's party scaling
levels (§Celestial Trial). The character model records no progress on any of
these, so the start is the user's pick in the target picker.

**Assumption, stated on every run: difficulty rises along the ladder**, so a build that clears rung k
clears every rung below it. The data are not trusted to agree: every probe of a build is kept, and any
build that met τ on a deeper rung and was shown below it on a shallower one is listed in
`push.contradictions` with a `ladder-not-monotone` warning (dungeon and raid rosters rotate between steps,
so a step can be easier than the one before for some builds).

**Procedure** (each decision a logged step):

1. **Climb** the current build B: check the start rung, then gallop up (k + 1, k + 3, k + 7, …) while it
   clears, then bisect between the last rung cleared and the first not cleared. A **check** is W1's
   "already clears" test on fresh fights of that rung: looks n0, 2n0, … maxN, Wilson at α / looks, stop
   once `meetsTarget` resolves; only `true` counts as clearing (`false`, and still open at maxN, do not).
2. At rung r = (deepest so far) + 1, the **screen** (the stop rule below). If it stops, the climb ends at r.
3. **Optimise** at r: the win-rate optimiser (§Search) on that rung, from the current build B (fewest
   changes from B, never from an earlier suggestion). `reached`: its fewest-changes row C (the goal's
   `bestKey`) is climbed from r (r is known cleared) to its deepest rung; `already` (B meets r on the
   optimisation's own S3 check): B is climbed from r; `not-reached`: the climb ends at r with the best
   rate the optimisation saw.
4. Repeat 2-3 from the new deepest rung. Every round goes at least one rung deeper, so the loop ends at
   the top of the ladder, at a screen stop or at an optimisation that does not reach τ.
5. **Confirm** on fresh fights: for B and for the deepest build D (when it is not B), a fixed-sequence
   test from the start rung upwards, each rung a check at α / 2 (α when D is B), stopping at the first rung
   not shown to clear. The reported rung of each build is its last confirmed one. When D confirms less
   than its climb found, the run says so (`push-unconfirmed`); when D does not confirm deeper than B, there
   is no suggestion (`status: 'no-gain'`).

**Stop rule (the screen).** Measured problem: on `dungeon_4_hard` step 6 every build is at 0 %, and a
Quick full-space win-rate run spent its 30-minute limit and about 5 M fights without a verdict, because
ties at 0 % need about z² / δ fights each (§Win rate, cost), per comparison and for every comparison of
the search. Push would probe exactly such rungs. A5's race futility stop (§Racing) does not end that: an
arm tied at 0 % is futile only once its capped-rate interval is inside δ, the same z² / δ fights (about
ln(8 / alpha) / δ since W3, §Win rate). So
before optimising rung r, Push screens the neighbourhood the optimisation would start from: the centres
(B, and the deepest build so far when it differs), every build one change from a centre (each enabled
block's domain; spec and mount values raw, not inner-optimised), m builds in all, and every (centre,
one-change build) pair, q pairs in all. Looks n0, 2n0, … maxN, each test at α / ((m + q) × looks):

- **rate**: a Wilson interval per build; a build is settled once its upper bound is below τ;
- **direction**: Tango's interval on the paired win bits of each pair (build − centre, common fights);
  a pair is settled once its upper bound is below δ, i.e. that change confidently raises the rate by
  less than δ (it may lower it).

The screen says **go** (run the optimisation) as soon as one build meets τ (`meetsTarget` true,
reason `meets`), as soon as one change confidently raises the rate (lower bound above 0, reason
`gradient`), or when anything is still unsettled at maxN (`open`). It says **stop** only when every
build and every pair is settled: every screened build confidently below τ and every single change from
a centre confidently flat. The rung is reported "not reached at this effort" with the best rate seen
(each build's estimate at its last look).

Why the direction test: the usual Push rung is one the current build clears less often than τ, where
reaching τ takes several changes that each help partly (B 60 %, two one-change builds 70 %, their
combination 97 % at τ 90 %). Every one-change build is then below τ, but the changes are directions:
the screen says `gradient` and the optimiser (§Search: coordinate ascent and multi-start) looks for the
combination (`push.test.js`). A stop needs a flat neighbourhood, which is the measured 0 % case: there
each pair settles once its Tango upper bound is below δ, about z² / δ fights once per build instead of
once per comparison of a whole search. The direction is the win rate, not the margin (mean score s): at
0 % the share of enemy HP removed differs between almost any two builds, so a margin test would send
every 0 % rung to the optimiser and bring the stall back.

Accuracy and what the claim covers. By the union bound over the m + q tests and the looks, the chance
that the screen stops although some screened build is truly at or above τ, or some single change truly
raises the rate by δ or more, is at most α (`push.test.js` checks the stop rate over 200 seeds with one
neighbour at τ). So a stop states, at family level α: no build within one change of the centres reaches
τ, and no single change from them raises the rate by δ. A build several changes away is reachable from
there only across a plateau no single step climbs (changes that do nothing alone and a lot together),
which the optimiser's coordinate ascent cannot cross either (it moves only on a better comparison); its
random starts could, and the stop does not cover them. Hence the wording "at this effort", and the result
points to the Win rate goal on that rung for a full search. When the stop does not fire, the optimisation
keeps A5's futility stop.

**Seeds.** Per probe, from the run seed and the rung key: climb `hashSeed('push-climb', seed, rungKey)`,
screen `hashSeed('push-screen', …)`, confirm `hashSeed('push-confirm', …)`, common to every build on that
rung; each optimisation uses its own S1-S3 (§Seeds and phases, keyed by the rung's target key). No data on
the confirm seed decides which build or rung is reported. Each role draws its own fights on purpose,
although a build checked in the climb is sampled again in the screen or the confirm: the confirm must
be fresh (data that decided the climb cannot report it), and the screen's family level holds only on
fights no earlier decision looked at.

**Multiplicity.** Each climb check, each screen and each optimisation is decided at its own level (α, the
screen's family α, the optimiser's families). These decisions steer the climb; they are not the reported
claims. The reported claims are the two confirmed rungs, "B clears every rung from the start to M" and "D
clears every rung from the start to N" (at τ − δ, `meetsTarget`): each is a fixed-sequence family at α / 2,
so both hold together with probability at least 1 − α. "Rung N + 1 is not reached" is a separate claim at
the level of the step that ended the climb (the screen's α, or the optimisation's), not covered by the
joint statement. The build's row (changes, own effects, contrasts) keeps the optimiser's own families on
the rung where it was found.

**Progress, cancel and resume.** Progress has the §Search shape with Push's phases (`climb`, `screen`,
`optimise`, `confirm`), `block` the rung being worked on (plus the optimisation's phase), fight counts that
include the running optimisation, and `steps`: one `{id, label, state, text}` per rung from the start
(backlog §1's step list). The checkpoint is `{schema: 'push-checkpoint/1', requestKey, characterKey, log,
inner}`: `log` replays every finished step without fights, and `inner` is `{rung, checkpoint}` of an
optimisation cancelled mid-run, which resumes from its own checkpoint (§Progress, cancel and resume), so
cancel + resume equals the uninterrupted run apart from wall-clock fields (`push.test.js`,
`push.live.test.js`).

**Result.** An `optimiser-result/2` (§Result) with `objective.kind` 'push', no `goal`, `search` null,
`phases` the four Push phases, `rows` = [the deepest build's row from the optimisation that found it] when
it confirms deeper than B (else empty), `baseline` that optimisation's baseline row (else B on its last
confirmed rung), and `push: {target, status: 'pushed'|'no-gain'|'none', ladder: {kind, label, size, unit: 'step'|'level'},
start, baseline: {deepest, label, searched}, reached: {deepest, label, key, foundAt, foundLabel,
searched}, stop: {index, label, reason: 'top'|'screen'|'not-reached', best: Estimate|null}|null, rungs:
[{index, label, key, current, build}] (each 'clears'|'fails'|'open'|null, the confirm probe when there is
one), contradictions, text}`. `headline.text` = `push.text`, "Reaches step N (now: step M) at τ." Warnings
add `ladder-not-monotone` and `push-unconfirmed`. A saved run keeps the block (`model/runs.js`).

**On screen.** The goal list offers "Push (deepest step)" for chapters, dungeons, raids and Oblivion, with
the Target field of §Win rate and a line naming the start rung (`WinRateTarget.svelte`). While it runs, the
Optimiser page lists the rungs climbed. The result (`PushLadder.svelte`) shows the ladder strip (rungs the
current build clears, rungs only the suggested build clears, the first rung not reached, rungs climbed
without a confirmed claim), "Reaches step N (now: step M)", the rung the build's changes were measured on
and why the climb stopped, then the build diff and Apply for the deepest build (`OptimiserResults.svelte`).

**Cost.** Measured on the Warrior fixture (one thread, Quick with maxN 256, relics and pet): campaign from
level 3-1 at 50 %, climbing and confirming levels 3-1 to 9-1, then a screen at 9-2 that finds a change
raising the rate and an optimisation that does not reach 50 % (best 23 %): about 12 700 fights in 3 s;
from level 9-1 at 90 %, two optimisations (9-1 reached, 9-2 not) and their screens, about 27 500 fights
in 7 s. A flat 0 % rung stops at the screen after about z² / δ fights per screened build.

## Result

`search/result.js`; schema `'optimiser-result/2'`. Plain JSON: a non-finite bound is null.

- `status` `'done'|'cancelled'|'failed'`, `aborted` (= cancelled), `error` (`{message}` or null).
- `request`: `{presetId, realm, mode, target, objective, space, powerFloor?, seed, seeds: {search, minimise,
  confirm}, effort: {level, delta, deltaKind, alpha, n0, maxN}, characterKey}` (`powerFloor` only when a
  floor is set, so the request keys of runs without one are unchanged);
  `characterKey = metricKey('character', character)` (staleness and Run more).
- `target`: the target spec plus `{kind, label, key, mode, fidelity, assumptions: [{id, label, value,
  tag}]}`; `tag` is `UNRESOLVED` for a server-run fight, `SERVER` for PVP and the World Boss model,
  else `APP`. `objective`: its spec plus `{kind, label, unit, higherIsBetter, statistic, q}`.
- `headline: {better, equivalent, unresolved, worseHidden, text}`.
- `baseline` (rank 0) and `rows` (rank 1…), each a **Row**: `{rank, tieGroup, isBaseline,
  provisional, key, engineKey, candidate, value: Estimate, aux, vsBaseline: Contrast|null, changes,
  power, remainder, writes, runMore, lines}`; `power` is the row's Combat Power (shown as its change
  against the baseline's). `aux`: TTK `{winRate: Estimate, meanMs}`; PVP `{meanMs,
  timeoutShare, matchups: [{opponentId, name, seat, value, vsBaseline}], defaulted?: [{opponentId,
  keys}]}` (a matchup's `vsBaseline` is unadjusted). `runMore` is `{targetN, reason: 'unresolved'}`
  when the row is too close to call (`targetN`: the next doubling of n reaching `nNeeded`), else null.
  `lines` is `describeBuild` (display only). Win rate: `aux` is `{winRate: Estimate, meetsTarget:
  true|false|null, margin: Estimate (mean score), target}` and the result has `goal: {target, status:
  'already'|'reached'|'not-reached', baseline: {winRate, meetsTarget, check: {meets, n, value}},
  bestKey, text}`. The highest chance has no `meetsTarget` and `goal: {mode: 'max', target: null,
  status: 'already'|'best'|'no-wins', baseline: {winRate, check}, bestKey, progress?, text}`; `headline.text` is `goal.text`. Run more re-derives `goal` from the re-measured rows (the baseline check stays the run's).
- **Change**: `effect.changesOf`'s `{id, dimension, label, from, to, scope, owner, sideEffects,
  bundle}` (a talent change also has `moved`, only the talents whose points changed, "Essence Siphon 2 → 0,
  Focused Casting 0 → 3", which every change list shows instead of `from → to`; saved runs keep it) plus `own: Contrast|null`, `needed: Contrast|null` (null only for a change that cannot be
  dropped alone) and `keptBecause` (`'own-effect'`, `'interaction'` or `'power-floor'`). Display rule
  (`optimiserView.changeEffect`): a change kept for its interaction, or "Only with" another change (`own`
  exactly 0), leads with `needed` ("Without it") in the value, the axis mark and the badge "Helps with the
  other changes", which is never red; its `own` is secondary text ("Alone on the current build"). Every
  other change leads with `own`. **WriteGroup** (`writes`): `effect.writesOf`.
- **Estimate** `{est, lo, hi, n, seed, level: 0.95, alphaAdj, method}`; **Contrast** `{delta, lo, hi,
  pct, n, seed, alphaAdj, method, verdict, significant, nNeeded, basis, higherIsBetter}` (`basis`
  `'winRate'` when a TTK contrast fell back to win rate; when every row fell back, `viewResult` draws the
  axis in win-rate points and a baseline without a value reads "Rarely clears: 18% win rate; compared by
  win rate" (`valueNoteOf`); `'win-rate'` or `'margin'` for the win-rate
  objective, which also adds `winRate: {delta, lo, hi}`, the uncapped paired difference in win-rate
  points, on every contrast including a change's `own`; `n` per lane).
- `search: {strategy, jointSize, blocks: [{id, enabled, domain, status: 'converged'|'unresolved'|
  'disabled'|'not-reached'}], steps: [the final search steps, §Progress], starts, optima, evaluated, merged, belowFloor, fights: {search, minimise, confirm,
  total}, unresolved: [{fromKey, toKey, change, contrast}]}` (`belowFloor`: distinct builds the Combat
  Power guard kept out). There is no `converged` flag: with no
  pass cap an ascent only ends when a pass accepts nothing, so every finished search is at a fixed
  point. Whether that optimum is resolved is `unresolved` (open neighbours, distinct pairs) and the
  blocks' `status`.
- `phases: [{id, label, state: 'done'|'cancelled'|'not-run', fights, ms}]`, `multiplicity` (the
  families above), `warnings: [{code, message, severity}]` (`sheet-stale`, `sheet-unverified`,
  `residual-applied`, `opponent-defaulted`, `change-dropped-unresolved`, `arms-not-simulable`,
  `checkpoint-ignored`, `invariant`), `baselineViolations` (non-empty ⇒ `failed`: the baseline breaks
  a game gate and is never silently legalised), `checkpoint`, `stats: {ms, workers}` (run metadata:
  wall clock and pool size; nothing else in a result depends on either), and after Run more `more`.

## Worker pool

Code: `src/lib/tasks/pool.js` (`createPool`, `inlinePool`, `poolScope`), `tasks/kernels.js`,
`tasks/cpuProfile.js` (`workersFor`), `src/lib/poolWorker.js`, hosted by `optimizerWorker.js`.

- **Size.** The per-device pref `cpuProfile` (data-model.md, UI key) gives `workersFor(profile, cores)`
  with `cores = navigator.hardwareConcurrency || 4`: `eco` ⌊cores/4⌋ clamped to 1-2, `balanced` ⌊cores/2⌋
  clamped to 1-6, `max` cores − 1 (at least 1). `optimizerClient.js` reads it when a job starts and
  sends it as `request.workers` (an explicit `workers` wins), so a change applies to the next job and
  the tasks stay pure.
- **Hosting.** The job keeps its one worker (the driver: search, statistics, progress, checkpoints) and
  that worker starts `workers` nested engine workers. Nested dedicated workers keep the main thread
  free of both the driver and the fights; the driver is cheap next to the fights it waits on. With
  `workers` 1, or where the job worker cannot create Workers, nothing changes: the fights run in the
  job worker (`inlinePool`); on the inline path (no Workers at all) they run on the main thread.
- **Kernels.** A pool runs one kernel per job: `objective` (the optimiser's target and objective,
  rebuilt from their specs), `duel`, `swap` (Drop Check's metrics) and `oblivion`. Each worker
  prepares it once (`prepare`: target, objective, opponents, prepared fighter); a shard message then
  carries only `{args: fighter or selector, from, to}`. Fight i of a kernel draws exactly what the
  single-thread code draws for i (`fightRng(seed, i)`, or `mulberry32(hashSeed(seed, k))` for Oblivion
  floors), so a chunk is a function of (setup, args, i) alone.
- **Sharding.** `run(args, from, to)` splits the range into shards of ⌈len / workers⌉ fights, clamped to
  4-64, queued first in, first out across all open requests; idle workers take the next shard. Chunks
  are merged in index order, so the result never depends on completion order or pool size.
- **Determinism.** Every decision reads merged, index-ordered outcomes. The search driver requests
  several arms at once only inside one logged step (a race look, a contrast's two sides) or as a
  prefetch: before a sequence of logged steps (minimise's tests, confirm, attribution, Run more) the
  arms are drawn in parallel to the n those steps will request anyway (their first look or fixed n).
  A prefetch does not touch the fight ledger and is skipped while a checkpoint is replayed, so fight
  counts, logs and checkpoints are identical for every pool size, and a checkpoint taken on one pool
  size resumes on another (`search/determinism.test.js`, pool sizes 1, 2 and 4 with shards finishing
  out of order).
- **Cancel.** An aborted request resolves with the contiguous prefix of finished shards and
  `aborted: true` (the sample store keeps that prefix); shards still running are discarded.
- **Failure.** A worker that fails before it is ready (load error, construction throws, prepare
  throws) is dropped; when none is left the queued shards run inline in the job worker with the same
  numbers. A worker that dies mid-shard has its shard re-queued. An error thrown by the kernel itself
  (a missing stat) rejects the request, as it would inline.
- **Measured** (chromium, built app, Warrior L72 capture's TANK preset, every block, Quick, 60 s dummy;
  4 cores shared with other work, load average about 7): 1 worker 321 s, 2 workers (balanced on 4
  cores) 265 s, identical results (41 947 builds evaluated, 394 744 fights, 25 rows). The gain is
  small here because the search is a long chain of small logged steps (8-fight first looks) and the
  driver's own work (legality, canonical forms, engine keys) stays on one thread.

### Speed calibration and run-time estimates

Settings > Performance holds the CPU thermal profile (pref `cpuProfile`) and an opt-in **Calibrate
speed** button; nothing calibrates on load. The `calibrate` task (`tasks/calibrate.js`) runs about 6 s
through the pool of the current profile: per fight kind (training dummy, a dungeon step, and a duel when
the character has an opponent with a complete sheet) one untimed warm-up batch, then batches until the
kind's slice is spent. It stores `{profile, workers, fightsPerSec by kind, measuredAt, version}` in the
per-device prefs (`lib/calibration.js`); `version` is the build id (package version plus commit, vite
`define`). The calibration is stale when the profile or the build id differs; it keeps giving estimates,
labelled as old. Tool pages show "About N min on this device (estimate)" under Effort, from fights by
kind over those rates: Duel exact, Drop Check and Oblivion Floors an upper bound (every comparison to
maxN, every floor scanned). The Optimiser shows its own Estimate section instead (§Estimates). The Jobs
tray prints the pool size a running job started with.

## Drop Check

Code: `src/lib/features/swap.js` (`runSwapMetrics`, `contrastMetric`, `applyFamily`, `verdictFor`),
`features/dropBatch.js`, worker task `tasks/dropCheck.js`.

- **Metrics** (each after − before, same seed so fight i draws the same randomness on both sides):
  `sim` DPS vs a training dummy (mean, paired t, δ relative), `survival` and `pvp` per opponent
  (proportion, Tango, δ absolute). Each runs the sequential comparator from its first look
  (`nSim`, `nSurvival`, `nPvp`) to `maxN`.
- **Precision** (open decision Q4, `DROP_PRECISION`): Standard δ = 0.5 % DPS, 1 point for
  proportions, `maxN` 32 768; Quick 1 % / 2 points / 8 192; Thorough 0.25 % / 0.5 point / 131 072.
- **Family**: a preset's metrics share α = 0.05. Each comparator runs at α / metrics (so its shown
  interval is Bonferroni-safe); `applyFamily` then applies Holm to the p-values (each times its
  number of looks) and sets `delta.holmReject`, which can promote an `unresolved` metric.
- **Verdict** (`verdictFor`): a metric is `up` / `down` only when better / worse **and** the effect
  clears δ; `flat` when equivalent or inside δ; `unknown` when unresolved (unless Holm rejects).
  `mixed` = up and down; else `inconclusive` if any metric is unknown ("too close to call"); else
  `upgrade` / `downgrade` / `sidegrade`. `sidegrade` therefore means equivalence was shown.
- **Coverage**: `coverage` lists the metrics measured and `notJudged` the changed stat keys no
  measured metric can see (with survival and PVP off, every key outside `DPS_STAT_KEYS`), with
  `coverageLabel` "DPS only: defence not measured".
- **Batch**: applying a drop writes a whole equipment set, so `judgeEntry` aggregates the presets
  wearing each set (`aggregateVerdict`) and ranks by the best set. A ranked row's headline is that
  set's lead preset, and its expanded cards are the same entry's (looked up by import index, not rank).
  An entry applied to a set leaves the list (page view state); Check again re-runs only the rest.
- **Sets compared** (pref `dropSets`, data-model.md UI key): `all` (default) or `set1`. With `set1`,
  `prepareSwap` / `prepareBatch` leave out the presets wearing Set 2 (`setInScope`), so they are neither
  simulated nor judged; Oblivion has one set either way.
- **Sources**: PVP opponents are `features/duel.js opponentFighter`, the Duel screen's own; an
  opponent whose sheet lacks a required stat is skipped and listed (`dropOpponents`). Oblivion rows
  anchor on the Oblivion sheet only for its owner preset (data-model.md §6); others recompute.
- Without a simulation the verdict is the closed-form auto-attack estimate (`basis: 'closed'`,
  `estimate: true`); it is never mixed with simulated results.

## Stat weights

Code: `src/lib/features/statWeights.js` (`STAT_WEIGHT_STEPS`, `statWeightsRequest`, `runStatWeights`,
`calibrateAttack`, `chartBars`), worker task `tasks/statWeights.js` (`KERNELS.statWeights`), UI
`components/statWeights/StatWeightsPanel.svelte` on the Stat Sheet page (B3). Backlog §9.

- **Probes.** One step per stat, the v1 sizes, in `STAT_WEIGHT_STEPS` (the only copy): +100 Attack,
  +1 point Attack %, +1 % Crit Chance, +10 % Crit Damage, +10 % Attack Speed, +1 point for every
  other percent stat, +1 000 gear Health. A class only gets the steps its sheet has. Each probe is the
  preset's Fighter with one stat changed by `anchoredDelta` (the pipeline's cap step): the step is
  added to the **raw** total and the soft cap applied once, so a stat at its hard cap does not move and
  a stat past its soft cap gains only what the curve gives. Never added to the capped value.
- **Damage chart.** Mean DPS over 60 s on the training dummy (the `dps` metric, the one Drop Check
  uses). The dummy has no defence and never hits back, so Penetration, PVP ratings and every defensive
  stat are not probed here.
- **Survival chart.** Chance to be alive after 60 s (the `survival` metric) against the **reference
  enemy** `REFERENCE_ENEMY`: a custom-mode mob with 10¹⁵ HP (it never dies), Attack Speed 1, no
  crit, defence or spells. Its Attack alone is set per run by `calibrateAttack`, so the preset itself
  survives about half the time (128 fights per try, seed `hashSeed('stat-weights-calibration', seed)`,
  never the measured fights; ×4 / ÷4 until bracketed, then log-space bisection; stops inside 35-65 %
  or after 24 tries). A fixed Attack would leave almost every build at 0 % or 100 %, where no step
  can show. When no try lands in the band (survival jumps from always to never, e.g. a minion that
  takes every hit), the try closest to 50 % is used and the page says survival is barely measurable.
  Spell Resist and Penetration are not probed (the enemy casts nothing and has no defence).
- **Pairing.** The base and every probe of a chart use the same seed and fight indices
  (`fightRng(seed, i)`), so each bar is a paired contrast probe − base: paired t for DPS (δ shown
  relative to the base mean), Tango paired proportion for survival (points). Fixed N per probe
  (`STAT_WEIGHT_PRECISION`: Quick 128 / 512, Standard 256 / 1 024, Thorough 1 024 / 4 096 fights for
  DPS / survival); no sequential looks.
- **No measurable effect.** Each chart is one family at α = 0.05, split evenly over its bars
  (Bonferroni), and every bar shows that simultaneous interval. A bar whose interval spans 0 has **no
  measurable effect** at this precision: it gets no rank and is listed after the ranked bars. That
  is not a claim that the stat does nothing, only that this many fights cannot tell. Ranked bars are
  ordered largest change first; a deterministic effect (zero-width interval, e.g. Spell Damage when
  every spell lands on a fixed schedule) is measurable.
- **Job.** Runs on the job's pool; progress phases Damage, Reference enemy, Survival in fights.
  Cancelling returns the bars finished so far (`aborted: true`); Resume re-runs from fight 0, which
  gives the same numbers as an uninterrupted run.
