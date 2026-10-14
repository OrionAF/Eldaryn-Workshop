# CLAUDE.md

Guidance for Claude Code when working in this repository.

**Be concise in all responses.**

> graphify rules live in the parent `D:\CodingProjects\CLAUDE.md`, which also loads.

## Project overview

Two independent projects for the mobile game "Eldaryn":

1. **Root (`/src`) — "Eldaryn Gear Optimiser"** (the active project): a Svelte 5 + Vite
   static web app. PVE DPS calculator and gear-swap comparator modelling every stat
   source. Persists to `localStorage`; deployed to GitHub Pages. It is a from-scratch JS
   port of the Python tool below — `EldarynTracker/eldaryn_gear_optimiser_handoff.md`
   holds the original domain spec.
2. **`EldarynTracker/`** — separate Python/Streamlit gear-data entry & analysis apps, not
   part of the JS build. Own setup/run/test commands in `EldarynTracker/README.md`.

Everything below refers to the root Svelte project unless stated otherwise.

## Commands

`npm run dev` / `build` / `preview`, `npm test` (Vitest once), `npm run test:watch`.

- Production build for GitHub Pages needs `BASE_PATH=/<repo-name>/`.
- Single file: `npx vitest run src/lib/dps.test.js` — by name: `npx vitest run -t "name"`.
- There is no linter configured in this project.

## Architecture

- **`src/lib/model.js`** — the typed data model (`Roster` → `Character[]` → `loadouts`,
  `talentSets`, `pets`, `presets`, etc.) plus factories and `normaliseRoster`/`normaliseCharacter`,
  which repair/migrate arbitrary persisted or imported JSON into a valid shape. Read the header
  comment here first — it's the map of the whole domain shape and documents the "Preset redesign"
  (character-wide sources like Mounts/Awakening/Transcendence vs per-preset sources like
  loadout/talent set/pet/relics).
- **`src/lib/rosterStore.svelte.js`** — the single reactive store (Svelte 5 runes) wrapping
  model/storage/dps/totals. Every mutator ends with an explicit `persist()` call rather than a
  background `$effect`, so save timing is deterministic around character switches and downloads.
- **`src/lib/storage.js`** — localStorage persistence + JSON export/import (all under one
  `eldaryn_optimiser_state_v1` key), routed through `normaliseRoster` on load/import so
  corrupt/old data can't crash the app.
- **`src/lib/dps.js`** — the core PVE closed-form damage engine (decompose flat stat from
  displayed total+percent, recombine, `compute_dps`/`compute_hps`, swap comparison). A verbatim
  port of `EldarynTracker/dps.py`; `dps.test.js` mirrors `test_dps.py` as the shared spec. It is
  only one layer of the combat model — read `docs/Reference/combat-model.md` first.
- **`src/lib/totals.js`** — the "Calculated totals" engine: additively sums a Preset's gear +
  talents + pet + relics + every character-wide source into one final stat set. Deliberately
  additive-only for every field (including Speed/Crit Mult) — a different operation from
  `dps.js`'s two-item swap delta, which has its own additive-vs-multiplicative switch.
- **Static domain data** (`talentTreeData.js`, `awakeningData.js`, `relicsData.js`,
  `transcendenceData.js`, `constants.js`) is code, not persisted state — only allocations/levels/
  selections referencing it are saved. Normalisation drops any saved reference that no longer
  resolves against this static data (e.g. after a class change).
- **`src/App.svelte`** — the shell: a sidebar + one active "screen" component per nav item
  (Presets, Drop Check, Gear Loadouts, Talent Sets, Pets, Relics, Mounts/Glyphs, Awakening,
  Transcendence, Sigils, Simulations), each in `src/components/`.
- Components pair `Thing.svelte` with `Thing.test.js`; lib modules pair `thing.js` with
  `thing.test.js`.

## Styling conventions

Full rationale in the `src/app.css` header comment — that file is authoritative.

- Design tokens (colors, spacing, radii) live in `:root` custom properties in `app.css`.
  Always reference these; never hardcode hex/px.
