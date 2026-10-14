# GitHub issue triage — 2026-07-29

**Status: investigated, not started.** All 10 open issues on
`github.com/OrionAF/Eldaryn-Workshop` were pulled and traced to code. Every
root cause below was read out of the source, not guessed. Nothing here has
been fixed yet.

Two issues carry decisions only the user can make (#3 scope, #10 confirmation)
— they are marked and repeated at the bottom.

**One issue overturns a documented finding.** #10 shows that the "OCR glitch"
explanation in `Reference/Notes/big-rework-v1-notes.md` is wrong: that cell was
real data. See §10 — a doc correction and a test rewrite ride along with the
fix.

---

## Summary

| # | Title | Kind | Area | Root cause found | Blocked |
|---|---|---|---|---|---|
| 1 | Wrong pet name on a saved pet | bug | Pets | `rosterStore.svelte.js:171` | — |
| 2 | Sliders hard to use on wide ranges | bug/UX | Slider | design gap, not a defect | — |
| 3 | Forge tier should wipe sigil data | bug | Sigils | `rosterStore.svelte.js:550` | scope Q |
| 4 | "not owned" text placement | enhancement | Sigils | `SigilsScreen.svelte:146-157` | — |
| 5 | Leading `·` before cooldown | bug | Sigils | `SigilsScreen.svelte:230-237` | — |
| 6 | Replace `XX` in sigil descriptions | enhancement | Sigils | `sigilsData.js` `notes` | — |
| 7 | Remove border around images | bug | all cards | 4 × `outline:` rules | — |
| 8 | New-character flow is ugly | enhancement | shell | `Sidebar.svelte:198-206` | — |
| 9 | Missing major glyph (Festering Coil) | data | Mounts/Glyphs | needs a new effect kind | — |
| 10 | Incorrect sigil stat (25.8% vs 25%) | bug | Sigils | missing `cap: 25` | confirm |

**Suggested batching.** #4, #5, #7 are one small Sigils/CSS pass. #6 and #10
both touch `sigilsData.js` and should land together. #1 is a two-line fix. #3,
#8, #9 and #2 are each their own slice, largest last (#2).

---

## 1 — Wrong pet name on a saved pet

*bug · page/pets · reported: every saved pet displays "Dust Stalker"*

### Root cause — confirmed

`PetsScreen.addPet()` (`PetsScreen.svelte:39-43`) seeds the new pet with the
first companion available at the current altar tier:

```js
const first = available[0];
const id = rosterStore.addPet({ companionId: first?.id ?? null });
```

`newPetEntry` (`model.js:136`) then stamps `name: name || def?.name || 'New Pet'`
— so the pet is born already named **"Dust Stalker"** (the first tier-1
companion).

Picking a different companion calls `setPetCompanion`, which guards the name
(`rosterStore.svelte.js:171`):

```js
if (!pet.name || pet.name === 'New Pet' || pet.name === 'Pet') pet.name = def.name;
```

"Dust Stalker" is none of those three, so the name is never updated. Edit mode
renders the `<select>` bound to `companionId` (correct), display mode renders
`pet.name` (`PetCard.svelte:78`, stale) — which is exactly the before/after the
screenshots show.

That guard exists to protect a user-chosen name, but **catalogue pets have no
rename UI**: `updatePetField` is exported and never called for `name`, and
`PetCard` shows the name as an `<h3>`, not an input. Only custom (non-catalogue)
pets display a `custom-name` (`PetsScreen.svelte:154`). So for a catalogue pet
`pet.name` is dead state that can only ever go stale.

### Proposed fix

Make the displayed name derive from the companion rather than from persisted
state — the pet's identity *is* its `companionId`:

1. `PetCard.svelte:78` → `{def?.name ?? pet.name}` (falls back for custom pets).
2. `rosterStore.svelte.js:171` → set `pet.name = def.name` unconditionally, so
   persisted state stops drifting from the catalogue.

Keeping the guard is not worth it until a rename affordance actually exists;
if one is added later, the right shape is a separate `customName` field so
"which companion is this" and "what did the user call it" stop competing for
one slot.

Also check `optimizer.js:1277,1350` and `PresetEditor.svelte:225`, which read
`pet.name` for build summaries — they inherit the same wrong name today and are
fixed for free by step 2.

**Risk:** low. Existing saves keep their wrong names in `localStorage` until
the companion is next changed; step 1 makes them display correctly regardless.

---

## 2 — Difficult using sliders with a wide min/max range

*bug · page/pets · ui_component*

### What's actually happening

Not a defect — a resolution mismatch. `SECONDARY_STAT_RANGES`
(`petsData.js:146-166`) spans a 32× difference in step count:

| Secondary | Range | Steps |
|---|---|---|
| Attack Speed | 0.1 – 32.0 | 320 |
| Spell Damage | 2.6 – 30.7 | 282 |
| Health % | 0.1 – 22.6 | 226 |
| Attack % | 0.1 – 21.0 | 210 |
| … | | |
| Paralyze Chance | 0.2 – 1.2 | 11 |

`Slider.svelte` is the same physical width in both cases, and inside a pet card
it is narrow (`PetCard.svelte` `.sec-slider`). At ~110 px of track, Attack Speed
is ~3 steps per pixel — single-stepping by mouse is impossible; Paralyze Chance
is ~10 px per step and feels fine.

Keyboard already works (arrow keys move exactly one `step` on a native range
input), but there is no discoverable pointer-free path and no typed entry.

### Proposed fix — the user's own suggestion, done carefully

Make the value readout to the right of the slider an editable field that stays
two-way bound with the slider. The pieces that need care:

- **Where it lives.** The readout is `PetCard.svelte`'s `.sec-value` span, but
  `Slider.svelte` is shared by `DropCheckScreen`, `PresetEditor`,
  `MountCard`, `GoalSliders` and `SimulationScreen`. Either add an opt-in
  `editable` prop to `Slider.svelte` (one implementation, one set of parsing
  rules) or build it only in `PetCard`. **Recommend the shared prop** — the
  same complaint applies anywhere a range is wide, and a second bespoke
  numeric input is exactly the ad-hoc pattern `app.css`'s conventions warn
  against.
- **Parsing.** Must go through `parseStat`/`formatStat` (`format.js`), because
  percentage stats use `.` as a decimal point while flat stats use `.` as a
  thousands separator (data-model conventions, CLAUDE.md).
- **Clamping.** Type-then-blur must clamp to `[min, max]` and snap to `step`,
  but must NOT clamp mid-keystroke (typing "1" on the way to "12" would
  otherwise be rewritten). Commit on `change`/blur, not `input` — the existing
  level inputs on `SigilsScreen` already use `onchange` for this reason.
- **Manual secondaries.** `penetration` is `manual: true` (no `max`) and
  already renders as a typed field with no slider — that path must keep
  working unchanged.
- **Tabular numerals.** The field is numeric data, so it needs `--font-data`
  per the styling conventions.

**Optional companion change:** a coarse/fine modifier is not worth building,
but widening `.sec-slider` in the pet card, or dropping to a per-row layout,
buys back resolution for free and should be evaluated first.

**Risk:** medium — touches every slider call site if done as a shared prop.
Wants tests in `Slider`'s consumers, and a `PetCard.test.js` case for
type-and-commit.

---

## 3 — Increasing the Sigil Forge tier should wipe sigil data

*bug · page/sigils*

### Current behaviour

`setSigilForgeTier` (`rosterStore.svelte.js:550-555`) only clamps and stores
the number. Nothing is cleared, and `SigilsScreen.svelte:103-113` wires the
± buttons straight to it — no confirm step.

The pet altar shows the pattern to copy. `setPetAltarTier`
(`rosterStore.svelte.js:195-207`) empties the collection, nulls every
`preset.petId` so no dangling reference survives, and returns the count
removed; `PetsScreen.svelte:63-77` puts a two-step confirm in front of it with
an explicit `role="alert"` panel naming what is lost.

### What "wipe" means for sigils

Per-sigil state lives in `character.sigilValues[defId]` and holds:

- `level` (the sigil's own level, 0 = not owned)
- `passive` / `active` — the hand-typed stat values for anything not derived
- `damage`, `tickDamage`, `regenDebuffPct` — the "YOUR NUMBERS" inputs

The issue asks for all three groups to reset. There is a second dangling
reference to handle that the pet altar's version has: `preset.sigilIds` points
at sigils that would drop to level 0. Sigils at level 0 aren't deleted (they
still exist in the catalogue), so unlike pets there is no *broken* reference —
but leaving a wiped sigil equipped means a preset silently equips a level-0
sigil contributing nothing.

### Proposed fix

1. `setSigilForgeTier` clears every `character.sigilValues` entry back to
   `emptySigilValues(def)` and returns how many owned sigils (level > 0) were
   reset, mirroring `setPetAltarTier`'s return contract.
2. `SigilsScreen` gains a `confirmingTier` state and a `.tier-warning` panel
   copying `PetsScreen.svelte:114-125`, including the "no data to lose → just
   do it" shortcut when nothing is owned.
3. Decide `preset.sigilIds` (see open question).

**Open question for the user — blocks step 1:**

- The issue says *increasing*. The pet altar wipes on **any** tier change,
  including a decrease. Should lowering the Forge tier also wipe, or only
  raising it? (Lowering already invalidates Legendary/Ancient sigils, which
  need tier ≥ 2.)
- Should equipped sigils be **unequipped** from presets on a wipe, or stay
  equipped at level 0?

**Risk:** low once the questions are answered; it is destructive, so the
confirm panel and its test matter more than the store change.

---

## 4 — "not owned" should replace the Attack/Health line

*enhancement · page/sigils*

### Current behaviour

`SigilsScreen.svelte:146-149` renders the caption inside `.level-row`, to the
right of the stepper:

```svelte
{#if level === 0}<span class="level-caption">not owned</span>{/if}
```

`.level-row` is `justify-content: center` (line 376-381), so adding a sibling
shifts the stepper left off-centre — exactly what the screenshot shows.

Immediately below, the Attack/Health line (lines 151-157) renders
`Attack: 0 | Health: 0` at level 0, because `sigilStat` returns 0 for
`level < 1`. Two adjacent elements both saying "this sigil has nothing".

### Proposed fix

Delete the `level-caption` span, and make the base-stats block a conditional:

```svelte
{#if hasSigilCurve(def)}
  {#if level === 0}
    <p class="base-stats not-owned">not owned</p>
  {:else}
    <p class="base-stats">Attack: … | Health: …</p>
  {/if}
{/if}
```

Edge case worth deciding: a sigil with **no** rarity curve (`hasSigilCurve`
false) renders no base-stats line at all, so it would lose the "not owned"
signal entirely. Check whether any class sigil lacks a curve — if so, render
the `not-owned` line whenever `level === 0`, regardless of the curve.

`SigilsScreen.test.js` will need its "not owned" assertion re-pointed.

**Risk:** trivial.

---

## 5 — Leading `·` in front of the cooldown

*bug · page/sigils*

### Root cause — confirmed

`SigilsScreen.svelte:230-237`:

```svelte
{#if def.active.durationSec > 0}{def.active.durationSec}s duration{/if}
{#if def.active.cooldownSec > 0}
  · {def.active.cooldownSec}s cooldown{#if uptime != null}&nbsp;· {uptime.toFixed(0)}% uptime{/if}
{/if}
```

The `·` is hardcoded onto the cooldown branch. When `durationSec === 0` (a
nuke: Blade of Judgment, Cataclysm, Crimson Arrow, Hemorrhage, Thunderbind)
the first branch renders nothing and the separator leads.

`uptimePct` already returns `null` when `durationSec` is 0, so the third
segment correctly hides — only the middle separator is wrong.

### Proposed fix

Make the separator conditional on the preceding segment having rendered:

```svelte
{#if def.active.cooldownSec > 0}
  {#if def.active.durationSec > 0}· {/if}{def.active.cooldownSec}s cooldown…
{/if}
```

A whitespace-only Svelte block is fiddly to read; building the string in a
small `timingLabel(active, uptime)` helper that joins non-empty parts with
`' · '` is cleaner and directly testable. **Recommend the helper.**

**Risk:** trivial. Add a `SigilsScreen.test.js` case asserting a nuke's timing
line starts with the cooldown.

---

## 6 — Substitute real values into the `XX` placeholders

*enhancement · page/sigils*

### Current behaviour

`def.notes` is the verbatim in-game tooltip, kept as ground truth
(`sigilsData.js` header), with `XX` / `XX.X` where a number belongs. It renders
raw at `SigilsScreen.svelte:241-243` and again in `PvpScreen.svelte:1215`.

### What's available to substitute

Every number a placeholder wants is already reachable, from three sources:

- `sigilEffectValue(def, statKey, level)` — the baked, level-derived magnitudes
- `character.sigilValues[id][effectType][statKey]` — hand-typed stat values
  (only `warborn-fury`'s `penetration` and `stormcaller`'s transform %s)
- `character.sigilValues[id].{damage,tickDamage,regenDebuffPct}` — the
  "YOUR NUMBERS" inputs

I checked every sigil in both classes: **the `XX` count always equals the
number of available values**, so no sigil has an unfillable placeholder and
none has a spare value.

| Sigil | `XX` | fills with (in text order) |
|---|---|---|
| `warborn-fury` | 3 | `attack_pct`, `penetration`, `dmg_reduction` |
| `iron-bastion` | 3 | `health_pct`, `dmg_reduction`, `block_chance` |
| `withering-touch` | 2 | `damage`, `regenDebuffPct` |
| `hemorrhage`, `venom-wound`, `ember-curse` | 2 | `damage`, `tickDamage` |
| `sanguine-rush` | 2 | `speed`, `lifesteal` |
| the 1-placeholder sigils | 1 | their single baked stat, or `damage` |

### The trap: order cannot be inferred

Most sigils happen to match declaration order (`passive.stats`, then
`active.stats`, then damage fields). **`withering-touch` does not** — its
tooltip reads *"Deals XX damage. Reduces enemy HP Regen by XX% for 8s."*, so
`damage` comes first and the baked `regenDebuffPct` second. Any rule of the
form "stats, then damage" produces a wrong description for it, silently.

### Proposed fix

Add an explicit ordered slot list to each sigil def in `sigilsData.js` —
one entry per `XX`, naming what fills it:

```js
notes: 'Deals XX damage.  Reduces enemy HP Regen by XX% for 8s.',
noteSlots: ['damage', { effect: 'regenDebuffPct' }],
```

Then a `describeSigil(def, values, level)` helper in `sigilsData.js` walks the
`XX`/`XX.X` matches in order and swaps each for its slot's value.

Rules the helper must follow:

- **Zero keeps the placeholder.** Per the issue: substitute only when the
  value is `> 0`; otherwise leave `XX`. That covers level-0 sigils (baked
  values return 0) and un-entered damage figures alike.
- **Honour the placeholder's decimals.** `XX%` and `XX.X%` are not
  interchangeable — the notes' own placeholder shape is what encodes each
  stat's display precision (documented in `big-rework-v1-notes.md`, and it's
  what `SIGIL_EFFECTS.decimals` was fitted against). Format to `XX.X` = 1 dp,
  `XX` = 0 dp.
