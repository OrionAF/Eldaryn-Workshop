# Combat model audit — 2026-07-28

Scope: everything DPS / fight / battle / tanking / healing / survivability /
mitigation / duel / gauntlet. Companion to `combat-model.md` (what the code
does); this file is what is **wrong** with it.

Findings are ranked by *blast radius × likelihood of being wrong*, not by how
hard they are to fix.

## Status — 2026-07-28

**Closed:** D1, D2, D3, F1, F2, F3, F5, F7, F8, F11, F12, F13, F14, F17, F18,
F20, F21, F23, F24, F25, F26, F27. F16 and F22 are closed in part, with the
remainder restated below as what is still missing.

**Open:** F4, F6, F15, F19 — plus §C items 1 and 5.

**New, from the calibration run:** F28 and F29 are [INFO] records of what the
data *rules out*. Read them before starting §C1.

**Every open item is now one piece of work.** F4 and F6 *are* §C1 — the
survivability factor's shape — and F15/F19 are the search-redesign notes, both
documented and neither urgent. §C5 (the build-power metric) is unstarted and
sequenced after §C1. Nothing is waiting on a decision any more; the three that
were (F13, F17, F27) were ruled on 2026-07-29.

Each closed finding records what landed and where, so this file can move to
`Reference/Notes/` as the record of the audit once §C1 is dealt with.

---

## A. Deferred fixes (already agreed, not yet applied)

Approved in conversation on 2026-07-28, held back pending this audit.

### D1 — ✅ RESOLVED 2026-07-28 — lifesteal now leeches off landed damage

`pvpFactorMetrics` binds `swingDamage = pvpAttackFactor · blockPenFactor ·
computeDps` — the same quantity Factor 1 reports — and the lifesteal term
multiplies **that**, not raw `computeDps`. `sigilActiveDps` is excluded,
because sigil casts go through `pureDamage` and never reach `onLandedHit`.
`computeHps` is no longer imported here at all; its only caller is now
`tankObjective`.

The overstatement removed was exactly `1/(1 − REF_BLOCK)` at zero Penetration.
A side effect worth knowing: Penetration and PVP Attack now raise the
survivability factor too, because they raise landed damage — which is what the
duels do.

Recorded in `combat-model.md` §8 Factor 3. Three tests pin it, including the
sigil-exclusion case, which is the part most likely to be "tidied" back.

### D2 — ✅ RESOLVED 2026-07-28 — the HPS fields are gone

All four (`current_hps`, `new_hps`, `hps_delta`, `hps_pct_change`) removed from
`compareSwap`, not just the two deltas — the other two existed only to feed
them. A survivability verdict for a swap goes through `dropGoals.js`'s `tank`
scorer, which is the goal-aware path.

`dps.test.js` asserts the properties are **absent**, so they cannot drift back
in on the argument that something might want them.

### D3 — ✅ RESOLVED 2026-07-28 — removed
Owner decision: cut it, and redesign a sustain readout properly later. The tile
is gone from `SimulationScreen.svelte`, with a comment where it stood recording
why (F4: `computeHps` is not a reliable rate, and displaying it as a headline
lent it credibility it has not earned). `selfHps` still feeds `sustainDps` as a
ranking proxy, which is defensible; showing it was not. The goals-redesign
record now stands as originally written — user-facing HPS is genuinely gone.

---

## B. Findings

### F1 — ✅ RESOLVED 2026-07-28 — double hits cannot crit; penetration can

**Owner ruling, and it closes the finding in favour of the existing code.**

- **Double Hit CANNOT crit.** `computeDps`'s additive form is correct, and both
  simulators were already right.
- **Penetration CAN crit.** What pierces a block takes the crit roll, as the
  Penetration Rework already implemented.

The finding originally argued the opposite from the reverse-engineered Combat
Power formula, whose damage index multiplied `(1 + double_hit)` onto the crit
term and fitted 124 profiles to 0.05%. **That reasoning was wrong in kind, not
just in conclusion:** CP is a rating the game rebalances frequently, and its
internal weighting of a stat is not evidence about how that stat resolves in
combat. Fitting it well proved only that we had fitted it well.

That whole path is now abandoned — `combatPower.js` and its tests are deleted,
the notes archived under `docs/archive/` behind a do-not-cite banner. See
`combat-model.md` §4 for the standing rule that replaces it.

**Regression cover added**, so neither ruling can drift: `dps.test.js` (closed
form), `simulation.test.js` (PVE sim), `pvpSimulation.test.js` (duel engine,
both rules, plus the pre-existing pierced-damage-crits test). All exact rather
than sampled — certain crit and certain double hit make every rng path
identical.

**Lesson worth keeping:** a well-fitted model of a moving target is more
dangerous than no model, because its precision is mistaken for authority. This
one nearly overturned a correct combat rule.

---

### F2 — ✅ RESOLVED 2026-07-28 — probes go through the curve exactly once

