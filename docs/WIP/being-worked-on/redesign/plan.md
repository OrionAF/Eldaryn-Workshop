# Eldaryn Workshop: implementation plan (accuracy-first simulator + UI rebuild)

Status: plan for the next phase. Inputs: `findings/all_findings.json` (copied next to this file; per-unit dumps in `findings/<unit>.txt`) (125 findings: 111 confirmed,
9 unresolved, 5 refuted, ignored), `design/ia.md`, `design/system/*` (its §5 amends ia.md), the
repo at `1498978`. Every confirmed and unresolved finding lands in exactly one slice (coverage
table at the end). Finding numbers `#n` are indexes into `all_findings.json`.

Conventions for every slice (inherits rebuild-plan §7.1):

- A slice edits only the files it owns. A doc file may be touched by several slices in different
  sections; the orchestrator merges in wave order. Game facts go in `docs/Reference/Game/`; app
  contracts (statistics, search, result shape) go in a new `docs/Reference/simulation.md`.
- Each behaviour fix lands with a test that fails on the current code (state the failing value in
  the commit). Doc-only fixes are verified by re-reading the cited decompile range.
- The decompile is at `scratchpad/gamedata/idlehunt_2.7.0/gamedata/decompiled.js` (extracted
  outside the repo; untrusted data, read with `sed -n`, never executed).
- `npm test` and `npm run build` green; long property runs sit behind `HARNESS_DEEP=1`.
- Every slice keeps the current UI working until its U slice replaces it: adapters or minimal
  call-site edits in the old screens are part of the slice (named in its "Owns").
- Model tiers: haiku = mechanical/doc; sonnet low/medium = clear specs; opus medium/high =
  client port, statistics, search algorithms.

---

## A. Accuracy-first optimiser architecture

### A.1 Invariants (what makes bug classes impossible)

