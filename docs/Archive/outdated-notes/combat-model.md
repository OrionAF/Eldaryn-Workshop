# The Combat Model — canonical reference

**This is the source of truth for everything damage, healing, mitigation,
survivability, duelling and scoring.** If another document contradicts this
one, this one wins and the other is stale. Audit date: **2026-07-28**.

Companion document: `combat-audit-2026-07-28.md` holds the open contradictions
and the deferred fixes. This file describes what the code *does*; the audit
describes what is *wrong with it*.

---

## 0. How to read this document

Every number in this codebase is tagged with where it came from. The tag is
the whole point of this rewrite: the recurring failure mode has been treating
an invented constant as if it were a measured one, then building on it.

| Tag | Meaning | Trust |
|---|---|---|
| **[RULED]** | Settled by the owner, who plays the game. A game fact. Do not reopen it from an inference. | Highest |
| **[PATCH]** | Stated by a patch note or the game wiki, and verified against the note's own worked example where one exists. | High |
| **[OBSERVED]** | Read off a real profile/screenshot — usually a single data point. | Medium |
| **[ASSUMED]** | A modelling decision with a written rationale, never checked against the game. | Low — flag before relying on it |
| **[CALIBRATED]** | Fitted against **our own simulation**, with the run recorded. Internally consistent; says nothing about the game. | Low as a game fact, high as a modelling choice |
| **[INVENTED]** | A number chosen for plausibility with no evidence at all. A taste parameter. | None — do not cite as fact |

Only **[RULED]**, **[PATCH]** and **[OBSERVED]** may be quoted to a user as game
facts. Note how much of the PVP scoring layer is **[INVENTED]** — that is the
honest state, not an oversight.

**[CALIBRATED]** is the tier this document's own closing instruction asks for,
and it carries a trap worth naming: a fitted number looks authoritative and is
not. It means "the best value found against the duel engine", so it inherits
every one of the duel engine's assumptions, and a constant can be calibrated
and still wrong about the game. Always cite the run that produced it. A
calibration that finds the shipped value was already best — which has
happened — is a real result and should be recorded as one, not silently
dropped.

There is deliberately **no "[MEASURED]" tier**. There used to be: a
reverse-engineered Combat Power formula that reproduced 124 observed profiles to
0.05% and therefore looked like the most authoritative thing in the repo. It was
retired on 2026-07-28 (`docs/archive/`) because the game's CP rating is under
active rebalancing — a derivation of a moving target is a snapshot that decays
into a confident wrong answer, which is worse than an honest **[ASSUMED]**.
**Do not re-derive game internals from observed aggregates.** Track patch notes,
rule from play, and where neither is available, mark it INVENTED and calibrate
it against our own simulation.

---

## 1. The pipeline

Everything flows one way. Knowing which stage you are in determines whether a
value is raw or effective, and that distinction causes more bugs than any
other thing in this codebase.

```
 persisted sources                  (gear, talents, awakening, transcendence,
        │                            relics, sigils, pet, mount+glyphs, stones,
        │                            fortress buffs)
        ▼
 computePresetRawTotals()           additive sum, per totals.js's rules
        │                           → RAW totals (may exceed every soft cap)
        ▼
 applyStatCaps() = applySoftCaps()  the diminishing-returns curve, applied
        │                           EXACTLY ONCE. Not idempotent.
        ▼
 computePresetTotals()              → EFFECTIVE totals ("display totals")
        │
        ├── resolveEffectiveTotals()  Manual presets skip both steps: the user
        │                             typed the game's already-effective
        │                             numbers, so they only get
        │                             clampToHardCaps().
        ▼
 the engines and objectives          computeDps / computeHps / runSimulation /
                                     runPvpSimulation / every objective
```

**The rule:** engines and objectives consume **effective** totals. Anything
that adds an item's printed stats to a build (Drop Check) must do so on **raw**
totals and then curve once. `computePresetRawTotals` exists solely for that.

Two places to check whenever you touch this: `VerdictCard.capAwareSwap` does it
correctly; `statWeights.computeStatWeights` does not (audit F2).

---

## 2. Stat inventory and caps

