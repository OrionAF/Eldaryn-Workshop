# Simulation contracts

How the app measures builds: the statistics every tool shares, the optimiser's search and its
result shape. App contracts only; game facts are in `Game/`. Design record:
`docs/WIP/being-worked-on/redesign/plan.md` §A.6, §A.12.

## Statistics

Code: `src/lib/engine/stats/` (`tdist`, `intervals`, `multiplicity`, `sequential`), re-exported by
`src/lib/engine/metrics.js`. Every function takes a two-sided `alpha` that is already divided by
its multiplicity family, and returns plain data.

### Sampling unit

Fight *i* of a stage uses `rng = mulberry32(hashSeed(seed, i))` for every build measured on that
stage (common random numbers), so outcomes are paired by fight index and prefix-stable: raising N
extends a sample, never restarts it.

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