- **All numeric data renders in tabular monospace** (`--font-data`,
  `font-variant-numeric: tabular-nums`). Add new numeric fields to the existing selector list
  in `app.css`, not via ad hoc inline styles.
- Reuse the recurring classes rather than inventing new ones: `.btn-gold`, `.btn-ghost`,
  `.btn-danger` (has an `.is-confirming` state), `.rank-controls button` (± steppers),
  `.subheading`, `.micro-label`.
- Mobile breakpoint is `700px` (rail → bottom tab bar). Check
  `docs/Reference/Notes/design-review-fixes.md` and `-2.md` for established layout/spacing
  values before introducing new panel patterns.

## Two repos: `git` for code, `edoc` for docs

This working tree is covered by **two** git repos.

- **`git`** — public (`github.com/OrionAF/Eldaryn-Workshop`), tracks `src/` and the build. Its
  `.gitignore` excludes `/docs`, `/EldarynTracker`, `CLAUDE.md`, `/CONTEXT.md`, `/graphify-out`.
- **`edoc`** — private (`github.com/OrionAF/eldaryn-private`), git-dir outside the project at
  `D:\CodingProjects\.eldaryn-private.git`, work tree at the project root. Tracks exactly what
  the public repo ignores. It's a `$PROFILE` PowerShell function — plain `git` with
  `--git-dir`/`--work-tree` preset; use it identically.

**Editing `docs/` or `CLAUDE.md` and running `git commit` does nothing** — the public repo
cannot see those files. Use `edoc`, or the work stays only on this disk.

Two traps: new files do NOT appear in `edoc status` (`showUntrackedFiles=no`), so add new paths
explicitly with `-f` the first time; and never `edoc add -f EldarynTracker` — `-f` overrides the
exclude list and would commit ~610 MB of screenshots.

### Standing authorization (granted 2026-07-28): commit and push `edoc` without asking

Any change to `docs/`, `CLAUDE.md` or `CONTEXT.md` gets committed and pushed with `edoc` as part
of the same piece of work. Don't ask, don't leave docs uncommitted. Commit at meaningful
checkpoints with a real message, not after every edit.

**Still ask before:** adding a *new path* to tracking (especially under `EldarynTracker/`);
anything that rewrites or discards history (`push --force`, `reset --hard`, `rebase`,
`filter-branch`, deleting tracked files); changing the remote; committing anything
credential-shaped.

Covers **`edoc` only** — the public repo keeps the normal rule of committing only when asked.
Details: `docs/Reference/Notes/private-repo-setup.md`. Why:
`docs/Archive/DATA-LOSS-2026-07-28.md`.

## Source of truth lives in docs, not comments

**A fact lives in exactly one place.** Game truth, cross-cutting contracts, decision records and
persisted shapes go in `docs/Reference/`; code cites them. Comments explain why *this* code does
*this*, plus a `see <doc> §N` pointer for anything broader. The test: *would this comment need to
change if a different file changed?* If yes, it's documentation, not a comment.

Canonical references: `combat-model.md` (all combat math), `data-model.md` (persisted shape, the
three scopes, normalisation, totals aggregation), `Notes/big-rework-v1-notes.md`
(mounts/glyphs/sigils/pets), `Notes/goals-linking-redesign-notes.md` (goals/linking).
`docs/README.md` explains the folder system and the archive rule.

## Combat model — READ THIS BEFORE TOUCHING ANY COMBAT MATH

`docs/Reference/combat-model.md` is the **canonical reference** for damage, healing, mitigation,
survivability, duels, scoring and the gauntlet: the raw→curve→effective pipeline, every formula,
and a provenance tag on every constant (MEASURED / PATCH / OBSERVED / ASSUMED / INVENTED). **Only
MEASURED and PATCH values may be stated to the user as game facts** — several load-bearing
constants are INVENTED, and treating them as measured is the mistake this reference exists to
prevent. Where any other doc disagrees, it wins and the other is stale.

