> **Status:** Current · **Last verified:** 2026-07-28
> **Covers:** mounts, glyphs, sigils and pets — the decision record AND the
> data derivations behind them, which are expensive to re-establish. Read
> before touching any of those four systems.

# BigReworkV1 — decision record

Source request: `EldarynTracker/BigReworkV1.txt`. This file records the
decisions and the data derivations behind them, so neither has to be
re-established from the raw scrapes. Companion to
`docs/goals-linking-redesign-notes.md`.

Status: **all four slices complete.** Baseline before starting was 69 test
files / 735 tests; after, 74 files / 823 tests, build green.

---

## What moved, and why it wasn't cosmetic

Three fields crossed the character-wide / per-preset boundary documented in
`model.js`'s header:

| Field | Before | After |
|---|---|---|
| Glyph equip state | character-wide `glyph.equipped` | **per mount** (`mount.glyphIds`) |
| Sigil tier | per sigil (`sigilValues[id].tier`) | character-wide `sigilForgeTier` |
| Pet tier + level | per pet (`pet.tier`, `pet.level`) | character-wide `petAltar {tier, level}` |

Each needed normalisation, a migration, and downstream updates in `totals.js`,
`optimizer.js` and `sigilEffects.js`.

---

## Data derivations (the expensive part to rediscover)

### Sigil base stats — `sigilsData.js:sigilStat`

```
stat(level, forgeTier) = floor( slope * (level + 9) * 3^(forgeTier - minForgeTier(rarity)) )
```

Two findings, both verified against all 331 usable rows of
`found_sigils.csv` (**317 exact on both Attack and Health**):

1. **The game truncates, it does not round.** Wild Renewal L7/T1 is
   `16.6 * 16 = 265.6`, displayed as 265. `Math.round` matched only 223/332
   Attack cells; `Math.floor` matches 310.
2. **Legendary and Ancient sigils can't be equipped below Forge Tier 2**, so
   their ×3 ladder starts there — at Forge Tier 2 a Legendary sits at `3^0`.
   The rarity slopes are therefore already "tier 2" values.

A tempting wrong turn: curve-fitting alone says the Legendary slopes are ×3 too
large (900/5800 fits 17/17 rows). That is numerically identical to the
`minForgeTier` reading but wrong about *why*, and it would have produced a
Legendary slope lower than Epic's at equal tier. The game rule settled it.

**Known residual:** 14 rows still differ — all Health at level 5 exactly, low by
1 (Common 1819 vs 1820), consistently across 6 sigils and both tiers. No choice
of slope/offset/rounding fixes them without breaking the other 317. Recorded as
a game quirk, asserted in the test as the *only* permitted deviation.

### Sigil effect magnitudes — `sigilsData.js:sigilEffectValue`

```
value(level) = base * (1 + 0.08 * (level - 1))   → clamp to cap → round to `decimals`
```

Reproduces **309 of 310** scraped magnitudes. The one miss is Sanguine Rush
lifesteal at L10, whose source text reads `lifesteal by25%` — run-together
digits that dropped a `.8`; every other level of that stat lands exactly.

Three things the data forced that a hand-written per-level table would have
hidden:

- **Caps are per sigil AND per stat, not global.** Iron Bastion's DMG Reduction
  caps at 35%, Warborn Fury's at 30%.
- **Display decimals vary.** Hawk Focus shows whole percents (0 dp), everything
  else 1 dp. The `notes` placeholder (`XX%` vs `XX.X%`) is a good hint.
- **One stat genuinely defies the law.** Sanguine Rush's attack speed steps
  20% → 30% at level 5 and is flat either side, identically at Tier 1 and
  Tier 2. It is an explicit `steps` override, not a fudged base.

Magnitudes depend on **level only, never tier** — checked across all 190
(sigil, level) groups; the only cross-tier differences are punctuation.