- **Flat damage uses `formatFlat`**, not percentage formatting — the thousands
  separator gotcha.

A test asserting `noteSlots.length === (notes.match(/XX(\.X)?/g) || []).length`
for every sigil in both classes keeps the table honest as sigils are edited.

`PvpScreen.svelte:1215` should use the same helper so the two renderings can't
drift.

**Risk:** low; contained to one data file plus one helper. The `noteSlots`
table is 26 short entries and is mechanical to write from the table above.

---

## 7 — Remove the black border around images

*bug · page/all*

### Root cause — confirmed

Four identical copies of the same rule, one per card component:

- `GlyphCard.svelte:105`
- `MountCard.svelte:123`
- `PetCard.svelte:199`
- `SigilsScreen.svelte:364`

```css
outline: 1px solid rgba(0, 0, 0, 0.25);
outline-offset: -1px;
```

Hardcoded `rgba` rather than a design token, which is itself against the
styling conventions (`app.css` `:root` tokens). There is no global `img` rule
in `app.css` — these four are the whole story.

### Proposed fix

Delete the `outline` / `outline-offset` pair from all four. Keep
`border-radius: var(--radius-field)` and `object-fit: contain`.

Worth doing in the same pass: the four `.*-art` blocks are otherwise
near-identical (size aside). Hoisting the shared parts into one `.card-art`
class in `app.css` would stop the next such fix from needing four edits — but
that's a judgement call, and four deletions is a valid answer if the sizes are
meant to stay independent.