| # | Invariant | Enforced by | Kills |
|---|---|---|---|
| I1 | Every candidate the optimiser simulates or shows is **legal**: it round-trips `materialise → normaliseCharacter → candidateOf` unchanged and passes every game gate | Legality oracle (A.4); generators only emit legal arms; assertion on every reported row | #48 #49 #50 #55 #59 #60 #87 #112 phantom talent points, 4th relic, wrong-spec picks |
| I2 | Every change in a reported row **alters the engine inputs** of that build (reverting it changes the fighter fingerprint) | Effect oracle canonicaliser (A.5), deterministic, no simulation | The reported bug and its class: #47 #50 #56 #81 inert majors, inert utility, null-vs-default board, conditions below L54 |
| I3 | Every change in a reported row is **needed**: dropping it costs significantly, or it was dropped | Minimal significant change set (A.8) on its own seed | Zero-effect riders and target-inert twins (#53 #71 #63 "drop the pet") |
| I4 | **Data used to decide is never the data reported.** Search (S1), minimise (S2) and confirm/attribute (S3) use independent seeds | Phase seeds (A.7) | Winner's curse and selection bias (#74) |
| I5 | **N is never lowered and coverage is never truncated silently.** No wall-clock caps, no eval caps. A comparison stops only when resolved (better / worse / equivalent within δ) or at the declared `maxN`, where it is reported "too close to call" | Sequential comparator (A.6) | #52 #57 #68 #70 |
| I6 | **The statistic ranked is the statistic shown is the statistic tested.** Value, CI and paired contrast come from one definition and one sample set | Objective definitions (A.6) | #66 #73 |
| I7 | **No proxy ranks anything.** Closed-form screens only order work and fill a labelled `ESTIMATE`; they never prune, rank or break ties | Search driver (A.7) | #61 #63 #67 #70 |
| I8 | **Deterministic.** Result = f(character snapshot, request, seed); identical after cancel + resume and for any worker count | Fight-indexed seeds, checkpoint (A.10) | Device-dependent answers (#68) |
| I9 | **Engine inputs are finite.** NaN/undefined at engine entry throws `EngineInputError` naming the key; nothing returns NaN | `engine/validate.js` (E1/E3) | #30 #42 #44 #95 |

### A.2 Module map (replaces `search/search.js`, `candidates.js`, `objectives.js`, `pvpObjective.js`)

| File (new unless noted) | Layer | Role | Slice |
|---|---|---|---|
| `src/lib/engine/stats/tdist.js` | L2 | exact Student-t quantile (inverse regularised incomplete beta) | A1 |
| `src/lib/engine/stats/intervals.js` | L2 | mean/t, Wilson, Newcombe paired-binary, censored quantile + order-statistic CI, paired bootstrap of quantile difference (seeded) | A1 |
| `src/lib/engine/stats/multiplicity.js` | L2 | Holm, Bonferroni | A1 |
| `src/lib/engine/stats/sequential.js` | L2 | look schedule, per-look alpha, `decide()`, `nNeeded()` | A1 |
| `src/lib/engine/metrics.js` (edit) | L2 | re-exports stats; `tCrit95` delegates to `tdist`; `pairedDelta` routes 0/1 data to Newcombe | A1 |
| `src/lib/model/legality.js` | L3 | pure game gates (A.4), shared by model, build, UI and search | M1 |
| `src/lib/search/space.js` (replaces `candidates.js`) | L5 | Candidate, `candidateOf`, `materialise`, `candidatePatch`, blocks with full legal domains, mode-aware | A2 |
| `src/lib/search/legality.js` | L5 | `legalityOf(character, presetId, cand)` = round-trip + `model/legality` gates | A2 |
| `src/lib/search/effect.js` | L5 | `engineKey(fighter, mode)`, `changesOf`, `canonicalise`, scope + side-effect resolution | A2 |
| `src/lib/search/patch.js` + `src/lib/store/apply.js` | L5/L6 | pure `applyCandidate(character, presetId, cand, {include})`; one store mutator that calls it, normalises, persists | A2 |
| `src/lib/search/objectives.js` (rewrite), `pvpObjective.js` (rewrite) | L5 | per-fight outcome functions + statistic + contrast per objective | A3 |
| `src/lib/search/sampler.js` | L5 | CRN sample store keyed by `(engineKey, stage)`; prefix-extensible; shared by engine-identical builds | A3 |
| `src/lib/search/race.js` | L5 | sequential multi-arm racing with family-wise elimination | A4 |
| `src/lib/search/search.js` (rewrite) | L5 | phases screen → search → minimise → confirm → attribute | A4 |
| `src/lib/search/minimise.js` | L5 | minimal significant change set | A4 |
| `src/lib/search/result.js` | L5 | assembles the result contract (A.9), asserts I1-I3 | A4 |
| `src/lib/tasks/optimize.js` (rewrite) + `optimizeMore` | L5 | worker tasks with progress, checkpoint, resume | A4 |
| `src/lib/optimizerClient.js`, `optimizerWorker.js`, `tasks/index.js` (edit) | L5 | job protocol (progress, checkpoint, cancel, resume, fallback) | J1 |

Retired: `search/candidates.js`, tiered beam, `screenWithGroups`, `finalMs`, `maxMs`, `maxEvals`,
`maxPasses`, `components/optimiser/apply.js`, the EHP/`-meanMs` tie-breaks.

### A.3 Build space

**Candidate** (canonical, plain JSON) keeps today's fields with three changes:
`sigilConditions` holds only overrides of the *character-wide* condition (M1 moves conditions to
`sigils.owned[sp].condition`, #54 #84); `talentAllocation`/`mountGlyphs` are `null` iff equal to
saved; `transcendencePresetId` is compared by its *resolved* board (B1 fallback) so null and the
board it resolves to are one build (#56).

**Mode.** `createBuildSpace(character, preset, {realm, mode: 'pve'|'pvp', residual, toggles})`.
`mode` comes from `target.kind === 'pvp'`. In `pvp` the conditions domain includes
`ENEMY_HP_BELOW_*` for DAMAGE/DEBUFF sigils (sigils.md §7, L668833; #51 #62); in `pve` only
`ON_COOLDOWN` + `MY_HP_BELOW_*` on BUFF/HEAL sigils.

**Blocks** (fixed order). Each exposes `domain(c)`: every legal value of that block given the rest
of `c`, already canonicalised and merged by engine fingerprint. No neighbour sampling.

| Block | Domain | Notes |
|---|---|---|
| `spec` (talent set) | the other set if it has a spec and `dualTalentsUnlocked(level)` (38) | **Compound**: switch → `legalise` (drop picks inactive for the new spec, wrong utility kind, invalid conditions, inert majors) → inner coordinate ascent over {sigils, utility, ancient, conditions, majorGlyphs, talents} before comparison (#50 #60) |
| `equipmentSet` | 1/2 if `dualEquipUnlocked` (28); none in Oblivion | |
| `sigils` | every subset of size ≤ `k = min(3, maxSigilSlots(level, class))` of the owned generic sigils active for the spec (an empty slot is a legal choice) | full enumeration (≤ ~1 350) |
| `utility` / `ancient` | owned, spec-active, unlocked (`maxSigilSlots > 0`, #59); Ancient also gated by the Q3 board policy (#55) | |
| `conditions` | product of options per equipped species (mode-filtered), level ≥ 54 | writes **character** scope; side effects = other presets equipping the species |
| `relics` | every subset of size ≤ `relicSlotCap` of the owned class relics; `relicSlotCap = 2 + extraSlotsPurchased` (0 below level 22) (#49) | ≤ ~6 200 |
| `pet`, `mount`, `transcendence` | owned + none; boards resolved | `mount` is **compound**: per mount, inner optimise its minor/major sockets from its saved sockets |
| `minorGlyphs`, `majorGlyphs` | all socket assignments for the ridden mount from inventory instances not sealed, one instance per mount; no signature dedupe (engine merge handles twins, #58) | majors filtered by `activeMajorGlyphs` (class, requiredSpec, sigil equipped, no same-type of ≥ rarity) (#47) |
| `talents` | local moves on the chosen set (A.7): +1, −1, move 1, move *k* between two talents, tier re-spec; cap `talentPointsForLevel(level)` (#48) | writes **character** scope |

Joint size = product of block domains. If it is ≤ `EXHAUSTIVE_MAX` (50 000, a strategy switch,
not a cap) the whole joint space is raced exhaustively; otherwise the local strategy (A.7) runs.

### A.4 Legality oracle

```
legalityOf(character, presetId, cand) -> { ok, violations: [{gate, field, detail}] }
  1. structural: fields typed; every id resolves and is owned.
  2. round-trip: X = materialise(character, presetId, cand)        // pure applyCandidate on the full character
                 N = reconcileCharacter(normaliseCharacter(X))
                 candidateOf(N, presetId) deepEquals canonical(cand)  else violation 'roundtrip' + diff
  3. gates (model/legality.js, each cited):
     talent points    spent <= talentPointsForLevel(L) = L<15 ? 0 : min(L,43)-14     talents.md §3, L1096580-1096620
     relic slots      relicIds.length <= 2 + min(extraSlotsPurchased,2); 0 below L22; every relic level > 0
                                                                                      relics.md, L1142530-1142573; UNLOCK_LEVELS L668649
     sigil slots      generic <= maxSigilSlots(L, class); utility/ancient unlocked; species active for spec;
                      utility kind = spec slot kind (SUMMON/SHIELD/FORM)              sigils.md §1-§2, §11
     form sigils      level fixed at 1                                                sigils.md §3, L1328698
     conditions       one per owned species (character-wide); option in sigilConditionOptions(sp, spec, mode);
                      default below L54                                               sigils.md §7, L668833
     unlocks          dual equip L28, dual talents L38, mounts L40, transcendence L55, its presets L58
                                                                                      classes.md, L668649
     Ancient          node allocated on the resolved board (Q3 policy, [SERVER])      sigils.md §9, transcendence.md
     glyphs           class, requiredSpec, not sealed, one instance per mount         mounts-glyphs.md §8-§10
```

Use: generators call the gates directly (cheap); the full oracle runs on every reported row in
`result.js` and on every arm in tests. A baseline that violates a gate is a **setup blocker**
(`status: 'failed'`, `baselineViolations` listed with fix links), never silently legalised.

### A.5 Effect oracle (deterministic, no simulation noise)

`engineKey(fighter, mode)` = `metricKey` of exactly what the engine reads:

- PVE: `preparePveFighter(fighter).inputs`, a plain object E1 makes `fresh()` read exclusively
  (player entity fields, spell configs after glyphs/form/spec, shield, summon, stack config,
  conduits, thorns, resolved conditions).
- PVP: `fighterDuelArgs(fighter)` (already the resolver's full argument list; E3 completes it).

```
canonicalise(B, X):                       // B = baseline candidate
  for c in changesOf(B, X) (stable order; c includes its legality bundle):
      Y = legalise(revert(X, c))
      if legal(Y) and engineKey(Y) == engineKey(X): X = Y   (record 'inert')
  repeat until no change; return X
```

Applied to every arm before it is simulated (inert variants collapse to one key and are never
evaluated twice; the kept one has the fewest changes) and to every reported row (assertion I2).
Builds with equal `engineKey` share one sample vector in the sampler: identical by construction.

Target-dependent inertness (a heal condition against the dummy, armour against a boss that never
hits) cannot be proven from inputs. It is handled by: (a) objective/target compatibility (no
survival objective against targets that deal no damage, #61); (b) *sample identity*: when a revert
yields a bit-identical outcome vector on the same stage seeds, prefer the build with fewer changes
(#71); (c) the minimal-set phase drops anything not needed (I3).

### A.6 Objectives and statistics

**Sampling unit.** Fight *i* of stage *s* uses `rng = fightRng(seed_s, i)` for every build (CRN).
E4 splits it into per-actor lanes (same distribution, higher pairing). Samples are
prefix-stable, so raising N extends, never restarts.

| Objective | Per-fight outcome | Statistic θ | Interval for θ | Paired contrast | Notes |
|---|---|---|---|---|---|
| `dps` | damage / window s | mean | t (exact quantile) | paired t on differences | window = target window |
| `ttk-median`, `ttk-p90` | time if won, else **+∞** (censored) | q-quantile over **all** fights (= quantile of wins at q/p; ∞ when p < q) | order-statistic binomial CI on the same vector | paired bootstrap of θ(X) − θ(Y) (fight-index resampling, B = 2 000, seeded); both ∞ → contrast on win rate | win rate shown on every row (#66 #73) |
| `survival` | alive at window end | proportion | Wilson | Newcombe paired (method 10) on discordant pairs | window defaults to the target's own fight length (#78); rejected for targets that deal no damage (#61); no EHP tie (#61) |
| `pvp-winrate` | my win per duel, per (opponent, seat) | pooled proportion, equal N per matchup | Wilson | stratified Newcombe across matchups | no `-meanMs` tie (#63); per-matchup rows kept |

Rules: t critical values are exact for every df (#69). A 0/1 paired difference never uses a t
interval; zero discordant pairs gives a non-degenerate Newcombe interval (#101).

**Sequential comparator** `compare(X, Y, {stage, delta, alpha, n0, maxN})`: looks at
`n0, 2n0, 4n0, … ≤ maxN`; at each look the two-sided interval at `alpha / looks` (Bonferroni over
looks; `alpha` already divided by its family). Verdict: `better` (lo > 0), `worse` (hi < 0),
`equivalent` (−δ < lo and hi < δ), else continue; at `maxN` → `unresolved`. δ is the indifference
zone (relative for dps/ttk, absolute points for proportions; effort sets it, Q4). Shown intervals
are these decision intervals, so "bar excludes 0" ⇔ "significant".

**Families.** Racing: Bonferroni over arms × looks. Confirm: Holm over rows vs baseline.
Attribution: Holm within a row's changes. Drop Check: Holm over its metrics. Power hint:
`nNeeded = ((z(1−αadj/2) + z(0.8)) · sd / max(|Δ|, δ))²`.

**Ordering heuristics** (I7): `closedFormDps` (fixed: player's `totalPenetration`, enemy miss
disables pierce, PVP passes opponent block/miss, #67) and `ehpProxy` only order arms inside a race
and fill `ESTIMATE` cells.

### A.7 Search procedure

Seeds: `S1 = hashSeed('search', seed, target.key)`, `S2 = …'minimise'…`, `S3 = …'confirm'…`,
`S4k = …'more', k…`. Phases (progress segments): **screen** (first racing look) → **search** →
**minimise** (S2) → **confirm** (S3) → **attribute** (S3).

```
race(arms, stage):        // successive elimination, paired against the current leader
  all arms sampled to n0; leader = best estimate
  eliminate arm a when compare(a, leader) = worse at alpha/(|arms| * looks)
  stop when 1 arm left, or survivors pairwise equivalent (tie set), or maxN (unresolved set)
  return {winner (fewest changes among the tie set), ties, unresolved}

search():
  if jointSize <= EXHAUSTIVE_MAX: R = race(all legal canonical builds, S1)       strategy 'exhaustive'
  else:                                                                          strategy 'local'
    starts = [baseline, best of each other spec (compound), each other equipment set,
              greedy talent fill, 3 seeded random legal starts]
    optima = starts.map(coordinateAscent)
  finalists = distinct optima ∪ every tie/unresolved contender ∪ baseline       (no count cap)

coordinateAscent(x):
  visited = {key(x)}
  loop:
    for block in BLOCKS:
      r = race([x, ...block.domain(x)], S1)
      if r.winner != x and compare(r.winner, x).verdict == 'better' and key not visited:
          x = r.winner; visited.add(key(x))
      contenders += r.ties ∪ r.unresolved
    until a full pass accepts nothing
  verify(x): race every single-block neighbour and every 1- and 2-point talent move against x;
             any 'better' → resume the loop; 'unresolved' → listed in search.unresolved
  return x
```

Talents (#52): inner steepest ascent with +1/−1/move-1/move-k/tier-re-spec moves, starts {saved,
greedy fill by marginal gain, other set if same spec}, run to verified convergence. No pass cap:
termination follows from strict significant improvement plus the visited set.

Cost control without losing accuracy: engine-identical merging, sample sharing, CRN lanes (E4),
racing (most arms die at the first look), optional deterministic worker pool (J2). Measured
cost per run is printed in the Effort control after A4 benchmarks it.

### A.8 Minimal significant change set

```
minimise(B, F):                                       // stage S2, after canonicalise
  loop:
    C = changesOf(B, F)                               // atomic changes with legality bundles
    for c in C: t_c = compare(F, legalise(F − c))     // Holm over |C|
    droppable = { c : t_c.verdict in {equivalent, worse, unresolved} }
    if empty: break
    drop the c with the smallest estimated loss (ties: most disruptive first); F = legalise(F − c)
  return compare(F, B).verdict == 'better' ? F : B
```

Then on S3 (attribute): `own(c) = contrast(legalise(B + c), B)`, `needed(c) = contrast(F, F − c)`
(both Holm within the row), `keptBecause = own significant ? 'own-effect' : 'interaction'`, and the
interaction remainder per fight (`d_full − Σ d_c` for mean/proportion objectives, paired t; for
quantile objectives a paired bootstrap of θ-differences). A change unresolved at `maxN` is dropped
(the row is still measured honestly on S3) and listed in `warnings`.

Design amendment: the mockup's "Within noise on its own: kept because the build with it measured
higher as a whole" becomes "Not significant alone; kept because removing it costs X (CI)", backed by
`needed`.

### A.9 Result contract (`search/result.js`; documented in `docs/Reference/simulation.md`)

```js
/** @typedef {{est: number|null, lo: number|null, hi: number|null, n: number, seed: number,
 *   level: 0.95, alphaAdj: number, method: 't'|'wilson'|'order-stat'|'bootstrap'}} Estimate */

/** @typedef {{delta: number|null, lo: number|null, hi: number|null, pct: number|null, n: number, seed: number,
 *   alphaAdj: number, method: 'paired-t'|'newcombe'|'paired-bootstrap',
 *   verdict: 'better'|'worse'|'equivalent'|'unresolved', significant: boolean,
 *   nNeeded: number|null}} Contrast            // significant === (verdict === 'better' || verdict === 'worse') */

/** @typedef {Object} OptimiserResult
 * @property {'optimiser-result/2'} schema
 * @property {'done'|'cancelled'|'failed'} status
 * @property {{message: string}|null} error
 * @property {{presetId: string, realm: 'base'|'oblivion', mode: 'pve'|'pvp', target: Object, objective: Object,
 *   space: Object, seed: number, seeds: {search: number, minimise: number, confirm: number},
 *   effort: {level: 'quick'|'standard'|'thorough', delta: number, deltaKind: 'relative'|'absolute',
 *            alpha: 0.05, n0: number, maxN: number},
 *   characterKey: string}} request            // characterKey = metricKey(character snapshot): staleness + re-run
 * @property {{kind: string, label: string, key: string, fidelity: 'client'|'server-model',
 *   assumptions: Array<{id: string, label: string, value: string, tag: 'CODE'|'SERVER'|'UNRESOLVED'|'APP'}>}} target
 * @property {{kind: string, label: string, unit: 'dps'|'ms'|'p', higherIsBetter: boolean,
 *   statistic: 'mean'|'proportion'|'censored-quantile', q: number|null}} objective
 * @property {{better: number, equivalent: number, unresolved: number, worseHidden: number, text: string}} headline
 * @property {Row} baseline                    // rank 0, always present unless status 'failed'
 * @property {Row[]} rows                      // 'better' rows by estimate, then equivalent/unresolved by fewest changes
 * @property {{strategy: 'exhaustive'|'local', jointSize: number|null,
 *   blocks: Array<{id: string, enabled: boolean, domain: number, status: 'converged'|'unresolved'|'disabled'|'not-reached'}>,
 *   starts: number, optima: number, evaluated: number,
 *   merged: {inert: number, engineIdentical: number, sampleIdentical: number},
 *   fights: {search: number, minimise: number, confirm: number, total: number},
 *   converged: boolean,
 *   unresolved: Array<{fromKey: string, toKey: string, change: string, contrast: Contrast}>}} search
 * @property {Array<{id: 'screen'|'search'|'minimise'|'confirm'|'attribute', label: string,
 *   state: 'done'|'cancelled'|'not-run', fights: number, ms: number}>} phases
 * @property {{vsBaseline: 'holm', perChange: 'holm-within-row', racing: 'bonferroni', looks: 'bonferroni', alpha: 0.05}} multiplicity
 * @property {Array<{code: string, message: string, severity: 'info'|'warn'}>} warnings
 *   // e.g. 'sheet-stale' (residual not applied), 'residual-applied', 'opponent-defaulted', 'change-dropped-unresolved'
 * @property {Array<{gate: string, field: string, detail: string}>} baselineViolations   // non-empty => 'failed'
 * @property {{jobId: string, phase: string, resumable: boolean}|null} checkpoint
 * @property {{ms: number, workers: number}} stats
 */

/** @typedef {Object} Row
 * @property {number} rank                     // 0 = baseline
 * @property {number|null} tieGroup            // rows not resolved apart share a group; UI prints "2="
 * @property {boolean} isBaseline
 * @property {boolean} provisional             // true until confirm finished for this row (cancel, or live progress)
 * @property {string} key                      // canonical candidate key
 * @property {string} engineKey
 * @property {Object} candidate                // canonical; legalityOf(...).ok asserted
 * @property {Estimate} value                  // the ranked statistic, S3
 * @property {{winRate?: Estimate, meanMs?: number, timeoutShare?: number,
 *   matchups?: Array<{opponentId: string, name: string, seat: 'attacker'|'defender', value: Estimate, vsBaseline: Contrast|null}>,
 *   defaulted?: Array<{opponentId: string, keys: string[]}>}} aux
 * @property {Contrast|null} vsBaseline        // Holm across rows
 * @property {Change[]} changes                // never empty for a non-baseline row (asserted)
 * @property {{delta: number|null, lo: number|null, hi: number|null, method: string}|null} remainder
 * @property {WriteGroup[]} writes
 * @property {{targetN: number, reason: 'unresolved'|'tighten'}|null} runMore
 * @property {Array<{label: string, value: string, inactive?: string}>} lines   // describeBuild, fixed label set
 */

/** @typedef {Object} Change
 * @property {string} id          // 'pet' | 'mount' | 'relics' | 'sigils' | 'utility' | 'ancient' | 'transcendence'
 *                                // | 'equipmentSet' | 'spec' | 'talents:<set>' | 'condition:<species>' | 'glyph:<mountId>:<tier>:<i>'
 * @property {string} dimension
 * @property {string} label   @property {string} from   @property {string} to
 * @property {'preset'|'character'|'mount'} scope
 * @property {{presetId?: string, talentSet?: 0|1, mountId?: string, species?: string}} owner
 * @property {Array<{presetId: string, name: string, reason: string}>} sideEffects   // other presets this write changes
 * @property {string[]} bundle    // changes forced with it by legality (e.g. a spec switch dropping a Mage sigil)
 * @property {Contrast|null} own  // baseline + this change alone vs baseline (S3)
 * @property {Contrast} needed    // full minus this change vs full (S3 report; S2 decided)
 * @property {'own-effect'|'interaction'} keptBecause
 */

/** @typedef {{scope: 'preset'|'character'|'mount', title: string, owner: Object, changeIds: string[],
 *   sideEffects: Array<{presetId: string, name: string, reason: string}>}} WriteGroup */
```

Progress (worker → client, throttled to ≥ 250 ms):

```js
{ type: 'progress', jobId, phase, phases: [{ id, label, state: 'done'|'current'|'queued', done, total }],
  block: string|null, counts: { evaluated, fights, eliminated, merged }, elapsedMs,
  provisional: Row[] | null }      // single-look values, labelled Provisional, never coloured
```

Checkpoint (small: samples are recomputed from seeds on resume):

```js
{ schema: 'optimiser-checkpoint/1', requestKey, characterKey, phase, seeds,
  log: Array<{phase, kind: 'accept'|'eliminate'|'tie'|'drop', key, vs, n, verdict}>,
  frontier: { start: number, incumbentKey, block, armsN: Record<key, number> },
  finalists: string[], minimised: Record<key, string[]>, confirmed: string[] }
```

Requests: `{mode: 'optimize', character, presetId, realm, target, objective, space, effort, seed, resumeFrom?}`
and `{mode: 'optimizeMore', character, result, rowKeys, targetN, seed}` (re-measures rows, their
changes and the baseline at fixed `targetN` on `S4k`; returns updated rows).

### A.10 Worker, progress, cancel, resume

- One long-lived worker per job; `new Worker` wrapped in try/catch with an inline fallback (#108).
- Cancel is soft: the task stops at the next fight batch, posts a checkpoint, then a result with
  `status: 'cancelled'`, finished phases kept and unfinished rows `provisional`.
- Resume: the job store re-starts the task with `resumeFrom`. Property: cancel at any point +
  resume = uninterrupted run, bit for bit (H3). Checkpoints live in the session job store (U3) and
  optionally IndexedDB so a reload can offer Resume.
- J2 (optional): deterministic worker pool. Fights are indexed, so sharding fight ranges across
  `hardwareConcurrency − 1` workers changes speed only (test: pool sizes 1/2/4 identical).

### A.11 Apply

`search/patch.js applyCandidate(character, presetId, cand, {include: scopes})` is the single write
path, used by the legality oracle (round-trip) and by `store/apply.js` (one mutator: patch →
normalise → reconcile → `persist()`). Apply review groups `row.writes` by scope with side effects
named; groups can be excluded. Applying marks the preset sheet stale (S1) and the run "applied".

### A.12 One statistical vocabulary for every tool

Drop Check, Duel and Oblivion Floors report `Estimate`/`Contrast` from the same `engine/stats`
modules and the same sequential comparator: Drop Check verdicts become Holm across metrics with an
`inconclusive` state (F1); Duel shows a Wilson interval, `nNeeded` and Run more (U10); Oblivion
floors resolve "≥ threshold" per floor sequentially (F2).

### A.13 Optimiser slices

**A1 Statistics core** (opus medium). Owns `src/lib/engine/stats/*` (new), `engine/metrics.js`
(stats parts), `docs/Reference/simulation.md` §Statistics (new). Findings: #69 tCrit95 too small
for df 31-59/61-119; #101 zero-discordant paired CI degenerate.
Behaviour: exact t quantile; Newcombe paired-binary; censored quantile + order-statistic CI;
seeded paired bootstrap; Holm/Bonferroni; sequential `compare`/`decide`; `nNeeded`.
Tests (fail first): `tCrit95(31)` = 2.0395 (now 2.0); `tCrit95(63)` = 1.9983 (now 1.98); paired
0/1 vectors with no discordant pairs at n = 64 give hi > 0.03 (now [0, 0]); Holm adjusts 11 equal
p-values; calibration (`stats/calibration.test.js`): 2 000 null paired contrasts → false
'better' ≤ 2.5 % ± MC error; equivalence verdict reached for a true effect of δ/2.

**A2 Space, legality and effect oracles** (opus high). Owns `search/space.js`, `search/legality.js`,
`search/effect.js`, `search/patch.js`, `store/apply.js`, tests; deletes `search/candidates.js`
after A4 switches over. Depends M1 (gates, conditions), B1 (`activeMajorGlyphs`, resolved board,
describe labels), E1/E3 (`inputs`, duel args).
Findings: #47 majorActive ignores requiredSpec/duplicates; #48 talents to 29 at any level;
#49 relics fill 4 slots; #50 spec switch keeps inactive sigils; #51 conditions never offer
ENEMY_HP_BELOW; #54 conditions searched per preset;
#55 Ancient paired with a board lacking its node (Q3 policy); #56 'default' offered for a null
link; #58 glyph signature dedupe blocks twins; #59 utility/ancient not gated by unlock level;
#60 tests miss spec-switch/level/duplicate cases; #62 PVP searches PVE conditions.
Behaviour: A.3-A.5, A.11. Tests (fail first on `candidates.js` equivalents): level-30 Warrior with
16/16 points → no 17-point arm; `relicSlotCap` 2 → no 3-relic arm; Mage→Druid spec arm carries no
Mage SHIELD utility and no Mage-locked major; PVP space offers `ENEMY_HP_BELOW_40` for CATACLYSM, PVE
does not; a major glyph whose sigil the arm drops is reverted by `canonicalise`; null link and
'default' board give one key; two identical minor glyph instances can both be socketed; level-16 Necro gets no utility arm;
property: every arm of every block for all 8 specs × 2 realms passes `legalityOf` (moved to H3 for
the deep run).

**A3 Objectives and sampler** (opus medium). Owns `search/objectives.js`, `search/pvpObjective.js`,
`search/sampler.js`, tests. Depends A1, E1 (mode), E3, D1 (`_hard` ids, `mode`).
Findings: #61 survival EHP tie outranks baseline / offered vs non-attacking bosses; #63 PVP
`-meanMs` tie prefers losing faster; #66 TTK ranks wins-only quantile; #67 screen uses enemy
penetration; #73 TTK vsBaseline is a penalised mean; #76 cache key omits N (structurally gone:
prefix-extensible sample store keyed by engineKey and stage); #78 survival window ignores target
length; #79 pvpObjective header wrong on timeouts.
Behaviour: A.6 table; `resolveTarget` accepts `dungeon_N_hard`, sets `mode` and `assumptions` from
E1's `PVE_MODES`; residual applied only when the sheet is fresh (S1), else warning.
Tests (fail first): build with 68.5 % wins and faster wins-only median ranks below a 99.5 % build;
displayed TTK value lies inside its own CI; TTK contrast unit is ms of the ranked quantile;
survival vs WB NONE throws `objective cannot score`; two PVP builds at p = 0 with different
`meanMs` tie (baseline first); raising `totalPenetration` raises `closedFormDps` vs block > 0;
custom target `seconds: 30` → survival window 30 s.

**A4 Driver, minimiser, result, tasks** (opus high). Owns `search/race.js`, `search/search.js`,
`search/minimise.js`, `search/result.js`, `tasks/optimize.js` (+ `optimizeMore`), tests, and
`docs/Reference/simulation.md` §Search/§Result, replacing rebuild-plan §5 row 2 with a pointer.
Depends A2, A3, J1.
Findings: #52 3 talent points per run, not flagged; #53 condition moves inert vs the dummy not
folded; #57 sigil subsets bypass the screen and eat the budget; #65 changes compared by line index;
#68 wall-clock caps lower fidelity; #70 PVP budget spent on sigils; #71 builds equal in effect
deduped only by full fighter; #72 minor-glyph changes missing from `changes`; #74 no multiplicity
or selection-bias correction; #80 rebuild-plan §5 row 2 stale.
Behaviour: A.7-A.10; `changes` come from `effect.changesOf` (never describe-line diffs); the
sample-identity collapse (A.5 b) uses the sampler: a revert with a bit-identical outcome vector
wins.
Also owns `src/components/optimiser/resultAdapter.js` (new) and minimal edits to
`OptimiserScreen.svelte`/`ResultList.svelte` so the current screen renders `rows`/`changes`
until U8.
Tests (fail first): deliberately poor 29-point allocation converges to the same optimum as
`maxPasses = 30` today (619k → ~699k case) and reports `converged`; Warrior owning 12 sigils
visits every enabled block (`blocks[].status` never `not-reached`); removing an Ancient shows an
`ancient` change, a minor-only swap shows a `glyph:` change; no `finalMs`/`maxMs` in the request
schema; dummy target: no row differs from another only by a condition or a defensive minor glyph
(today ranks 4-10 are such twins); 11 null finalists → top flagged 'better' in ≤ 5 % of 400 runs (now
~15 %); I1-I3 asserted in `result.js` (inject an inert change → throws in test mode).

**J1 Job runner** (sonnet medium). Owns `optimizerClient.js`, `optimizerWorker.js`,
`tasks/index.js`, tests. Finding: #108 worker per request, constructor errors escape.
Behaviour: A.10 protocol (`progress`, `checkpoint`, `done`, `error`; `cancel`, `resumeFrom`);
try/catch → inline fallback; metrics memo note corrected. Tests (fake Worker): progress/done/error,
cancel before start, constructor throws → inline path resolves, checkpoint relayed, abort after
done is a no-op.

**J2 Worker pool** (sonnet medium, optional, after H3). Owns `src/lib/jobs/pool.js`; sampler
requests fight ranges. Test: pool sizes 1/2/4 give identical results.

---

## B. Engine, model and data fixes

### B.0 Modelling policy for unresolved findings (never stated as game fact)

| # | Question | Policy (default; open decision Q1-Q5 where marked) | Label in UI/docs |
|---|---|---|---|
| #28 #35 (+#0 confirmed) | Shield mitigation per PVE mode | Use the value the client's caller for that mode sets: campaign 0.5 (`PROGRESS_CONSTANTS`, L1076145/L1085224), dungeon 0.5 (L1670985-1671018, L1062719), World Boss **0** (affinity table L1153433-1153447). Raid/Oblivion: E1 reads the raid constants (L1064866) and the Oblivion config; where none exists, the dungeon family value, marked assumption (Q1) | `server-model` target + assumption chip |
| #13 | 500 ms inter-mob gap + `elapseMinionRespawn(500)` | Port `simulateDungeonStep` (L1671071-1671135) for dungeon/raid/Oblivion; campaign has no gap (live loop) | [CODE] in the client shared engine; server use [UNRESOLVED] |
| #36 (+#23 confirmed) | Oblivion output cut (`playerDamageMult`) | Q2: default **off** (the client fight never reads it, pve-content.md §11); a labelled toggle applies it to *all* player damage events | assumption chip on every Oblivion result |
| #55 #86 #116 | Ancient sigil when the resolved board lacks its node | Q3: **strict**: the build treats the Ancient as inactive (stored choice kept, warning shown); the optimiser couples board and Ancient | [SERVER] note in sigils.md §9 |
| #96 | Oblivion floor fight cap | Client engine cap `FIGHT_CAP_MS` (20 min, L1087922); timeouts reported apart from deaths | server cap [UNRESOLVED] |
| #117 | Altar tier above `EVOLVE_TIER_CAP` (3) | Keep 1-8 as entered/imported (no clamp); warn above 3 | "not reachable by Evolve in 2.7.0" |

Check while fixing (never verified): the client dungeon step and the Necromancer summon (E1);
dungeon tests beyond `dungeon_1` (D1); `processArenaSpells` JSDoc source of
`casterHpPercentBonus` (X1); a PVP hit-path test with opponent-sheet-shaped stats (E3).

### E1 PVE fight modes and minion sequencing (opus high)

Owns `engine/pve/fight.js`, `engine/pve/tick.js`, `engine/core/minions.js`,
`engine/core/shield.js` (comment), `engine/validate.js` (new), their tests; docs combat-pve.md
§1, §2, §10, §12, §13, §14 and pve-content.md §11.
Findings: #0 #28 #35 WB/raid shield mitigation 0.5; #20 #33 #64 dungeon/raid 100 ms tick (client
10 ms); #12 #27 #34 crusade-only minion reset between mobs; #19 `resummonIfDead` inverted and early
summon; #13 missing 500 ms gap; #21 one 20-min cap for a whole sequence; #22 chapter Chrono Flux
transform timing; #23 #36 Oblivion output cut by default on Attack only; #29 untested fight
branches; #30 NaN fighter / empty mob array; #37 `defender_dead` on a no-swing tick;
#9 `openingSwingTimerStart` parameter misdocumented; #10 minion ceiling tests.

Behaviour:
1. `PVE_MODES` table in fight.js keyed by `mode` (`campaign|dungeon|raid|worldBoss|oblivion|custom|dummy`;
   read from `o.mode ?? mobs[0].mode`, stamped by D1): `dtMs` (10 for dungeon/raid, L1062719,
   L1064866; 100 campaign/WB), `shieldMitigation` (B.0), `interMobGapMs` (500 dungeon/raid/Oblivion),
   `perFightCapMs` (`FIGHT_CAP_MS` per mob, counted from that mob's start; campaign: the same
   value as a safety stop reported as `timedOut`, since the live loop has none, §14), `liveLoop`
   (campaign), `assumptions[]` for the UI. Explicit `o.maxMs` keeps today's shared window (dps,
   survival, WB, custom). Objectives and Drop Check stop choosing `dtMs` themselves.
2. Minions (L1094190-1095536): `resummonIfDead` summons iff `!alive && !(respawnMs > 0)`; `fresh()`
   no longer summons, so the first opening resummons with the `summonCastMs` window; between mobs:
   campaign leaves the minion untouched (hp, timer, empower, frenzy); dungeon family calls
   `elapseMinionRespawn(minion, 500)` and starts mob *k* at `prevEnd + 500` (first at 500)
   (L1671080-1671084); `carryMinionIntoNewFight` stays for a future crusade port (L1863431).
3. Chapter (`liveLoop`): the Chrono Flux transform fires at the top of the next tick before
   `spellsStep` and its heal joins the clamped spell heal (L1074747-1074773, L1074900-1074909), so
   a lethal tick no longer revives; shared-engine modes unchanged.
4. Output cut (Q2): off by default; when on, applied once in `simulateFight` to swings, spells, DoT
   ticks, minion, thorns and rebound, not via Attack.
5. `processCombatTick`: `defender_dead` only inside the player-swing branch (combat-pve.md §5).
6. `preparePveFighter` returns `inputs` (complete plain closure) and `fresh()` reads only `inputs`
   (A2's `engineKey` depends on this).
7. `engine/validate.js` `assertFiniteEntity(kind, obj, keys)`; `simulatePve` throws
   `EngineInputError` for an empty mob list, non-positive/non-finite player HP/Attack/Attack Speed
   or mob HP, and any non-finite entity-read stat.
8. Rename `openingSwingTimerStart(swingIntervalMs, windowMs, fallback)`, cite L1094757/L1087885.

Tests (fail first): `worldBossMob('ENRAGED')` fight runs with `player.shieldMitigation === 0`;
dungeon step swing timestamps on a 10 ms grid; a dead, `respawnMs 0` minion is summoned after the
1 500 ms window (today: never); 2-mob campaign Necro keeps minion hp/frenzy/timer; dungeon step
mob starts at 500 and `prevEnd + 500`, respawn aged 500; 3 mobs × ~8 min in a dungeon → `won`
(today `false` at 1 200 000); chapter lethal-tick transform → `attackerWon false`, no
`spell_cast`; output-cut default pinned and, when on, thorns reduced too; no-swing tick with
`defenderHp 0` emits no `defender_dead`; `stats: {}` throws `EngineInputError` (today NaN);
empty enemy throws `EngineInputError` (today TypeError); minion ceilings exact (222, 80, 80,
soft-cap gain exact); `openingSwingTimerStart(500, w>0, 0) = -100`, `w = 0 → fallback`; Oblivion
`healingMult 0.5` + HEAL + shield exact with and without `blocksShieldOverflow`.
Check: does the client dungeon step ever summon the minion (L1670985-1671135)? Record in §12/§14.

### E2 Druid variants and spell typing (opus medium)

Owns `docs/Reference/Game/data/sigils.json`, `src/data/game/sigils.json` (via `npm run sync:data`),
`engine/core/stacks.js`, `engine/core/spellConfig.js`, `engine/sources/sigilScale.js`, tests in
`spellConfig.test.js`, `spells.test.js`, `glyphMods.test.js`, `sigilScale.test.js`; doc sigils.md §12.
Findings: #4 #25 PRIMAL_AWAKENING form spells ignored (Wolf casts the Bear buff, formless casts);
#7 no test of Druid variant spell types; #8 no test of BUFF-granted SPELL_VAMP/SPELL_CRIT;
#14 glyph coverage test checks only the accumulator.
Behaviour: re-extract PRIMAL_AWAKENING and PRIMAL_INSTINCT as `druidVariant: {name, spell,
formSpell: {BEAR, WOLF}}` (L1069698-1069715); PRIMAL_AWAKENING form spells get `durationMs 8000`,
`cooldownMs 12000` (confirm registers r12/r22 in module 3950); store the client's explicit
`spellType` on every druidVariant spell and formSpell; `spellTypeOf` returns the stored type
first; `stacks.js` reads only `druidVariant.formSpell`; `sigilView.js` and `model/sigils.js` start
working from the data with no edit.
Tests (fail first): Druid + PRIMAL_AWAKENING: WOLF casts ATTACK_PERCENT + ATTACK_SPEED, BEAR casts
HP_PERCENT, `formKind null` casts nothing; catalogue invariant (no top-level `formSpell`; every
castable formSpell has duration and cooldown); 15 variant/form pairs' `spellType` and opening
cooldown (0 BUFF, 1000 DAMAGE/DEBUFF); active BUFF `{SPELL_VAMP: 8}` vamp heal exact and capped at
80; `{SPELL_CRIT}` raises chance to 95 and draws rng only above 0; every MAJOR_GLYPHS entry ×
applicable spec (× form for Druid) changes the combat config in at least one form (explicit
exception list).

### E3 PVP input boundary (sonnet medium)

Owns `features/duel.js`, `engine/pvp/resolver.js`, `engine/pvp/replayCheck.js`,
`engine/core/disruption.js` (new), `engine/pipeline/totals.js` (helper import + comment), tests in
`duel.test.js`, `resolver.test.js`, `replayCheck.test.js`, `__fixtures__/real/real.test.js`; doc
data-model.md (opponent sheets). Imports E1's `engine/validate.js`.
Findings: #42 #44 blank/hidden sheet rows reach the resolver as undefined (no Block/Miss, NaN HP);
#95 `missingStats` only HP and Attack; #45 typed/cloned Necro/Bear/Wolf use Silence; #38
replayCheck 'pass' when the check was skipped; #39 minion opening clock untested; #24 stale
`round()` comment in totals.js.
Behaviour: `completeDuelStats(stats, cls, form)` fills every `total*` key `createPlayerEntity`
reads with its neutral base (0 for chances, ratings, regen, DR; `BASE_CRIT_DAMAGE` 1.5, stats.md §2)
and returns `defaulted[]`; applied in `opponentFighter` and again in `fighterDuelArgs`.
`missingStats` = HP > 0, Attack > 0, Attack Speed > 0. `disruptionEffectFor(class, form)`
(stats.md §3.2, L1216943-1216988: SILENCE; Mystic BEAR STAGGER, WOLF FEAR; Necromancer FEAR) used
by `totals.js` and by `fighterDuelArgs` when absent, covering sheet presets, opponents and clones.
`simulateArenaPvP` asserts finite entity fields (throws `EngineInputError`). replayCheck reports
`skipped` (or `partial`) when the substantive comparison did not run and accepts one side's sheet.
Tests (fail first): opponent with only HP/Attack/Attack Speed → finite result and `defaulted`
lists the rest; Warrior Tank Block 30 with blank Miss → avoid share ≈ 0.28 (today 0);
blank Crit Damage + Crit Chance → no NaN; typed Necro/Bear/Wolf → `attacker_feared` /
`staggered` events (today silenced); injected NaN → throws; real arena log with the attacker's
`computedStats`: 562 ms swing schedule and 57 376 / 22 950 regen pulses compared, `skipped` when
not; minion duel opening on one side and both: summon rows at t = 0, first swings at
`window + max(interval, 400)`, timeout at `60 000 + window`; a PVP hit-path test driven by an
opponent-sheet-shaped fighter.

### E4 RNG lanes for common random numbers (opus medium, late)

Owns `engine/rng.js`, `engine/metrics.js` (`fightRng`), the rng call sites in `pve/tick.js`,
`pve/fight.js`, `core/rolls.js`, `core/spells.js`, `core/minions.js`, `core/debuffs.js`,
`pvp/attack.js`, `pvp/resolver.js`, `pvp/arenaSpells.js`, `pvp/hpBuff.js`; re-pinned seeded tests.
Finding: #75 CRN claim overstated (shared stream desyncs).
Behaviour: `fightRng(seed, i)` returns lanes (player swing, enemy swing, minion, per-spell, debuff;
per side in PVP); a plain function still works (all lanes = it). Distribution unchanged.
Tests: marginal invariance (4 specs × 3 targets, N = 4 000, lane vs single stream within a
two-sample test at p > 0.01); paired sd for a +5 % attack-speed change measured and recorded; if
the reduction is under 20 %, ship only accurate comments plus the measurement test; determinism.

### D1 Dungeon rosters, hard dungeons, mode stamping (opus medium)

Owns `docs/Reference/Game/data/pve-content.json`, `src/data/game/pve-content.json` (sync),
`engine/pve/enemies.js`, `game/pveContent.js`, tests; docs pve-content.md §4/§12, combat-pve.md §3.2.
Findings: #31 dungeon mobs lose Block/Penetration (dungeons 3-7 too easy); #32 hard dungeons not
built.
Behaviour: re-extract classic rosters with `id`, `spriteKey`, `blockChance`, `penetration`,
`damageReduction` (L1062731-1062800) and pass DR through `dungeonSteps` like `makeMob`; port
`hardVariant` and `hardCoinRewards` (L1062199-1062371: HARD_CFG ladder, 1.05, 1.25, SHARE);
`dungeonSteps('dungeon_N_hard')`; stamp `mode` on mobs from `chapterMobs` (campaign),
`dungeonMobs` (dungeon), `raidMobs` (raid), `oblivionFloorMob` (oblivion), `worldBossMob`
(worldBoss). `npm run sync:data`.
Tests (fail first): `dungeonMobs('dungeon_7', 8)` carries block 20, pen 48/52; every dungeon 1-7 ×
step 1-8 matches the client table; `dungeon_1_hard` step 1 = Giant Rat 108 000 000 HP / 2 570 400
atk / 1.625 / block 20 / pen 50; `dungeon_7_hard` step 8 = Kairon 91 931 840 000 HP /
653 769 600 atk / 1.063 / block 26 / pen 66 / DR 30 (re-check the cap source "two mobs before the
boss, boss only" and the +4 boss penetration while porting); mobs carry `mode`; `parity.test.js`.

### M1 Progression and loadout gates; conditions character-wide (sonnet medium)

Owns `model/legality.js` (new), `model/talents.js`, `model/relics.js`, `model/presets.js`,
`model/sigils.js`, `model/awakening.js`, `model/character.js` (`normaliseLevel`),
`store/characters.js` (level), `store/relics.js`, `store/sigils.js`, `store/presets.js`,
`build/fighter.js` (`conditionsFor`, Ancient gate), `build/fixtures.js`, a deprecated alias
`setPresetSigilCondition(presetId, sp, c)` that writes the character-wide value (old
`SigilEquipPanel.svelte` and `optimiser/apply.js` keep working; removed in U12; opponent conditions
stay per opponent), tests; docs data-model.md §1/§2/§3/§7. Keeps
`setCharacterLevel(level)` working and adds `previewLevelChange(level)` for U5.
Findings: #87 #115 level gates not enforced (talent points, awakening) and level changes do not
reconcile; #85 #112 relic slot count not modelled; #114 unowned relics stay equipped; #82 Form
sigils levelled to 30; #84 conditions stored per preset; #122 empty level → 1 wipes sigils;
#86 #116 Ancient decoupled from its node (Q3); #117 altar tier above 3 (policy).
Behaviour:
- `model/legality.js`: `talentPointsForLevel`, `relicSlotCap`, `sigilSlotCap`, unlock predicates
  (UNLOCK_LEVELS L668649: talents 15, relics 22, sigils 25/17, dual equip 28, dual talents 38,
  mounts 40, awakening 45, conditions 54, transcendence 55, boards 58), `isFormSigil`,
  `ancientActive(character, species, board)`, `checkPreset(character, preset) → violations[]`.
- Talents: over-cap allocations trimmed deterministically (highest tier first) in normalise.
- Relics: character-wide `extraRelicSlots` (top level of the character, since `relics` is an id-to-level map; = the game's `extraSlotsPurchased`; 0-2; default 2 so old saves keep 4);
  `preset.relicIds` clamped to the cap; relics at level 0 or unowned leave presets
  (`setRelicLevel` reconciles).
- Awakening points ≤ `max(0, min(level, 59) − 44)` (awakening.md L13).
- Level: `''`, `null`, booleans, arrays → `MAX_PLAYER_LEVEL` (like `undefined`); lowering the level
  returns a preview of what reconcile will drop (talent points, sigil slots, awakening points) for
  the UI to confirm (ia.md §4.1 cross-scope preview), then reconciles.
- Form sigils: `clampSigilLevel` returns 1 for spellType FORM (L1328698, L1066539); fixture
  DIRE_URSINE at level 1.
- Conditions: `sigils.owned[sp].condition`. Normalise lifts any `preset.sigilConditions`: the active
  preset's value wins, else the first non-default; conflicts go to a normalisation report
  (`ctx.report`) that the import dialog and Activity show; `preset.sigilConditions` is removed.
  `fighter.conditionsFor` reads the character-wide value; store gets `setSigilCondition(sp, c)`.
- Ancient (F3 strict): stored choice kept; `buildFighter` drops it when the resolved board lacks
  `transcendenceNode`, with a warning in `computePresetStats().warnings`.
- Altar tier: unchanged range; `checkPreset` warns above 3.
Tests (fail first): talent cap at levels 14/30/43 (30 → 16); 20-point allocation at level 30
trimmed to 16 with tiers valid; `extraSlotsPurchased 0` → 2 relics kept; relic set to level 0
leaves every preset; DIRE_URSINE level 12 normalises to 1 (Attack 186 261 → 132 788); two presets
with different REJUVENATION conditions → one character-wide value + report entry; `''` level →
100 and sigils kept; level 50 with 15 awakening points → 6; Flameborn on a board without its node
→ `fighter.ancient === null` and a warning; set 2 at level 20 → `checkPreset` violation.

### M2 Item legality (sonnet medium)

Owns `model/glyphs.js`, `model/stones.js`, `model/equipment.js`, `model/pets.js`,
`engine/sources/stones.js`, `store/pets.js`, tests; doc data-model.md §3.
Findings: #109 pet secondaries clamped to a v1 envelope; #118 glyph secondary class/quality
unchecked; #119 stone legality minimal, `activated` not stored; #120 gear caps not game-derived;
#123 #99 conduit type not checked against rarity and realm.
Behaviour: pets: validate type, finite ≥ 0, slot cap, class gate; round to 3 dp; the envelope is a
UI hint only (manual-entry setter may still clamp). Glyphs: quality clamped to
`GLYPH_QUALITY_BANDS[rarity]` (Mythic 1); class pool only warns (per-class lists partly
[UNRESOLVED]). Stones: stats checked against the type pool and guaranteed list (guaranteed first,
deterministic order), values clamped to [min, max] with decimals, count ≤ `statCount`; OBLIVION
type only in the Oblivion pool and vice versa; persist `activated`; `sources/stones.js` skips
falsy `activated` (L1205747, L1209896-1209914). Gear: item level capped by `skills.ascension`
(gear.json `maxItemLevelByAscension`) for drops, warning for owned items; secondaries clamped to
`secondaryStatMaxValue` with a report entry; `conduitTypesFor(rarity, realm)` (Oblivion realm and
rarity ≥ `DARK_CONDUIT_MIN_RARITY` → DARK; ETERNAL → FLAME/EARTHEN; OBLIVION rarity → DARK; else
none; unknown rarity permissive); invalid conduits dropped with a report entry. Check the
Oblivion-realm minimum rarity (Mythic) against gear.md before enforcing.
Tests (fail first): imported HEALTH_PERCENT 24.3 stays 24.3 (today 22.6); Common glyph quality 1.0
clamped to its band; PvP stat on a Crimson stone dropped; guaranteed stat listed last kept;
OBLIVION stone in the base pool rejected; unactivated stone adds 0; base ETERNAL+DARK and
Oblivion DIVINE+FLAME conduits dropped; Oblivion ETERNAL+FLAME kept.

### M3 Import and persistence integrity (sonnet medium)

Owns `model/gameProfile.js`, `storage.js`, `model/runs.js` (budget only), `store/characters.js`
(import path), tests; doc data-model.md §5/§7.
Findings: #121 unrecognised JSON replaces the roster with an empty one; #111 `computedStats`
attached to a dirty active preset; #113 Druid profile without presets imports Mage arrays;
#110 imported presets fall back to 'default' board; #124 quota failures swallowed, no roster-wide
budget.
Behaviour: `importJson` throws `ImportError` (with JSON line for syntax errors) when the input is
neither a profile nor a roster with ≥ 1 character; `loadRoster` keeps its empty fallback. Dirty
profile (live set/talent/pet/mount/relics-as-set/sigils differ from the active preset) → append a
"Live loadout" preset from `implicitPreset` holding the sheet (sheet dropped with a report entry
at `MAX_PRESETS`). Druid: `implicitPreset` uses `druidEquippedSpecies` /
`druidUtilitySlotSpecies` when the active talent set's spec is MYSTIC_DRUID (check
`mapPresetSigils` for client presets). Import `activeTranscendencePresetId` into
`transcendence.activePresetId` (B1's fallback then uses it), `relicState.extraSlotsPurchased`,
per-sigil `activationCondition`, stone `activated`, and the Oblivion sheet's owner preset (S1).
`saveRoster` returns `{ok, error}` (store exposes `saveState`); before saving, a roster-wide size
check trims run detail across characters in one pass by per-run size estimates.
Tests (fail first): `importJson('{}')` throws and the roster is unchanged; `activeEquipmentSet 2`
vs a preset on set 1 → Live preset with the sheet; Druid no-preset profile keeps DIRE_URSINE and
Druid sigils; active board 'x' + unlinked preset → stats include x; `setItem` throwing →
`saveRoster().ok === false`; `extraSlotsPurchased 0` → relic cap 2.

### B1 Build layer (sonnet medium)

Owns `build/presetInputs.js`, `build/describe.js`, `build/fighter.js` (glyph part),
`model/mounts.js` (`activeMajorGlyphs`), tests; docs transcendence.md §9, data-model.md.
Findings: #83 unlinked preset uses 'default' instead of the active board; #89 transcendence.md §9
misstates the link fallback; #81 describe lists inert majors/utility; #91 variable describe lines;
#92 describe omits minor glyphs.
Behaviour: `transcendencePreset` fallback = linked id → `transcendence.activePresetId` →
'default' → first (game: a null link leaves the board unchanged, L911090; module 6535
L2137034-2137121). `activeMajorGlyphs(character, mount, spec, equipped)` shared by fighter and
describe. `describeBuild` emits a fixed label set in fixed order (Gear set, Talents, Pet, Mount,
Minor glyphs, Major glyphs, Mythic glyph, Relics, Sigils, Utility sigil, Ancient sigil,
Conditions, Transcendence), `None` when empty, and marks non-effective items
`inactive: '<reason>'`.
Tests (fail first): unlinked preset with active 'pvp' board → 167 643 / 553 403 (today 169 344 /
557 269); label list identical for any two builds; dropping the Ancient changes only the
Ancient line; minor-only socket change changes the Minor glyphs line; a major glyph whose sigil is
not equipped is marked inactive.

### S1 Sheet integrity (opus medium)

Owns `build/stats.js`, `build/residual.js`, `engine/pipeline/anchoredDelta.js`,
`engine/pipeline/sheet.js`, `model/character.js` (`normaliseSheet`/`makeSheet`), `model/oblivion.js`,
`store/sheets.js`, tests; doc data-model.md §6.
Findings: #90 stale preset sheet stays authoritative; #88 one Oblivion sheet overlaid on every
preset; #16 anchored swap off by up to ~19 Attack/HP; #17 capped stats re-derived from 1-dp totals.
Behaviour: sheets store `inputsKey` (metricKey of the preset's build inputs, realm, level) and the
Oblivion sheet its `presetId`. `computePresetStats` returns `sheetStatus`
(`fresh|stale|unverified|none`): stale → computed stats, empty residual, warning; legacy sheets
(no key) are `unverified` (overlay kept, banner with "Confirm sheet matches this build").
Non-owner presets in the Oblivion realm use computed stats plus a warning. Anchored delta: when
the computed percent rounds to the sheet's, use the computed unrounded percent and flat split and
anchor only the residual; else return `approx: true` with an error band; capped stats keep the
computed raw when the sheet has none and totals agree, else `approx ±0.1`.
Tests (fail first): drop the pet after entering a sheet → effective Attack 95 585 (today 169 344)
and residual `{}`; Oblivion sheet from p1 not applied to p2 (today 237 002); anchored swap with a
74.383 % stone-like percent equals a full recompute; capped stat without raw equals recompute.

### F1 Drop Check (sonnet medium)

Owns `features/swap.js`, `features/dropBatch.js`, `tasks/dropCheck.js`, tests, and minimal edits to
`components/drop/VerdictCard.svelte`/`DropCheckScreen.svelte` (inconclusive state, opponent source)
until U9. Depends A1, E3, S1.
Findings: #93 own `opponentFighter` drops the Druid form; #94 PVP N = 64 underpowered, unresolved
→ "Sidegrade"; #97 batch ranks by best single preset; #98 Oblivion Drop Check anchors every preset
to one sheet; #100 verdict is dummy DPS only, unlabelled; #102 no multiplicity control.
Behaviour: delete `swap.js opponentFighter`, use `duel.js` and skip opponents with `missingStats`;
every metric uses the sequential comparator; verdict = Holm across the set's metrics; `sidegrade`
only when equivalence within δ is shown, `inconclusive` when unresolved at `maxN`; verdict
carries `coverage` (metrics measured) and `notJudged` (stat keys the item changes that no enabled
metric covers); batch judges per equipment set (all presets wearing it) and ranks by the best
set; Oblivion anchoring only for the sheet's owner preset (S1), others `approx`.
Tests (fail first): Druid opponent Drop Check fighter equals the Duel fighter (0.280 vs 0.200
today); near-null item false upgrade ≤ 5 % over 200 seeded runs (today ~12 %); unresolved →
`inconclusive`; HP% item with PVP/survival off → `coverage ['dps']`, `notJudged` has HP%; batch
A +6 % / B −9 % on one set → `mixed`; non-owner Oblivion preset not anchored.

### F2 Oblivion floor scan (sonnet low)

Owns `tasks/oblivionFloors.js`, `features/oblivionDungeon.js` tests, new `oblivionFloors.test.js`.
Findings: #96 5-minute cap and stop rule (policy B.0); #107 no tests for the scan task and helpers
(worker-branch tests land in J1).
Behaviour: `maxMs` defaults to `FIGHT_CAP_MS`; rows split wins/deaths/timeouts; `stopAfter` counts
floors with no wins and no timeouts; each floor resolves "≥ threshold" with the sequential
comparator; result carries `assumptions` (cap, output-cut policy) and `scanCapped` when the last
data floor passes. Tests (fail first): a sustain build with timeouts at 300 s is not stopped and
wins at the 20-min cap; n = 0 / abort; non-contiguous `maxFloor`; `scanCapped`.

### X1 Docs and citation fixes (haiku)

Owns comments in `engine/core/caps.js` (+ `caps.test.js` names), `engine/core/chronoFlux.js`,
`engine/pvp/events.js`, `engine/pvp/reactions.js`, `engine/pvp/arenaSpells.js` (JSDoc check);
docs gear.md §7, sigils.md §3/§5/§8/§9, combat-pve.md §10.5, stones.md §5/§11, awakening.md §3/§4,
clan-fortress.md §2.4, combat-pvp.md §4/§9. Runs after E1, E3, M1 so the text matches behaviour.
Findings: #1 caps.js citations (L1080224-1080265, L1080297-1080308, L1080334-1080366,
L1080367-1080400); #2 gear.md §7 Chrono Flux "UNRESOLVED, not modelled"; #5 Ancient transforms
re-fire on refilled flux (L1092524, L1089040-1089110, L1960459); #6 §10.5 debuff sources and
`blindOnTick` (L1092079-1092190, L1091685-1091700, L1091236); #15 stones.md: the activated/socketed
filter is [CODE] (L1209868-1209914); #18 awakening/sigils consumer is [CODE] (stats.md §3.2,
L1216476-1216574); #40 Bulwark clamp only when a stack is active (L1456416-1456465); #41 events.js
result citation L1457545-1457621; #43 Miss also grants Bulwark stacks (L1455048-1455098,
L1080043-1080062); #46 reactions.js header: blind names the blinded swinger. Also writes the
sigils.md §3 form-level-1 [CODE] line and the §9 Ancient [SERVER] note for M1's policy.
Verification: re-read each cited range; no tests beyond renamed test titles.

---

## C. Robustness harness

Generators are in-house and seeded (mulberry32), no new dependency: a failure prints the seed and
the generated JSON so it replays exactly. Default `npm test` runs a few hundred cases per property
(seconds); `HARNESS_DEEP=1` runs thousands. "All specs" = WARRIOR_DPS, WARRIOR_TANK,
SENTINEL_MARKSMANSHIP, SENTINEL_DISRUPTION, MYSTIC_MAGE, MYSTIC_DRUID (BEAR, WOLF, formless), NECROMANCER_DEATHLORD,
NECROMANCER_DOOMWEAVER; "both realms" = base, oblivion.

| Slice | Test file | Asserts |
|---|---|---|
| H1 | `src/lib/harness/specs.js`, `src/lib/harness/arbitrary.js` | (support) spec × realm table; `arbCharacter`, `arbOpponent({blankRate})`, `arbJunk`, `forAll(name, gen, prop, {runs, seed})` |
| H1 | `src/lib/model/normalise.property.test.js` | `normaliseCharacter` never throws on junk; idempotent (`n(n(x))` deep-equals `n(x)`); every M1/M2 gate holds on the output (talent cap, relic cap and ownership, Form level 1, conditions shape, stone pools, conduits, glyph bands) |
| H1 | `src/lib/build/fighter.property.test.js` | **Finite fighters**: for every spec × realm, `buildFighter` stats are finite; chances within [0, ceiling]; `totalAttackSpeed > 0`; `totalHp > 0`; `engineKey` computable |
| H1 | `src/lib/engine/validate.property.test.js` | **NaN guard**: injecting NaN / undefined / ±Infinity into any one entity-read key makes `simulatePve` and `runDuel` throw `EngineInputError` naming that key; no metric ever returns NaN |
| H1 | `src/lib/features/opponentSheets.property.test.js` | **Blank rows**: random subsets of a class sheet left blank → `opponentFighter` stats finite, `defaulted` lists exactly the blanks, `missingStats` exactly the required blanks, duel results finite, avoidance happens iff block + miss > 0 |
| H1 | `src/lib/__fixtures__/real/golden.test.js` | **Golden server fixtures**: `profile-warrior-l72` imports and its computed stats match `computedStats` key by key within the sheet tolerance (residual only on documented server-only keys); `arena-fight-warrior` passes every replayCheck rule with substantive checks (no `skipped` when the attacker sheet is given); `drop-batch` normalises and batch-checks; D1's pinned dungeon and hard mobs |
| H2 | `src/lib/engine/__client__/*.client.js` + `src/lib/engine/clientDiff.test.js` | **Client-transcription differential**: hand transcriptions of the client functions (test-only, `// transcribed from L…`) vs the engine on 10 000 seeded inputs, exact equality: `rawFromSoftCapped`, `applyCombatCeiling`, `softCapGainFromSheet`, `softCapEfficiency`, swing rolls and damage mitigation (combat-pve §5/§7), `absorbWithShield` (§13), `createMinion` and minion intervals (§12), sigil flat scaling and spell value scaling (sigils.md §4/§5), transcendence bonus sum, stone bonuses, `getAvailableTalentPoints`, `getMaxRelicSlots`, awakening points, conduit rule, `hardVariant`, Oblivion instability/strain, `disruptionEffect` |
| H3 | `src/lib/search/legality.property.test.js` | **Legality round-trip**: every arm of every block for random characters of all specs × realms passes `legalityOf`; `applyCandidate → normaliseCharacter → candidateOf` is the identity on canonical candidates; Apply through `store/apply.js` writes the same character |
| H3 | `src/lib/search/effect.property.test.js` | `engineKey` soundness: a random single-field perturbation of a fighter that leaves `engineKey` unchanged gives bit-identical results on 16 seeds (PVE and PVP); every Fighter field the engine reads changes the key when perturbed |
| H3 | `src/lib/search/inert.property.test.js` | **No inert change in any optimiser result**: Quick-effort runs on random characters vs dummy, a chapter, WB NONE and a cloned PVP opponent: every non-baseline row has ≥ 1 change; reverting any change changes `engineKey`; every change has `needed` or `own` significant; every row passes `legalityOf` |
| H3 | `src/lib/search/determinism.test.js` | Same request + seed → identical result; cancel at random progress points + resume → identical result; (with J2) pool sizes 1/2/4 identical |
| H3 | `src/lib/search/nullCalibration.test.js` | 11 finalists equal to the baseline: top row flagged `better` in ≤ 5 % of 400 runs; reported delta unbiased within MC error (fresh-seed confirm) |

---

## D. UI rebuild slices

Rules: build to `design/system` (tokens, components, mockup views) with ia.md as amended by
design-system.md §5 (Grenze/Alegreya Sans/Red Hat Mono, inspector reflows below main at ≤ 1100,
Jobs pill, modal 560/680). L3 model and L6 store stay; pages call the existing mutators plus the
new ones from M1/M3/A2. Until U12, each new route may mount the old screen as an adapter so the
app stays usable between waves. Every `data-testid` and aria-label listed in ia.md §6 survives.
"Keep" = the ia.md §5 rows the slice must carry over.

| Slice | Model | Delivers | Consumes | Keep (ia.md §5) | Tests |
|---|---|---|---|---|---|
| **U0** Tokens + self-hosted fonts | sonnet low | `design/system/tokens.css` into `src/app.css` (`:root` + base); 14 woff2 (Grenze 700; Alegreya Sans 400/500/700; Red Hat Mono 400/500/600; latin + latin-ext) in `src/assets/fonts/` with OFL texts and `font-display: swap` + `size-adjust` fallbacks; legacy class aliases (`.btn-gold` → primary/secondary, `.btn-ghost`, `.btn-danger.is-confirming`, `.rank-controls`, `.subheading`, `.micro-label`) | – | numeric data in `--font-data` tabular | no hex outside `:root` (lint test); build output has no Google Fonts URL; contrast script passes |
| **U1** Shell + hash routing | sonnet medium | `src/lib/router.svelte.js` (`#/character/<page>[/<tab>]`, `#/builds/…`, `#/tools/…`, `#/settings`, `#/welcome`); per-device UI key `eldaryn_ui_v1` (try/catch); `App.svelte` shell: top bar (brand, G1 switcher, G2 preset + realm, Jobs pill slot, save state, notifications, settings, Import), grouped rail, icon rail, phone tab bar + area strip, context header with scope badge, inspector region; `notify()` + session Activity log; one page file per route (`src/components/pages/<Area><Page>Page.svelte`) mounting the old screen as an adapter, so later slices replace only their own page files | M3 `saveState` | §5.1 all rows: 18 nav items in 3 groups, Oblivion always listed with locked state, unknown route → B1 (or G0 when empty), switcher (switch/new/rename/class/delete, delete disabled at 1), privacy line, status live region, `setStatus`→`notify`, `onNavigate`→`go(route)` | rewritten `Sidebar`/`navVisibility` tests; deep link, back/forward, reload returns; info toasts 6 s, errors sticky |
| **U2a** Component primitives | sonnet medium | Panel (frame levels per design-system §2.11, one scope badge), Tabs, SegmentedControl, Select, NumberField (`format.js` parse + live echo), Stepper, Chip, Button variants, Modal (unique title id), Drawer, EmptyState, Tooltip, Menu, Checkbox/Switch, Textarea, Banner, Skeleton, Slider (markup fix kept), StarRating, DropZone, ItemTile, PickCard | U0 | §5.5 (Modal, ConfirmButton, Chip, Slider, StarRating semantics) | one test per component (states from the matrix, keyboard, aria) |
| **U2b** Data and result components | sonnet medium | StatTable, ProvenanceTag (`SHEET`/`MODEL`/`ESTIMATE`/`STALE`), VerdictChip (incl. `Inconclusive`, `Equivalent`), ScopeChip (scope + side effects), CIForest (one labelled axis per table), ResultRank (expandable: change rows with `own`, `needed`, ScopeChip, remainder), RunProgress (data-driven segments: screen/search/minimise/confirm/attribute), `src/lib/ui/statsFormat.js` (Estimate/Contrast formatting, signed CI in every unit, "too close to call at N", `nNeeded`) | U0, A.9 types | – | **#77**: a ms CI of [−3 000, +5 000] prints "−3.00 s to +5.00 s"; forest marks share one scale; Remainder never coloured |
| **U3** Session job store + Jobs tray | sonnet medium | `src/lib/jobs.svelte.js` (start, progress, cancel → checkpoint, resume, dismiss, open result; staleness signature = `characterKey` + preset + inputs; IndexedDB checkpoint opt-in for resume after reload); JobsPill/JobsTray with the status table | J1, U1, U2a/b | §5.1 G4 row (optimiser/duel/drop/batch/Oblivion progress + Cancel) | job survives navigation; cancel → `cancelled` + checkpoint; resume equals uninterrupted (inline runner); stale marker after a preset edit |
| **U4** Import, Welcome, Data & Settings | sonnet medium | G0 Welcome; G3 Import dialog with kind detection (roster / profile / loot bag / fight log / unrecognised, specific errors) and import report (dry-run normalise + M1/M2/M3 report: defaulted, dropped, conditions merged); "Update <name>" via new `model/merge.js mergeProfileIntoCharacter` (keeps presets, opponents, runs; one-step undo); roster replace confirm with backup download; G6 Data (export all / this character), Preferences (density, reduced motion, default effort), Danger zone | M3, U1-U2 | §5.2, §5.3, §5.4 (RESET exact text, v1 key untouched) | junk import shows the error and leaves the roster; merge keeps presets/opponents/runs; RESET rules |
| **U5** Character I: C1-C5 | sonnet medium | C1 Overview (class editable, level stepper with M1 drop preview, Oblivion card, base stats); C2 Skills & Clan; C3 Gear (Set 1 / Set 2 / Oblivion × Equipment / Stones; visible ranges, M2 out-of-range flags, stone `activated`); C4 Talents (points bar against `talentPointsForLevel`); C5 Sigils (altar with tier > 3 warning, Evolve destructive preview, Form sigils level-locked, "Equipped in ▾") | M1, M2, U1-U2 | §5.6, §5.9, §5.10, §5.11 (collection part) | existing screen tests ported; level-lowering preview; Form level locked |
| **U6** Character II: C6-C10 | sonnet medium | C6 Pets (number field + slider hint; tier-change wipe names pets and presets); C7 Mounts & Glyphs (sockets, inventory, inert warning naming presets via `activeMajorGlyphs`, quality bands); C8 Relics (levels, "Relic slots 2/3/4" = `extraRelicSlots`, "Equipped in ▾" with cap); C9 Awakening (cap by level); C10 Transcendence (board, Used by, unlinked presets follow the active board) | M1, M2, B1, U1-U2 | §5.12-§5.16 | ported tests; relic cap honoured; inert glyph warning text |
| **U7** Builds: B1-B3 | sonnet medium | B1 compare table (source tag sheet/computed/stale); B2 Loadout trays (gear set, talent set, pet, mount + sockets read-only, board, relics to cap, sigils by unlock level, conditions with `CHARACTER` ScopeChip "also <presets>", M1 `checkPreset` badges); B3 Stat Sheet (one table, `sheetStatus` banner and "Confirm sheet matches this build", Oblivion sheet owner, per-source contribution, absorb preview + undo) | M1, S1, B1, U1-U2 | §5.7, §5.8 | Presets tests split B1/B2/B3; stale sheet banner after an edit |
| **U8** Optimiser (T2) | sonnet medium | Setup steps (preset; shared Target picker incl. hard dungeons, server-model labels and assumption chips; objective with compat; allowed-to-change groups with relic cap; effort printing δ, n0, maxN and measured cost, no time cap; seed); blockers (`baselineViolations`, opponent missing stats); run as a job with RunProgress and provisional rows; results per A.9 (sticky baseline, forest rows, tie groups "2=", verdicts, change rows with `own`/`needed`/scope, remainder, power hint, Run more → `optimizeMore`); Apply review grouped by `writes` (exclude groups; side effects named) through `store/apply.js`; Run history (schema 2 in `model/runs.js` compaction; legacy runs show "not measured"; Re-run with settings; compare two runs) | A4, U2b, U3 | §5.17 all rows | contract fixtures render; no non-baseline row without changes; Apply review lists every side effect; legacy run renders |
| **U9** Drop Check (T1) | sonnet medium | Single drop + Loot bag; per-set verdict cards (Holm verdict, `inconclusive`, `coverage` label "DPS only: defence not measured", `notJudged` keys); one table per metric, own axis; Run more; Apply → scoped confirm; `ESTIMATE` row under the simulated one; stale batch | F1, U2b, U3 | §5.18 | VerdictCard states incl. inconclusive; estimate never coloured |
| **U10** Duel + Opponents (T3, T4) | sonnet medium | T3 setup (seat Both), win rate with Wilson CI, verdict text with `nNeeded`, Run more, fighters-as-simulated columns with defaulted keys marked, sample duel panel, Verify tab (rule statuses incl. `skipped`); T4 library, editor (B3 sheet table, "Needs: HP, Attack, Attack Speed", defaulted list), clone, loadout | E3, U2b, U3 | §5.19 | blank-row opponent shows defaults; Verify shows `skipped` |
| **U11** Oblivion Floors (T5) | sonnet low | Locked state with inline unlock; summary strip; scan setup (floors, threshold, effort); table with wins/deaths/timeouts and N; "Model estimate: the server resolves the real fight" caption; "sampling range"; "30+ (scan cap)"; assumption chips; staleness signature | F2, U2b, U3 | §5.20 | **#104** results grey out / discard when the signature changes; **#105** caption, labels and cap marker |
| **U12** Retire old UI + docs | sonnet low | delete unrouted screens/components, legacy class aliases, `setPresetSigilCondition` alias and `components/optimiser/apply.js`; CLAUDE.md (L7 row, styling conventions: fonts, tokens, components, router, job store); data-model.md (UI key); a route smoke test that every route renders for an empty, a fresh and the real fixture character | all U | parity sweep against ia.md §5 | route smoke test |

Dependency order inside D: U0 → U1, U2a → U2b → {U3, U5, U6, U7}; U3 → {U4, U8, U9, U10, U11};
everything → U12. Tool pages need their engine slices merged first (U8 ← A4, U9 ← F1, U10 ← E3, U11 ← F2).

---

## E. Order and dependencies

### E.1 DAG (edge = "must merge before")

| Layer | Slices (dependencies in brackets; every dependency sits in an earlier layer) |
|---|---|
| 0 | E1, A1, M1, M2, E2, D1, J1, U0 |
| 1 | E3 (E1) · B1 (M1) · S1 (M1) · F2 (E1, A1) · U2a (U0) |
| 2 | A2 (M1, B1, E1, E3) · A3 (A1, E1, E3, D1, S1) · M3 (M1, M2, B1, S1) · X1 (E1, E3, M1) · F1 (A1, E3, S1) · H1 (E1, E3, M1, M2, B1, D1) · H2 (E1, E2, E3, D1) · U2b (U2a) |
| 3 | A4 (A2, A3, J1) · E4 (E1, E2, E3, A3) · U1 (U0, M3) |
| 4 | H3 (A4, E4) · U3 (J1, U1, U2b) · U5, U6 (M1, M2, B1, U1, U2b) · U7 (S1, B1, M1, U1, U2b) |
| 5 | U4 (M3, U3) · U8 (A4, U3) · U9 (F1, U3) · U10 (E3, U3) · U11 (F2, U3) · J2 (H3; optional) |
| 6 | U12 (every U slice) |

Same-file touches across slices (`store/characters.js` M1→M3, `build/fighter.js` M1→B1, `model/character.js` M1→S1,
`model/runs.js` M3→U8, doc files) are ordered by these edges.

### E.2 Waves (at most 2 agents at once)

| Wave | Lane 1 | Lane 2 |
|---|---|---|
| 1 | E1 PVE modes + minions (opus high) | A1 statistics core (opus medium) |
| 2 | E3 PVP boundary (sonnet medium) | M1 gates + conditions (sonnet medium) |
| 3 | E2 Druid variants (opus medium) | D1 dungeon data (opus medium) |
| 4 | B1 build layer (sonnet medium) | M2 item legality (sonnet medium) |
| 5 | S1 sheet integrity (opus medium) | J1 job runner (sonnet medium) |
| 6 | A2 space + oracles (opus high) | M3 import integrity (sonnet medium) |
| 7 | A3 objectives + sampler (opus medium) | U0 tokens + fonts (sonnet low) |
| 8 | A4 driver + result (opus high) | F2 floor scan (sonnet low), then X1 docs (haiku) |
| 9 | F1 Drop Check (sonnet medium) | U1 shell + routing (sonnet medium) |
| 10 | H1 generators + properties + goldens (sonnet medium) | U2a primitives (sonnet medium) |
| 11 | H2 client differential tests (opus medium) | U2b data components (sonnet medium) |
| 12 | E4 RNG lanes (opus medium) | U3 job store (sonnet medium) |
| 13 | H3 optimiser properties (sonnet medium) | U4 import + settings (sonnet medium) |
| 14 | U5 Character I (sonnet medium) | U6 Character II (sonnet medium) |
| 15 | U7 Builds (sonnet medium) | U8 Optimiser (sonnet medium) |
| 16 | U9 Drop Check (sonnet medium) | U10 Duel + Opponents (sonnet medium) |
| 17 | U11 Oblivion (sonnet low), then U12 retire + docs (sonnet low) | J2 worker pool (sonnet medium, optional) |

Tier totals: opus high 3 (E1, A2, A4), opus medium 7 (A1, E2, D1, S1, A3, H2, E4), sonnet
medium 20 (+ J2 optional), sonnet low 4, haiku 1. Token savers: each agent gets only its slice
section, the A-sections it cites, CLAUDE.md, cited doc sections and decompile ranges; the audit's
scratch repro scripts (`scratchpad/audit/<unit>/*.mjs`) are the starting point for "fails first"
tests; agents run the default `npm test`, never `HARNESS_DEEP`; vitest limited to 2 workers per
agent on the 4-CPU box.

Milestones: after wave 8 the engine, model and optimiser are fixed behind the current UI (old
ResultList reads `rows`/`changes` through a thin adapter in A4, so the fixes ship early); after
wave 13 the harness guards everything; waves 14-17 replace the UI.

---

## F. Open decisions for the user (defaults apply if unanswered)

**Answered 2026-10-14:** Q1 follow client values (default). Q2 instability cut off by default, with a
toggle (default). Q4 Standard precision (default). Q3 and Q5 not asked; their defaults apply (strict
Ancient/board rule; estimates only as labelled estimates). The user approved building the plan.

1. **Q1. Fights the server resolves (World Boss, dungeons, raids, Oblivion).** *Default: follow the
   client's own code wherever it has a value* (World Boss shields absorb 1:1 per its config,
   dungeon/raid 10 ms tick, 500 ms between mobs, a 20-minute cap per fight); where the client has
   no value (raid/Oblivion shield mitigation if absent, Oblivion tick), use the dungeon values.
   Every such target is labelled "server model" with its assumptions listed. Alternative: keep
   today's uniform values. Effect of the default: today's World Boss (Enraged) scores for Mage shield
   builds are 23-36 % too high; short dungeon fights come out 3-6 % faster.
2. **Q2. Oblivion "instability damage cut".** *Default: off* (the client's fight never applies it; the
   app today applies an 87-96 % cut to Attack only), with a labelled toggle that applies it to all
   your damage. Alternative: on by default. Floor clear rates swing a lot between the two; build
   rankings change little once the cut is uniform.
3. **Q3. Ancient sigil on a Transcendence board without its node.** *Default: strict*: the Ancient
   counts as inactive (your choice is kept, with a warning) and the optimiser never suggests a
   board switch that silently keeps it. Alternative: lenient (count it anyway).
4. **Q4. Precision targets and run time.** *Default*: Effort sets only precision; Standard resolves
   differences of 0.5 % (DPS, TTK) or 1 point (win rate, survival), giving up at 32 768 fights per
   comparison and saying "too close to call"; Quick 1 % / 2 pts / 8 192; Thorough 0.25 % /
   0.5 pt / 131 072. A full-space PVE run takes minutes to tens of minutes; PVP against several
   opponents can take over an hour unless the optional worker pool (J2) is built. Alternative:
   tighter or looser defaults.
5. **Q5. Instant estimates before simulation.** *Default: show them only where they help and never as
   results*: Drop Check shows a closed-form "ESTIMATE, no interval" under the simulated verdict;
   the Optimiser shows simulated "Provisional" rows while running, never closed-form ranks.
   Alternative: hide every estimate.

---

## Coverage table (every confirmed and unresolved finding, exactly one slice)

120 findings: 111 confirmed + 9 unresolved (refuted #3 #11 #26 #103 #106 ignored). Generated by
`work/coverage.py`, which fails if a finding is unmapped or mapped twice.

| # | Status | Sev | Unit | Finding title (as audited) | Slice |
|---|---|---|---|---|---|
| 0 | confirmed | major | core-stats | World Boss fights use shield mitigation 0.5, but the client's World Boss config sets shieldMitigation 0 | E1 |
| 1 | confirmed | minor | core-stats | Wrong decompile line citations for four caps.js ports (and their tests) | X1 |
| 2 | confirmed | minor | core-stats | gear.md §7 still says Chrono Flux is UNRESOLVED and not modelled; chronoFlux.js header points to a sigils.md note that no longer exists | X1 |
| 4 | confirmed | major | core-spells | Primal Awakening's BEAR/WOLF form spells are ignored: a Wolf Druid casts the Bear (HP%) buff, and a formless Druid casts a spell the client skips | E2 |
| 5 | confirmed | minor | core-spells | sigils.md says Ancient transforms fire once per fight; the 2.7.0 client re-fires them when Chrono Flux refills | X1 |
| 6 | confirmed | minor | core-spells | combat-pve.md §10.5 attributes SLOW/WOUND/CRIT_DOWN to debuff-type spells and names a non-existent `blinds` field | X1 |
| 7 | confirmed | minor | core-spells | No test checks the Druid variant spell types per form, which the port infers from each spell's shape | E2 |
| 8 | confirmed | minor | core-spells | No test covers BUFF-granted SPELL_VAMP or SPELL_CRIT (activeSpellStatBuff) feeding spell vamp and crit | E2 |
| 9 | confirmed | minor | core-effects | openingSwingTimerStart documents its first argument as the summon-ready time, but the client and every caller pass the swing interval | E1 |
| 10 | confirmed | minor | core-effects | Minion ceiling branches and soft-cap gain value are untested | E1 |
| 12 | confirmed | major | core-effects | simulatePve resets the Necromancer minion between mobs using a crusade-only rule (full heal, swing timer reset, empower/frenzy ended) | E1 |
| 13 | unresolved | minor | core-effects | simulatePve omits the client's 500 ms inter-mob gap and the minion respawn elapse that goes with it | E1 |
| 14 | confirmed | minor | core-effects | The glyph coverage test checks only the accumulator, not that each glyph changes combat for its class/spec/form | E2 |
| 15 | confirmed | minor | stat-pipeline | stones.md marks the stone list passed to calculateEnchantStoneBonuses (and which set feeds the stats) as UNRESOLVED, but the client code settles it | X1 |
| 16 | confirmed | minor | stat-pipeline | Sheet-anchored swap can be off by several to tens of Attack/HP, beyond the app's own ±1 tolerance | S1 |
| 17 | confirmed | minor | stat-pipeline | Capped stats are re-derived from 1-dp effective values when no raw is entered, although the computed raw is available | S1 |
| 18 | confirmed | minor | stat-pipeline | awakening.md and sigils.md tag the stat-pipeline consumer as UNRESOLVED / not traced, but calculateTotalStats reads it | X1 |
| 19 | confirmed | major | pve-fight | resummonIfDead runs the wrong way round, and preparePveFighter summons the minion early to cover it: Necromancer fights skip the 1.5 s summon cast and come back from respawn too early | E1 |
| 20 | confirmed | major | pve-fight | Dungeon and raid targets run at a 100 ms tick; the client's dungeon and raid engine uses 10 ms | E1 |
| 21 | confirmed | minor | pve-fight | A mob sequence shares one 20-min cap; the client caps each fight separately (dungeon step) or not at all (campaign) | E1 |
| 22 | confirmed | minor | pve-fight | Chapter targets use the shared engine's Chrono Flux transform (same tick, heal not clamped); the live campaign loop fires it a tick later and clamps the heal | E1 |
| 23 | confirmed | major | pve-fight | The [UNRESOLVED] Oblivion output cut is applied by default, and only to Attack-derived damage | E1 |
| 24 | confirmed | minor | stat-pipeline | Stale comment in totals.js says stats.md gives round() for raw keys; the doc now says parseFloat(toFixed) | E3 |
| 25 | confirmed | major | stat-pipeline | Druid form variants of PRIMAL_AWAKENING ignored: getSigilDefinitionForSpec/getFormConditionalSpells only read | E2 |
| 27 | confirmed | major | pve-fight | simulatePve fully heals and resets a surviving minion between mobs (carryMinionIntoNewFight); neither the live | E1 |
| 28 | unresolved | major | pve-fight | World Boss fights use shield mitigation 0.5; the affinity record the app already reads says shieldMitigation 0 | E1 |
| 29 | confirmed | minor | pve-fight | Untested branches in simulateFight/simulatePve: Oblivion spell-heal scaling, blocksShieldOverflow, transform h | E1 |
| 30 | confirmed | minor | pve-fight | A fighter with missing stats leaks NaN instead of failing; an empty mob array throws | E1 |
| 31 | confirmed | major | pve-tick | Dungeon mobs lose their Block and Penetration: the roster data dropped them, so dungeons 3-7 are simulated as | D1 |
| 32 | confirmed | major | pve-tick | Hard dungeons (dungeon_N_hard) are not built, although the client's hardVariant is fully determined | D1 |
| 33 | confirmed | minor | pve-tick | Dungeon and raid fights run at the 100 ms progress tick instead of the 10 ms tick those modes use | E1 |
| 34 | confirmed | major | pve-tick | Multi-mob steps fully re-summon the Necromancer minion between mobs; the client loops do not | E1 |
| 35 | unresolved | major | pve-tick | Shield mitigation 0.5 is stamped on every PVE mode, though the World Boss config carries 0 and the raid config | E1 |
| 36 | unresolved | minor | pve-tick | The Oblivion output cut is applied to player Attack by default, though the doc marks it [UNRESOLVED] and the o | E1 |
| 37 | confirmed | minor | pve-tick | processCombatTick ends the tick with defender_dead whenever defenderHp <= 0, even when the player did not swin | E1 |
| 38 | confirmed | minor | pvp-resolver | replayCheck reports 'pass' for swing-times and regen when their substantive check was skipped, and cannot take | E3 |
| 39 | confirmed | minor | pvp-resolver | PVP opening clock with minions (swing timers start at min(0, interval-400), horizon 60000+window) has no test | E3 |
| 40 | confirmed | minor | pvp-resolver | combat-pvp.md §4 describes the Bulwark max-HP clamp as unconditional; the client clamps only when a stack bund | X1 |
| 41 | confirmed | minor | pvp-resolver | events.js cites the wrong client lines for the simulateArenaPvP return value | X1 |
| 42 | confirmed | major | pvp-resolver | Opponent sheet with blank rows reaches the resolver as undefined stats: Block/Miss are switched off, HP goes N | E3 |
| 43 | confirmed | minor | pvp-hits | combat-pvp.md §9 says a Miss-stat defender never gains Bulwark stacks from avoids, but the client grants +1 Bu | X1 |
| 44 | confirmed | major | pvp-hits | Typed opponents never block or miss: a stat their class sheet hides is left undefined, so block + miss is NaN | E3 |
| 45 | confirmed | major | pvp-hits | Typed and cloned Necromancer / Bear / Wolf opponents use Silence instead of Fear or Stagger | E3 |
| 46 | confirmed | minor | pvp-hits | reactions.js header comment says blind events name the evading side; they name the blinded swinger | X1 |
| 47 | confirmed | minor | candidates | Inert-major-glyph fix is incomplete: majorActive ignores the glyph's requiredSpec, so a talent-set move leaves | A2 |
| 48 | confirmed | major | candidates | Talent dimension allows up to 29 points whatever the character level (the game allows min(level,43)-14) | A2 |
| 49 | confirmed | minor | candidates | Relic dimension fills 4 slots by default; the game gives 2 plus purchased extras (2..4), and the app does not | A2 |
| 50 | confirmed | major | candidates | Talent-set move keeps sigils that are inactive for the new spec (e.g. a Mage SHIELD in a Druid's utility slot) | A2 |
| 51 | confirmed | minor | candidates | Conditions dimension never offers ENEMY_HP_BELOW_* even though the same build space drives the PVP optimiser, | A2 |
| 52 | confirmed | minor | candidates | Single-point talent moves x maxPasses=3: a run can move at most 3 talent points, silently (not flagged truncat | A4 |
| 53 | confirmed | minor | candidates | Sigil-condition moves are inert vs the dummy yet are not folded: the results list fills with 'change condition | A4 |
| 54 | confirmed | minor | candidates | Activation conditions are searched per preset, but the game stores one condition per owned sigil (character-wi | A2 |
| 55 | unresolved | minor | candidates | Ancient sigil can be paired with a transcendence preset that does not allocate its sigil node; the game grants | A2 |
| 56 | confirmed | minor | candidates | Transcendence move offers 'default' when the preset's link is null: an inert change (same board) | A2 |
| 57 | confirmed | minor | candidates | Every sigil subset is its own kitKey group, so the screen never prunes sigils and they consume ~70% of the eva | A4 |
| 58 | confirmed | minor | candidates | Glyph pool dedupe by signature blocks socketing two identical glyphs on one mount | A2 |
| 59 | confirmed | minor | candidates | Utility and Ancient moves are not gated by sigil unlock level (reconcileSigils is) | A2 |
| 60 | confirmed | major | candidates | Tests miss the spec-switch, level-cap and spec/duplicate-major cases; the 'every neighbour builds' test covers | A2 |
| 61 | confirmed | major | search | Survival objective ranks proxy-only 'improvements' above the current build, including against bosses that neve | A3 |
| 62 | confirmed | major | search | PVP optimiser searches the PVE condition space, so it never offers ENEMY_HP_BELOW conditions, which are live i | A2 |
| 63 | confirmed | minor | search | PVP tie-break prefers losing faster: at a 0 % win rate it recommends weaker builds (e.g. dropping the pet) | A3 |
| 64 | confirmed | major | search | Dungeon and village-raid targets are simulated on a 100 ms tick; the game runs them on 10 ms | E1 |
| 65 | confirmed | major | search | Result 'changes' are compared by line index: toggling the Utility or Ancient sigil hides the real change and r | A4 |
| 66 | confirmed | major | search | TTK objectives rank by the median/P90 of WON fights only, so a build that loses a third of its fights outranks | A3 |
| 67 | confirmed | major | search | Tier-0 screen credits the enemy's penetration to the player and ignores the player's own Penetration and the e | A3 |
| 68 | confirmed | minor | search | Wall-clock caps silently lower fidelity: finalMs shrinks the finalists' N, and maxMs/maxEvals truncate the bea | A4 |
| 69 | confirmed | minor | search | tCrit95 under-states the t critical value for df 31-59 and 61-119 | A1 |
| 70 | confirmed | major | search | Sigil-subset enumeration bypasses the screen (every subset is its own kit group) and uses up the whole PVP bud | A4 |
| 71 | confirmed | major | search | Builds equal in effect for the objective are deduped only by full-fighter identity: inert glyph swaps and remo | A4 |
| 72 | confirmed | major | search | Result 'changes' omit minor-glyph socket changes, so a row says 'No differences from the current preset' next | A4 |
| 73 | confirmed | major | search | TTK vsBaseline uses a different statistic than the ranking (mean of per-fight scores with a -2.4M ms loss pena | A3 |
| 74 | confirmed | minor | search | No multiplicity control or selection-bias correction: the best of 11 finalists is flagged 'significant' about | A4 |
| 75 | confirmed | minor | search | Common-random-numbers claim is overstated: CRN barely reduces variance for PVE, and for TTK the paired error i | E4 |
| 76 | confirmed | minor | search | Optimiser eval-cache key omits N, while the docs say a cache can be shared across runs | A3 |
| 77 | confirmed | minor | search | fmtDeltaCi drops the sign of a millisecond CI | U2b |
| 78 | confirmed | minor | search | Survival window ignores the target's own fight length (a custom target's seconds) | A3 |
| 79 | confirmed | minor | search | pvpObjective header says timed-out duels go to the defender; the doc says timeout goes to higher absolute HP | A3 |
| 80 | confirmed | minor | search | rebuild-plan §5 row 2 describes a different search than the code (per-build seeds, tier 2 on top 20-50) | A4 |
| 81 | confirmed | minor | build | describeBuild lists inert major glyphs (sigil not equipped) and inert utility sigils as part of a suggested bu | B1 |
| 82 | confirmed | major | build | Form sigils can be levelled to 30, but the game keeps every FORM sigil at level 1; flat Attack/HP inflated | M1 |
| 83 | confirmed | major | build | An unlinked preset is built with the 'default' Transcendence board instead of the board that is active | B1 |
| 84 | confirmed | major | build | Activation conditions are stored per preset, but the game stores one condition per owned sigil | M1 |
| 85 | confirmed | minor | build | Relic slot count (2 + extraSlotsPurchased) is not modelled; up to 4 relics are always accepted and suggested | M1 |
| 86 | unresolved | minor | build | An Ancient sigil can be owned and equipped while the linked Transcendence board does not allocate its sigil no | M1 |
| 87 | confirmed | minor | build | Talent allocations may exceed the points the character's level grants (optimiser proposes phantom points) | M1 |
| 88 | confirmed | minor | build | The one Oblivion sheet is overlaid on every preset in the Oblivion realm | S1 |
| 89 | confirmed | minor | build | transcendence.md §9 misstates resolveTranscendenceLink's fallback | B1 |
| 90 | confirmed | major | build | Stale preset sheet stays authoritative after the build changes; the next optimiser run's residual cancels the | S1 |
| 91 | confirmed | major | build | describeBuild emits a variable set of lines, so the optimiser's index-based change list is misaligned | B1 |
| 92 | confirmed | major | build | describeBuild omits minor glyphs, so a socket-only recommendation shows no changes | B1 |
| 93 | confirmed | major | features | Drop Check builds PVP opponents with its own opponentFighter that drops the Druid form, skips the major-glyph | F1 |
| 94 | confirmed | minor | features | PVP win-rate delta at N=64 is badly underpowered, and an unresolved result is labelled 'Sidegrade' | F1 |
| 95 | confirmed | major | features | missingStats only requires HP and Attack; an opponent sheet missing Crit Damage or HP Regen yields NaN HP and | E3 |
| 96 | unresolved | major | features | Oblivion floor scan uses a 5-minute fight cap (maxMs 300000), not the client engine's 20-minute cap, and stops | F2 |
| 97 | confirmed | minor | features | Batch drop ranking takes the best single preset and ignores that applying the item changes the whole set (sing | F1 |
| 98 | confirmed | minor | features | Oblivion-realm Drop Check anchors every preset to the single oblivion.sheet, so non-active presets are judged | F1 |
| 99 | confirmed | minor | features | Drop items accept any conduit type for a rarity and realm that allow a conduit (e.g. a base-realm Eternal with | M2 |
| 100 | confirmed | minor | features | Drop Check / batch verdict is decided by training-dummy DPS only; HP%, DR, lifesteal, regen, block and penetration items read 'Sidegrade' | F1 |
| 101 | confirmed | minor | features | Zero-discordant-pair paired deltas show a zero-width '95% CI' that excludes the true effect | A1 |
| 102 | confirmed | minor | features | Verdict combines up to 2+K independent 95% tests with 'any up and none down' and no multiplicity control; best-of-presets adds more | F1 |
| 104 | confirmed | minor | features | Oblivion screen keeps old floor-scan results after gear/character changes | U11 |
| 105 | confirmed | minor | features | Oblivion floor win % / 'highest floor at 90%' presented as game fact although floor resolution is [SERVER] | U11 |
| 107 | confirmed | minor | features | No tests for the oblivionFloors task, oblivionDungeon.js helpers, the Worker branch of the client, optimizerWorker.js, or the null/zero-sample paths | F2 |
| 108 | confirmed | minor | features | Worker is spawned per request: construction errors escape, and the metrics memo cache never survives a run in the browser | J1 |
| 109 | confirmed | major | model | Pet secondaries are clamped and re-quantised to a v1 'observed' envelope, so imported real rolls are silently altered | M2 |
| 110 | confirmed | minor | model | Imported build presets are left unlinked from the active Transcendence preset, so the build falls back to 'default' and drops the live bonuses | M3 |
| 111 | confirmed | major | model | computedStats is always attached to the active preset even when the live loadout differs from it (dirty state) | M3 |
| 112 | confirmed | minor | model | Relic slot count is not modelled: every preset may equip 4 relics regardless of purchased slots | M1 |
| 113 | confirmed | major | model | Mystic Druid profile without build presets imports the Mage sigil arrays instead of the live Druid ones | M3 |
| 114 | confirmed | minor | model | Equipped relics need not be owned: reconcile only checks the class, so unowned relics stay equipped and are inert | M1 |
| 115 | confirmed | minor | model | Progression level gates (Awakening points, talent points, Transcendence, Dual Talents/Equip, Oblivion) are not enforced, and level changes do not re-reconcile | M1 |
| 116 | unresolved | minor | model | Ancient sigil ownership is decoupled from the Transcendence sigil node that grants it | M1 |
| 117 | unresolved | minor | model | Sigil Altar tier accepts 4..8 although the game can only evolve to tier 3 | M1 |
| 118 | confirmed | minor | model | Minor-glyph secondary accepts class-illegal stats and out-of-band quality | M2 |
| 119 | confirmed | minor | model | Stone legality is minimal: stat pools, guaranteed stats, value ranges and Oblivion realm separation are unchecked, and sealed state is not stored | M2 |
| 120 | confirmed | minor | model | Gear caps are not game-derived: item-level cap ignores Ascension, secondary values have no ceiling, conduit type and Oblivion minimum rarity are unchecked | M2 |
| 121 | confirmed | major | model | Importing any unrecognised JSON replaces the whole roster with an empty one, with no error | M3 |
| 122 | confirmed | minor | model | normaliseLevel maps an empty or null level to 1 (but undefined or NaN to 100), and level 1 then silently wipes every preset's sigil equips on the next load or edit | M1 |
| 123 | confirmed | minor | model | Conduit type is not checked against item rarity and realm | M2 |
| 124 | confirmed | minor | model | Per-character run-history budget (1.5 MB) is not a roster-wide budget, but the whole roster is one localStorage value whose quota failures are swallowed | M3 |

### M1 review hand-offs

- A2/H1 oracle: assert the dual-equip, dual-talent, mount and transcendence unlock gates explicitly; M1 only reports them via `checkPreset`, it never repairs them.
- A2/U12: sigil conditions are character-wide, so applying an optimiser candidate (or the deprecated `setPresetSigilCondition`) writes a value shared by every preset that equips the sigil. Surface this cross-preset write in the UI.
