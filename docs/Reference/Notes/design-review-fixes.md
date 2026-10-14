> **Status:** Current · **Last verified:** 2026-07-03 (⚠ not re-checked since)
> **Covers:** the first design-review pass on the Preset redesign. CLAUDE.md
> cites it for the reference layout/spacing values to reuse before inventing
> new panel patterns.
>
> ⚠ Carried into `Reference/Notes/` on 2026-07-28 without re-verification —
> the combat audit did not cover styling. Treat the *spacing values* as
> current (nothing since has changed them) and anything about component
> structure as needing a check against the code first.

# Design-Review Fixes — Preset Redesign (post-implementation)

Review of `main` (`90b4d48`) against the design reference (`design_handoff_preset_redesign/Preset Prototype.dc.html`).
The data layer (model/totals/rosterStore), migration, Sidebar/mobile nav, and screen structure are faithful — the items below are the remaining deltas. Ordered by impact; each has the file and the exact fix.

## A. Functional bugs

### A1. `LoadoutColumn.svelte` — core-stat summary renders "0 +6.2% ATK" for %-only pieces
`coreSummary()` always prints `formatFlat(piece.attack)` when *either* `attack` or `attack_pct` is set, so a piece with only Attack % shows a leading `0`. Same for HP.
**Fix:** when the flat part is 0, omit it: `attack ? '12.664 +6.2% ATK'` / `attack_pct only ? '+6.2% ATK'`. Mirror for health.

### A2. `PresetsScreen.svelte` — editor doesn't follow character switches
`editingId` is initialized once from `rosterStore.current.presets[0]` and never resets. After switching characters (Sidebar), `editingId` points at the previous character's preset id → `editingPreset` resolves to `null` and the editor panel silently disappears; no card shows EDITING.
**Fix:** add an `$effect` keyed on `character.id` that resets `editingId = character.presets[0]?.id ?? null` whenever the character changes.