**Sigils level to 30**, but the scrape only ever reached 13. Levels 14–30 are
the same formulas extended: linear in `level + 9` for base stats, 8%-per-level
for magnitudes, with each stat's cap still binding (which is what keeps the
extension from running away). Sanguine Rush's step override is stored as
`stepsFrom` (a breakpoint → value map) rather than an enumerated table, so it
covers any max level.

**Still manual:** every damage figure (the scrape shows `X` placeholders, since
Spell Damage makes them unscrapeable) plus Warborn Fury's penetration, which
reads `?` at 19 of 24 levels because a game update reworked the stat.

### Major glyph values — `glyphsData.js`

Values are **absolute, not deltas**: "Cooldown -> 14S" means Warborn Fury's
cooldown *becomes* 14s, down from its catalogue 15s. Confirmed by cross-checking
every glyph against its sigil's own base value.

```
value(rarity) = from + step * rank      (Common = 1 … Legendary = 5)
```

`from` is the sigil's un-glyphed value where the glyph retunes an existing
parameter, or 0 where it adds a new effect. Self-consistent across all three
multi-rarity cooldown glyphs (Warhaste 1s off 15s, Cataclysmic 1s off 10s,
Ironclad 1.5s off 28s) and reproduces all 35 observed cells.

Coverage is sparse — most families were seen at only 1–3 of 5 rarities — so the
rest are **extrapolated**. Each family lists the rarities actually seen in
`observedRarities` (e.g. `['Common', 'Uncommon']`); anything outside that list
is projected from the line above, which the UI shows as "estimated values".

*(Corrected 2026-07-28: this said the flag was `observed: false`. The field is
and always was `observedRarities`, an allow-list of the rarities that were
measured.)*

`found_glyphs.csv`'s "Equippable in" column is a **sigil name** (all 12 distinct
values match a sigil exactly). That is what makes a major glyph a sigil
modifier rather than a stat source.

### Pet primary stats — `petsData.js`

A companion's Attack and Health are **deterministic**, not rolled:

```
stat(tier, level) = round( tierMultiplier(tier) * (slope * level + icpt) )
```

Perfectly linear in level — R² ≈ 1.0 across all 34 companions — scaled by a
per-tier multiplier. The `{slope, icpt}` stored in `COMPANION_DEFS` are the
**tier-1 fit**, so `companionStat()` reproduces the in-game numbers to within
display rounding. Levels run 1..`COMPANION_MAX_LEVEL`.

**The tier multiplier was rebalanced by the game.** It used to be exponential,
`3^(tier-1)` — ×2187 at Tier 8, which drowned out every other stat in a build.
The "Pet Altar Evolve Rebalance" patch replaced it with a gentle quadratic; the
current shape is `COMPANION_TIER_MULTIPLIER`. If pet contributions ever look
absurd relative to gear again, this is the first constant to re-check against
the game.

### Pet secondary rolls — `petsData.js`

Secondaries are **not a curve**. Every companion draws from the same 16-stat
pool, and a value is a random roll that does *not* scale with tier or level —
only a global observed min..max range exists (`SECONDARY_STAT_RANGES`). Hence
the UI: pick which secondaries the pet actually rolled, then set each on a
bounded slider.

How many secondary slots a pet has comes from its **rarity**
(`PET_SECONDARY_SLOTS_BY_RARITY`). Rarity is not in the scraped data, so for a
custom pet it stays a user choice; a catalogue pet takes it from the catalogue.

One roll is deliberately **manual** rather than ranged: Penetration, whose
scraped 0.1–14.6 envelope predates the Penetration Rework and was never
re-sourced. It carries `manual: true` and renders as a typed field.

### Pet tier-1 / tier-2 pairs — `petsData.js`

The catalogue is **18 pairs**: each pair shares one stat curve, and in
`eldaryn.db` the two members appear at *disjoint* tiers — one at tier 1 only,
its partner at tier ≥2 only. That is exactly the tier-1/tier-2 availability
split the game exposes, and it matches the tier-1 list in BigReworkV1.txt.

