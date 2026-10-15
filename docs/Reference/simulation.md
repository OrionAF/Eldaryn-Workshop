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
  that look (`deltaAbs`; 0 when θ(Y) is infinite, so equivalence is then impossible).
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
- majors only those that act for the spec and the running sigils, one per glyph type; minors every
  unsealed instance, identical twins included;
- talents: +1, −1, move 1 or k points between two talents, every redistribution of a tier's points,
  within `talentPointsForLevel`.

`legalise(c)` makes the repairs reconcile would make, drops conditions the spec does not offer, and
takes back changed major glyphs that would be inert. `spec` and `mount` values are compound: the
switch plus its legality bundle; the inner ascent over the new spec's picks or the mount's sockets
is the driver's.

### Legality oracle

`legalityOf(character, presetId, cand)` → `{ok, violations, warnings}`: structural checks; round-trip
(`materialise → normaliseCharacter → candidateOf` keeps every choice); `checkPreset` gates with the
Ancient-board entry promoted to a violation; talent points, sigils locked, conditions below 54, board
links below 58, and placed glyphs (sealed, twice on one mount, a major of another class or spec).

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
`src/lib/search/pvpObjective.js` (PVP), `src/lib/search/sampler.js` (sample store, contrasts).
Design record: plan §A.6.

### Per-fight outcome, statistic, interval, contrast

One definition per objective: the value ranked is the value shown is the value tested.

| Objective | Per-fight outcome | Statistic θ | Interval | Paired contrast θ(X) − θ(Y) |
|---|---|---|---|---|
| `dps` | damage / window s; the mob cannot die inside the window | mean | t | paired t (`paired-t`); δ relative |
| `ttk-median`, `ttk-p90` | time in ms if won, else +∞ | censored q-quantile of **all** fights (q = 0.5 / 0.9): the quantile of the wins at q/p, ∞ when p < q | order statistic | paired bootstrap of the quantile difference, in ms (`basis: 'quantile'`); when both builds are ∞ the quantiles cannot differ and the contrast is the paired win-rate difference (`basis: 'winRate'`, Tango, higher is better, absolute zone `WIN_RATE_DELTA` = 0.02 unless given) |
| `survival` | 1 if alive at the window end | proportion | Wilson | Tango paired proportion; δ absolute |
| `pvp-winrate` | 1 if my build wins the duel, one lane per (opponent, seat) | pooled proportion, equal N per lane | Wilson on the pool | stratified Tango, one stratum per lane; δ absolute |

The TTK row also reports the win rate (Wilson) and the mean time of the wins; the PVP row reports
per-matchup Wilson intervals, mean duel length and the timeout share. None of these rank anything:
equal statistics are a tie (no effective-HP or duel-length tie-break).

### Windows and compatibility

- A target with its own length (dummy and custom: `seconds`, default 60; World Boss: its affinity's
  fight duration) is the `dps` window and the default `survival` window. A sequence target (chapter,
  dungeon, raid, Oblivion) has none: every mob keeps its own cap, and `survival` means alive when
  the fight ends. An objective `seconds` overrides the survival window.
- `survival` is refused for a target that cannot damage the player (no swing with attack > 0 and
  speed > 0, no World Boss hit-back, no Oblivion instability): World Boss NONE and FORTIFIED, a
  custom mob with no attack. `objectiveKindsFor(kind, target)` leaves it out of the picker.
- Target kinds and their objectives: dummy `dps`; chapter, dungeon (normal and `_hard`), raid,
  Oblivion `ttk-*`, `survival`; World Boss `dps`, `survival`; custom all four; pvp `pvp-winrate`.

### Target fidelity

Every resolved target carries its engine `mode` (`PVE_MODES` key, or `pvp`), the mode's labelled
`assumptions` (`{id, label, value?}`; the Oblivion output-cut toggle gives `value` 'on'/'off',
default off) and `fidelity`: `server-model` when the fight is server-run (dungeon, raid, Oblivion,
World Boss, PVP), else `client`.

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
them in parallel; the decision reads them in arm order once all are in); the leader is the best estimate (`objective.score`); an arm leaves when
its contrast against the leader is `worse` at α / (arms × looks). The race stops when one arm is
left or every survivor is `equivalent` to the leader; arms still open at maxN are `unresolved`. The
winner is the arm nearest the baseline among the leader and its ties. Before a race the arms are
made distinct, simulable (an `EngineInputError` arm is skipped, warning `arms-not-simulable`) and
merged by engine key (`effect.mergeByEngine`).

### Strategy