Source: `constants.js` STAT_FIELDS. Caps are **[PATCH]** (wiki "Combat Stats
Explained", updated Jun 2026, plus the Jul 2026 rebalance).

| Stat | key | base | soft cap | hard cap | class |
|---|---|---|---|---|---|
| Attack | `attack` | 10 | — | — | |
| Attack % | `attack_pct` | 0 | — | — | |
| Health | `health` | 10 | — | — | |
| Health % | `health_pct` | 0 | — | — | |
| Attack Speed | `speed` | 100 | 200 | 400 | |
| Crit Chance | `crit` | 0 | 50 | 90 | |
| Crit Damage | `crit_mult` | 150 | 300 | 700 | |
| Double Hit | `double_hit` | 0 | 60 | 90 | |
| Spell Damage | `spell_damage` | 0 | — | — | uncapped by design |
| Lifesteal | `lifesteal` | 0 | 40 | 70 | |
| HP Regen | `hp_regen` | 0 | 40 | 60 | |
| Miss Chance | `miss_chance` | 0 | 50 | 90 | Sentinel |
| Blind Chance | `blind_chance` | 0 | 30 | 50 | Sentinel |
| Paralyze Chance | `paralyze_chance` | 0 | 8 | 18 | Sentinel |
| DMG Reduction | `dmg_reduction` | 0 | 30 | 60 | Warrior |
| Spell Resist | `spell_resist` | 0 | 30 | 60 | |
| Block Chance | `block_chance` | 0 | 40 | 80 | Warrior |
| Penetration | `penetration` | 0 | 30 | 70 | |
| PVP Attack | `pvp_attack` | 0 | — | — | rating |
| PVP Defense | `pvp_defense` | 0 | — | — | rating |

**Base values** are **[OBSERVED]** from a bare character (handoff §; Attack 10,
Speed 100%, Crit Mult 150%).

### The soft-cap curve — `statCaps.js`

With soft cap `S`, hard cap `H`, `K = H − S`, `over = raw − S`:

```
effective = S + K · (1 − (2K / (over + 2K))²)          for raw > S
effective = raw                                         for raw ≤ S

marginal  = 8K³ / (over + 2K)³        ← share of the next raw point that arrives
```

**[PATCH]** — Jul 2026 "gentler overcap" patch, and **[OBSERVED]** — confirmed
against a live character on 2026-07-28 (`Source/screenshots/stat-sheet-*`):

| | Game | Our curve |
|---|---|---|
| Block, raw 56.4 → effective | **52.5%** | 52.452% |
| marginal value of the next point | **57% GAIN** | 57.15% |

The second row is the strong one: it confirms the **derivative**, not just a
point on the curve, at an operating point nothing was ever fitted to. A wrong
curve shape could coincidentally match one value; matching its slope too is
much harder to fake.

The curve approaches `H` asymptotically and never reaches it, so overcapping
always helps a little — **there is no dead stat**.

### What the game's stat sheet actually shows — **[OBSERVED]**, settled

The sheet shows **three** numbers per capped stat:

| Displayed | Meaning |
|---|---|
| the big number, e.g. **52.5%** | the **EFFECTIVE** value — *the only number combat uses* |
| **RAW 56.4%** | the plain additive sum of every source, pre-curve |
| **57% GAIN** | how much of your next raw point actually arrives, colour-coded yellow → orange → red |

This settles audit **F7 in the app's favour**: a Manual total is the player
copying the big number, which is already effective, so `clampToHardCaps`
(never re-curving) is correct. The same holds for typed PVP opponents.

Two consequences worth carrying:

- **Items never lose their printed value.** The curve bends the *total*, not
  the item. A +1% Block ring is always +1% raw; what changes is how much of the
  total survives the curve.
- **`GAIN` is a number we can compute exactly** (`marginal` above), so the app
  can show the same guidance the game does. Not yet built.

Two operations, and confusing them corrupts a build:

- `applySoftCaps(raw)` — for pre-curve sums. **Not idempotent.**
- `clampToHardCaps(effective)` — for values already post-curve (Manual totals,
  PVP opponent entry). Only guards impossible entries.

---

## 3. Damage — the closed form (`dps.js`)

`dps.js` is a 1:1 port of the original Python `dps.py`. Scope is **PVE only**:
it ignores enemy defence entirely.

```
finalAttack   = flatAttackTotal · (1 + attackPct/100)          [OBSERVED]
computeDps    = (attack·(1 + c·(cm − 1))  +  attack·dh) · speed/100
                 └── main hit, can crit ──┘  └ extra strike ┘
```

where `c = crit/100`, `cm = crit_mult/100`, `dh = double_hit/100`.

- The Attack decompose/recombine is **[OBSERVED]** — verified against a real
  profile (35.833 × 1.343 = 48.124).
- **The double-hit strike deals normal damage and CANNOT crit** — **[RULED]**
  2026-07-28. Settled; the additive form above is correct. A retired CP
  derivation implied otherwise and is not evidence (see §0). Pinned by a test
  in each of the three engines: `dps.test.js`, `simulation.test.js`,
  `pvpSimulation.test.js`.
- **Penetration CAN crit** — **[RULED]** 2026-07-28. What pierces a block takes
  the crit roll like any other hit. Independent of the rule above; both are
  pinned in `pvpSimulation.test.js`. (PVE ignores block entirely, so this only
  bites in duels.)

### PVP Attack / Defense ratings

```
pvpEffect(rating) = rating / (rating + 200) · 100
```

**[OBSERVED]** — verified against a real combat example (303 → 60.2%,
283 → 58.6%). Ratings sum additively like flat Attack; the percentage is always
derived, never stored.

### Healing — `computeHps`

```
hps_regen     = health · hp_regen/100
hps_lifesteal = computeDps(profile) · lifesteal/100
total_hps     = hps_regen + hps_lifesteal
```

**[ASSUMED]** as a survivability rate. The regen half matches what both tick
engines implement; the sum as a whole is a Phase-0 artifact with four known
biases (overheal, undefended lifesteal DPS, summing two differently-conditional
terms, no timing). **It is not a reliable measurement — audit F4.**

**Its only remaining caller is `tankObjective`** (2026-07-28). The PVP goal used
to call it too and no longer does: it computes its own lifesteal term off landed
damage, which removes the undefended-DPS bias for that goal — see §8 Factor 3.
The other three biases still apply wherever this function is used.

### `compareSwap`

Produces before/after totals for a one-piece swap, plus the DPS delta, the %
change and a verdict. **No HPS fields** — `current_hps`, `new_hps`, `hps_delta`
and `hps_pct_change` were removed on 2026-07-28 (audit D2/F9). Nothing rendered
them, and a swap verdict built on `computeHps` would have carried that
function's biases into the one number the user acts on. A survivability verdict
for a swap goes through `dropGoals.js`'s `tank` scorer instead (§8).

---

## 4. Build power — ours, not the game's

**The app does not model the game's Combat Power rating, and must not start.**

`src/lib/combatPower.js` was deleted on 2026-07-28 along with its tests. It
reverse-engineered the game's displayed CP to 0.05% across 124 profiles, which
is exactly what made it dangerous: the game rebalances that formula frequently,
so a derivation is a snapshot with an authoritative-looking error bar and a
silent expiry date. It had already been used, in this document's own first
draft, to argue against a combat rule that the owner then confirmed was correct
all along. Notes are archived under `docs/archive/` with a do-not-cite banner.

**The standing rules:**

- Never re-derive the game's internal rating from observed aggregates.
- Update caps and mechanics from **patch notes** as they ship (that is a small,
  reliable, one-line-per-patch job — see §2).
- Where the game gives no number, the owner's play experience rules
  (**[RULED]**); failing that, mark it **[INVENTED]** and calibrate it against
  our own simulation.

**What fills the gap:** a build-power metric *we define*, used to size gauntlet
opponents. The gauntlet currently anchors archetype budgets to the player's raw
`Attack + Health`, which is crude — it treats a point of Attack and a point of
Health as interchangeable and ignores every secondary. A deliberate formula
would make "equal-resources opponent" mean something. Being ours, it is stable
by construction, needs no reverse-engineering, and is allowed to be wrong about
the game's rating as long as it ranks builds fairly. Design direction lives in
`combat-audit-2026-07-28.md` §C — **not yet built**.

---

## 5. The PVE simulator (`simulation.js`)

Monte Carlo 60-second World Boss fight. Where `dps.js` gives the expected rate,
this plays swings out and returns a distribution.

- **Clock: 400 ticks/second** — **[ASSUMED]** (400% is the Speed hard cap, so
  one tick is the smallest meaningful slice; the game is a React Native frame
  loop, i.e. itself discrete). One constant if the true frame rate is measured.
- Swing every `40000 / speed` ticks; first swing on tick 1; speed re-read per
  swing so timed buffs shift the next interval. The *next* swing time accrues
  on a float accumulator so rounding cannot bias the attack rate.
- Speed is clamped to ≥ 100 — the attack rate can never drop below base.
- **The boss is a pure target dummy**: no defence, no mechanics, never attacks.
  Lifesteal and HP Regen are therefore irrelevant here and ignored.
- All mechanics are `EffectDef` hooks (`modifySwing`, `resolveHit`,
  `afterSwing`, `onHit`, `speedBonus`, …). The core knows nothing about crit or
  double hit; `DEFAULT_EFFECTS` supplies both, sigils append more.

**Cross-check that exists:** `simulation.test.js` asserts the engine mean
converges to `computeDps(stats) · duration` within 1%. This is the one place in
the codebase where a closed form and a simulation are pinned to each other.

---

## 6. The PVP duel engine (`pvpSimulation.js`)

Two-sided, one shared timeline, same 400-tick clock. This is the most detailed
model in the repo and the de-facto ground truth for PVP.

### Resolution order, per hit

1. Attacker paralyzed → swing skipped entirely
2. Attacker blinded → consume one stack, whole swing deals 0
3. Defender Miss roll → full dodge, **nothing** pierces
4. Defender Block roll → only attacker's Penetration % of the pre-crit base
   goes through
5. Crit roll — **main hit only**; the double-hit extra strike cannot crit.
   Since the Penetration Rework, whatever pierces a block **can** crit
6. PVP chain: `dmg · (1 − DR) · (1 + pvpEffect(atk.pvp_attack)) · (1 − pvpEffect(def.pvp_defense))`
7. On a landed hit: blind roll, paralyze roll, lifesteal, on-hit sigil marks,
   thorns reflect, hit-stack burn

### HP, healing, and the timeout

- **`PVP_HEALTH_MULTIPLIER = 8`** — **[PATCH]** Jul 2026. Every fighter in
  Arena and Clan War, one multiplier for everyone, no level-45 breakpoint.
  Not a mode the caller picks; the parameter survives only for tests.
- **Healing is not multiplied** — **[PATCH]**. HP Regen (and shields) are sized
  off *original* max HP, so the regen tick divides the multiplier back out.
  Lifesteal is a share of damage dealt and was never pool-derived.
- Regen accrues per tick: `originalMaxHp · hp_regen/100/400`, clamped at the
  (multiplied) max HP.
- **The 60s timeout is won by higher remaining HP *percentage*** — **[PATCH]**
  Jul 2026, replacing the old flat-HP rule. Equal → draw.
- **Mutual kill counts as a LOSS for the player** — **[OBSERVED]**
  (`docs/IMG_7384.png`: both drop to 0, arena shows "Defeated").

### Documented assumptions (each is one branch to change)

- Blind stacks as a counter; procs roll only on hits that landed.
- A blocked hit with Penetration > 0 counts as landed for procs *and* as
  blocked for bulwark stacks.
- Swing intervals round to whole ticks (±1.25 ms, ~0.02% — far under MC noise).
- Both sides auto-fire actives as early as possible: pure self-buffs on tick 1
  (before that tick's swings), enemy-targeting sigils at 1s — **[OBSERVED]**,
  the in-game 59s mark.

### Over-cap rule

Base `stats` are final **capped** totals. Sigil active buffs are timed additive
layers *on top* and may exceed the cap for their duration (Miss 70% + 20% buff
= 90% while it lasts). All reads go through `statNow()`, never raw `stats`.
Enemy strips (negative layers) floor at 0.

### PVP-only sigil mechanics

The PVE registry marks enemy-targeting legendaries `unsupported` (a dummy has
no defences and never attacks). `PVP_SIGIL_MECHANICS` overrides them with
tooltip numbers — **[OBSERVED]**: sunder/siegebreaker marks (max 8, 4%/stack,
shed 1.75/s), bulwark-of-thorns and elusive-supremacy hit-stacks (max 8, burn 2
on an unblocked hit), withering-touch regen debuff (8s), thunderbind paralyze
(2s).

---

## 7. Sigils in combat (`sigilEffects.js`)

- Sigil **damage is spell damage**: boosted by the caster's Spell Damage %,
  reduced by the target's Spell Resist %, then through the PVP chain. Swings
  are physical and untouched by either.
- Sigil casts are **unblockable and un-dodgeable** ("pure"), and in the duel
  engine they do **not** proc lifesteal (only `onLandedHit` leeches, and
  `pureDamage` bypasses it).
- Every damage figure is **manual entry** — the scrape shows `X` placeholders
  because Spell Damage makes them unscrapeable. Warborn Fury's Penetration is
  manual for the same reason (`?` at 19 of 24 levels).
- Buff stats apply as timed layers. **Attack % inside a buff is applied
  multiplicatively to the already-%-inflated displayed Attack**, in all three
  engines — which contradicts this model's own additive stacking rule. Audit F3.

**Activation model.** Every active sigil auto-fires the moment it comes off
cooldown — the game fires them automatically in combat, and an opponent's
activation conditions are not visible to us, so both sides are assumed to
activate as early as possible. Cooldown starts *at* activation, so activations
land at `firstAt, firstAt+cd, firstAt+2cd, …` and a buff's steady-state uptime
is `duration / cooldown`. Pure self-buffs fire immediately (tick 1 in the duel
engine, ordered before that tick's swings so the buff covers the first hit);
enemy-targeting sigils wait `SIGIL_FIRST_HIT_DELAY_SEC` — 1s, **[OBSERVED]** as
the in-game 59s mark.

**Structure vs numbers.** The catalogue (`sigilsData.js`) declares only
*structure* — which stats, durations, cooldowns. The magnitudes scale with each
character's in-game sigil level and are entered per character
(`character.sigilValues`). A sigil with no entered numbers simulates as
all-zeros.

**Not simulated in PVE.** Some sigils only do anything against a boss that
fights back, and the PVE sim's boss is a pure target dummy (§5). So
sunder/siegebreaker marks (nothing to strip), bulwark-of-thorns and
elusive-supremacy (the dummy never attacks, so stacks never build), and
withering-touch's regen debuff / thunderbind's paralyze are all inert there —
their activation *damage* still counts. Each carries a `note` so the UI can say
why. **A real opponent fixes all of these**, which is why `PVP_SIGIL_MECHANICS`
(§6) overrides them for duels. Modelling them in PVE would need a boss model —
a scope decision, not a code gap.

---

## 8. The objectives layer

Every goal is a `(totals) => number` scorer, and the optimizer maximises it.
Rankings are all that matter; absolute units do not.

### DPS goal
`sigilAwareDpsFromTotals` = `computeDps` + the closed-form expectation of
equipped sigil actives (flat nuke/tick damage exactly; timed buffs mixed per
exact buff-window segment, so overlap synergy is captured rather than
approximated additively). A Monte Carlo variant confirms challengers.

### Tank goal (`tankObjective.js`, Warrior)

**The problem.** The game exposes nothing about incoming damage — monster
attack speed, hit sizes and ability damage are all unmeasurable in-game — so a
literal "simulate this dungeon fight" objective is impossible.

**The inversion.** Instead of asking "do I survive dungeon X?", score what the
build *could* survive, purely from the player's own stats.

```
selfHps        = computeHps(totals).total_hps
landedFraction = (1 − dmg_reduction) · (1 − block_chance)
sustainDps     = selfHps / landedFraction
ehp            = health / (1 − dmg_reduction)
score          = (1 + ehp)^w · (1 + sustainDps)^(1−w)        w = ehpWeight ∈ [0,1]
```

**Factor 1 — Sustainable incoming DPS.** The largest raw (pre-mitigation)
incoming damage per second at which the build's recovery still keeps up.
Bigger means it holds steady against harder-hitting content, in real damage
units, with no monster numbers required. A block negates the entire hit in PVE:
the PVP chain lets the attacker's Penetration through, but dungeon monsters'
Penetration is unknowable and assumed 0.

**Factor 2 — Effective HP.** The burst buffer against spike damage. Block is
deliberately **excluded** here — it is chance-based, boss abilities may be
unblockable, and a spike kills before regen matters. We cannot know an
ability's damage, but a bigger effective pool is strictly better against any
spike, and ranking is what the optimizer needs, not absolute survival.

**The blend.** Geometric rather than a weighted sum because the two metrics
live in different units and scales; a ratio-scale blend needs no baseline
normalisation and is monotone in both inputs. The `+1` floors keep a
zero-sustain build scorable so the search can still move, while heavily
favouring any sustain at all when `w < 1`. The unknowns we cannot measure
(attack cadence, ability details) are absorbed into `w` instead of pretending
to know enemy stats.

Sigil *active* damage is not folded into the lifesteal term — only base
closed-form DPS is. Passives are already inside the totals.

**[ASSUMED]** throughout — coherent, never validated against anything.

Two structural notes:

- **Pool and healing are never added together.** They stay as two factors and
  the slider sets the exchange rate, so no time constant is needed anywhere.
  This is the design the PVP goal failed to copy — see F6.
- **DMG Reduction is counted in both factors, and that is intended.**
  **[RULED] 2026-07-29.** It divides into `ehp` *and* into `sustainDps`, so it
  carries total exponent 1 across the blend while Block carries only `1−w`.

  This is not double-counting a single effect: in the game DR genuinely does
  both jobs. It deepens the pool you can absorb a spike with, and it stretches
  every point of healing further, because healing is measured against damage
  that has already been reduced. Block does one job — it negates whole hits,
  which helps sustained attrition and cannot be relied on against a spike, so
  it correctly appears in `sustainDps` alone.

  The consequence to know, because it is genuinely surprising: **the
  `ehpWeight` slider does not move DR's influence at all.** Wherever the slider
  sits, DR is weighted the same. A player who drags it to "all sustain"
  expecting to de-emphasise DR will not see that happen, and the ranking is
  still right. If a Tank recommendation ever looks over-invested in DR, this is
  why, and it is by design rather than a bug to chase.

### PVP goal (`pvpGoalObjective.js`)

**The problem.** A real PVP score is "win chance against the ladder", but a
duel needs a concrete opponent. The Monte Carlo win-rate objective
(`pvpOptimizer.js`) answers that for *saved* opponents; this goal must rank
builds with no opponent picked at all, cheaply enough to drive the deep search.

**The inversion** (same trick as the Tank goal): score each factor from the
player's OWN stats. Opponent-dependent stats — ones that only pay off through
what the enemy does — are valued against a fixed **reference opponent**.
Opponent stats that scale every candidate equally (their Miss vs my swings,
their raw DPS) cancel out of a *ranking* and are deliberately not modelled.

#### Factor 1 — Maximum Damage

Expected damage output per second, in real damage units, built from the duel
engine's own swing math:

```
D              = pvpAttackFactor · (blockPenFactor · computeDps + sigilActiveDps)
blockPenFactor = (1 − REF_BLOCK) + REF_BLOCK · (penetration/100)
pvpAttackFactor= 1 + pvpEffect(pvp_attack)/100
```

- `blockPenFactor` scales the **swing** portion for the reference enemy's
  Block: a blocked swing deals `base × Penetration`, and since pierced damage
  crits like any other hit, the crit expectation `computeDps` already folded in
  applies to the pierced share too — nothing is divided back out. This is what
  gives Penetration a nonzero closed-form value.
- `sigilActiveDps` is the sigil-active increment exactly as the PVE sigil-aware
  objective computes it. Spells are unblockable in the duel engine, so this part
  deliberately skips `blockPenFactor`; the small buff-window swing delta rides
  along unscaled, an accepted approximation. The enemy's Spell Resist and DMG
  Reduction scale all candidates equally and cancel.

#### Factor 2 — Damage Mitigation

The reciprocal of the expected fraction of a raw incoming stream that actually
lands — an "incoming damage multiplier", like EHP with Health factored out, so
it *composes* with Survivability instead of double-counting Health.

```
M           = 1 / ((1 − REF_SPELL_SHARE) · swingLanded + REF_SPELL_SHARE · spellLanded)

swingLanded = (1 − miss/100)
              · (1 − blindedFraction)
              · (1 − paralyzeUptime)
              · (1 − (block/100) · (1 − REF_PEN))
              · (1 − dmg_reduction/100)
              · (1 − pvpEffect(pvp_defense)/100)

spellLanded = (1 − spell_resist/100) · (1 − dmg_reduction/100)
              · (1 − pvpEffect(pvp_defense)/100)
```

with, where `h` is my landed-hit rate `(speed/100) · (1 − REF_MISS)`:

```
blindedFraction = min(0.9, h · (blind/100) / REF_ENEMY_SWINGS_PER_SEC)
paralyzeUptime  = 1 − exp(−h · (paralyze/100) · PARALYZE_SEC)      ← Poisson overlap-corrected
```

Sigil casts fire on schedule, so `spellLanded` skips miss/blind/block entirely.
Note that **Attack Speed and Miss buy mitigation here** — they drive blind and
paralyze uptime — matching the duel engine, where disruption scales with how
often you land hits.

#### Factor 3 — Survivability

```
S = PVP_HEALTH_MULTIPLIER · health + selfHps · REF_FIGHT_SEC
```

```
selfHps = health · hp_regen/100  +  swingDamage · lifesteal/100
```

where `swingDamage = pvpAttackFactor · blockPenFactor · computeDps` is the
**same** landed-swing quantity Factor 1 reports — deliberately *not*
`computeHps` (§3), and deliberately excluding `sigilActiveDps`.

**Why (audit D1, applied 2026-07-28).** `computeHps` leeches off raw
`computeDps`: pre-block, pre-penetration, pre-PVP-chain. It therefore credits a
build with lifesteal on damage the opponent never takes — an overstatement of
exactly `1/(1 − REF_BLOCK)` at zero Penetration. The duel engine leeches inside
`onLandedHit`, off the final post-chain number, so the closed form must too.
Sigil casts go through `pureDamage`, which bypasses `onLandedHit` entirely (§6),
so **sigil damage does not lifesteal** — hence the exclusion. No new constants;
strictly more accurate.

Consequences worth knowing: Penetration and PVP Attack now raise the
survivability factor as well as the damage factor, because they raise landed
damage, and that is what the duels do. Attack Speed still contributes through
Lifesteal throughput. The regen term is untouched — it is unconditional and
pool-proportional.

This removes one of F4's four biases from this goal. Overheal, the differing
conditionality of the two terms, and the absence of timing remain.

The multiplier mirrors the duel engine's 8× pool with healing left at 1×,
because the game sizes HP Regen off original max HP. That is the point of the
Jul 2026 patch: a point of Health now buys 8× what it used to relative to a
point of recovery, so the blend must see the same ratio the duels do rather
than a merely monotone stand-in.

`REF_FIGHT_SEC` is half the 60s duel horizon — recovery after the fight ends is
worthless, and mid-fight healing is worth less than pool you start with. It is
**[INVENTED]** and is the obvious tuning knob if longer fights turn out to
favour recovery more than 30s implies. See audit F4/F6: it multiplies a biased
rate, and this fusion of pool with healing is what forces the constant to exist
at all.

#### The blend

```
score = (1+D)^wD · (1+M)^wM · (1+S)^wS        wD + wM + wS = 1
```

Geometric for the same reason as the Tank goal: the factors live in different
units, a ratio-scale blend needs no baseline normalisation and stays monotone
in every input, and the `+1` floors keep degenerate builds scorable. A 100/0/0
slider reduces exactly to single-factor ranking.

Closed-form and cheap, so the optimizer runs it single-stage with no Monte
Carlo screening. The **Custom** goal reuses this same engine with its own
weights — it is a slider blend, not a separate scoring engine.

Reference constants, all originally **[INVENTED]** by a stated rule (half the
soft cap, halved again for class-gated stats). Four have since been checked
against duel rankings — see "Calibration of the reference constants" in §9 for
the method and the caveats:

| Constant | Value | Provenance | Note |
|---|---|---|---|
| `REF_BLOCK` | 0.10 | **[CALIBRATED]** | half of 40%, halved for Warrior-only — and the grid maximum, so the guess was right |
| `REF_PEN` | 0.15 | **[INVENTED]**, weakly constrained | ρ span 0.17; the fit drifts to a grid edge rather than converging |
| `REF_MISS` | 0.125 | **[INVENTED]**, not identifiable | ρ span 0.024 — its value barely affects any ranking |
| `REF_SPELL_SHARE` | 0.25 | **[INVENTED]** | share of incoming damage that is spell; not yet fitted |
| `REF_ENEMY_SWINGS_PER_SEC` | 2 | **[INVENTED]** | Speed soft cap 200% |
| `REF_FIGHT_SEC` | 30 | **[INVENTED]**, contested | the most influential of the four (ρ span 0.74) and the one a refit most wants to move — but the refit does not generalise, and this constant is the fusion F6 objects to |
| `PARALYZE_SEC` | 2 | **[OBSERVED]** | mirrors the duel engine; **not** a reference constant and not tunable — changing it desyncs the two models |

`pvpFactorMetrics` accepts a `refs` override so the harness can search this
space. Nothing in the app passes it; the defaults are the shipped values, and a
test pins that equivalence.

### Drop Check goals (`dropGoals.js`)
DPS fast / DPS sim / Tank, scored on **raw** totals which each scorer curves
exactly once. This module is the correct reference implementation of the
raw-vs-effective discipline.

### Stat weights (`statWeights.js`)

Perturbs one stat by a game-meaningful unit and re-scores with the goal's own
closed form, so a weight answers "what would this goal's optimizer pay for one
more of this?".

Probes are applied to **raw** totals and the result is curved exactly once —
the same discipline as `dropGoals.js` (§1, §2). It probed post-curve totals
until 2026-07-28 (audit F2), which overstated any stat already past its soft
cap — one `K` into overcap the true marginal is roughly 30% of a point and the
panel reported 100% — and could push a probe above a hard cap, an unreachable
state. The baseline score is unaffected either way, since curving the
unperturbed raw record is exactly `computePresetTotals`.

Consequences of the fix: weights for over-soft-cap stats fall toward their true
marginal value and a hard-capped stat now scores ~0, which is the honest answer.
This is also the fix for the linking report's `recommended.statPriorities`,
which inherited the same defect (audit F24).

### Why search maxima are not comparable

`optimize()`'s `best.score` is **the maximum of many noisy evaluations** whenever
the objective is Monte Carlo (`pve-accurate`, `pvp`). The maximum of noisy draws
is biased upward — the winner's curse — and the size of that bias **grows with
how many candidates were evaluated**. Two searches that adopted a different
number of times therefore sit on different rulers, and any gap between them
smaller than the differential bias is an artifact of search length rather than
of the thing being compared.

The rule that follows:

> A Monte Carlo `best.score` may be compared against **the incumbent inside its
> own search** (that comparison is what the search is for). It may never be
> subtracted from another search's `best.score`.

To compare across searches, re-score the winning candidates at a **fixed
iteration count under one shared seed** and use those numbers.
`optimizer.js` exposes `simulateCandidate` for exactly this; `verifyDpsOutcome`
is the before/after form of the same idea for the result card. Closed-form
objectives (`tank`, `pvp-goal`) are deterministic and exempt.

The linking simulation violated this rule until 2026-07-28 (audit F23) — it fed
four raw search maxima straight into the regret math behind a **near-permanent
awakening lock**, the highest-stakes recommendation in the app. It now runs two
extra verification stages per Monte Carlo preset and computes regret from those;
each report preset carries `scoreBasis` (`'verified'` | `'closed-form'`) saying
which it was.

---

## 9. The gauntlet (`pvpArchetypes.js`, `pvpGauntlet.js`)

The duel-validation half of the hybrid: the closed form ranks, the duels check.

- Archetypes are class-scoped stat *shapes* — an attack/health split of a
  budget plus a fixed secondary kit — scaled to the player's own
  Attack + Health budget, so every duel is an equal-resources fairness test.
  **[INVENTED]** starter numbers.
- `runGauntlet` duels every finalist against every archetype variant under
  common random numbers, with cancel and progress.
- `analyzeContradiction` flags only when the duel leader beats the closed-form
  leader **beyond their combined CI**, so MC noise cannot raise a false flag.

The gauntlet can falsify the closed-form PVP model, but it only runs when a
user presses the button. The standing, automatic check is the contract test
below.

### The closed-form ↔ duel-engine contract (`pvpModelContract.test.js`)

The PVE side has always had one: `simulation.test.js` asserts the simulated
mean converges on `computeDps`, so neither model can drift alone. PVP had no
equivalent until 2026-07-28 (audit F8) — a divergence between
`pvpGoalObjective` and `pvpSimulation` would have surfaced only in an audit,
while the optimizer went on confidently recommending builds that lose fights.

The test ranks a fixed field of contrasting equal-budget builds by both models
— closed-form score, and mean win rate over a seeded round-robin — and asserts
**rank** agreement. Not value agreement: the units differ, and the closed form
faces an averaged reference opponent while the duels face a specific field, so
exact agreement would be suspicious rather than reassuring.

**Measured agreement: Spearman ρ = 0.714** (2026-07-28, balanced sliders). The
two models agree strongly at the extremes — both put the bases-only build last
and neither's favourites are the other's worst — and disagree in the middle
third of the field. That is the expected shape while `REF_BLOCK`, `REF_PEN`,
`REF_MISS` and `REF_FIGHT_SEC` remain **[INVENTED]**; closing that gap is what
calibration against duel data is for. The test's threshold is deliberately
slack (ρ > 0.5) so calibration can move the number without a false alarm, with
the sharp assertion carried by the top-two/bottom-two disjointness instead.

One fixture rule worth knowing, because getting it wrong invalidates the whole
comparison: **every build must carry base Speed 100 and Crit Damage 150
explicitly.** `offensiveStats()` zeroes every field, and a Speed 0 build never
swings — which turns each duel into a remaining-HP tiebreak at the timeout and
ranks the field by tankiness alone.

### Calibration of the reference constants — **[RESULT] 2026-07-28**

`docs/tools/calibrate-pvp-refs.mjs` fits `REF_BLOCK`, `REF_PEN`, `REF_MISS` and
`REF_FIGHT_SEC` against duel rankings over a 16-build, two-class field, using
the same measurement module as the contract test. The duel engine does not read
these constants, so this is the detailed model judging the cheap one — it
depends on nothing the game might rebalance.

**The constants were not changed, and the evidence says they should not be.**

| Finding | Number |
|---|---|
| Shipped constants, balanced blend, 16-build field | ρ = 0.664 |
| Best grid refit | ρ = 0.696 (**+0.032**) |
| Same refit on the held-out 6-build contract field | ρ = 0.714 → **0.714** (no change) |

A refit that buys 0.03 on the field it was fitted to and exactly nothing on a
field it wasn't is noise, not signal. Two per-axis results say why:

| Constant | ρ span across its whole grid | Reading |
|---|---|---|
| `REF_FIGHT_SEC` | 0.736 | dominant — but see below |
| `REF_BLOCK` | 0.383 | **shipped 0.10 is already the grid maximum** |
| `REF_PEN` | 0.171 | fit drifts to the grid edge, i.e. not converging |
| `REF_MISS` | **0.024** | **not identifiable** — its value barely matters |

So `REF_BLOCK`'s "half the soft cap, halved for Warrior-only" guess landed on
the best available value, and `REF_MISS` is a number nobody needs to argue
about. That closes the part of audit F5 that was actionable.

#### What the residual disagreement actually is

Per-factor predictive power against duel win rate (16-build field):

| Factor alone | ρ |
|---|---|
| Damage Mitigation | **0.878** |
| Survivability | 0.564 |
| Maximum Damage | **−0.379** |

**Mitigation alone predicts duel outcomes better than the blend does.** The
damage factor is *anti*-predictive at equal budgets, which is not a defect —
these are equal-resource fights, so a build that spends everything on damage
has nothing left to survive with, and the slider is a statement of preference
rather than a prediction. It does mean a damage-heavy slider setting will
always look "wrong" against win rate (ρ ≈ −0.36), and **that must not be
calibrated away.**

The concentrated errors, balanced blend: control builds are under-ranked
(a miss/blind/paralyze Sentinel sits 10th by closed form and 2nd in duels) and
lifesteal builds are over-ranked (two sit 1st and 2nd by closed form, 4th and
9th in duels).

#### One candidate redesign is now ruled out

The obvious fix for the lifesteal over-ranking is to cap the healing term at
what a pool can actually absorb — `computeHps`-style totals ignore overheal
(§3), and the numbers are stark: the worst case credits healing at **19.4% of
max HP per second**, over 11× its own pool across a duel.

**Capping it makes agreement worse, monotonically, on both fields.**

| Overheal cap | ρ (16-build) |
|---|---|
| none (shipped) | 0.676 |
| 2× pool | 0.673 |
| 1× pool | 0.631 |
| 0.5× pool | 0.484 |
| 0.25× pool | 0.364 |

Held-out drops 0.714 → 0.600. Do not build this without new evidence: the
uncapped term is evidently carrying ranking information beyond literal healing
throughput, and clamping it destroys that without replacing it.

**Caveat on all of the above.** Sixteen builds is a small field and six is very
small; rank correlations at that size are noisy, and the two fields disagree
about whether mitigation alone beats the blend (0.878 vs 0.507). Treat the
direction as established and the magnitudes as indicative.

---

## 10. Constant register

Everything not already tabled above.

| Constant | Value | Where | Provenance |
|---|---|---|---|
| `TICKS_PER_SEC` | 400 | both sims | **[ASSUMED]** |
| `PVP_HEALTH_MULTIPLIER` | 8 | pvpSimulation | **[PATCH]** |
| paralyze duration | 2s | both | **[OBSERVED]** tooltip |
| `SIGIL_FIRST_HIT_DELAY_SEC` | 1s | both | **[OBSERVED]** in-game 59s mark |
| duel duration | 60s | pvpSimulation | **[OBSERVED]** |
| PVE fight duration | 60s | simulation | **[OBSERVED]** |
| default duel iterations | 1000 | runPvpSimulation | tuning |
| optimizer screen/confirm iterations | 150 / higher | pvpOptimizer | tuning |
| Drop Check MC iterations | 100 | dropGoals | tuning |
| mark shed rate | 1.75/s | PVP sigils | **[OBSERVED]** |
| max stacks (marks, hit-stacks) | 8 | PVP sigils | **[OBSERVED]** |

---

## 11. What would resolve the biggest doubts

In priority order. Note what is *not* on this list any more: "measure the game's
CP formula". Answers come from patch notes, from play, or from our own
simulation — never from re-deriving the game's internals (§4).

1. **Does the stat sheet show pre- or post-curve values?** (F7) — take a
   character whose raw Block is well past 40 and compare the sheet against
   `computePresetRawTotals`. Every Manual preset and every typed opponent
   depends on this answer, and it is one screenshot to settle.
2. **Do timed Attack % buffs add into the % total, or multiply the displayed
   Attack?** (F3) — the three engines do the latter, this document's stacking
   rule says the former, and they disagree by ~5% on high-Attack-% builds.
   A **[RULED]** answer closes it.
3. **Reference-opponent calibration** (F5, F6) — fit `REF_*` against gauntlet
   duel rankings instead of asserting them. Self-contained: our simulation
   judging our constants, no game archaeology.
4. **Is the tick rate 400/s?** (low stakes, wide blast radius if wrong.)

Already settled, kept here so they are not re-litigated: **double hits cannot
crit** and **penetration can crit** — both **[RULED]** 2026-07-28, both pinned
by tests.