`docs/WIP/being-worked-on/combat-audit-2026-07-28.md` is the open findings queue. Check it before
"fixing" something here — it may already be logged, with evidence.

Older docs are **dated decision records, not current truth**: `big-rework-v1-notes.md`,
`goals-linking-redesign-notes.md`, `superpowers/specs/*`, `adr/0001`. In particular `adr/0001`
and `dps.js`'s header claim the defensive/PVP stats are display-only — long false.

## Goals/linking redesign (core slices complete)

All five slices shipped; `docs/Reference/Notes/goals-linking-redesign-notes.md` is the decision
record and per-slice detail, with the user's raw answers in `docs/Reference/Source/grilling.txt`.
What it left in the code: user-facing HPS is gone; every preset has a persisted `goal`;
`src/lib/pvpGoalObjective.js` (three-factor PVP scoring, objective spec kind `pvp-goal`),
`linkingSimulation.js`, `talentLean.js`, `pvpArchetypes.js` + `pvpGauntlet.js`; one
**Simulations** nav item where finished runs auto-save into `character.runHistory` (no manual
Save button).

PVP reference constants were refitted on 2026-07-29 and **nothing changed** — read
`combat-model.md` §9 before touching them; the survivability factor's *shape* is the open
problem, not its constants. Non-blocking trailers: refine archetype numbers, sigils/PVP ratings
on archetypes, a linking-report gauntlet.

## BigReworkV1 (complete)

Read `docs/Reference/Notes/big-rework-v1-notes.md` before touching mounts, glyphs, sigils or pets
— it holds both the decision record and the data derivations, which are expensive to
re-establish from the raw scrapes. The gotchas that bite silently:

- **Glyphs are mount-bound.** Inventory is character-wide, equip state lives on
  `mount.glyphIds`; `totals.js` sums them inside `mountContribution` (the generic `SOURCE_DEFS`
  equipped-entries path is gone). A major glyph is inert unless its sigil is equipped AND it's on
  the ridden mount.
- **`mount.star === 0` means not owned** — there is no `owned` flag.
- **Sigil tier is one character-wide `sigilForgeTier`**; `sigilStat` truncates with `Math.floor`
  because the game does. Effect magnitudes come from `sigilEffectValue` (level only, never tier).
- **Changing pet altar *tier* WIPES the collection** — that's the game's behaviour, and
  `setPetAltarTier` nulls every `preset.petId`. Always confirm with the user first.
- Rarity colours: use `-fg` for large text, `-fg-strong` for normal-size (four tiers fail AA
  otherwise).
- All range inputs go through `Slider.svelte` — a native thumb can't reach the track ends, and
  the fix needs markup, not just CSS.

## Data-model conventions

- Persisted state always goes through `normaliseRoster`/`normaliseCharacter` — never trust a
  loaded/imported object's shape. New persisted field ⇒ add its normalisation (default +
  validation against any static data it references) alongside the existing ones in `model.js`,
  and handle legacy migration if it replaces an older shape (see
  `isLegacyCharacter`/`migrateLegacyCharacter`).
- Presets carry a persisted `goal` (`normalisePresetGoal`): 'tank' is Warrior-only, weights
  renormalise to sum 100, `linked` defaults by position. Characters have a **two-preset
  minimum** — `deletePreset` refuses below two, so never write test loops that delete "down to
  one preset" (they spin forever against the guard).
- Three scopes, and the split is intentional — don't casually move a field across it:
  **character-wide** (Mounts, glyph inventory, Awakening, Transcendence, pet collection,
  `petAltar`, `sigilForgeTier`, relic levels), **per-preset** (which loadout/talent set/pet/
  mount/relics/sigils are chosen), and **per-mount** (`mount.glyphIds`, reached via
  `preset.mountId`). Documented in `model.js`'s header.
- Number format gotcha from the game's own UI (handoff doc §9): flat stat values use `.` as a
  **thousands** separator while percentage stats use `.` as a **decimal** point — keep this
  straight when parsing/summing any new stat source.