`computeStatWeights` now probes `computePresetRawTotals` and applies
`applyStatCaps` once, the `dropGoals.js` pattern. The baseline is unchanged by
construction (curving the unperturbed raw record *is* `computePresetTotals`),
so only the probes moved — which is the whole point.

Effect: an over-soft-cap stat now reports its true marginal value, and a
hard-capped stat scores ~0, which the old header wrongly claimed was already
happening. **F24 falls out of this** — the linking report's
`recommended.statPriorities` calls the same function.

Recorded in `combat-model.md` §8 "Stat weights". Three tests, including one
that pins a probe against the hard cap.

One thing deliberately *not* changed while here: the `Attack %` probe is a
relative `v * 1.01`, not a `+1` on `attack_pct`. That is a defensible reading
("+1% Attack", a real gear roll) but it is not what the label says, and after
F3 that exact ambiguity deserves a conscious decision rather than a drive-by
edit. Logged as **F27** below.

---

### F3 — ✅ RESOLVED 2026-07-28 — the code was wrong, the doc was right

**Owner ruling: Attack % and Health % buffs are ADDITIVE into the total.** A
build at 175% Attack % activating a +20% sigil is at **195%**, not 175 × 1.2.

So the documented stacking rule was correct and all three engines were wrong.
Fixed by extracting the conversion into **one** function — `dps.js`'s
`buffedAttack(displayed, basePct, flatAdd, pctAdd)` — which decomposes to the
flat pool, adds there, and recombines with the summed percentage. All three
call sites now use it:

- `sigilEffects.modifySwing`
- `pvpSimulation.resolveHit`
- `optimizer.sigilAwareDpsFromTotals`

