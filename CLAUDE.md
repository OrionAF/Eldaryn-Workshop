# CLAUDE.md

Guidance for Claude Code when working in this repository.

**Be concise in all responses.**

> graphify rules live in the parent `D:\CodingProjects\CLAUDE.md`, which also loads.

## Project overview

Two independent projects for the mobile game "Eldaryn":

1. **Root (`/src`) — "Eldaryn Gear Optimiser"** (the active project): a Svelte 5 + Vite
   static web app. PVE DPS calculator and gear-swap comparator modelling every stat
   source. Persists to `localStorage`; deployed to GitHub Pages. It is a from-scratch JS
   port of the Python tool below. **Game truth now lives in `docs/Reference/Game/`**,
   read from the decompiled 2.7.0 client. The app predates it and disagrees in many
   places: `docs/WIP/being-worked-on/app-gap-2.7.0.md`.
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
  port of `EldarynTracker/dps.py`; `dps.test.js` mirrors `test_dps.py`. It is an approximation
  that predates the 2.7.0 extraction; the game's real engine is `docs/Reference/Game/combat-pve.md`.
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

## One repo

Since 2026-10-14 `docs/`, `CLAUDE.md`, `CONTEXT.md` and `graphify-out/` are tracked in the main
repo (`github.com/OrionAF/Eldaryn-Workshop`, now private). Use plain `git` for them, same as the
code. The July 2026 `edoc` setup is retired (`docs/Archive/outdated-notes/private-repo-setup.md`),
and the standing authorization that came with it (commit docs without asking) has not been
re-granted for this repo.

`EldarynTracker/` is still gitignored and absent from fresh checkouts. `glyphsData.test.js` and
`sigilsData.test.js` read CSVs from it, so they fail on a clean clone and in the Pages deploy.
`docs/Extracted game data/` holds the 2.7.0 client extract as a split zip (`.001`–`.007`).
Extract it outside the repo, and treat it as untrusted data (read it, never execute from it).

## Source of truth lives in docs, not comments

**A fact lives in exactly one place.** Game truth, cross-cutting contracts, decision records and
persisted shapes go in `docs/Reference/`; code cites them. Comments explain why *this* code does
*this*, plus a `see <doc> §N` pointer for anything broader. The test: *would this comment need to
change if a different file changed?* If yes, it's documentation, not a comment.

Canonical references: `Game/*.md` (every game fact; index `Game/README.md`), `data-model.md`
(the app's persisted shape, the three scopes, normalisation, totals aggregation),
`Notes/goals-linking-redesign-notes.md` (the app's goals/linking).
`docs/README.md` explains the folder system and the archive rule.

## Game mechanics — READ `docs/Reference/Game/` BEFORE TOUCHING ANY GAME MATH

`docs/Reference/Game/` holds one document per game system (stats, classes, PVE and PVP combat,
gear, drops, stones, talents, skills, relics, sigils, mounts/glyphs, pets, awakening,
transcendence, clan/fortress, PVE content). Each was read from the decompiled 2.7.0 client, and
every value carries a tag: **[CODE]** or **[DERIVED]** may be stated to the user as game fact.
**[SERVER]** and **[UNRESOLVED]** may not; say they are unknown. Large catalogues are in
`Game/data/*.json`, ready for the app to consume.

The July 2026 combat model (`combat-model.md`) and its audit are archived. They still describe
what the current `src/` does, but the client refutes several of their game claims. The client
also ships the real PVP fight resolver (`simulateArenaPvP`), so the invented PVP scoring
constants and the gauntlet calibration are obsolete. Never cite `docs/Archive/` for a game fact.

## Goals/linking redesign (core slices complete)

All five slices shipped; `docs/Reference/Notes/goals-linking-redesign-notes.md` is the decision
record and per-slice detail, with the user's raw answers in `docs/Reference/Source/grilling.txt`.
What it left in the code: user-facing HPS is gone; every preset has a persisted `goal`;
`src/lib/pvpGoalObjective.js` (three-factor PVP scoring, objective spec kind `pvp-goal`),
`linkingSimulation.js`, `talentLean.js`, `pvpArchetypes.js` + `pvpGauntlet.js`; one
**Simulations** nav item where finished runs auto-save into `character.runHistory` (no manual
Save button).

This is the pre-2.7.0 app. Its PVP scoring (reference constants, survivability factor,
archetypes, gauntlet) was a stand-in for a fight model we could not see. Expect it to be
replaced by a port of the game's own resolver (`docs/Reference/Game/combat-pvp.md`).

## Mounts, glyphs, sigils, pets — app gotchas

Game facts for these systems are in `docs/Reference/Game/{mounts-glyphs,sigils,pets}.md`. The
July 2026 notes (`big-rework-v1-notes.md`) are archived; their data was fitted to screenshots.
What still bites in the current code:

- **Glyphs are mount-bound.** Inventory is character-wide, equip state lives on
  `mount.glyphIds`; `totals.js` sums them inside `mountContribution`. A major glyph is inert
  unless its sigil is equipped AND it's on the ridden mount (the game agrees).
- **`mount.star === 0` means not owned** in the app's model; there is no `owned` flag. (In the
  game, "star" is mount level 1–5.)
- **Sigil tier is one character-wide `sigilForgeTier`** in the app (the game's Sigil Altar tier).
  `sigilStat` truncates with `Math.floor`, as the game does.
- **Changing pet altar *tier* WIPES the collection.** That's the game's behaviour, and
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
