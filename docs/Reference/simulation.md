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