Two pairs were incomplete in the scrape: **Pyre Toad** (↔ Flame Toad) and
**Gloomwing** (↔ Gloom Bat) had no rows at all. They inherit their partner's
curve — safe precisely because pair members share one.

### OCR artefacts to expect in these sources

`O.4s` for `0.4s` · `lron Bastion` for `Iron` · `1.778` for `1.77` ·
`203 THORNMAIL` junk prefix · `by25%` for `by 25.8%` · `INFERNAL HELIHOUND`.
The CSVs are hand-cleaned exports of `eldaryn.db`; where they disagree, the CSV
was treated as authoritative (it was curated, and carries two glyphs the DB
lacks).

---

## Decisions

**Glyphs**
- Slots are **per mount: 3 minor + 2 major + 1 mythic** = the six slots a card
  shows. `tierCaps` reused unchanged, re-scoped from character to mount.
- **Strategically meaningful** because presets ride different mounts: the
  high-HP mount can carry defensive glyphs while another preset's mount carries
  offensive ones. (My initial read — that unlimited sharing made mount-binding
  pure bookkeeping — was wrong.)
- A major glyph is **inert unless its sigil is equipped** *and* it sits on the
  ridden mount. Both gates are surfaced in the UI, not silent.
- Major glyphs are **catalogue picks carrying no stat**; minor glyphs stay
  free-form `{statKey, value}`. Mythic unchanged — none exist in game yet.
- Each variant has a stable id (`warhaste-emblem:rare`) so a glyph stays one
  opaque string everywhere it was already referenced. `resolveMajorGlyph`
  tolerates the legacy `ember-curse-glyph` id on read, since ids also arrive
  from places that never pass through normalisation.
- **Migration drops all equip state, keeps the inventory** — a deliberate,
  visible one-time reset.

**Mounts**
- **`star = 0` means not owned.** The separate `owned` flag is deleted, not kept
  in sync. Clicking the star that IS the current value returns to 0 — from any
  star, so the lit 2nd star of a 2-star mount un-owns it.
- **Star hit areas must tile, never overlap.** The first version kept a 22px
  button and grew the target with `::before { inset: -11px }`, making each area
  44px wide on a 24px pitch — later siblings paint on top, so the right 20px of
  every star triggered the *next* one and the 2nd/3rd stars felt unclickable.
  The button itself is now the target (28px, 40px on mobile) and `::before`
  expands vertically only. jsdom can't catch this (`.click()` skips hit-testing),
  so it was verified in Chromium via `elementFromPoint`.
- Cards always render **5 stars**; levels without catalogue data use Lucide
  `star-off` and are unclickable (3/4/5 on Common–Rare, 4/5 on Epic).
- The **6 mounts with art but no data** stay out of the catalogue
  (`abyss_ray`, `bone_wyvern`, `celestial_moth`, `ember_wyvern`,
  `sunfire_phoenix`, `void_manta`) — unreleased higher-rarity art.

**Sigils**
- Rarity sections run **Common first** (ascending), the opposite of the Glyphs
  page. Ancient conduits close the page.
- **Ancient conduit sigils** (Warrior: Earthwarden `1:1`, Flameborn `27:1`;
  Sentinel: Stormcaller `1:1`, Flameborn `27:1`) need Forge Tier 2 **and** their
  Transcendence node. Their "once per fight, no cooldown" transform has no shape
  the uptime model can express (`cooldownSec: 0` would read as infinite
  uptime), so they are marked not-simulated while their passive stats still
  count. Stormcaller was never scraped — manual entry.