**Risk:** trivial. Visual-only; no test asserts on the outline.

---

## 8 — Adding a new character should open a welcome-style page

*enhancement*

### Current behaviour

"+ New Character" (`Sidebar.svelte:198-206`) opens a cramped inline
`.edit-panel` inside the character picker: a bare name input, Create, Cancel.
`confirmNewCharacter` (`Sidebar.svelte:93-99`) calls `rosterStore.addCharacter`,
which pushes the character **and switches to it** (`rosterStore.svelte.js:71-77`)
— with no class set.

`App.svelte:41` then computes `profileReady = !!character.class`, and since it's
false the whole app is replaced by this (`App.svelte:105-109`):

> Choose a class for this character to get started — open ⇄ Change character in
> the rail, click the ✎ next to the character, and pick a class.

So the user is bounced out of their working character, given no class picker,
and told to go back into the rail they just left. That is the "not UX healthy
and rather ugly and confusing" the issue describes.

`WelcomeScreen.svelte` already solves exactly this for the first character —
name + class up front, so the created character is immediately `profileReady`
(its header comment says so).

### Proposed fix

Reuse `WelcomeScreen` for both cases by giving it a mode.

**Props:** `mode: 'first' | 'additional'` (or equivalently `oncancel`, whose
presence implies the additional-character case).