### A3. `SlotSilhouette.svelte` — filled/empty backgrounds are inverted
`.slot` base is `--color-field` (#1c1840, lighter) and `.slot.filled` is `--color-inset` (#14112a, darker) — filled slots recede instead of popping. Reference: **filled = #1c1840 (raised), empty = #14112a (deep)**.
**Fix:** swap the two values; also give the selected slot's label the gold-light text (`#f3d78d`) like the reference.

## B. Layout

### B1. `DropCheckScreen.svelte` — verdict cards should stack, not sit side-by-side
`.verdict-cards` is `grid-template-columns: 1fr 1fr` inside the altar. The reference stacks the two loadout verdict cards **vertically, full-width** (one ribbon per loadout). Side-by-side halves the width while `VerdictCard`'s `.deltas` is `white-space: nowrap` (`DPS 75.833 → 77.641 (+2.4%) · HPS (+0.2%)`) — it will clip/overflow at most widths.
**Fix:** make `.verdict-cards` a single-column flex/grid with 10–12px gap at all widths.

### B2. `StatsFields.svelte` consumers — effective-totals and drop inputs need a 2-column grid
The reference lays out the preset editor's EFFECTIVE TOTALS (16 rows) and the Drop Check stat inputs as a **2-column grid** (`1fr 1fr`, gap `2px 26px`) on desktop; the implementation renders one tall single column, which makes the editor and altar ~2× taller than designed.
**Fix (no logic change):** in `PresetEditor.svelte` and `DropCheckScreen.svelte`, wrap with `:global(.stats-fields) { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 26px; }` above ~900px (keep single column below). While there: the per-row separator should be the hairline (`--color-border-hairline`, #241f42) — `StatsFields` still uses `var(--color-border, #444)`.

## C. Visual fidelity

### C1. `PresetCard.svelte` — number treatment
Currently `DPS 75.833` renders label+value in one 24px span. Reference: **big mono value first, tiny label after** — value 24px/600 (17px for HPS), then a 10px, letter-spacing 0.12em, `--color-muted` label (`75.833 DPS`).
**Fix:** split into two spans and restyle.

### C2. `PresetCard.svelte` — EDITING badge should be filled
Badge is gold-outlined text on transparent. Reference: **solid gold** — `background: var(--color-gold); color: var(--color-bg)` (dark text), radius pill, 10px/700/0.1em.

### C3. `PresetCard.svelte` — mini-chips too faint / mode chip logic
`.mini-chip` uses the hairline border (#241f42 — nearly invisible on the panel). Reference: border `--color-border` (#2c2650), and on the *editing* card chips get `background: --color-field` + text `--color-soft`. The mode chip should be cyan **only when "calculated"** (border `rgba(84,208,255,0.4)`, text `--color-dps`); "manual" stays plain muted. Currently both render cyan-dim.

### C4. `App.svelte` — banner subline lost the character context
`context-sub` shows only the screen label. The class is now visible nowhere outside the character picker. Reference sublines carry class + scope, e.g. `Sentinel · 3 presets · 2 loadouts · 2 talent sets` (Presets), `Sentinel · 2 presets watching this drop` (Drop Check), `Sentinel · character-wide` (Mount/Awakening/Transcendence).
**Fix:** build the subline from `character.class` (or "No class") + a per-screen suffix map; keep the screens' own hint lines as-is.

### C5. Loadout hue treatment is on the wrong panels (`VerdictCard` / `LoadoutColumn`)
`VerdictCard h3` colors *both* loadout names `--nav-gear-light` (violet). Reference: **verdict-card titles are plain ink**; the *flanking* `LoadoutColumn` titles carry the hue — Loadout 1 `#b06cff` (`--nav-gear`), Loadout 2 `--color-muted`.
**Fix:** move the color: `VerdictCard h3 → var(--color-ink)`; `LoadoutColumn h3 → nav-gear` for index 0, muted for index 1 (pass `loadoutIndex`, already a prop).

### C6. `Chip.svelte` / `DropCheckScreen.svelte` — slot chips should be small pills
The single Chip style (radius 7, 0.8rem, 0.35/0.7rem padding) renders Drop Check's 9 slot chips much chunkier than the reference's compact pills (radius 999, ~10.5px text, 3px 9px padding).
**Fix:** add a `size="small"`/`pill` variant to `Chip.svelte` and use it for the slot picker (both Drop Check and any future compact rows). Editor chips keep the current size.

### C7. `PresetsScreen.svelte` — character-wide tiles lack their primary line
Tiles render title + one small sub line. Reference: a **bold 16px primary value line** between them — `Duskmare` + rarity, `11 / 15 · Shadow Path`, `14 nodes` — with the mono detail line below it.
**Fix:** split `tile-sub` into a 16px/700 primary line + 11px mono detail line.

### C8. `Sidebar.svelte` — two token nits
- Brand wordmark: reference is `--color-gold` (#d9a94b), implementation uses `--color-gold-light`.
- Rail `border-right` (and the mobile bar's `border-top`): reference uses `--color-border` (#2c2650), implementation uses the hairline (#241f42).

### C9. `PresetEditor.svelte` — header rule (nit, optional)
Reference header is asymmetric: a short 26px **solid** gold rule left of "EDITING — …", then a gold→transparent gradient filling the right, delete button at the far end. Implementation has symmetric fade rules on both sides. Cosmetic — align if cheap.

### C10. Pet stat summaries (nit, optional)
`petSummary()` in `PetsScreen`/`PresetEditor` prints full field labels ("1.200 Attack · 4% Attack %"); the reference abbreviates ("1.200 ATK · +4% ATK · 1.5% crit") to keep chips one line. Consider a short-label map for the summary only. Also dedupe: the same `petSummary` is copy-pasted in both files — move it to `model.js` or a small helper.

## Explicitly verified as correct (no action)
- Migration, per-character drop, snapshot-on-manual-switch, relic/glyph caps with inline errors, mixed-verdict two-step confirm, per-preset verdict math, class gating + onboarding copy, hard-reset relocation, mobile bottom bar + More sheet, transcendence logic untouched, fonts wired in `index.html`.
