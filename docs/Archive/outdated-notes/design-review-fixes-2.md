> **Status:** Current · **Last verified:** 2026-07-03 (⚠ not re-checked since)
> **Covers:** the second design-review pass on the Preset redesign. Same
> caveat as round 1 — carried forward on 2026-07-28 without re-verification;
> the combat audit did not cover styling.

# Design-Review Fixes, Round 2 — Preset Redesign

Review of `main` (`c3127f1`) against the design reference (`design_handoff_preset_redesign/Preset Prototype.dc.html`).
All items from round 1 (design-review-fixes.md) verified as landed. These are the remaining deltas. Reference values are quoted exactly from the prototype's inline styles.

---

## G. Global / systemic (fix these first — they cascade into every screen)

### G1. `app.css` — `--radius-panel` drifted to 12px
Reference panels are all `border-radius: 10px`. Repo has `--radius-panel: 12px`.
**Fix:** `--radius-panel: 10px`.

### G2. `app.css` — global `button` default doesn't match the reference's button vocabulary
The global rule (`background: var(--color-field); border: var(--color-border); padding: 0.4rem 0.75rem`, inherited 16px text) makes every unstyled button chunky, field-filled, and oversized. The reference has exactly four recurring button treatments, none of which is that:

1. **Gold CTA** (`+ New Preset`, `Add Pet`, `Add Mount`, `Save to Inventory`): transparent bg, `border: 1px solid var(--color-gold)`, `color: var(--color-gold-light)`, `font-size: 12px; font-weight: 600; border-radius: 7px; padding: 6px 14px`; hover bg `var(--color-gold-tint)`.
2. **Ghost** (`Edit stats`, `Export`/`Import`): transparent bg, `border: var(--color-border-strong)`, `color: var(--color-soft)`, `font-size: 11.5px; border-radius: 6px; padding: 5px 12px`; hover border gold.
3. **Rank ±** (talents, relics, awakening): `width: 26px; padding: 2px 0; font-size: 13px; border-radius: 5px; background: var(--color-field); border: 1px solid var(--color-border-strong); color: var(--color-ink)`; hover border gold.
4. **Danger/confirm** (Remove / Confirm): transparent bg, `font-size: 11.5px; padding: 5px 12px; border-radius: 6px`; idle `border #5c4a4e; color #a08b8d`, confirming `border/color var(--color-danger)`.

**Fix:** add `.btn-gold`, `.btn-ghost`, `.btn-danger` utility classes (or props on a Button component) in app.css and apply throughout; change `.rank-controls button` (TalentTierList, RelicsScreen, AwakeningScreen) to treatment 3. Make the global `button` default transparent-bg, 12px, so unstyled buttons fail small rather than chunky.

### G3. `app.css` — inputs/selects too large
Reference form controls: `font-size: 12.5px; padding: 6px 10px; border-radius: 6px` (mono for numeric ones). Repo global is `padding: 0.3rem 0.5rem` with inherited 16px text.
**Fix:** global `input, select { font-size: 12.5px; padding: 6px 10px; }`.

### G4. Missing "Cinzel subheading" class
The reference uses one recurring in-screen subheading style for tier/section titles (`TIER 1`, `GOLD` relic tier, `GLYPH INVENTORY`): `font-family: var(--font-heading); font-weight: 700; font-size: 12px; letter-spacing: 0.1–0.12em; color: var(--color-soft); text-transform: uppercase`. Repo renders these as default sans `h3`/`.tier-title` (16px-ish, no tracking, no Cinzel).
**Fix:** add `.subheading` class in app.css; apply in TalentTierList (`.tier-title`), RelicsScreen (tier `h3`), MountAndGlyphsScreen (`.glyphs-heading`).