**Copy changes, per the issue:**

| Element | first run | adding another |
|---|---|---|
| `h1` | `Welcome` | `New Character Profile` |
| `.subtitle` | `Create your first character **profile** to get started.` *(also changed)* | `Create your new character profile to get started.` |

Name input, class `<select>`, Get started, Import from file and its hint all
stay. Below them, in the additional-character mode only, a new
**"Cancel and go back"** button returning to the previously selected character.

**Wiring:**

- `App.svelte` needs a third state beyond "roster empty" / "normal shell" —
  e.g. `let creatingCharacter = $state(false)` set by a callback the `Sidebar`
  raises instead of opening its inline panel. When true, render
  `<WelcomeScreen mode="additional" … />` in place of the shell.
- Cancel must restore the previous character. Since nothing has been created
  yet at that point, the simplest correct version is: don't call `addCharacter`
  until "Get started" is pressed, and have Cancel just clear
  `creatingCharacter`. That avoids needing to remember and re-select a
  previous id, and avoids ever creating a class-less character.
- Delete the `newCharacterOpen` / `newCharacterName` state and the inline panel
  from `Sidebar.svelte`; the button becomes a plain callback.
- Import in this mode goes through `rosterStore.importFromJson`, which
  **replaces the whole roster**. On first run that's harmless; from inside an
  existing roster it silently destroys the user's other characters. Either
  hide the import block in `additional` mode, or put a confirm in front of it.
  **Recommend hiding it** — the issue asks to keep it, but "import replaces
  everything" is not what "add a character" implies, and the rail already has
  its own import. Worth raising with the user rather than deciding silently.