- The `berserkt-stance` id keeps its typo (it's a persisted key); only the
  display name was fixed, with an asset alias.

**Pets**
- **Changing the Pet Altar tier wipes the collection** (game behaviour), behind
  a two-step confirm that names the consequence, and nulls every
  `preset.petId`. Changing altar *level* does not wipe.
- **Rarity is catalogue data**, not a user choice; it decides the
  secondary-slot count, and repointing a pet trims excess rolls.
- **"Edit Mode" is a view toggle**, not a commit — edits persist as made, so
  there is no draft to lose and no Cancel to reason about.

**Cross-cutting**
- Rarity colours: exact hex on **large** text (card titles, stars — all 10 tiers
  clear 3:1), and a lightened `-fg-strong` for normal-size text. Measured
  failures at normal size: Rare 3.38, Epic 3.37, Eternal 3.87, Oblivion 4.36.
  Only those four shift, and only slightly. `Oblivion` is new to `RARITIES`.
- Sliders: a native range thumb is **edge-aligned inside its own track**, so its
  centre can never reach either end — that is the "feels stuck" gap, and no
  amount of styling the native track fixes it. `Slider.svelte` overlays the
  input one thumb-width wider than a separate visible track. Verified in
  Chromium: knob centre lands at 0.0px from both ends.
- Tests: screen tests were rewritten against new DOM;
  `model`/`totals`/`optimizer`/`sigilEffects` treated as regression fences.

---

## Bugs found along the way (pre-existing, unrelated to the request)

- `PresetsScreen`'s mount tile counted `m.baseHpPct || m.baseAtkPct` — legacy
  *saved* fields that normalisation never writes, so it always read 0.
- The optimizer's `sigilHasAnyValue` pool filter counted a manual value for a
  stat that `totals.js` derives, so it could offer a sigil contributing nothing.
- A level-0 sigil's manual percentage used to contribute, contradicting the
  documented "level 0 = not owned" rule that `attack`/`health` already followed.

---

## Penetration Rework — source rescale status

Caps (60/90 -> 25/50, then walked back up to **30/70** in a Jul 2026 follow-up
patch) and the crit-on-pierce mechanic are done. The rework also scaled the
SOURCES down; those are being re-sourced from the game one at a time. The
follow-up only moved the caps — it did not re-scale any source, so the rows
below still stand.

| source | status |
|---|---|
| Relics — Crimson Edge, Viper Glyph | **done** 12->24 became 6->10 |
| Relics — Dragon Core, Void Arrow | **done** 12->50 became 6->22 |
| Awakening (Shadow) | **done** 1.5 -> 0.6 per point |
| Transcendence nodes | **done** — confirmed unchanged by the patch: still 21x `+1` and 1x `+2` per tree (+23 total) |
| Pet secondary roll | **done (manual)** — the stale 0.1 -> 14.6 envelope is gone; `SECONDARY_STAT_RANGES` marks penetration `manual: true`, so PetCard types the value instead of sliding it |
| Warborn Fury active | **done (manual)** — unscraped (`?` at 19 of 24 levels), so `sigilEffectValue` returns null and SigilsScreen already renders a typed field |
| `pvpArchetypes.js` Penetrator | **PENDING** — still 85, above the new hard cap of 70 |

Two sources are deliberately manual rather than re-sourced: no scraped curve
backs them, and inventing one would be worse than typing the number the game
shows. Both are one-line reversions if the scaling ever lands (drop `manual:
true`, restore a range; fill in Warborn Fury's level table).

The archetype row matters for the gauntlet: a reference opponent carrying 85
penetration is now unreachable in game, so duels against it are unrealistic.

## Open items (non-blocking)

- **Mythic glyphs**, **Legendary glyph rarities**, and the **6 unreleased
  mounts** all await data.
- **Stormcaller** has art and a Transcendence node but no scraped stats.
- The **14 level-5 Health rows** remain unexplained.
- `assets.js` globs eagerly, so **all ~222 PNGs ship to `dist`** (~20 MB)
  including 20 for two unimplemented classes. Page load is unaffected (separate
  files, fetched on demand); only the deploy carries the weight.
- Warborn Fury penetration and every sigil damage figure stay manual.