- **Exhaustive** when the talents block is off (its domain is a neighbourhood, not every
  allocation) and the joint space (product of the enabled blocks' domain sizes, then the actual
  enumeration) holds at most `EXHAUSTIVE_MAX` = 50 000 builds: one race of every legal canonical build.
- **Local** otherwise. Starts: the baseline; each other spec, inner-optimised; each other gear set;
  a talent fill that spends points one at a time on the best ordering heuristic (`objective.screen`,
  a start only); `randomStarts` (3) seeded random legal starts. From each, coordinate ascent: race
  `[x, ...block.domain(x)]` per block in `BLOCKS` order and accept a winner only when a sequential
  compare on S1 at α / arms says `better` and its canonical form was not visited; a full pass that
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

The full run shared four cores with other jobs. Standard and Thorough cost more: n0 doubles, and a
comparison inside δ can run to maxN. A PVP duel costs several times a dummy fight, per matchup.
The Effort control prints δ, the first look n0 and maxN per level and these measured figures
(`ui/optimiserView.js` `MEASURED_COST`, `effortPlan`); no run is time-capped. The Optimiser page runs as
a session job (U3): Cancel keeps the provisional rows and Resume re-starts the task with the job's
checkpoint as `resumeFrom`. The page sends the character with `runs: []`, so saving a run does not change
`characterKey` (Run more and the staleness marker compare it).

## Result

`search/result.js`; schema `'optimiser-result/2'`. Plain JSON: a non-finite bound is null.

- `status` `'done'|'cancelled'|'failed'`, `aborted` (= cancelled), `error` (`{message}` or null).
- `request`: `{presetId, realm, mode, target, objective, space, seed, seeds: {search, minimise,
  confirm}, effort: {level, delta, deltaKind, alpha, n0, maxN}, characterKey}`;
  `characterKey = metricKey('character', character)` (staleness and Run more).
- `target`: the target spec plus `{kind, label, key, mode, fidelity, assumptions: [{id, label, value,
  tag}]}`; `tag` is `UNRESOLVED` for a server-run fight, `SERVER` for PVP and the World Boss model,
  else `APP`. `objective`: its spec plus `{kind, label, unit, higherIsBetter, statistic, q}`.
- `headline: {better, equivalent, unresolved, worseHidden, text}`.
- `baseline` (rank 0) and `rows` (rank 1…), each a **Row**: `{rank, tieGroup, isBaseline,
  provisional, key, engineKey, candidate, value: Estimate, aux, vsBaseline: Contrast|null, changes,
  remainder, writes, runMore, lines}`. `aux`: TTK `{winRate: Estimate, meanMs}`; PVP `{meanMs,
  timeoutShare, matchups: [{opponentId, name, seat, value, vsBaseline}], defaulted?: [{opponentId,
  keys}]}` (a matchup's `vsBaseline` is unadjusted). `runMore` is `{targetN, reason: 'unresolved'}`
  when the row is too close to call (`targetN`: the next doubling of n reaching `nNeeded`), else null.
  `lines` is `describeBuild` (display only).
- **Change**: `effect.changesOf`'s `{id, dimension, label, from, to, scope, owner, sideEffects,
  bundle}` plus `own: Contrast|null`, `needed: Contrast|null` (null only for a change that cannot be
  dropped alone) and `keptBecause`. **WriteGroup** (`writes`): `effect.writesOf`.
- **Estimate** `{est, lo, hi, n, seed, level: 0.95, alphaAdj, method}`; **Contrast** `{delta, lo, hi,
  pct, n, seed, alphaAdj, method, verdict, significant, nNeeded, basis, higherIsBetter}` (`basis`
  `'winRate'` when a TTK contrast fell back to win rate; `n` per lane).
- `search: {strategy, jointSize, blocks: [{id, enabled, domain, status: 'converged'|'unresolved'|
  'disabled'|'not-reached'}], starts, optima, evaluated, merged, fights: {search, minimise, confirm,
  total}, unresolved: [{fromKey, toKey, change, contrast}]}`. There is no `converged` flag: with no
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
  wearing each set (`aggregateVerdict`) and ranks by the best set.
- **Sources**: PVP opponents are `features/duel.js opponentFighter`, the Duel screen's own; an
  opponent whose sheet lacks a required stat is skipped and listed (`dropOpponents`). Oblivion rows
  anchor on the Oblivion sheet only for its owner preset (data-model.md §6); others recompute.
- Without a simulation the verdict is the closed-form auto-attack estimate (`basis: 'closed'`,
  `estimate: true`); it is never mixed with simulated results.