### G5. Missing "panel micro-label" class
Second recurring label style (panel titles like `LOADOUT 1 — WEAPON`, `ASHFANG — STAT CONTRIBUTION`, `NAME`, `EFFECTIVE TOTALS — …`): `font-size: 10px; font-weight: 700; letter-spacing: 0.14em; color: var(--color-muted); text-transform: uppercase`. Repo variants use 0.06–0.08em tracking and `--color-dim`.
**Fix:** add `.micro-label` class; apply in PresetEditor (`.field-group-label`, `.totals-mode`), GearLoadoutsScreen (field-col title), PetsScreen (pet-editor title). Note reference color is **muted** (#8d86b8), not dim.

---

## PresetEditor.svelte

1. **No panel background.** Reference editor panel: `background: #161331` (`--color-panel`). Repo `.editor` has no background — page bg shows through the gold border.
2. **Padding** `16px 18px` → reference `18px 20px`. Margin: reference sits 14px below the card grid and 16px above the strip; repo `margin-top: var(--space-6)` (26px) — use 14px.
3. **Header title**: reference `font-size: 12.5px; letter-spacing: 0.14em`; repo 13px with the global h2's 0.04em tracking. Set both explicitly.
4. **Field-group labels**: apply `.micro-label` (10px / 0.14em / **muted**, margin-bottom 7px) — currently 0.08em / dim. Also the reference prefixes four labels with a colored `◆` diamond keyed to the nav hue: GEAR LOADOUT `#b06cff`, TALENT SET `#54d0ff`, PET `#ff7ac2`, RELICS `#e8c84f`. Repo has none. Add `<span class="diamond" style="color: var(--nav-…)">◆</span>`.
5. **Totals divider**: reference `border-top: 1px solid var(--color-border)` (#2c2650) with `padding-top: 14px`; repo uses the hairline (#241f42).
6. **DPS/HPS readout order + size**: reference is value-first big mono — `<value 15px/600 color-dps> <unit 10px muted>` (`75.833 DPS`), value via `formatFlat(Math.round(x))`. Repo renders `DPS 75.833` label-first, default-size, `toFixed(1)`. Restyle to match PresetCard's value-first pattern.
7. **EFFECTIVE TOTALS label**: `.micro-label` (10px/0.14em/muted/700) — repo is 10.5px/0.06em/dim.
8. **Editor chips (via Chip.svelte)**: reference unselected chips are **transparent** (`background: none; border: #3a3468; color: #8d86b8`), `font-size: 12px; padding: 6px 13px`; selected adds `font-weight: 600`. Repo Chip default is field-filled bg, 0.8rem, `0.35rem 0.7rem`, no weight change. Fix the default variant.
9. **Relic chips**: reference uses a smaller third size: `font-size: 11px; padding: 4px 10px; border-radius: 7px`; unselected `border: var(--color-border); color: var(--color-dim)`; selected `border: gold; background: rgba(217,169,75,0.08); color: <tier color>`. Add e.g. `size="compact"` to Chip and use for relics.

## PresetsScreen.svelte

1. **CHARACTER-WIDE divider is not inline.** Reference: one flex row — label, sub, then `<span style="height:1px; flex:1; background: var(--color-border)">` filling the remaining width. Repo puts a `border-bottom` (hairline) under the whole row. Replace with the inline flex rule; rule color is `--color-border` (#2c2650), not hairline.
2. **Strip label type**: reference `10.5px / 0.16em / var(--color-dim) / 700`; sub `10.5px var(--color-dim)`. Repo: 10px/0.1em label, **muted** sub.
3. **Tile dots not inline.** Reference: dot + tile title share one flex row (`align-items: center; gap: 8px; margin-bottom: 8px`); repo tile is a plain flex-column so the dot sits on its own line. Wrap dot+title in a `.tile-head` row.
4. **Tile title**: reference `font-size: 12px; font-weight: 700`; repo 13px/600.
5. **Tile hover**: reference `border-color: var(--color-border-strong)` (#3a3468) — subtle; repo jumps to gold.
6. **New-preset ghost card**: reference is 3 lines — `+` (22px, dim), `New preset` (12px, muted), `pick a loadout…` (10.5px, dim) — `min-height: 130px`. Repo merges the first two lines and uses 100px.

## DropCheckScreen.svelte & LoadoutColumn.svelte

1. **Loadout panel background wrong.** Reference top (slots) panel is `--color-panel` (#161331) `padding: 14px 16px`; only the bonus panel below is `--color-inset` (#14112a) `padding: 12px 16px`. Repo renders both as inset with `12px 14px`.
2. **Loadout title row not inline.** Reference: title and used-by share one row — `justify-content: space-between; align-items: baseline`, title left, `used by Farm, Arena` right-aligned at `10px muted`. Repo stacks used-by as a paragraph under the title.
3. **Loadout title type**: reference `Cinzel 12.5px / 700 / 0.1em`, uppercase (`LOADOUT 1`); hue `#b06cff` for index 0 / muted for index 1 (hue placement is already right). Repo h3 is ~14.4px/600, not uppercase, no tracking.
4. **Slot rows**: reference **empty rows have no background** — `background: none`, filled `#1c1840`, selected gold-tint + gold border; row text `11.5px` (weight 600 only when selected); value mono `10.5px` colored `#f3d78d` selected / `#8d86b8` filled / `#665f96` empty. Repo gives every row the field bg, bolds every label at 11px, and uses one muted value color.
5. **Section labels** (`CORE STATS PER SLOT`, `BONUS STATS — …`): reference `9.5px / 0.14em / var(--color-dim) / 700`; repo 10px/0.08em.
6. **Overflow on smaller windows** (the "not scaling" report): `VerdictCard .deltas` is `white-space: nowrap` and the altar's stats grid is 2-col, so the middle column's min-content width forces the 220px side columns off-screen between ~1280–1500px. **Fix:** add `min-width: 0` to `.loadout-col` and the altar; in VerdictCard allow the deltas to wrap (`white-space: normal` below ~1500px, or drop nowrap entirely and rely on tabular mono).
7. **Verdict card geometry/type**: reference `padding: 11px 14px; border-radius: 8px`; title `Cinzel 12.5px/700/0.1em` uppercase ink with sub-count (`2 presets`, 10px muted) beside it; repo `14px 16px`, radius-panel, ~14.4px title, no sub-count.
8. **Equip button placement + colors**: reference puts `Equip → Loadout 1` in the card's **header row, right-aligned, auto width** (`font-size: 12px; font-weight: 600; padding: 7px 14px; border-radius: 6px`); clean-upgrade: `background: rgba(64,180,111,0.18); border: #7fe0a6; color: #baf1d1`; mixed: warning-tint bg; neutral: transparent, `border #5c4a4e; color #a08b8d`. Repo renders a full-width field-bg button at the bottom with border-only coloring.
9. **Preset row names**: reference `Cinzel 12px/700/0.08em` uppercase; repo has Cinzel+700 but no size/tracking/uppercase.
10. **Altar**: reference `padding: 20px 22px` (repo 18px); subline `11.5px` (repo 11px); header title tracking `0.16em`. Header rules are asymmetric fades **toward the title** (left: `linear-gradient(90deg, transparent, gold)`, right: `linear-gradient(270deg, transparent, gold)`); repo fades both directions.

## GearLoadoutsScreen.svelte

1. **Field column has no panel.** Reference wraps the stat fields in a panel: `background: var(--color-panel); border: 1px solid var(--color-border); border-radius: 10px; padding: 16px 18px`. Repo renders bare fields on the page bg.
2. **Panel title**: reference is a `.micro-label` (`LOADOUT 1 — WEAPON`, 10px/0.14em/muted/700 uppercase, margin-bottom 10px); repo uses a default sans h3.
3. **Stat fields single-column.** Same fix as PresetEditor/DropCheck round 1: `:global(.stats-fields) { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 26px; }` above 900px. This screen was missed.
4. **Silhouette slots**: reference `padding: 10px 4px; font-size: 11px; border-radius: 7px; gap: 8px`; empty-slot text `var(--color-dim)`, filled `var(--color-soft)` (selected gold-light is already right). Repo: 12px text inheriting ink for all states, radius 6.
5. **used-by** line: `11px var(--color-dim)` (repo muted).

## TalentSetsScreen.svelte & TalentTierList.svelte

1. **Tier title**: apply `.subheading` (Cinzel 12px/700/0.1em/soft, uppercase `TIER 1`); repo is plain sans 600 at inherited size.
2. **Tier badge should be a pill**: reference `font-size: 10px; padding: 1px 8px; border-radius: var(--radius-pill)`; unlocked `border gold / color gold-light`, locked `border var(--color-border) / color var(--color-dim)`. Repo: 12px, radius-chip (7px).
3. **Talent row type sizes** (all currently inheriting 16px): name `13px/600`; stat-name label `11px var(--color-dim)`; rank badge mono `12px`; value column mono `11.5px`, `min-width: 180px`. Row padding `7px 10px`, radius 7.
4. **± buttons**: treatment G2-3 (13px, radius 5, `border-strong`, field bg).
5. **Points readout** (TalentSetsScreen controls row): `12.5px` mono (currently inherited 16px); used-by `11px var(--color-dim)`.
6. Copy nit: reference reads `+X% NOW · NEXT +Y%`; repo `+X% CURRENT · NEXT: +Y%`. Optional.

## PetsScreen.svelte

1. **PET LEVEL control**: reference is a single inline row — label `10px/0.12em/muted/700` followed by a `64px` right-aligned mono `12.5px` input, `gap: 7px`. Repo stacks label above a 5rem input at 0.06em.
2. **Add Pet button**: gold CTA (G2-1). Currently the default field-bg button.
3. **Edit stats / Hide stats**: ghost treatment (G2-2). Remove: danger treatment (G2-4).
4. **Row values**: summary mono `10.5px muted`; used-by `10.5px muted; min-width: 110px` (repo has dim). Row padding `8px 10px`, radius 7.
5. **Pet stat editor loses its panel.** Reference: `background: var(--color-panel); border: var(--color-border); border-radius: 10px; padding: 16px 18px`; title `.micro-label` uppercase (`ASHFANG — STAT CONTRIBUTION`); fields in the standard 2-col grid (`1fr 1fr, gap 2px 26px`). Repo: a hairline `border-top` with a plain h3 and a custom horizontal-wrap field layout. Replace with the panel + 2-col grid used everywhere else.

## RelicsScreen.svelte

1. **Tier headings**: `.subheading` (Cinzel 12px/700/0.12em/soft uppercase — `GOLD`, `SILVER`, `BRONZE`); repo plain sans h3.
2. **Row type sizes**: name `13px/600` (currently inherited 16px); level badge mono `11px` (repo 12.8px); stats column `11.5px`, `min-width: 180px` (repo 10rem); used-by `10.5px muted; min-width: 130px; text-align: right` (repo dim/8rem). Row `padding: 8px 10px; border-radius: 7px`.
3. **± buttons**: treatment G2-3.

## MountAndGlyphsScreen.svelte

1. **Buttons**: `Add Mount` and `Save to Inventory` → gold CTA (G2-1); `Remove` → danger (G2-4).
2. **GLYPH INVENTORY heading**: `.subheading` (Cinzel 12px/700/0.12em/soft); repo default h3.
3. **Base-stat labels**: reference reads `HP%` / `ATK%` at `11px` with a `56px` right-aligned mono `12.5px` input; repo `Base HP%` at 12.8px with a 4rem input.
4. **Tier counters**: reference mono `11.5px muted, gap 18px`; repo 13.6px sans (not in the app.css mono list — add the class or `font-family: var(--font-data)`).
5. **Glyph row label**: mono `12px` (currently inherited 16px). Riding radio label `11px`.
6. **Glyph error**: `12px` (currently inherited).
7. Screen hint lines (`character-wide — …`): reference `11px var(--color-dim)`; repo muted. (Same nit on Pets/Relics/Awakening hints.)

## AwakeningScreen.svelte

1. **Path cards**: reference is chip-styled — unselected `background: none; border: var(--color-border-strong); color: var(--color-muted)`; selected `background: var(--color-gold-tint); border: gold; color: gold-light`; type `Cinzel 12.5px/600/0.08em`, `padding: 10px`, radius 7. Repo: inset bg, `--color-border`, inherited 16px, active gets no tint bg.
2. **Points readout**: mono `13px var(--color-soft)` (repo muted, inherited size).
3. **± buttons**: treatment G2-3; `Reset Awakening` → danger (G2-4).
4. **Bonus rows**: total `mono 12.5px var(--color-gold-light)` ✓ but set the size; per-point `10.5px var(--color-dim)` (repo 12px muted); label `12px`; row `padding: 8px 10px; radius 7`.

---

## Explicitly verified as correct (no action)
All round-1 fixes: LoadoutColumn %-only summaries, editor character-switch `$effect`, SlotSilhouette filled/empty swap, stacked verdict cards, 2-col stats grids in PresetEditor/DropCheck, PresetCard number treatment + filled EDITING badge + mode-chip logic, banner sublines, verdict/loadout hue placement, Chip `size="small"` slot pills, character-wide tile primary lines, Sidebar tokens, asymmetric editor header rule, `summarizeStats` dedupe.