- The `onboarding-hint` block in `App.svelte:105-109` becomes unreachable for
  new characters, but is still reachable for old saves whose character has no
  class. Keep it.

**Risk:** medium — touches the app shell's top-level branching. Wants tests in
`WelcomeScreen` (both modes' copy, cancel callback) and `Sidebar.test.js`
(the button now raises a callback rather than opening a panel).

---

## 9 — Add the missing major glyph "Festering Coil"

*page/mount_glyphs · Missing Glyph*

### Reported

| field | value |
|---|---|
| Name | Festering Coil |
| Rarity | Common |
| Applies to | Venom Wound |
| Description | *Venom Wound becomes a permanent stacking poison. Its stacks never fade, building up to 3.* |

### Why this is not a one-line data addition

Every existing family in `MAJOR_GLYPH_FAMILIES` (`glyphsData.js:55-176`)
retunes a **numeric parameter** of a sigil whose mechanic kind stays the same:
`cooldownSec`, `maxStacks`, `tickDamagePct`, `stackDecaySec`,
`thornsPerStackPct`, `paralyzeSec`, `paralyzeOnHitSec`,
`attackSpeedWhileActivePct`, `reflectWhileActivePct`.

Festering Coil changes Venom Wound's **kind**. Today
(`sigilEffects.js:151`):

```js
'venom-wound': { kind: 'dot', tickIntervalSec: 1 },
```

`'dot'` = up-front damage, then `tickDamage` every second for `durationSec`
(10s), on a 13s cooldown — so it is *not* permanent, and it does not stack.
The glyph turns it into a stacking DoT with a ceiling of 3 whose stacks never
expire — closest to the existing `'stacking-dot'` kind, except that kind's
stacks are already documented as "never decays" within a fight, and here the
*poison itself* also stops expiring.

`applySpecialGlyphsToMech` (`sigilEffects.js:71-80`) can only override
`maxStacks` and scale `tickDamage`. It has no way to change `kind`, so
declaring the glyph with `maxStacks: { flat: 3 }` alone would leave Venom Wound
a plain 10-second DoT — the glyph would be silently inert in the simulation
while looking correct in the UI. That's the failure mode to avoid.

### Proposed fix

1. **New effect kind** in `glyphsData.js`, e.g.
   `becomesPermanentStackingDot: { flat: 3 }`, documented in the effect-kind
   list at the top of the file alongside the others.
2. **Family entry**, `observedRarities: ['Common']` — only Common was
   reported, so every other rarity is projected. The rarity line is the open
   part: the value that scales is presumably the stack ceiling, but with a
   single observation there is no line to fit. Recording it as `flat: 3` is
   honest (it says "we saw 3, we don't know how it scales") and matches how
   `maxStacks` is already handled for Emberhoard/Hemorrhagic Excess, which are
   flat across two observed rarities.
3. **`applySpecialGlyphsToMech`** learns to switch `kind` to `'stacking-dot'`
   and set `maxStacks` when this effect is present. The `'dot'` branch of the
   sim (`sigilEffects.js` ~line 409) already handles stacking, so most of the
   machinery exists.
4. **Permanence.** "Stacks never fade" needs the DoT to keep ticking past
   `durationSec` for the rest of the fight. Check whether the tick loop bounds
   ticking by duration; if so it needs an "unbounded" path. This is the part
   with real work in it.
5. **`describeEffects`** gets a line so the glyph card reads sensibly.
6. `glyphsData.test.js` validates families against
   `EldarynTracker/found_glyphs.csv`. This glyph is **not in the CSV** — it was
   reported by hand. Either add the row to the CSV (keeping the test's
   "the scrape is the spec" contract intact) or explicitly exempt it. Adding
   the row is better; the CSV is the source of truth the test reads.

**Risk:** medium. Steps 1-2 are data; steps 3-4 touch the sim and want their
own `sigilEffects.test.js` cases. Landing the data without the sim support is
worse than not landing it, because the UI would then promise an effect the
numbers don't include.

---

## 10 — Incorrect sigil stat — and a documented finding that was wrong

*bug · page/sigils · **highest-value issue in this batch***

### Reported

Both at Forge Tier 2, sigil level 10:

| Sigil | Stat | Game says | Tool says |
|---|---|---|---|
| Sanguine Rush | lifesteal | **25%** | 25.8% |
| Phantom Veil | miss chance | **25%** | 25.8% |

### Root cause — confirmed, and it overturns a doc

Both stats are `{ base: 15, decimals: 1 }` in `SIGIL_EFFECTS`
(`sigilsData.js`), with **no `cap`**. The growth law is
`base * (1 + 0.08 * (level - 1))`, so level 10 → `15 × 1.72 = 25.8`.

The formula is right. The **cap is missing** — both stats stop at 25%.

This matters beyond the two numbers. `Reference/Notes/big-rework-v1-notes.md`
§"Sigil effect magnitudes" currently says:

> Reproduces **309 of 310** scraped magnitudes. The one miss is Sanguine Rush
> lifesteal at L10, whose source text reads `lifesteal by25%` — run-together
> digits that dropped a `.8`; every other level of that stat lands exactly.

I re-read `EldarynTracker/found_sigils.csv`. That row is real:

```
Sanguine Rush, Tier 2, Level 10 — "Increases Attack Speed by 30%, lifesteal by25% for 6s. 14s cooldown."
```

It was the **only** scraped cell above level 9 for either stat (Phantom Veil's
scrape stops at L9 = 24.6%, Sanguine Rush's at L10). The single data point that
would have revealed the cap was explained away as an OCR artefact, and the
explanation was written into the notes *and* asserted in the test
(`sigilsData.test.js:206-210`) as a known exception:

```js
{ name: 'Sanguine Rush', level: 10, key: 'lifesteal', want: 25, got: 25.8 },
```

The user's report of **Phantom Veil** independently showing 25% at L10 is the
second data point. Two unrelated sigils, same `base: 15`, both landing on
exactly 25 where the uncapped law predicts 25.8 — that is a cap, not an OCR
glitch twice.

### Proposed fix

1. `sigilsData.js` — add `cap: 25` to `sanguine-rush.lifesteal` and to
   `phantom-veil.miss_chance`.
2. `sigilsData.test.js:180-210` — the "reproduces every scraped magnitude
   except one OCR-mangled cell" test now has **no** exception. Delete the
   allowance, rename the test, and assert 310/310. Add a direct case pinning
   L10 = 25 for both stats.
3. `Reference/Notes/big-rework-v1-notes.md` — correct the passage above, in the
   same dated-correction style already used in that file for the
   `observedRarities` fix. It should say the law reproduces all 310 cells once
   the 25% cap is included, and record that the cap was found from a user
   report on 2026-07-29, not from the scrape.

### Also check while in here

Nothing else in `SIGIL_EFFECTS` is uncapped and reaches 25% inside the scraped
range, so no other stat is *known* wrong. But the same blind spot applies to
every uncapped entry whose scrape stopped early — `mist-veil` (base 8, scraped
to L13 = 15.7%), `blinding-mark` (base 30, scraped to L7), `wild-renewal`
(base 5, scraped to L9), `hawk-focus` (base 10, scraped to L12),
`defense-stance` / `berserkt-stance` / `rejuvenation` (scraped to L13). Sigils
level to **30**; the scrape never passed 13. Any of these could hit an
unobserved ceiling. Worth a line in the notes flagging uncapped stats as
"cap unknown above the scrape" rather than "uncapped".

**Open question for the user — worth confirming, does not block:** does
Sanguine Rush's lifesteal (or Phantom Veil's miss chance) still read **25%** at
level 11 or above? If yes, `cap: 25` is confirmed outright. If it reads 27%,
the growth law itself is wrong above L9 and the fix is different. A cap is by
far the more likely reading — it matches Iron Bastion's 35%/50% and Warborn
Fury's 30% — so the fix can land now and be re-checked when a higher level is
seen.

---

## Blocked on the user

1. **#3** — should *lowering* the Sigil Forge tier also wipe, or only raising
   it? And should a wipe unequip sigils from presets, or leave them equipped at
   level 0?
2. **#10** — confirm Sanguine Rush lifesteal / Phantom Veil miss chance at
   sigil level 11+ still reads 25%. Non-blocking; the fix is sound at L10
   either way.
3. **#8** *(recommendation, not a blocker)* — "Import from file" replaces the
   entire roster. Keeping it on the add-a-character page means one click can
   destroy the other characters. Recommend hiding it in that mode; the issue
   asks to keep it.

---

*Sources: GitHub issues #1-#10 (all open, filed 2026-07-28), read via the
GitHub API on 2026-07-29. Code references are to `main` at `c2085ec`.*
