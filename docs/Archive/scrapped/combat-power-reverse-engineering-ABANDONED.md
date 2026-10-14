# ARCHIVED — Total Combat Power reverse-engineering (ABANDONED 2026-07-28)

> ## ⚠️ THIS IS A RECONSTRUCTION, NOT THE ORIGINAL
>
> The original `combat-power-notes.md` was **destroyed** on 2026-07-28 by an
> error during the docs restructure (see `../DATA-LOSS-2026-07-28.md`). It is
> not recoverable.
>
> What follows was rebuilt from the deleted `src/lib/combatPower.js` source and
> from fragments quoted during the combat audit. The **formula and constants
> are complete and verbatim** — they came from the module itself. The
> **surrounding derivation narrative is partial**: individual arguments,
> counter-hypotheses and the "what would confirm this" discussion are lost.
>
> Do not read this as the original document. Where it is thinner than it should
> be, that is the loss, not the original author's brevity.

> ## ⛔ DO NOT USE THIS AS EVIDENCE ABOUT ANYTHING
>
> **This path is abandoned by owner decision.** The game's Combat Power formula
> is under active, frequent rebalancing. Reverse-engineering a moving target
> produces a snapshot that looks authoritative — "measured, 124 profiles, 0.05%
> error" — and then silently rots into a confident wrong answer.
>
> - `src/lib/combatPower.js` and its test suite are **deleted**.
> - Nothing in the app computes or displays Combat Power.
> - **No number in this file may be cited in a design decision, a code comment,
>   or an answer to the user.**
> - Specifically: this formula's damage index implied that double hits inherit
>   crit. **They do not** — settled by the owner against this document. See
>   `Reference/combat-model.md` §3.
>
> **What replaces it:** our *own* build-power metric, defined by us and stable
> by construction, for gauntlet budgeting. Caps and mechanics come from patch
> notes; we never again re-derive the game's internal rating.
>
> Retained because the measurement *technique* (minimal-pair sweeps: freeze
> every stat, move one, read the ratio) is reusable for our own formula, and
> because the raw observations in
> `EldarynTracker/combat_power_observations.csv` — **which survived** — are a
> genuine record of what the game displayed in July 2026.

---

## Historical status at abandonment

Solved for the July 2026 build: one formula reproduced all 124
no-damage-sigil profiles — three characters, both classes, CP from 26k to
2.03M — to within ~0.06%. Most terms were *measured* differentially rather
than fitted.

## The formula (verbatim from the deleted module)

```
CP = CP_SCALE · DamageIndex^0.84 · SurvivabilityIndex^0.56 · Π(spellFactors)

DamageIndex        = attack · (speed/100)
                     · (1 + crit/100 · (crit_mult/100 − 1))
                     · (1 + double_hit/100)
                     · (0.7407 + 0.2593 · penetration/100)

SurvivabilityIndex = health
                     · (1 + lifesteal/200)
                     · (1 + hp_regen/regenDivisor)
                     · (1 + spell_resist/200)
                     · mitigation

mitigation         = 1 / ((1−dmg_reduction)(1−block_chance)(1−miss_chance))
                     each term clamped to ≤ 99% so a capped stat can't divide by zero
```

## Constants (verbatim)

| Constant | Value |
|---|---|
| `CP_SCALE` | 1.6040788e-4 |
| `CP_DAMAGE_EXPONENT` | 0.84 |
| `CP_SURVIVABILITY_EXPONENT` | 0.56 |
| `CP_REF_BLOCK` | 0.2593 |
| `CP_LIFESTEAL_DIVISOR` | 200 |
| `CP_SPELL_RESIST_DIVISOR` | 200 |
| `CP_HP_REGEN_DIVISOR` | `{ Warrior: 173.35, Sentinel: 186.6 }` |
| `CP_SPELL_FACTORS` | `ember-curse:2` 1.118950 · `:4` 1.118195 · `:5` 1.125210 |

`cpSpellDamageShare(factor) = factor^(1/0.84) − 1` backed out how much a damage
sigil adds to the damage index (Ember Curse Lv2's 1.11895 → +14.28%).

## What the minimal-pair sweeps established

Freeze every stat, move one, read the CP ratio — the term falls out with no
model assumed.

| Stat | Pairs | Range probed | Result |
|---|---|---|---|
| Miss Chance | 20 | 12.3% → 32.5% | `1/(1−miss)` to within 0.0005% |
| HP Regen | 7 | 3% → 7.2% | divisor 186.6, flat across the range |
| Penetration | 7 | 21.4% → 25.4% | reference block 0.25921–0.25937 |
| Attack | 1 | — | exponent 0.8406 |
| Attack Speed | 2 | — | exponents 0.8403, 0.8396 |
| **Blind Chance** | 31 | 6% → 16.8% | **exactly inert** — CP does not move one point |
| **Paralyze Chance** | 31 | 0.4% → 6.9% | **exactly inert** |

Exponents came out 0.840 (Attack, Attack Speed) and 0.560 (Health) — ratio
exactly 3:2, sum exactly 7/5, so `CP ∝ (Damage³ · Surv²)^0.28`.

Notably the app's own `computeDps` was a **worse** CP predictor (4.6% worst
error) than the plain product. The two differ in shape: the index multiplies
`(1 + double_hit)` onto the crit term; `computeDps` adds the double-hit strike
outside it. **The owner has since confirmed `computeDps` is correct about the
game and this index is not** — which is the clearest possible demonstration of
why fitting a rating formula proves nothing about combat resolution.

## Class differences

Almost everything was shared. Both classes independently gave the same
exponents, the same penetration reference block, the same lifesteal divisor,
and the same scale constant — `K(Sentinel)/K(Warrior) = 1.0003`.

Fitted separately, for the record: penetration reference block 0.2572 (W) vs
0.2592 (S); lifesteal divisor 196 (W) vs 199.5 (S).

The one claimed genuine exception was **HP Regen**, weighted ~7.5% more
strongly for Warriors. The Sentinel divisor was measured from 7 clean minimal
pairs (186.3–186.7). The Warrior divisor was **inferred** from a 23-row fit
with no clean pairs: a single divisor simultaneously closed one character's
0.43% offset at HP Regen 19.5 and another's 0.77% offset at 42.5. Forcing one
shared divisor fitted 3.8× worse. The competing explanation — that the DMG
Reduction / Block term bends above the lower character's observed range — was
never excluded.

*(The original document's fuller discussion of this open question, and of what
observation would settle it, is among the material lost.)*
