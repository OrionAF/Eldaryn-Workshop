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