**The triplication was the root cause, not a detail.** One convention
implemented three times meant no test could disagree with itself, which is why
this survived. `optimizer.test.js` even *asserted* the wrong model, with a
comment spelling it out ("the buff scales the already-final Attack — it is not
added back into the attack_pct field"). That test now asserts the correct one.

Pinned by three tests in `dps.test.js`, including the owner's own 175%→195%
example and the case that explains the long survival: **with no existing
Attack %, both models agree**, so the bug is invisible on a 0% build and grows
with the build's Attack %.

### F3 (original finding, for the record) — Attack % buffs violate the model's own stacking rule

The documented rule (`dps.js`, `totals.js`): Attack % has base 0, sums
additively across all sources, then the summed % multiplies the summed flat
Attack once.

All three engines break it for *timed* buffs:

| Site | Code |
|---|---|
| `sigilEffects.js:341` | `swing.baseDamage = (baseDamage + attackFlat) · (1 + attackPct/100)` |
| `pvpSimulation.js` `resolveHit` | `flat · (1 + pct/100)` where `flat = statNow('attack')` |
| `optimizer.js` `sigilAwareDpsFromTotals` | `(totals.attack + statAdds.attack) · (1 + statAdds.attack_pct/100)` |

In every case the multiplicand is the **displayed** Attack, which already has
the build's Attack % baked in. A +20% sigil on a build with 34% Attack % gives
`48124 × 1.2 = 57749` instead of `35833 × 1.54 = 55182` — **+4.7%**, and the
error grows with existing Attack %, i.e. it is worst on exactly the end-game
builds the optimizer is aimed at.

The three engines agree with each other, so no test catches it. Whether the
code or the documented rule is right is a **game question** — but they cannot
both be, and right now the doc says one thing and every engine does the other.

---

### F4 — [MED] `computeHps` is not a reliable survivability rate

*Updated 2026-07-28: one of the four biases is gone, and the blast radius
halved.*

1. **Overheal.** Both engines clamp heals at max HP; `computeHps` counts
   healing that would be thrown away. The 8× pool made this worse (more of the
   fight is spent near full). **Still open.**
2. **Undefended lifesteal.** ~~Open~~ — fixed for the PVP goal by D1, which
   stopped calling `computeHps` and derives its own lifesteal term from landed
   damage. `computeHps` itself is unchanged and still has this bias.
3. **Summing differently-conditional terms.** Regen is unconditional and
   pool-proportional; lifesteal is conditional on landing hits and collapses
   exactly when you are blinded, paralyzed or dodged — i.e. when you are
   losing, which is when healing matters. **Still open.**
4. **No timing.** Survival is about damage arriving faster than healing at a
   moment, not totals over a minute. **Still open.**

**`tankObjective` is now its only caller** (`combat-model.md` §3 records this),
so the remaining exposure is one goal rather than two. It still needs *some*
cheap proxy — a duel per candidate is unaffordable in the optimizer's inner
loop — so the question remains what replaces it, not whether to delete the
concept.

---

### F5 — [MED] `REF_BLOCK` is invented, and nothing anchors it

`pvpGoalObjective.REF_BLOCK = 0.10` **[INVENTED]** — "half the 40% soft cap,
halved again because Block is Warrior-only". It sets how much Penetration is
worth in every PVP ranking, and it was never checked against anything.

*Revised 2026-07-28:* this finding originally proposed adopting the CP
formula's measured 0.2593 for the same concept. **Withdrawn** — that number
went with the abandoned CP work (F1), and importing a constant from a retired
derivation of a rebalanced rating is exactly the mistake the retirement was
meant to stop. The 2.6× gap between them is no longer interesting; it was never
a like-for-like comparison.

What remains true is the part that matters: the constant is a guess. The fix is
calibration against our own duels (§C item 2), not archaeology.

### F5 — ✅ RESOLVED 2026-07-28 — calibration run; the guess was right

`docs/tools/calibrate-pvp-refs.mjs` fitted the constants against duel rankings over
a 16-build two-class field. Result for this finding's subject:

**`REF_BLOCK = 0.10` is the maximum of its own grid.** Sweeping it from 0 to
0.7 moves ρ between 0.281 and 0.664, and 0.664 is at the shipped value. The
"half the soft cap, halved again for Warrior-only" rule produced the best value
available. Retagged **[CALIBRATED]**.

Two more results fell out:

- **`REF_MISS` is not identifiable.** ρ span across its entire grid is 0.024.
  Its value does not meaningfully affect any ranking, so it is not worth
  arguing about — a useful thing to know about a constant that had been listed
  as a risk.
- **`REF_PEN` is weakly constrained** (span 0.171) and the fit drifts to a grid
  edge rather than converging. Left at 0.15; flagged as the weakest of the four.

The overall refit gained +0.032 on the field it was fitted to and **exactly
nothing** on the held-out field, which is why nothing shipped. Full numbers and
caveats in `combat-model.md` §9.

---

### F6 — [MED] `REF_FIGHT_SEC` is an invented horizon on a biased rate

`survivability = 8·health + selfHps·30`. With `selfHps ≈ health·regen/100`:

```
S = health · (8 + 0.3·regen) = 8·health · (1 + regen/26.7)
```

30 seconds is **[INVENTED]** — "half the duel horizon", a discount rationale,
never checked. It sets the Health↔HP Regen exchange rate for every PVP ranking,
and it multiplies `selfHps`, which F4 shows is itself biased. A guessed constant
on a biased rate.

*Revised 2026-07-28:* the original finding leaned on the CP formula's
`1 + regen/186.6` to claim we over-value regen ~7×. **Withdrawn** with the CP
work (F1) — same reasoning error as F5.

**Structural note (unchanged, and the real point).** This constant only exists
because the PVP goal *fused* pool and healing into one scalar. `tankObjective`
faces the identical problem and never fuses — two factors, slider sets the
exchange rate, no time constant needed. The fusion was forced by the
three-slider UI, not by the model.

*2026-07-28 — calibration ran, and it sharpened this finding rather than
closing it.* `REF_FIGHT_SEC` is **the most influential of the four constants**
by a wide margin (ρ span 0.736 across its grid, versus 0.383 for the next). A
refit wants to raise it 30 → 90. It was not changed, for two reasons:

1. The gain does not generalise — +0.032 on the fitting field, 0.000 held out.
2. **The structural note is now visible in the data.** Raising the constant
   helps regen-based tanks rank correctly and simultaneously inflates
   lifesteal builds, which are *already* over-ranked. One knob is being asked
   to serve two terms whose errors point in opposite directions. That is what
   "the fusion is the problem" looks like when you measure it.

So F6 stays open, better evidenced, and unambiguously a §C1 shape question
rather than a tuning one. See F28 for what the data rules *out*.

---

### F7 — ✅ RESOLVED 2026-07-28 — the app was right, and the curve is now confirmed

**Owner observation:** the game's stat sheet shows **three** numbers per capped
stat — the big **EFFECTIVE** value (the only one combat uses), **RAW** beneath
it, and **N% GAIN** (how much of the next raw point survives). Evidence:
`Source/screenshots/stat-sheet-block-chance.png`.

So a Manual total is the player copying the *effective* number, and
`clampToHardCaps` — never re-curving — is correct. Same for typed opponents.
Nothing to fix.

**Bonus: this independently verified the soft-cap curve**, at an operating
point nothing was ever fitted to:

| | Game | `softCapValue` |
|---|---|---|
| Block, raw 56.4 → effective | **52.5%** | 52.452% |
| marginal value of next point | **57% GAIN** | 57.15% |

The second row confirms the **derivative**, which is a far stronger test than a
single value — a wrong curve shape can coincidentally hit one point; matching
its slope too is much harder. The curve moves from PATCH-only to PATCH +
**[OBSERVED]**.

Applied: the UI's `SOFT · <raw>` label is now **`RAW <raw>`**, matching the
game's own wording.

**Follow-up: ✅ BUILT 2026-07-28.** `statCaps.marginalGain(raw, softCap,
hardCap)` returns `8K³/(over+2K)³`, and `StatsFields` renders
`RAW <raw> · N% GAIN` on any overcapped stat — the same three figures the game
shows, in the game's own wording. Implemented as the exact derivative of
`softCapValue`, and a test asserts it numerically against that function, so the
readout cannot drift from the curve it describes. Pinned against the original
observation: raw 56.4 → 52.5 effective / 57% GAIN.

The colour warning the game uses is not implemented; the number alone answers
"is another point worth it?".

### F7 (original finding, for the record) — the raw-vs-effective assumption was unverified

`resolveEffectiveTotals` treats Manual totals — and every typed PVP opponent —
as **already post-curve**, so they are only hard-clamped, never curved. If the
game's stat sheet actually displays *raw* sums, then every Manual preset and
every opponent profile in the app is overstated on every soft-capped stat, and
Calculated vs Manual presets are not comparable.

This is a single-observation question that nobody has run: take a character
with raw Block well past 40 and compare the sheet against
`computePresetRawTotals`. Cheap to settle, expensive to be wrong about.

---

### F8 — ✅ RESOLVED 2026-07-28 — the contract exists and is in CI

`src/lib/pvpModelContract.test.js` ranks a fixed field of six contrasting
equal-budget builds by both models — closed-form score, and mean win rate over
a seeded round-robin — and asserts Spearman rank agreement plus a
top-two/bottom-two disjointness invariant. Everything is seeded, so a failure
is reproducible rather than flaky.

**It immediately paid for itself, twice.**

1. The first run scored ρ = 0.257, which looked like a real divergence. It was
   a fixture defect: `offensiveStats()` zeroes *every* field, so builds that
   did not name Speed had Speed 0 and never swung, turning every duel into the
   timeout's remaining-HP tiebreak. **Any future PVP fixture has to carry the
   base Speed 100 / Crit Damage 150 explicitly** — noted in `combat-model.md`
   §9 because it will catch someone else.
2. With that fixed, **ρ = 0.714**. The models agree at the extremes and
   disagree through the middle of the field — which is the honest current
   state, and exactly what F5/F6 predict from four invented constants. That
   number is now recorded, so calibration (§C2) has a before to improve on.

The threshold is set at 0.5, well below the observed value, on purpose:
calibration will legitimately move ρ, and a bar set just under today's number
would fire on the tuning rather than on a defect.

---

### F9 — ✅ RESOLVED — dead HPS outputs in `compareSwap`, see D2

### F10 — ✅ RESOLVED — "user-facing HPS removed", see D3

### F11 — ✅ RESOLVED 2026-07-28 — Penetrator is a legal opponent again

Dropped 85 → **62**, and deliberately not to the 70 hard cap. `scaleArchetype`
clamps, so the real defect was worse than "illegal on paper": every jittered
Penetrator variant clamped to exactly 70, so **the archetype had no variance
at all** on its defining stat. 62 keeps the whole ±12% jitter band legal.

The rule generalises and is now in the module header: a catalogued secondary
must sit far enough below its hard cap for the jitter to survive. Two tests
enforce it — one asserts no secondary in the catalogue is altered by the caps,
the other that the Penetrator's variants are distinct.

The Blocklord's Block sits at exactly 80 (the cap) and therefore jitters
downward only. That is a legal opponent, just a less varied one; left alone
because retuning archetype numbers is a design call, not a bug fix.

### F12 — ✅ RESOLVED 2026-07-28 — no instance of the claim survives

ADR 0001 carries a **SUPERSEDED** header naming the four modules that now read
those stats; `dps.js`'s header is scoped to "PVE closed form only" and says
explicitly that the scope statement is about the file, not the app;
`constants.js` records the correction; `dps.test.js`'s section comment no
longer restates it. The 2026-07-09 PVP optimizer spec is archived under a
placeholder banner and reads as history.

A sweep for the phrasing (`display-only`, `swap-tracking only`, `not yet
computed with`) now returns only correct uses.

### F13 — ✅ RESOLVED 2026-07-29 — intended; now stated

**Owner ruling: the double count is correct and stays.** DR genuinely does both
jobs in the game — it deepens the pool a spike is absorbed by, *and* it
stretches every point of healing, because healing is measured against
already-reduced damage. Block does one job, so its appearing in `sustainDps`
alone is right too.

No behaviour change. What was missing was that anyone reading a Tank
recommendation had no way to know, so `combat-model.md` §8 now records it as
**[RULED]**, including the surprising consequence: **the `ehpWeight` slider
does not move DR's influence at all**, wherever it sits. A recommendation that
looks over-invested in DR is behaving as designed.

This was the finding most at risk of being "fixed" by someone who noticed the
asymmetry and assumed it was an oversight.

---

## B2. Search-layer findings (optimizer / relicSuggester / linkingSimulation)

Second sweep, 2026-07-28, completing the coverage gap flagged in §D. These
modules *consume* the combat model rather than define it, so nothing here
changes a formula — but several of them decide what the user is told to do.

### F14 — ✅ RESOLVED 2026-07-28 — the glyph pass can stop

The pass now scores its own starting point and requires
`bestAddScore > baseScore + EPS` before advancing, matching the stones pass.
A tier can be left part-filled, so a recommendation no longer contains
instructions that do nothing.

Test: on a fixture whose only major glyph is Health % — worth nothing to a DPS
goal — the optimizer leaves the major tier **empty** while still filling the
minor tier with the three strongest of four. That covers both halves: stopping
when it should, and not stopping when it shouldn't.

Note for anyone tightening this later: greedy-with-stopping is *exact* for the
purely additive stones, but only a heuristic for glyphs, since a major glyph
retunes a sigil's mechanic and can interact with the next pick. The header says
so.

### F15 — [HIGH] The eval memo is invalidated across passes, by construction

*Status 2026-07-28: documented, not fixed — and the fix is a redesign of the
search, not a patch. `optimizer.js`'s header no longer claims re-passes are
free, and `estimateSearchCost` multiplies by `maxPasses` so the cost this
causes is at least measurable (F16).*

`candidateKey` covers every searched dimension. Coordinate ascent clones each
pass's candidates from the current `best`. So the moment any pass adopts,
**every other dimension's cached scores become unreachable** — pass 2's relic
subsets carry the new talent allocation and all miss.

The header claims "objective evals are memoized … so re-passes over unchanged
alternatives are free". That is only true of the *final* pass, the one that
adopts nothing. Every improving pass pays full price again. With `maxPasses`
defaulting to 5 (8 for the linking simulation), worst case is 5–8× the eval
count the header implies.

### F16 — ⚠️ PARTLY RESOLVED 2026-07-28 — measurable, not yet surfaced

**Done.** Both enumerations now go through one exported `subsetsUpTo(pool, cap)`
whose accumulator is a plain loop, not `subsets.push(...grown)` — the
argument-spread shape that blows the stack once the array is long enough. A
test runs it at a 40-item pool (102,091 subsets) to prove the shape is gone.

`estimateSearchCost({ character, preset, searchDimensions, maxPasses })` is
exported and tested: it returns pool sizes, subset counts, per-pass candidates
and a `worstCaseEvals` upper bound **without running the search**, and it
accounts for F15 by multiplying by `maxPasses`.

**Still missing:** nothing calls it. The number exists; no screen warns the
user before starting an expensive PVP search, and nothing caps the pool. That
is a UI decision — warn and proceed, warn and require confirmation, or cap —
and it should be made deliberately rather than picked while fixing a stack
shape. The measurement half was the part that could not be done later.

### F17 — [MED] A fresh character is told to spend talent points it doesn't have

```js
const ownedPoints = Math.max(...talentSets.map(ts => totalPointsSpent(ts?.allocation)), 0);
const budget = Math.min(TALENT_TOTAL_POINTS, ownedPoints > 0 ? ownedPoints : TALENT_TOTAL_POINTS);
```

Both sets empty ⇒ budget 29 ⇒ a full end-game build recommended to a level-1
character. Documented in the header, but note the inconsistency: awakening
*points* are treated as level-derived and deliberately never searched, while
talent points are inferred from what happens to be saved. Same kind of
resource, opposite convention.

### F17 — ✅ RESOLVED 2026-07-29 — always the endgame budget

**Owner decision: `budget = TALENT_TOTAL_POINTS`, always.** Talent points are
level-derived exactly like awakening points, so the two now follow one
convention: project both to endgame, search neither. The recommendation is the
build to grow into.

This also removes the odder half of the old behaviour, which nobody would have
chosen deliberately: a player with *one* talent recorded got a one-point
"optimal build", while a player with none got the full 29.

The accepted cost, stated so it is not rediscovered as a bug: a mid-game player
sees a target they cannot field yet. Two tests pin the new convention,
including one asserting the search now spends *more* than the saved sets hold.

### F18 — ✅ RESOLVED 2026-07-28 — the gain goes to the node it was bought for

`childState` credits `buy.gain` to the **last** node of a buy — the one the
path was chosen to reach — and 0 to the corridor before it, with each row
flagged `corridor: true/false` so a renderer can say which is which. The plan
total is unchanged; every row is now defensible.

An exact per-node split would need one objective eval per corridor node, which
is not worth it for a display figure. Attributing to the target is not an
approximation of that — it is the correct description of why the buy happened.

Tested: no corridor row carries a non-zero score, no stats-free node does
either, and at least one row is positive.

### F19 — [MED] Two-stage search: the confirm objective can only veto, never discover

`adoptIfBetter` returns early unless `screenScore > bestScreen`, so a build the
expensive objective would love but the cheap one ranks below the incumbent is
never even confirmed. Intended for `pve-accurate` (screen and confirm are the
same model). Worth stating for `pvp`, where screen and confirm differ only by
noise, and for any future pairing where they genuinely disagree.

Same bias reaches the UI: `noteCandidate` only records confirmed candidates in
two-stage mode, so **`topCandidates` is a screen-ranked shortlist wearing
confirm-score labels**.

*Status 2026-07-28: stated in `optimizer.js`'s header, including the
`topCandidates` consequence, which was the part not written down anywhere.
Changing it means confirming candidates the screen ranked below the incumbent —
a real cost increase on exactly the expensive objectives — so it belongs with
the search redesign, not with the bug fixes.*

### F20 — ✅ RESOLVED 2026-07-28 — `preset.talentSet` is in the memo key

Added, with the reason stated in the doc comment: `materializeCandidate` writes
it, so the memo has to be correct **before** a pass varies it, not after.
A collision here would be silent — one candidate inheriting another's score —
which is the kind of defect that gets found by an audit rather than a test.

### F21 — ✅ RESOLVED 2026-07-28 — the displacement is now visible

Each `perRelic` row carries `gainIncludesSwap`, `displacedId` and
`displacedName`. The panel names the displaced relic under the row and the
column header reads **"{unit} if levelled & slotted"** rather than "gain", with
a note explaining that a strong relic can score low because what it pushes out
is also strong. The header comment states the same thing once, at the top.

Tested from both directions: on a full preset every not-equipped relic reports
the same displaced relic (the cheapest to remove), and on a preset with a free
slot nothing is displaced.

The weakest-relic selection itself was correct all along — it maximises the
post-removal score — despite `weakestScore` starting at `-Infinity`, which
reads backwards. Left as-is, comment retained.

### F22 — ⚠️ PARTLY RESOLVED 2026-07-28 — caveated, not quantified

`suggestRelics` takes and returns `sampled`, set from `specIsSampled(spec)` by
both the worker and the inline path, and the panel prints a caveat when it is
true.

**No CI, and not by omission.** `rateCiHalfWidth` cannot help here: it needs a
rate and a sample size, and an objective returns one scalar with no variance
attached. A real interval means replicate scoring under a second seed, which
would roughly double the run and is a decision to take on its own merits. The
honest state — "these are sampled estimates, small differences may be noise" —
is now stated to the user instead of implied by a bare sorted column.

### F23 — ✅ RESOLVED 2026-07-28 — the verdict runs on verified scores

`runLinkingSimulation` adds two verification stages **per Monte Carlo preset**
after the four searches: each arm's winning candidate is re-simulated at
`LINKING_VERIFY_ITERATIONS` (3000, 6× the search's own) under one shared seed,
and regret is computed from those means. Deterministic goals (tank, pvp-goal)
skip it, so the stage count is computed rather than fixed at 4.

Supporting changes: `simulateCandidate` extracted in `optimizer.js` (and
`verifyDpsOutcome` refactored onto it, so there is one implementation); a
`verify-candidate` mode through the worker and the inline client, so the
verification stays off the main thread; `scoreBasis` (`'verified'` |
`'closed-form'`) on each report preset, so the card can state which it is.

The test fake's verified means deliberately **disagree** with its search
maxima, so a regression that reads `best.score` again fails loudly rather than
passing on agreement.

The general rule this is an instance of is now written down once, in
`combat-model.md` §8 "Why search maxima are not comparable": a Monte Carlo
`best.score` is valid against its own search's incumbent and against nothing
else.

### F24 — ✅ RESOLVED 2026-07-28 — inherited the F2 fix

Same function, same fix; no separate change was needed. The report's
`recommended.statPriorities` no longer overstate over-soft-cap stats.

### F25 — ✅ RESOLVED 2026-07-28 — search results are checked before use

Each search result is validated (`best.score` finite, `best.candidate` present)
at the stage that produced it, and a failure throws naming the preset and the
path. Previously a worker error surfaced as a TypeError three lines later,
after four completed searches — the most expensive possible moment to lose the
work, and with nothing in the message to say which arm failed.

### F26 — ✅ RESOLVED 2026-07-28 — dead `Math.max` removed

`seedCharacter` sets `points: AWAKENING_TOTAL_POINTS` flat. The comment now
carries the actual reason (the lock is near-permanent, so evaluate at the level
it will be lived with) instead of a `Math.max` implying a subtlety that was
never there.

### F27 — ✅ RESOLVED 2026-07-29 — the probe now means what the label says

`STAT_PERTURBATIONS` implemented `Attack %` as `v => v * 1.01`, a 1% relative
increase in displayed Attack, while the label reads as the `attack_pct` stat
where +1 means one percentage point. The two differ on any build that already
has Attack % — i.e. every real end-game build.

**Owner decision: make it a true percentage point.** The probe now calls
`buffedAttack(attack, attack_pct, 0, 1)` — the function that exists precisely
to stop this confusion — and the unit reads `+1pt`. `apply` gained a second
argument (the whole raw record) because a correct Attack % probe cannot be
expressed as a change to its own field.

The stat-weight row for Attack % **will show a smaller number than before** on
any build with Attack %, by exactly that build's Attack % multiplier. That is
the correction, not a regression.

Two tests: one on a 60% Attack % build asserting the new reading and the exact
ratio to the old one, and one at 0% Attack % asserting both readings agree —
which is why the wrong one survived. Same signature as F3.

### F28 — [INFO] Capping overheal makes the PVP ranking WORSE — do not build it

Raised by the 2026-07-28 calibration run, and recorded because it rules out
work rather than creating it.

The intuitive fix for F4's overheal bias — and for the lifesteal over-ranking
the calibration found — is to cap the survivability factor's healing term at
what a health pool can actually absorb. The motivating numbers are extreme: the
worst build in the field is credited with healing at **19.4% of its max HP per
second**, more than 11× its own pool across a 60s duel.

**Tested. Rank agreement falls monotonically as the cap tightens** (0.676
uncapped → 0.631 at 1× pool → 0.364 at 0.25× pool), and the held-out field
drops 0.714 → 0.600.

So the uncapped term is carrying ranking information that is not literal
healing throughput, and clamping it removes that without supplying a
replacement. Whatever replaces the survivability factor (§C1) has to *account
for* what the crude term is currently getting right, not merely correct its
most obvious physical error. Anyone reaching for the overheal cap should read
this first — it is a day of work that is already known not to pay.

### F29 — [INFO] Damage is anti-predictive of duel outcome at equal budgets

Also from the calibration run. Per-factor rank agreement with duel win rate on
the 16-build field:

| Factor alone | ρ |
|---|---|
| Damage Mitigation | **0.878** |
| Survivability | 0.564 |
| Maximum Damage | **−0.379** |

Two things follow, and neither is a bug.

**Mitigation alone out-predicts the balanced blend** (0.878 vs 0.664) on this
field. That is worth knowing before anyone reweights the blend — though note
the 6-build contract field disagrees (0.507 vs 0.714), so the field size is
doing real work here and the effect is not established.

**The damage factor's negative correlation is correct behaviour.** These are
equal-resource fights: a build that spends everything on damage has nothing
left to survive with. The slider states a *preference*, not a prediction, so a
damage-heavy setting will always score ≈ −0.36 against win rate. **This must
never be calibrated away** — doing so would delete the feature. The calibration
harness fits the balanced blend only, for exactly this reason, and says so.

---

## C. What actually needs redesigning

Ranked. Everything else above is a bug fix or a measurement.

1. **The PVP survivability factor.** F4 + F6 are one problem: a biased rate
   multiplied by an invented horizon. Two candidate shapes:
   - *Copy the tank pattern* — stop fusing pool and healing; make the third
     slider drive a two-sub-factor blend. Removes `REF_FIGHT_SEC` entirely.
     Cheapest, most consistent with the codebase.
   - *Time-to-die* — `pool / max(ε, REF_ENEMY_DPS − selfHps)`. Physically
     meaningful and correctly nonlinear (sustain approaching incoming damage
     should blow survivability up), and `REF_ENEMY_DPS` is *measurable* from
     the archetype catalogue rather than invented. Costs a clamp whose value is
     itself a taste parameter, and the optimizer will chase the clamp.

   ~~Recommendation: do not refactor before F1 and the calibration below.~~
   **This is now the top of the queue.** Both prerequisites are done, and the
   calibration made the case for this item rather than against it: constants
   are not what is wrong (F5), `REF_FIGHT_SEC` is simultaneously the most
   influential constant and provably a single knob serving two opposed errors
   (F6), and the residual disagreement is concentrated in exactly this factor.

   **Read F28 before starting.** The obvious physical correction — capping
   healing at what a pool can absorb — has been tested and makes agreement
   *worse* on both fields. Whatever replaces this factor must account for what
   the crude uncapped term is currently getting right, and be measured against
   ρ = 0.664 (16-build) / 0.714 (contract) with `docs/tools/calibrate-pvp-refs.mjs`,
   not argued from first principles.

   Note also F29: mitigation alone scores 0.878 on the fitting field. If a
   redesign cannot beat "ignore the other two factors", that is worth knowing
   early.

2. **Reference-constant calibration** — ✅ **DONE 2026-07-28**,
   `docs/tools/calibrate-pvp-refs.mjs`. Outcome: **no constant changed**, and that
   is the finding, not a failure to act.

   - `REF_BLOCK` was already the best value on its grid → **[CALIBRATED]** (F5).
   - `REF_MISS` is not identifiable (ρ span 0.024) — stop worrying about it.
   - `REF_PEN` is weakly constrained; the fit drifts to a grid edge.
   - The best full refit gained +0.032 on the fitting field and **0.000** held
     out. Shipping that would have been fitting noise.

   The audit's own prediction was right: *"If no setting agrees, that is the
   evidence that the shape is wrong (item 1)."* No setting agrees, so item 1 is
   promoted. Two new [INFO] findings (F28, F29) record what the run ruled out,
   so the next attempt does not re-derive them.

   The harness stays, and is the acceptance test for item 1.

3. **A standing closed-form-vs-simulation contract** (F8) — ✅ **DONE
   2026-07-28**, `pvpModelContract.test.js`. This class of drift is now caught
   by CI rather than by an audit a month later. See F8 for what it found on
   first run.

4. **The linking simulation's verdict basis** (F23) — ✅ **DONE 2026-07-28.**
   The regret math was always sound; the inputs were unequal, and now are not.
   The general rule it turned on is written down in `combat-model.md` §8, which
   matters more than the fix: the same mistake was available anywhere two
   searches get compared.

5. **Our own build-power metric** — the replacement for the retired CP work
   (F1), and the piece the gauntlet actually needs. **Not yet designed.**

   The gauntlet's job is "an opponent of comparable strength, built
   differently". It currently anchors archetype budgets to the player's raw
   `Attack + Health`, which treats one point of each as interchangeable and
   ignores every secondary stat — so a crit/speed build faces opponents sized
   as if those stats were free.

   Requirements, from what the gauntlet needs rather than from what the game
   does:
   - Ranks builds by overall strength, monotone in every stat that helps.
   - Combines offence and defence at a defensible rate — the natural anchor is
     our own duel engine (build A beats build B ⇒ A should score higher), which
     also makes it *self-calibrating* against the thing we already trust.
   - Defined by us, versioned by us, and **explicitly not** an estimate of the
     game's displayed CP. It must never be shown next to the game's number or
     described to the user as such.
   - Stable across patches by construction; caps move, the metric's shape does
     not.

   Sequence it after item 2 — the same duel-ranking harness serves both.

---

## D. Documentation and code actions taken

- `docs/combat-model.md` — **new**, the canonical reference. Every constant
  carries a provenance tag (RULED / PATCH / OBSERVED / ASSUMED / INVENTED),
  which is the actual defence against the failure mode that prompted this
  audit: quoting an invented number as a game fact.
- This file — the findings queue.
- `CLAUDE.md` — points at both, and no longer implies HPS is gone.
- **Combat Power work retired (2026-07-28, owner decision):**
  `src/lib/combatPower.js` and `combatPower.test.js` **deleted**; nothing in the
  app imported them. `docs/combat-power-notes.md` moved to
  `docs/archive/combat-power-reverse-engineering-ABANDONED.md` behind a
  do-not-cite banner, with the deleted constants recorded there so the history
  survives. `docs/archive/README.md` states the rule for the whole folder.
  `EldarynTracker/combat_power_observations.csv` is left in place — it is raw
  observation, not a derivation, and no code reads it.
- **Rulings pinned:** double hits cannot crit / penetration can crit, each
  covered by a test in all three engines (F1).
- The **MEASURED** provenance tier was removed from the reference. It existed
  only for the CP derivation, and its presence implied a class of evidence this
  project has decided not to generate.

Second sweep (2026-07-28, §B2): headers corrected in `optimizer.js` (the memo
claim, plus the four heuristic gaps it did not list), `linkingSimulation.js`
(the biased-maxima defect), and `relicSuggester.js` (what `gain` actually
measures, and a note on the correct-but-backwards-reading weakest-relic loop).
No behaviour changed.

**Audit coverage is now complete** across the combat and search layers: dps,
statCaps, totals, both simulators, sigilEffects, all objectives, dropGoals,
statWeights, gauntlet/archetypes, optimizer, relicSuggester, linkingSimulation.

### Fix pass (2026-07-28) — eighteen findings closed

Suite: 66 files / 718 tests → **67 / 742**, green throughout. New behaviour is
covered; nothing was closed on inspection alone.

New in `Reference/combat-model.md`, because each is a rule wider than the file
that prompted it:

- §8 **"Why search maxima are not comparable"** — the general statement behind
  F23. A Monte Carlo `best.score` is valid against its own search's incumbent
  and nothing else; crossing searches needs fixed iterations under one seed.
- §9 **the closed-form ↔ duel-engine contract** — what it asserts, the measured
  ρ = 0.714, and the fixture rule about base Speed that invalidated the first
  run.
- §3 `compareSwap` / `computeHps`, §8 Factor 3, §8 Stat weights — rewritten to
  the current behaviour.

New code worth knowing exists, because each is the kind of thing that gets
re-implemented locally by someone who didn't know it was there:

- `optimizer.simulateCandidate` — fixed-fidelity re-scoring; `verifyDpsOutcome`
  is now built on it.
- `optimizer.subsetsUpTo` / `estimateSearchCost` — one enumeration, and its
  cost predicted without running it.
- `statCaps.marginalGain` — the game's `N% GAIN`, as the exact derivative of
  `softCapValue`, so the two cannot drift.
- `optimizerObjectives.specIsSampled` — whether a spec's objective is a Monte
  Carlo estimator, for consumers that report differences.
- A `verify-candidate` worker mode.

**One process note.** The first few fixes in this pass put their rationale in
code comments — including a decision record in `pvpGoalObjective.js`, whose own
header says the derivation lives in `combat-model.md` and not to restate it.
Corrected doc-first, and the audit-ID references (`audit F14`) were stripped
from source too: they point into `docs/WIP/`, which this file leaves the moment
its findings close, so closing a finding would have created the dangling
pointer. Doc → code references are the durable direction, and this file uses
them throughout.

Documents *not* rewritten, deliberately: `big-rework-v1-notes.md`,
`goals-linking-redesign-notes.md` and the `superpowers/specs` files are dated
decision records. They are accurate as history and should stay that way; the
combat facts they contain are superseded by `combat-model.md`.
