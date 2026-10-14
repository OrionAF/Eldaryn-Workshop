# CLAUDE.md

Guidance for Claude Code when working in this repository.

**Be concise in all responses.**

> graphify rules live in the parent `D:\CodingProjects\CLAUDE.md`, which also loads.

## Project overview

Two independent projects for the mobile game "Eldaryn":

1. **Root (`/src`) — "Eldaryn Gear Optimiser"** (the active project): a Svelte 5 + Vite
   static web app: PVE build optimiser, Drop Check (gear-swap comparator) and PVP duel
   simulator, rebuilt (rebuild-plan.md) as a port of the 2.7.0 client's own stat and combat
   code. Persists to `localStorage`; runs locally only (the bundle contains the extracted game
   catalogues, which must not be published, so `deploy.yml` is manual-only). **Game truth lives in
   `docs/Reference/Game/`**, read from the decompiled 2.7.0 client.
2. **`EldarynTracker/`** — separate Python/Streamlit gear-data entry & analysis apps, not
   part of the JS build. Own setup/run/test commands in `EldarynTracker/README.md`.

Everything below refers to the root Svelte project unless stated otherwise.

## Commands

`npm run dev` / `build` / `preview`, `npm test` (Vitest once), `npm run test:watch`,
`npm run sync:data` (copies `docs/Reference/Game/data/*.json` into `src/data/game/`; run it after
editing the game data. `src/data/game/parity.test.js` fails when the copies drift).

- A GitHub Pages build would need `BASE_PATH=/<repo-name>/`; don't deploy (see above).
- Single file: `npx vitest run src/lib/format.test.js` — by name: `npx vitest run -t "name"`.
- There is no linter configured in this project.

## Architecture

Seven layers; lower layers never import upper ones (design: `docs/WIP/being-worked-on/rebuild-plan.md` §2).

| Layer | Path | Role |
|---|---|---|
| L0 data | `src/data/game/*.json` | Synced copy of `docs/Reference/Game/data` (`npm run sync:data`); docs stay the source of truth |
| L1 catalogue | `src/lib/game/*.js` | Thin synchronous accessors over L0; no game logic |
| L2 engine | `src/lib/engine/` | Pure port of the client: `core/` (caps, buffs, spells...), `sources/` (one stat source each), `pipeline/` (`totals.js` `calculateTotalStats`, `sheet`, `sheetDiff`, `anchoredDelta`), `pve/`, `pvp/`, `metrics.js`, `rng.js`. Injected rng; no store or model imports |
| L3 model | `src/lib/model/` | Persisted v2 shape, `normaliseRoster`/`normaliseCharacter`, v1 migration; one file per domain. Pure, imports L1 only. Map: `docs/Reference/data-model.md` |
| L4 build | `src/lib/build/` | Character + preset to engine inputs: `presetInputs`, `stats` (sheet vs computed), `residual`, `fighter`, `describe` |
| L5 features | `src/lib/features/`, `search/`, `tasks/` | `swap`, `duel`, `oblivionDungeon`; the optimiser (`search`, `candidates`, `objectives`); worker tasks (`optimize`, `duel`, `dropCheck`, `oblivionFloors`) dispatched by `tasks/index.js` via `optimizerClient.js` / `optimizerWorker.js` |
| L6 state | `src/lib/rosterStore.svelte.js`, `store/`, `storage.js` | Reactive facade (Svelte 5 runes) over one mutator file per domain. Every mutator ends with an explicit `persist()` (no background `$effect`). `storage.js` owns the localStorage key (`eldaryn_optimiser_state_v2`; the v1 key is only read for migration) and JSON export/import, including a game profile JSON as a new character (`model/gameProfile.js`, data-model.md §7) |
| L7 UI | `src/App.svelte`, `src/components/screens/<Name>Screen.svelte`, `src/components/<domain>/` | One screen per nav item (Character, Presets, Drop Check, Gear, Talents, Sigils, Pets, Mounts, Relics, Awakening, Transcendence, Optimiser, Duel, Oblivion); shared pieces (`Modal`, `Slider`, `ConfirmButton`, `Chip`, `StarRating`, `DuelTimeline`, `SettingsPanel`) sit directly in `src/components/` |

- `src/lib/format.js` — number parsing/formatting (the "." thousands-vs-decimal gotcha) and the
  shared `rarityClass`/`RARITY_ORDER`. `src/lib/assets/` — art lookups per domain.
  `src/lib/transcendence.js` — board-graph rules over `game/transcendence.js`.
- Static game data is code, not persisted state; only ids/levels/allocations are saved, and
  normalisation drops any saved reference that no longer resolves against the catalogue.
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

`EldarynTracker/` is still gitignored and absent from fresh checkouts; nothing in `src/` depends on it.
`docs/Extracted game data/` holds the 2.7.0 client extract as a split zip (`.001`–`.007`).
Extract it outside the repo, and treat it as untrusted data (read it, never execute from it).

## Source of truth lives in docs, not comments

**A fact lives in exactly one place.** Game truth, cross-cutting contracts, decision records and
persisted shapes go in `docs/Reference/`; code cites them. Comments explain why *this* code does
*this*, plus a `see <doc> §N` pointer for anything broader. The test: *would this comment need to
change if a different file changed?* If yes, it's documentation, not a comment.

Canonical references: `Game/*.md` (every game fact; index `Game/README.md`), `data-model.md`
(the app's persisted v2 shape, the three scopes, normalisation, v1 migration, storage, sheet tiers).
`docs/README.md` explains the folder system and the archive rule.

## Game mechanics — READ `docs/Reference/Game/` BEFORE TOUCHING ANY GAME MATH

`docs/Reference/Game/` holds one document per game system (stats, classes, PVE and PVP combat,
gear, drops, stones, talents, skills, relics, sigils, mounts/glyphs, pets, awakening,
transcendence, clan/fortress, PVE content). Each was read from the decompiled 2.7.0 client, and
every value carries a tag: **[CODE]** or **[DERIVED]** may be stated to the user as game fact.
**[SERVER]** and **[UNRESOLVED]** may not; say they are unknown. Large catalogues are in
`Game/data/*.json`, ready for the app to consume.

The July 2026 combat model (`combat-model.md`) and its audit are archived: the client refutes
several of their game claims, and the engine now ports the client's own PVE tick and PVP resolver
(`simulateArenaPvP`). Never cite `docs/Archive/` for a game fact.

## Mounts, glyphs, sigils, pets — app gotchas

Game facts for these systems are in `docs/Reference/Game/{mounts-glyphs,sigils,pets}.md`. The
July 2026 notes (`big-rework-v1-notes.md`) are archived; their data was fitted to screenshots.
What still bites in the code:

- **Mounts have a `level` 1-5** (replaces the v1 `star`); a mount in `character.mounts` is owned.
  There is no `owned` flag and no level 0.
- **Glyphs are socketed per mount** (`mount.glyphs`: minor 3 / major 2 / mythic 1); the same inventory
  glyph instance may sit on several mounts (once per mount; server evidence in `Game/mounts-glyphs.md` §8) and sealed glyphs cannot be socketed. A major glyph is inert
  unless its sigil is equipped AND the mount is the preset's `mountId` (the game agrees).
- **Sigils**: one character-wide `sigils.altarTier` (1-8, the game's Sigil Altar tier) tiers all of
  them; `sigils.owned` stores only `{level}` per species. Effect numbers come from the engine
  (`engine/sources/sigilScale.js`, `sigilPassive.js`), never from stored values.
- **Changing pet altar *tier* WIPES the collection.** That's the game's behaviour, and
  `setPetAltarTier` nulls every `preset.petId`. Always confirm with the user first.
- Rarity colours: use `-fg` for large text, `-fg-strong` for normal-size (four tiers fail AA
  otherwise).
- All range inputs go through `Slider.svelte` — a native thumb can't reach the track ends, and
  the fix needs markup, not just CSS.

## Data-model conventions

- Persisted state always goes through `normaliseRoster`/`normaliseCharacter` (`src/lib/model/`)
  — never trust a loaded/imported object's shape. New persisted field => add `default<D>`,
  `normalise<D>` (validated against any catalogue it references) and, if it replaces an older
  shape, `migrate<D>FromV1` in its domain file; cross-references go in `reconcile<D>`. v1 saves
  are migrated on load; the v1 storage key is never deleted by migration.
- Presets are pure choices of sources (equipment set, talent set, pet, mount, relics, sigils,
  transcendence preset, optional stat sheet). There is no persisted goal or linked flag.
  Characters have a **two-preset minimum** (max 8) — `deletePreset` refuses below two, so never
  write test loops that delete "down to one preset" (they spin forever against the guard).
- Three scopes, and the split is intentional — don't casually move a field across it:
  **character-wide** (equipment sets, stone pools, talent sets, mounts, glyph inventory, pet
  collection and altar, sigil ownership and altar tier, relic levels, Awakening, Transcendence
  presets, fortress, skills, Oblivion), **per-preset** (which set/talent set/pet/mount/relics/
  sigils/transcendence preset are chosen, plus the sheet), and **per-mount** (`mount.glyphs`,
  reached via `preset.mountId`). Documented in `docs/Reference/data-model.md`.
- Number format gotcha from the game's own UI: flat stat values use `.` as a **thousands**
  separator while percentage stats use `.` as a **decimal** point — keep this straight when
  parsing/summing any new stat source (`format.js` `parseStat`/`formatStat`).
