# Eldaryn Workshop design system: "Forge & Ember on Obsidian"

The hybrid the user picked: the **look** of Forge & Ember (brass frames, serif titles, one ember
accent, a crafted in-game menu) on the **layout and token discipline** of Obsidian & Runes (result
layout, clean hierarchy, full token scale, cheap ornament), cooled from Forge's warm brown to the
game's navy black-glass. Dark only, desktop first, phone secondary.

Files in this folder:

| File | Role |
|---|---|
| `tokens.css` | `:root` tokens + base element styles. Replaces the token section of `src/app.css` |
| `components.css` | Reference implementation of every component below (mockup only; port per component) |
| `mockup.html` | Self-contained reference (built by `build.py` from `mockup.src.html`, `tokens.css`, `components.css`, `icons.svg.html`, `img/uris.json`). 17 views via `#v1`…`#v15`, `#v1o` (Overview in the Oblivion realm), `#v9v` (Duel, Verify tab). View map in §6 |
| `v<n>-1440.png` (full page, except the two modal views), `v1/v2/v3-1100.png`, `v2-900.png`, `v<n>-390.png` | Screenshots. `node shoot.mjs` re-shoots all of them, then lints every view at 1440/1280/1100/900/701/390: no horizontal page scroll, no zero-width item name, at most 2 `.panel.primary` per view, every phone target at least 44 px |
| `contrast.py` | Contrast measurements quoted below (`python3 -I contrast.py`) |

All sample data in the mockup is invented (names, items, numbers). Structure follows `../ia.md`.

---

## 1. Principles

1. **Numbers first.** The figure is the largest thing in its row; labels, ornament and art defer to
   it. Every number in a data position is tabular mono (`--font-data`), right-aligned in tables, with its unit smaller
   and softer (`.unit`). One hero figure per view at most (`--fs-34`).
2. **Ornament marks structure only.** Brass frames, corner ticks, plate headers and the numeral
   diamonds tell you *where a unit of work begins*. They never decorate data, never repeat inside
   a panel, never animate. Ornament is CSS borders and gradients only: no images, no filters, no
   blend layers, no full-screen overlays.
3. **Provenance and uncertainty are always visible.** A value from the player's stat sheet carries
   `SHEET`; one the engine computed carries `MODEL`; an instant calculation without an interval
   carries `ESTIMATE` and is **never** coloured like a result. Every simulated delta shows its 95 %
   interval and N. A verdict is a glyph + a word, never colour alone.
4. **One scope per panel.** Each editable panel shows exactly one scope badge (CHARACTER / PRESET /
   MOUNT / TOOL) and a 2 px top rule in that scope's hue. The frame itself is brass (F2) or rule
   grey (F1); scope never recolours it. A change that writes elsewhere says so
   with a ScopeChip and a side-effect note ("also ridden in PVP"). Tools read the character and
   write only on Apply.
5. **The ember is singular.** One hot colour: primary action, current rail/tab-bar item, running work,
   selected-row marker. Selected tabs and segments are **brass**, not ember. If two ember things
   compete in a view, one of them is wrong.
6. **Nothing hides on resize.** Breakpoints reflow (rail collapses, inspector moves below); they
   never drop information. Phone gets a different shell, not less data.

---

## 2. Tokens

Measured with WCAG 2.x relative luminance (`contrast.py`). Ratios are for text on the named
surface; the floor surface for text is `--surface-4` (hover/selected), so every text token is
quoted there.

### 2.1 Surfaces (navy black-glass, darkest to lightest)

| Token | Hex | Use |
|---|---|---|
| `--surface-0` | `#070a11` | Page |
| `--surface-1` | `#0b0f18` | Rail, top bar, bottom tab bar |
| `--surface-2` | `#0f141e` | Panel body |
| `--surface-3` | `#151b27` | Raised: inputs, plate header, table head, tiles |
| `--surface-4` | `#1c2331` | Hover, selected row, pressed segment |
| `--surface-scrim` | `rgba(3,5,9,.72)` | Behind modal / phone sheet only |
| `--sheen` | 3.5 % blue-white top gradient, 72 px | Panel body top; the only "glass" effect |
| `--plate` | `#171e2b → #121823` | Primary panel header plate |

Hue sits at ~220° (navy), saturation low, so Forge's warmth comes from text and brass, not ground.

### 2.2 Lines

| Token | Hex | On s2 | On s4 | Use |
|---|---|---|---|---|
| `--line-hairline` | `#252d3c` | 1.33 | 1.14 | Decorative dividers only (not a boundary) |
| `--line-rule` | `#323b4c` | 1.64 | 1.40 | Secondary panel edge, table row rules |
| `--line-control` | `#6f7889` | **4.15** | **3.54** | Every control boundary (WCAG 1.4.11 ≥ 3:1) |
| `--line-control-hover` | `#8e97a8` | 6.27 | 5.35 | Control hover |
| `--frame-edge` | `#03050a` | n/a | n/a | Outer dark edge of a primary frame |

Panels need no 3:1 edge (they are not controls); controls always do.

### 2.3 Text (warm parchment on cool ground)

| Token | Hex | s0 | s2 | s4 | Use |
|---|---|---|---|---|---|
| `--text-ink` | `#eee7d9` | 16.1 | 15.0 | 12.8 | Primary text, numbers |
| `--text-soft` | `#cec5b4` | 11.6 | 10.8 | 9.2 | Secondary text, labels |
| `--text-muted` | `#a69e91` | 7.5 | 7.0 | 5.9 | Captions, CI brackets, N (the floor) |
| `--text-disabled` | `#7d786f` | n/a | 4.2 | n/a | Disabled controls only (exempt) |

### 2.4 Brass (structure) and Ember (the one accent)

| Token | Hex | On s2 | Use |
|---|---|---|---|
| `--brass-200` | `#efd59c` | 12.9 | Primary panel titles, secondary-button text |
| `--brass-400` | `#d6b06a` | 9.0 | Brass labels, links, character scope |
| `--brass-500` | `#b8924f` | 6.4 | Secondary-button border, rivets, rule centre |
| `--brass-700` | `#7d6234` | 3.2 | Rule gradients, locked-slot icon (non-text, ≥ 3:1) |
| `--ember-300` | `#ffa465` | 9.4 | Ember text, primary hover |
| `--ember-500` | `#ff8a3d` | 7.9 | Primary fill, active-nav bar, running spinner, selection marker |
| `--ember-600` | `#d9651f` | n/a | Primary pressed fill (`--on-ember` text 5.3:1) |
| `--ember-700` | `#a8420a` | 3.0 | Primary border (non-text) |
| `--on-ember` | `#1a0c02` | 8.2 on ember-500 | Text on primary button |
| `--on-brass` | `#14100a` | 9.3 on brass-400 | Text on brass fill |

### 2.5 Focus

`--focus-ring: #ffe6a0` (15.0:1 on s2), `--focus-width: 2px`, `--focus-offset: 2px`,
`--focus-offset-inset: -3px`. Always `outline`, never `box-shadow`. Pale gold, distinct from the
ember selection marker (different hue and lightness, and the 2 px offset gap separates them) and
from the brass selected-tab underline (the ring surrounds the whole control, the underline is one
edge). **Inset rule, one place:** anything inside `overflow:auto|hidden` (rail, tab lists, `role=row`,
phone tabs and area strip) draws the ring inside itself via a single selector list in
`tokens.css`; a new flush component must be matched there or carry `.focus-inset`. Selected
markers sit on the outside edge (4 px inset bar), the ring 4 px inside it, so they never touch.
Primary buttons are plain rectangles (no `clip-path`), so rest, focus and disabled share one
silhouette. `forced-colors: active` maps the ring and every selected state to `Highlight`;
`prefers-contrast: more` raises control borders and the ring to 3 px.

### 2.6 Verdict and status (always glyph + word)

| Token | Hex | On s2 | Glyph / word |
|---|---|---|---|
| `--verdict-up` | `#6fd69c` | 10.3 | ▲ Upgrade / Significant |
| `--verdict-down` | `#ff8170` | 7.6 | ▼ Downgrade / Loss / error |
| `--verdict-side` | `#b8c0cd` | 10.1 | ◆ Sidegrade, ≈ Within noise (neutral, no hue) |
| `--status-warn` | `#f2c35b` | 11.2 | ⚠ warning |
| `--status-info` | `#8ec5ff` | 10.2 | ⓘ info |
| `--status-estimate` | = `--text-muted` | 7.0 | "estimate, no interval": never a verdict colour |

Tints (`--verdict-up-tint`, `--verdict-down-tint`, 10 %) fill chips only.

### 2.7 Scope colours

| Scope | Text/badge | On s2 | Top rule (2 px, panel) |
|---|---|---|---|
| CHARACTER | `--scope-character #d6b06a` | 9.0 | `--frame-character #b8924f` |
| PRESET | `--scope-preset #86b6f2` | 8.8 | `--frame-preset #5b8fd0` |
| MOUNT | `--scope-mount #d6a27a` | 8.2 | `--frame-mount #c08a5c` |
| Oblivion realm | `--scope-oblivion #bf93ff` | 7.8 | `--frame-oblivion #8a63c8` (top rule + 2 px inner ring on `.realm-oblivion` panels; shown in `v1o-1440.png`) |
| TOOL | `--scope-tool` = text-soft | 10.8 | `--frame-tool #5b6579` |

### 2.8 Rarity (the game's own; unchanged) + new `-fg-on-raised`

All `--rarity-<tier>-{fg,fg-strong,border,bg}` names and values are kept verbatim from
`src/app.css`. Rule: `-fg` for large text, `-fg-strong` for normal text on s0–s2.
Each `.r-<tier>` class sets three custom properties: `--r-fg` (= `-fg-strong`, text on s0-s2), `--r-up`
(= `-fg-on-raised`, **default for any rarity text on s3/s4**: tiles, pick cards, Drop Check names,
the drawer title, selected rows) and `--r-edge` (= `-fg-on-raised` too: the 3 px tile edge and the art
border, ≥ 5:1 on s3, so the rarity cue is a real non-text signal and survives selection). The game's
`-border` values stay in `:root` but are no longer drawn on tiles (1.7:1, below 3:1). No tile or row
background is anything but `--surface-3/4`. New `-fg-on-raised` is lifted toward white until ≥ 5.0:1 on s4:

| Tier | `-fg-strong` on s4 | `-fg-on-raised` | on s4 | on s3 |
|---|---|---|---|---|
| common | 5.80 | `#9d9d9d` (same) | 5.80 | 6.36 |
| uncommon | 11.51 | `#1eff00` (same) | 11.51 | 12.61 |
| rare | 4.35 ✗ | `#2694ff` | 5.07 | 5.55 |
| epic | 4.32 ✗ | `#bd6ef3` | 5.01 | 5.49 |
| legendary | 6.25 | `#ff8000` (same) | 6.25 | 6.85 |
| mythic | 4.72 | `#ff4d8a` | 5.01 | 5.49 |
| ancient | 10.23 | `#00e5ff` (same) | 10.23 | 11.21 |
| divine | 11.38 | `#ffd76b` (same) | 11.38 | 12.47 |
| eternal | 4.43 ✗ | `#a079ff` | 5.00 | 5.48 |
| oblivion | 4.43 ✗ | `#c964ff` | 5.06 | 5.54 |

Stones (`--stone-*`, `-light`, `-tint`) and relic tiers (`--tier-gold/silver/bronze`) are kept;
`--stone-oblivion` is new (replaces the old `--nav-oblivion` reuse). Stone hues are icon/edge only;
stone text uses `-light`.

### 2.9 Type (3 families; blackletter dropped)

| Token | Family | Weights loaded | Where |
|---|---|---|---|
| `--font-display` | **Grenze** (serif, angular, game-menu feel) | 700 | Page titles (h1), primary panel titles (h2), character name, results headline. Never < 16 px, never in tables or controls |
| `--font-ui` | **Alegreya Sans** (humanist sans, calligraphic roots that pair with Grenze) | 400, 500, 700 (`--fw-heavy` is an alias of 700; no italics) | All prose, labels, controls, micro labels, secondary panel titles |
| `--font-data` | **Red Hat Mono** | 400, 500, 600 | Numbers **in data positions only**: table cells, CI brackets, stat values, hero figures, tile meta, steppers. A number inside a sentence (`p`, `.plan`, `.hint`, `.toast`, `.legend`, `.banner`, button labels…) switches to the UI face (700, lining, tabular) by the rule in `tokens.css`, so the line keeps its rhythm |

Scale (px): `--fs-11` micro label (uppercase, 700, tracking .1em) · `--fs-12` caption, meta, chip ·
`--fs-13` table data (mono), dense UI · `--fs-14` body (default) · `--fs-16` panel title (display) ·
`--fs-20` section headline, secondary figure · `--fs-26` page title · `--fs-34` hero figure (one per view).
Weights: 400 / 500 / 700 / 800. Line heights: 1.15 titles, 1.3 dense, 1.45 body.
Tabular numbers: `font-variant-numeric: tabular-nums slashed-zero` on `.num`, `td.num`, `data`,
`output`, `input[type=number]`, `.stat-value`, `.ci`, `.n` (extend that selector list, not inline).
The app runs offline, so self-host (see §5 for the file list); the mockup uses Google Fonts.

### 2.10 Space, radii

Spacing (4-pt): `--sp-1 4` `--sp-2 8` `--sp-3 12` `--sp-4 16` `--sp-5 20` `--sp-6 24` `--sp-8 32`
`--sp-10 40`. Panel padding `--sp-4`; gap between panels `--gutter` (16); page pad 24
(16 on phone). Row height 32 (44 on coarse pointers), control height 32 (44 coarse), `--hit` 44.

Radii are forged, not rounded: `--r-1 2px` panels, buttons, inputs · `--r-2 4px` tiles, inner cards ·
`--r-3 6px` popovers, modals, drawers · `--r-pill` status pills (Jobs, Saved) and count badges only.

### 2.11 Frame and ornament levels

| Level | Used by | Recipe |
|---|---|---|
| **F2 primary** | The one or two panels that hold the view's main unit of work or its result (Identity, Equipped gear, Setup, Results, Drops, Gear & talents, Effective stats) | **Brass frame for every scope**: 1 px `--frame-brass` border, 1 px `--frame-edge` outer ring, `--frame-highlight` and `--frame-inner` (brass hairline) inset, **2 px scope-hue top rule**, `--plate` header with display title and a **2 px brass bottom edge**, **four 10 px × 2 px brass-400 corner ticks** drawn as background gradients on `::before` (no extra elements, no images) |
| **F1 secondary** | Everything else: Game profile, Base stats, Pet, Mount, Relics, Sigils, preferences, filters | 1 px `--line-rule` border, 2 px scope-hue top rule, `--surface-2`, UI-face 700 title at `--fs-14`, no plate, no ticks |
| **F0 inline** | Groups inside a panel | `--line-hairline` divider or a numeral diamond (Ⅰ–Ⅴ) for ordered setup steps |
| Rule | Section breaks inside the rail | `--rule-gold` gradient hairline |

Never nest F2 in F2. **Lint: a view has at most 2 `.panel.primary`**; `shoot.mjs` counts them per view
and fails on 3. (Before this revision Loadout had 5.)

**Ornament budget** (reviewable numbers): filters 0, blend modes 0, `backdrop-filter` 0, images in CSS
0, `clip-path` 0. Blurred shadows (radius ≥ 10 px) only on popover, tray, toast, modal and drawer
(`--elev-2/3`) and the ember glow on the *current* run segment; **tiles carry only inset shadows** (no
blur paint), at most one blurred shadow per visible element. Gradients: page wash, sheen, plate, rule,
corner ticks, the area-strip fade mask.

### 2.12 Elevation

`--elev-2` popover, Jobs tray, toast (10/28 shadow + edge
ring) · `--elev-3` modal, drawer (18/56). `--glow-ember` (8 px) only on the current RunProgress segment.

### 2.13 Motion

`--dur-1 120ms` hover/press · `--dur-2 200ms` expand, tab change, toast in · `--dur-3 320ms`
drawer, modal. `--ease-out cubic-bezier(.23,1,.32,1)`.
One orchestrated moment: page-load reveal of panels (opacity + 6 px translate, 40 ms stagger).
Transform and opacity only. `prefers-reduced-motion: reduce` collapses all durations to 0.01 ms
and stops spinners and the page reveal. State never rests on motion: the Jobs ring becomes a static 14/26 arc, and the segmented progress bar, its counts and the word "Running" carry the state.

### 2.14 Z-index

`--z-sticky 10` (context header, pinned baseline row) · `--z-rail 20` ·
`--z-topbar 30` · `--z-drawer 40` · `--z-popover 50` (menus, Jobs tray, select lists) ·
`--z-modal 60` · `--z-toast 70` · `--z-tooltip 80`.

---

## 3. Layout grid and breakpoints

App grid: `rail | main`, top bar spanning both. Main is a 12-column `minmax(0,1fr)` grid inside
`--page-pad`, max `--content-max` 1680. Page patterns:

- **Overview / collection with inspector**: `minmax(0,1fr) minmax(0,1fr) var(--inspector-w)`.
- **Tool (Optimiser, Duel)**: `var(--setup-w) minmax(0,1fr)` (setup left, results right).
- **Batch (Drop Check)**: full width, filters bar on top, result list below.
- **Editor drawer**: right drawer `--inspector-w`+ over the page (Gear item editor).

CI tables use `grid-template-columns: var(--cols)` with `minmax()` tracks (`24px
minmax(150px,1fr) minmax(220px,1.4fr) 110px 128px` at 1440), so the forest column shrinks before
anything wraps.

| Width | Behaviour |
|---|---|
| **≥ 1280** | Full rail `--rail-w` 240 with labels; inspector right; setup 360. 1440 is the design width and has no rule of its own (`--content-max` 1680 caps wider screens) |
| **1024–1279** | Icon rail `--rail-w-icon` 64: labels visually hidden and shown as a real Tooltip on hover and focus; group heads become brass rules; badges move to the icon corner; setup column 320 |
| **1024–1100** | Inspector reflows **below** main as a 2-column grid (nothing hidden); CI table tracks tighten (the Drop Check table keeps all **4** tracks, so item names never collapse); "Saved" label visually hidden; drawer 380 |
| **701–1023** | Setup panel stacks **above** results (single column); top bar drops the character text and the Import label (both stay as accessible names); CI tracks tighten again; drawer overlays instead of reserving margin; slot silhouette loses its decorative figure |
| **≤ 700** (phone) | Rail and brand hidden; bottom tab bar (Character / Builds / Tools / Import) whose current item follows the **area of the page**; under the top bar an **area strip that lists that area's pages** (Tools: Optimiser, Drop Check, Duel…) with an end fade and scroll-snap, the current item scrolled into view. Everything is one column. Tool pages put **results first, setup after**. **CI tables become cards**: the single labelled axis stays in the sticky header, each card's forest spans the same inner width so the scale is still shared, and value, delta and verdict sit in the card (nothing hidden). Drawers are full-screen sheets, modals are bottom-aligned. Wide tables (Presets compare, Stat Sheet) scroll **inside** their own focusable region, never the page |
| **Touch** (≤ 700 or `pointer: coarse`) | Every interactive type is at least `--hit` 44 px (buttons, inputs, selects, chips, tabs, segments, steppers, stars, icon buttons, links, checkboxes, board nodes); slider tracks 44 px high |
| **Short** (height ≤ 520) | Sticky context header, pinned table head/baseline and area strip become static |

---

## 4. Component catalogue

Shared state rules (apply to every interactive component unless overridden):

- **Rest**: border `--line-control`, text `--text-soft`/`--text-ink`.
- **Hover**: border `--line-control-hover`, background `--surface-3`, `--dur-1`.
- **Focus**: `:focus-visible` outline 2 px `--focus-ring`, offset 2 px (inset −3 px inside any scroll container, one selector list).
  Never box-shadow, never the selection colour, never clipped.
- **Active/pressed**: background `--surface-4` (primary: `--ember-600` fill, `--on-ember` text, inset top shade).
- **Selected**: tabs and segments get a **3 px brass-400 underline**; rows, tiles and picks get the
  **ember** left bar or frame (selection marker) + `--surface-4`; text weight 700. Rarity text on
  s3/s4 always uses `--r-up` (`-fg-on-raised`).
- **Disabled**: `--text-disabled`, border `--line-rule`, `cursor: not-allowed`, still focusable
  when it needs to explain why (`aria-disabled` + tooltip).
- **Loading**: skeleton bars in `--surface-3` (no shimmer under reduced motion) or the segmented
  RunProgress; never a spinner over data that already exists.
- **Error**: `--verdict-down` border + ⚠ glyph + message below, linked with `aria-describedby`.
- **Empty**: EmptyState component with one action.

### State matrix

Cell = token pair or `n/a`. R rest · H hover · A active · F focus · S selected · D disabled · L loading · E error · Em empty. Every F cell is the same 2 px `--focus-ring` outline; every D cell is `--text-disabled` on `--line-rule`. Instances: `v15-1440.png` (forced states) plus the views.

| Component | R | H | A | S | D | L | E | Em |
|---|---|---|---|---|---|---|---|---|
| Rail item | soft / none | ink on s3 | n/a | ink 700 on s4 + ember bar | n/a | n/a | n/a | n/a |
| Tab | soft | ink | n/a | ink 700 + brass 3 px underline | muted + tooltip | n/a | n/a | n/a |
| Segmented | soft on s2 | ink on s3 | s4 | s4 + brass underline | disabled text | n/a | n/a | n/a |
| Select / Input | ink on s3, control border | hover border | n/a | n/a | rule border | skeleton | down border + message | placeholder muted |
| Button primary | ember-500 / on-ember | ember-300 | ember-600 + inset shade | n/a | rule border | "Running…" + 2 px bar | n/a | n/a |
| Button secondary / ghost | transparent / brass or control border | brass tint / s3 | s4 | n/a | rule border | as primary | n/a | n/a |
| Button quiet | soft | s3 + underline | s4 | n/a | disabled | n/a | n/a | n/a |
| Button danger | down text | down tint | confirm: down fill | n/a | disabled | n/a | n/a | n/a |
| Chip / checkbox | control border | s3 | n/a | brass border, brass check, brass tint | rule | n/a | n/a | n/a |
| ItemTile | s3, control border, rarity edge | s4, hover border | s3 | s4, ember frame, rarity edge kept | 60 % opacity | skeleton | n/a | dashed, plus icon |
| Pick card | s3 | s4 | n/a | s4, ember frame, ember radio | n/a | n/a | n/a | n/a |
| CI row | transparent | s3 | n/a | s4 + ember bar (expanded) | n/a | running: ember bar, queued: muted | failed: down | "Estimate" tag |
| Panel | F1/F2 | n/a | n/a | n/a | n/a | skeleton body | banner on top | EmptyState; stale: `STALE` tag |
| Modal / Drawer | s2, brass edge | n/a | n/a | n/a | n/a | skeleton | banner | EmptyState |
| Banner / Toast | info/warn/error/estimate left edge | n/a | n/a | n/a | n/a | n/a | down edge, persists | n/a |
| Tooltip / Menu | s4 or s3, control border | item s4 | n/a | menu item checked | muted | n/a | n/a | n/a |
| Board node | control border | hover border | n/a | ember ring | dotted + disabled text | n/a | n/a | n/a |

### 4.1 App shell

**Rail** (`.rail`): three area groups with micro-label heads and brass rule: **Character**
(Overview, Skills & Clan, Gear, Talents, Sigils, Pets, Mounts & Glyphs, Relics, Awakening,
Transcendence), **Builds** (Presets, Loadout, Stat Sheet), **Tools** (Drop Check, Optimiser, Duel,
Opponents, Oblivion Floors). Item: icon + label, 36 px. Selected: 3 px ember left bar, `--surface-4`,
ink 700, `aria-current="page"`. Count badge (pill, mono) for pending drops. Foot: "100 % local"
note. States: rest/hover/focus (inset)/selected. a11y: `<nav aria-label="Main">`, groups as
`<ul>` with `aria-labelledby` the head.

**Top bar** (`.topbar`, `--topbar-h` 56, `--surface-1`): brand · **character switcher** (diamond
class crest, name, class · spec · level, chevron → menu of characters + "New character") ·
**PRESET** select (bookmark icon, preset name) · **REALM** SegmentedControl (Base / ◆ Oblivion) ·
spacer · **Jobs pill** · **Saved indicator** · **Notifications** (bell, unread dot) · **Settings**
(cog: data, export/import JSON) · **Import** primary button. Preset and realm are the global
context every tool reads; changing them is announced in a polite live region.

**Phone top bar (≤ 700)**: two rows, `--topbar-h-phone` 100 in the app (the mockup's 52 was one row). Row 1: character switcher, Jobs pill, bell, settings. Row 2: preset select and realm control, visible labels dropped (the controls keep their accessible names). The Saved indicator hides unless storage failed. Brand and Import live in the tab bar.

**Rail on the icon rail** shows a real Tooltip (4.32) on hover and focus, fed from `data-tip`. **Saved indicator**: dot + word. States: `Saved` (verdict-up dot), `Saving…` (muted, pulsing
dot, static under reduced motion), `Not saved` (verdict-down dot + "Retry"). `role="status"`.

**Notifications**: bell icon button, unread = ember dot + `aria-label="Notifications, 1 unread"`;
opens a popover list (same anatomy as JobsTray rows).

### 4.2 Context header with scope badge

Anatomy: breadcrumb (area / page) · h1 display title · **scope badge** · one-line scope sentence
("Shared by all 3 presets", "Only this preset. Collections are edited in Character.") · optional
page tabs · right: context echo (dashed box: "Context: Farm build (Talent Set A · Arms)") and
page action. Sticky (`--z-sticky`) on scroll. Variants: CHARACTER (brass, shield icon),
PRESET (blue, bookmark, names the preset: "PRESET: FARM BUILD"), MOUNT, TOOL (neutral, reads/writes
sentence). a11y: badge is text, not an icon; the sentence is part of the heading's description
(`aria-describedby`).

### 4.3 Panel

Primary (F2) and secondary (F1), see §2.11. Anatomy: header (title, optional meta right, optional
tabs/segmented right, optional scope badge if it differs from the page), body, optional footer
(actions right-aligned, note left). States: rest; **loading** (body skeleton, header stays);
**stale** (header gets a `STALE` muted tag + an info note explaining why and how to fix);
**error** (inline Notification at top of body); **empty** (EmptyState in body). a11y: `<section
aria-labelledby>` the title.

### 4.4 Tabs

Underline tabs for page sections and in-panel sets. Anatomy: label + optional mono count or
muted meta ("Set 1 Farm, Boss"). Selected: **brass-400 3 px underline**, ink 700. Hover: ink. Focus:
the ring (outside on desktop, inset in the phone scroller). Disabled: muted, tooltip why. a11y: `role="tablist"`, roving tabindex, arrow keys,
`aria-selected`, panels `role="tabpanel"`.

### 4.5 SegmentedControl

2–4 mutually exclusive options that change a view immediately (Realm, Equipment/Enchant stones,
Effort Quick/Standard/Thorough with N sub-label). Box with `--line-control` border; selected
segment `--surface-4` + **brass** underline + ink 700. a11y: `role="group"` of `button[aria-pressed]`
(or radiogroup when inside a form). Effort variant shows the N range in mono below each label.

### 4.6 Select

Button-styled trigger: optional leading icon, value, muted meta (e.g. "Set 1 · Talent Set A",
"42 pts"), chevron. 32 px, `--line-control` border, `--surface-2`. Open list: `--elev-2`, `--r-3`,
`--z-popover`, selected option has an ember check. Error: down border + message. Native `<select>`
is acceptable for simple lists; custom lists use the listbox pattern.

### 4.7 NumberField

Mono, right-aligned, unit suffix inside the box (`%`, `/s`). Parses with `format.js parseStat`
rules (flat `.` = thousands, percentage `.` = decimal) and shows the formatted value on blur.
Error state: down border, ⚠ message below ("Above this slot's cap (24.0 %) at ilvl 74"),
`aria-invalid`, `aria-describedby`. Disabled: rule border, disabled text.

### 4.8 Stepper

`[−] value [+]` in one bordered group (the `.rank-controls` pattern). Buttons 32 px (44 coarse),
disabled at min/max with `aria-disabled`. Value is a NumberField; Up/Down arrows step,
Shift+arrow ×10. a11y: `role="spinbutton"` semantics via `input type=number` + labelled buttons.

### 4.9 Chip / Toggle chip

**Chip**: static label (filter summary, tag). **Toggle chip**: checkbox in a bordered pill-less
box (`--r-1`), check glyph + label + optional mono count ("Slots 4"). Checked: brass border, brass
check, ink text, `--brass-tint`. Unchecked: control border, empty box. a11y: real
`<input type=checkbox>` inside a label; focus ring on the whole chip.

### 4.10 Button

| Variant | Look | Use |
|---|---|---|
| Primary | Ember fill, `--on-ember` text, plain 2 px-radius rectangle (no chamfer: one silhouette for every state) | One per view: Apply, Import, Run |
| Secondary | Transparent, brass-500 border, brass-200 text | Run more, Check drops, Open result |
| Ghost | Transparent, control border, soft text | Reset, Cancel, Show full build |
| Quiet | No border, soft text, underline on hover | Inline row actions (Dismiss) |
| Danger | Ghost with down text; **confirm state** (`.is-confirming`): down fill, "Click again to remove", auto-reverts after 4 s or on blur | Remove item, delete preset |

States: hover (lighter fill/border), active (pressed tone), focus (ring), disabled, loading
(`aria-busy`: label replaced by "Running…" + 2 px inline bar, width locked, pointer events off). Icon buttons are 32 px (44 coarse)
with `aria-label`. Primary buttons that open a review end with "…" ("Apply to Farm build…").

### 4.11 ScopeChip (per change, with side-effect note)

Two-part chip: `[SCOPE]` micro label in scope colour with scope border, then the target and any
side effect in the same box: `PRESET | Farm build only`, `CHARACTER | Talent Set A, **also Boss
build**`, `MOUNT | Shardback, **also ridden in PVP**`. Side effects in brass 700 weight. Shown on
every ablation row and in Apply review. Settings uses `GLOBAL | This device` (app-wide, not tied to a
character or preset). The target and the side effect are separate runs, so the comma follows the target
with no space before it. a11y: one text run, readable as a sentence.

### 4.12 ProvenanceTag

`SHEET` solid border (value the player entered from the in-game sheet) · `MODEL` dashed border
(engine computed) · `ESTIMATE` muted, dotted (instant, no interval). Micro label, mono-free.
Tooltip explains the source. Never coloured as a verdict. Always in its own column in stat tables.

### 4.13 VerdictChip

Glyph + word, tinted fill for up/down, neutral for side: `▲ Significant`, `▲ Upgrade · Set 1`,
`▼ Downgrade`, `◆ Sidegrade`, `≈ Within noise`, `Remainder` (muted, for interaction rows),
`Simulating…` / `Queued` (muted outline, for pending states). Pending and estimate rows never
receive up/down colours. a11y: the word carries the meaning; glyph is `aria-hidden`.

### 4.14 StatTable

Columns: STAT (ui) · VALUE (mono, right) · SOURCE (ProvenanceTag) or BASE / RESIDUAL. Header
`--surface-3`, micro labels. Rows 32 px with `--line-rule` separators; hover `--surface-4`.
Footer row for summaries ("Sheet vs model 9 / 10 explained"). Positive residuals in verdict-up,
zero in muted. a11y: real `<table>`, `<th scope>`.

### 4.15 CI forest row with shared labelled axis

**A table has exactly one `.axis` element** (and one metric). A page with two metrics (Drop Check: Set 1 DPS %, Set 2 PVP win-rate points) uses two tables, each with its own labelled axis, never two axes in one header. Drawn once in the header: title ("Δ DPS vs current (%)"), ticks with mono
labels, a heavier zero line. Every row (baseline, ranks, per-change rows) plots on **the same
scale** in the same column. Mark: interval bar (2 px, verdict colour if significant else neutral)
+ diamond at the point estimate. Baseline row shows a brass diamond at 0 with `NOW` tag. Estimate
rows show a hollow diamond only, no bar. Numbers to the right: delta (mono, coloured only if
significant), interval in muted brackets, N. a11y: each row has a visually hidden sentence
("+6.8 %, 95 % interval +5.9 to +7.7, significant"); the SVG/axis is `aria-hidden`.

### 4.16 ResultRank (expandable)

Collapsed: rank diamond, figure + CI, change summary ("4 changes · Pet, Relic 3, Talents, Glyph"),
forest, delta, VerdictChip, `Run more` link. Selected/expanded: ember left bar, `--surface-4`.
Expanded body:
1. Caption: "CHANGE · OWN EFFECT (ADDED ALONE TO THE CURRENT BUILD, PAIRED SEEDS) · SAME AXIS AS ABOVE".
2. **Ablation rows**, one per change: "Pet: Emberkit → **Pyre Wyrmling**", forest on the shared
   axis, delta + CI, verdict, ScopeChip, one-line why.
3. **Interaction remainder** row (italic label): total minus solo effects, hollow diamond, "no
   interval", `Remainder` chip; never coloured.
4. Footer: what Apply writes (all scopes, side effects named) · `Show full build` (ghost) ·
   `Run more (N 4,096)` (secondary, with target N) · `Apply to Farm build…` (primary).
a11y: row is a `button[aria-expanded]` controlling the body region; keyboard Enter/Space.

### 4.17 RunProgress (segmented)

Four labelled segments across the results header: Screening `962/1,184` · Search `7 dims` ·
Re-measure `4/6` · Ablation `queued`. Done = brass fill; current = ember fill + glow; queued =
dashed outline. Results above the current segment are labelled **Provisional** in the headline.
Under reduced motion, no animation, the counts still update. a11y: `role="progressbar"` per
segment with `aria-valuetext` ("Re-measure, 4 of 6").

**StepList** (`components/ui/StepList.svelte`): the disclosure under a RunProgress that lists the steps
of the Search segment, one per build-space block ("1. Gear set: done", "4. Relics: in progress", detail:
builds tried, fights, pass, improvement; a skipped block says why). A quiet text button "Search steps ·
3 of 4 done" with `aria-expanded` / `aria-controls` toggles it (collapsed by default); rows carry a glyph
(✓ ● ◌ –) and the state word, never colour alone, and the current one has `aria-current="step"`. The
list is not a live region. It sits under RunProgress on the Optimiser page, in each Jobs tray row (blocks
turned off left out) and in a saved run's Details; no list when the run has no search steps (Push, an
older run). Data and wording: `lib/ui/searchSteps.js`; shape: simulation.md §Progress.

### 4.18 Jobs pill and JobsTray

**Jobs pill** (top bar): pill, labelled "Jobs" (never icon only) + ring spinner while any job
runs + count badge. Idle: no spinner, muted count. Opens the tray.
**JobsTray** (popover, `--elev-2`, `--jobs-tray-w` 420): header "Jobs (2)" + "Clear finished" + close. Job row:
tool icon, title ("Optimiser · Boss build"), context line (fight, metric, seed), status right
(see the status table below), segmented progress,
elapsed + estimate left, actions `Cancel` (ghost) / `Open` (secondary). Finished row shows its
summary chips (▲ 3 upgrade · ◆ 1 · ▼ 1 · ! 1 skipped), finish time, `Dismiss` / `Open result`.
**Status table** (`.st-*`, always glyph + word): Queued `◌` muted · Running `●` ember-300 · Finished `✓` up · Failed `✕` down, with an error banner and `Retry` · Cancelled `⊘` muted, no colour change, `Dismiss` only · Skipped `!` warn with the reason. Rows are in the tray (`v6-1440.png`) and the specimen (`v15`).
Footer: "Jobs run in this tab and survive navigation; a reload cancels running jobs."
a11y: `role="dialog"` non-modal, Escape closes and returns focus to the pill; status changes go to
a polite live region.

### 4.19 Notification / toast

Anatomy: status glyph, bold lead + sentence, inline actions (Undo, Verify in Duel), close.
Variants: success (up edge), info, warn, error (down edge; does not auto-dismiss). Position:
**bottom-right stack** (`right/bottom --sp-6`, above the tab bar and safe-area inset on phone), so it never covers the panel it refers to; `--z-toast`, `--elev-2`, fade/rise `--dur-2`. A toast with an action (Undo) or an error **stays until dismissed**; a plain success may auto-dismiss after 20 s (paused on hover/focus). Everything stays readable in Activity (G5). a11y: `role="status"` for success and info, `role="alert"` for errors.

### 4.20 Modal

`.scrim` (`--surface-scrim`, `--z-modal`, no blur) + `.modal` (`--elev-3`, `--r-3`, brass edge, plate header; `--modal-w` 560, `.wide` 680 for Apply review). Header (display title, close),
body, footer actions (primary right). Used for Apply review (`v7-1440.png`: one `.grp` per scope, each with its ScopeChip, an Include checkbox and a side-effect note; "Apply to a copy instead" for shared Talent Sets), the Import report (`v13`), the Edit character dialog (`v15`),
destructive confirmations (pet altar tier wipe). a11y: `role="dialog" aria-modal`, focus trap,
Escape, focus returns to the trigger.

### 4.21 Drawer / Inspector

**Drawer** (item editor, Activity log): right side, `--drawer-w` 420 (`--drawer-w-compact` 380 at ≤ 1100, overlay at ≤ 1023, full-screen sheet on phone), `--elev-3`.
Header: tile art, rarity-coloured name (display), meta ("Weapon · Set 1 · used by Farm, Boss"),
scope badge, close. Body: fields (Rarity select, Item level stepper, Quality slider, Stars,
secondary stats rows with NumberField and remove, enchant stones list, "Contributes to Farm build"
bars). Footer: "Changes save as you edit" + Danger (confirm) + `Done`. Non-modal on desktop (page
stays readable); focus moves into it on open.
**Inspector**: in-flow right column (secondary panels); moves below main at ≤ 1100.

### 4.22 EmptyState

Brass outline diamond with a line icon, h3 title ("No spare items"), one-sentence explanation,
one secondary action ("Open Drop Check"). Centred in the panel body, max 360 px text.

### 4.23 ItemTile (rarity edge + glow)

Anatomy: 40 px icon well (rarity border), name in rarity `-fg-strong`, meta (slot · ilvl · Q),
rarity diamond top-right. **No full rarity fill**: `--surface-3` ground, **1 px `--line-control` border** (the tile is a control, ≥ 3:1), a 4 px rarity left edge (`--r-edge`, ≥ 5:1) and an 8 % inset glow (inset only, no blur). Name is always `--r-up`. Hover: `--surface-4`, hover border. Selected: ember 1 px frame + `--surface-4` and **the 4 px rarity edge is kept** (it never disappears under the frame). Disabled: 60 % opacity.
Empty slot: dashed control border, plus icon, "Trinket: empty / Add an item". Variants: gear tile,
pick card (pet/mount with art + radio), relic tile (square art, name, level), glyph socket (36 px).
a11y: tile is a button; name includes rarity in text for screen readers ("Mythic").

### 4.24 Slider

Custom markup (native thumbs cannot reach track ends; CLAUDE.md): track `--surface-4` with
`--line-control` edge, fill brass-500, thumb a 16 px brass diamond with dark edge; paired
NumberField on the right. Focus ring on the thumb. Keyboard: arrows, PageUp/Down, Home/End.
`role="slider"` with `aria-valuenow/min/max/valuetext`.

### 4.25 StarRating

5 stars (44 px targets on touch), filled brass-400, empty `--line-control` outline (3:1). Radio group semantics; arrow keys
change; each star labelled "4 stars".

### 4.26 Drop zone

Dashed `--line-control` box, file icon, "Drop a game profile JSON or click to choose", accepted
types in muted. Drag-over: ember dashed border + `--ember-tint`. Error: down border + message.
Success: file name + summary counts (Game profile panel). a11y: it is a real `<button>` plus
hidden file input; drag is an enhancement.

### 4.27 Bottom tab bar (phone)

Four equal tabs: Character, Builds, Tools, Import. Icon + micro label. Current = the **area of the page** (global pages such as Settings have none): ember top bar + ember label. 56 px + safe-area inset. The area strip under the top bar **lists the current area's pages**, scrolls horizontally with an end fade and scroll-snap, and scrolls the current page into view (current: brass underline). a11y: `<nav aria-label="Areas">`, `aria-current`.

### 4.28 Drop Check verdict card (per set)

**One table per metric**: a Set 1 table (DPS %) and a Set 2 table (PVP win-rate points), each with its own labelled axis (`v3-1440.png`); the Set 1 rows expand. Expanded drop row shows one card per gear set: "Set 1 worn by [Farm build] [Boss build]",
per-preset metric rows (preset, metric, delta, CI, N), verdict chip in the card header, footer
with ScopeChip (`CHARACTER | Gear Set 1, changes Farm, Boss`) and `Apply to Set 1…`; cards whose
verdict is within noise offer `Run more (N 6,400)` with the N needed. Below the cards, the
instant estimate is labelled `ESTIMATE` and stated in muted text, never as a verdict. Summary bar
above the list counts by verdict (▲ 3 upgrade · ◆ 1 sidegrade · ▼ 1 downgrade · 2 pending ·
! 1 skipped).
A `Compare against` SegmentedControl (`Both sets` | `Set 1 only`, a remembered pref) sits in the Single
drop Measure panel (base realm only) and the Loot bag panel; `Set 1 only` hides Set 2 cards, rows and the
Presets entries wearing Set 2, and a finished run whose mode differs reads Stale. A Loot bag item applied to
a set leaves the list (tab count and summary follow, a hint counts the removed items); Check again judges
only the items left.

### 4.29 BoardGrid and Node (Transcendence)

Canvas `.board` (`--surface-1`, rule border, `--r-2`) with an SVG edge layer (`--line-rule`, brass-500 where both ends are allocated) and absolutely positioned `.node` buttons (44 px hit area around a 28 px diamond, 36 px for the core). Tools top right: zoom +, −, reset view. A key row below lists the five states.

| State | Look |
|---|---|
| Available | control border, `--surface-2` fill |
| Locked | **dotted** control border, `--text-disabled` cost |
| Allocated | brass-400 fill, brass-200 border, `--on-brass` cost |
| Selected | ember 2 px ring (offset by the board colour); combines with allocated |
| Filtered out | 45 % opacity, border kept (never removed from the board) |

Cost number is mono inside the diamond. a11y: `role="group"` of buttons with roving tabindex and arrow-key movement, `aria-label` "Node n, cost 2, allocated, selected"; the NodeDrawer is the F1 panel in the inspector (name, effect, Deallocate, Show path). `v14-1440.png`.

### 4.30 DuelTimeline

Shared-axis rows: one `.axis` (0–40 s, no sign on ticks) above lanes of 34 px, one lane per fighter (label column 124 px, 76 on phone) with the same domain. Events are marks, never colour alone: hit `┃`, crit `◆`, heal `+`, death `✕` (the word is in the event table below, which is the accessible equivalent; the lane is `role="img"` with a summary label). Lanes use brass (you) and soft text (rival); only death uses the down colour. Legend under the lanes. `v9-1440.png`.

### 4.31 WelcomePage

Hero (crest, display h1, one sentence) over a 2-column grid: F2 "Import your game profile" (large Drop zone, Choose file, Paste JSON, Restore a backup, a "How do I get this file?" disclosure) and F1 "Start manually" (name, class, disabled "Get started" with the reason beside it). Privacy line last. The shell loses the rail, preset and realm controls while the roster is empty (`.no-roster`). `v12-1440.png`. The Import report dialog (4.20) opens over it (`v13`).

### 4.32 Tooltip

`.tooltip` (`role="tooltip"`, `aria-describedby` set on the trigger), `--surface-4`, control border, `--r-2`, `--z-tooltip`, max 260 px, text only (never interactive). Shown on hover and focus after a short delay, hidden by Escape. Used for icon-rail labels, disabled-control reasons ("Unlock Oblivion on Overview first") and provenance explanations.

### 4.33 Menu

`.menu` (`role="menu"`, `--surface-3`, control border, `--r-3`, `--elev-2`, `--z-popover`): 32 px items, optional checkbox (checkmark in brass-400) for the "Ridden in" / "Equipped in" lists, separator, trailing meta. Arrow-key roving, typeahead, Escape returns focus. Used for the character switcher, preset and realm pickers, overflow. `v15`.

### 4.34 Checkbox and Switch

Real `<input type=checkbox>` visually hidden over a 16 px `.box` (control border; checked: brass-400 fill + `--on-brass` tick); focus ring on the box; disabled uses rule border. Switch: 32 × 18 pill, thumb moves 14 px (brass when on). Same 44 px hit rule on touch. Used for Include (Apply review), Differences only, Reduce motion.

### 4.35 Textarea

`.input.textarea`: same border and states as Input, mono 13 px for pasted JSON, vertical resize only, 96 px minimum. Not used for prose.

### 4.36 Banner / Callout

Inline notice in a panel body or dialog: icon, bold lead, sentence, optional action. Left edge 3 px: info (`--status-info`), warn, error (`--verdict-down`, ✕), estimate (muted, dotted edge). Same anatomy as a toast but static and non-dismissing unless it has a close. a11y: `role="status"`; error uses `role="alert"`.

### 4.37 Skeleton

`.skeleton` blocks in `--surface-3` at the final line height; panel headers stay. Pulse (opacity 1 → .55, 1.4 s) only under `prefers-reduced-motion: no-preference`. Never shown over data that already exists.

### 4.38 Preset compare table, Stat Sheet table, Danger zone, Activity log

- **Compare** (B1, `v8`): one column per preset; header cell = name, ACTIVE verdict tag, row actions (Make active, Duplicate, Delete with the reason it is disabled at 2 presets); rows = source tag, headline stats, then sources; cells that differ are ink 700, equal cells muted; "Differences only" checkbox.
- **Sheet** (B3, `v10`): Stat · Model · Your sheet (inline input) · Gap · Status; status text "Explained" / "Off by 3.4 (tolerance ±1.0)" / "Not read"; invalid input shows the parsed echo and the fix ("Read as 48 124? Use 48.124 for flat stats."); a row expands into per-source contribution bars.
- **Danger zone** (G6, `v11`): F1 panel with a `--verdict-down` top rule, the list of what is wiped, `Export first`, a "Type RESET" input with its error ("Type RESET exactly, in capitals") and the Danger button disabled until it matches.
- **Activity log** (G5, `v11`): the drawer with glyph + sentence + time entries; errors stay until dismissed; "Normalisation dropped n references" is logged once on load.
- **Identity fields** (C1, `v1`): Class select, Level stepper, "Oblivion unlocked" toggle chip and Oblivion level number field in a 2 × 2 grid under the Power figure.


---

## 5. Implementation notes and IA amendments

### IA clauses this system overrides (ia.md is not edited; engineers follow this table)

| IA clause | System decision |
|---|---|
| Brand and rail headers in Cinzel (ia.md §2.1) | **Grenze 700** for the brand; rail group heads are the micro-label style (Alegreya Sans 700, uppercase, brass). No blackletter anywhere |
| Inspector as slide-over at 1024–1279 and bottom sheet on phone (§2.3) | Inspector **reflows below main at ≤ 1100**, nothing hidden; it is a normal in-flow column above that. Item drawers stay drawers |
| Jobs tray as a "rune icon with a count" (§2.1) | Labelled **Jobs** pill with ring and count (the user's graft) |
| Modal max 560 | 560, with a 680 `.wide` variant for Apply review |

### Fonts to self-host

| Family | Weights | Subsets | Files |
|---|---|---|---|
| Grenze | 700 | latin, latin-ext | 2 |
| Alegreya Sans | 400, 500, 700 | latin, latin-ext | 6 |
| Red Hat Mono | 400, 500, 600 | latin, latin-ext | 6 |

14 woff2 files. `font-display: swap` with `size-adjust` fallbacks (Georgia for Grenze, system-ui for Alegreya Sans, ui-monospace for Red Hat Mono) so an offline first load causes no layout shift. Alegreya Sans 800 and italics are not loaded.

### Other

- `-fg-on-raised` values for rare/epic/mythic/eternal/oblivion differ slightly from the game hue; base tokens are untouched.
- Contrast check: `python3 -I contrast.py` prints every text token on s0-s4 and every rarity pair; a build that adds a text token should add it there (fail below 4.5 text / 3.0 non-text).
- `--zero` is set per `.forest` element by script from its column domain (`--zero: 50%` fallback in CSS); it is not a global token.
- `--tier-gold/silver/bronze` are carried from `app.css` for the Relic tile port; the mockup's relic art does not use them.
- `components.css` is a reference, not drop-in: map the app's classes (`.btn-gold`, `.btn-ghost`, `.btn-danger`, `.rank-controls`, `.subheading`, `.micro-label`) to the variants here (`.btn-gold` becomes primary or secondary per call site).

---

## 6. Parity checklist (IA ids to views)

Views: `v1` Overview, `v1o` Overview in Oblivion realm, `v2` Optimiser result, `v3` Drop Check, `v4` Gear + drawer, `v5` Loadout + toast, `v6` Optimiser running + Jobs tray, `v7` Apply review, `v8` Presets, `v9` Duel, `v9v` Duel verify, `v10` Stat Sheet, `v11` Settings + Activity, `v12` Welcome, `v13` Import report, `v14` Transcendence, `v15` component states.

| IA id | Where |
|---|---|
| G0 Welcome | `v12` |
| G1 Character switcher | top bar (all views); Edit character dialog in `v15` |
| G2 Context (preset, realm) | top bar; realm = Oblivion in `v1o` |
| G3 Import | `v13` dialog; Drop zone in `v1`, `v12`, `v9v`; Import button in the top bar |
| G4 Jobs tray | `v6` (running, finished, failed, cancelled); status table 4.18 |
| G5 Activity log | `v11` drawer; toast in `v5` |
| G6 Data & Settings, RESET | `v11` |
| C1 Overview | `v1` (editable identity fields), `v1o` |
| C2 Skills & Clan | composed (Stepper, StatTable, Chip); no dedicated view |
| C3 Gear | `v4` (silhouette, drawer, stones) |
| C4 Talents, C5 Sigils, C6 Pets, C7 Mounts & Glyphs, C8 Relics, C9 Awakening | composed from Tile, Pick card, Slot, Stepper, Slider; the Loadout views (`v5`) show the same cards in their choose form; no dedicated views |
| C10 Transcendence | `v14` |
| B1 Presets | `v8` |
| B2 Loadout | `v5` |
| B3 Stat Sheet | `v10` |
| T1 Drop Check | `v3` (Loot bag); Single drop tab is the same table with one row and the Setup fields of `v2` |
| T2 Optimiser | `v2`, `v6`, Apply review `v7` |
| T3 Duel + Verify | `v9`, `v9v` |
| T4 Opponents | composed: the editor is the `v10` sheet table plus the `v5` pick cards; no dedicated view |
| T5 Oblivion Floors | composed: a CI table (`v2`) in the Oblivion realm (`v1o`); locked state is the EmptyState in `v4` |

Open gaps (not drawn): C2, C4-C9 collection pages, T4, T5 and the Single drop tab are compositions of drawn components, listed so the port does not wait for a mock.

---

## 7. Changelog from critique

### Fidelity
| Issue | Resolution |
|---|---|
| Major: Forge look is thin; frames 1 px and blue | **Fixed.** Every F2 frame is brass (1 px `--frame-brass`, outer ring, inner hairline), four 10 px corner ticks, 2 px brass plate-header edge. Scope hue moved to a 2 px top rule and the badge. `--frame-preset/mount` recoloured for rule use only |
| Major: 5 primary panels on Loadout | **Fixed.** Loadout: Gear & talents + Effective stats are F2, Pet/Mount/Relics/Sigils are F1. Overview: Farm build inspector is F1. §2.11 states the max-2 rule and `shoot.mjs` lints it per view |
| Major: Drop Check has two axes | **Fixed.** Two tables (Set 1 DPS %, Set 2 PVP points), one axis each; §4.15 and §4.28 say a table has exactly one `.axis` |
| Major: ~10 IA pages with no view | **Fixed in part.** Added `v7` Apply review, `v8` Presets, `v9`/`v9v` Duel + Verify, `v10` Stat Sheet, `v11` Settings + Danger + Activity, `v12` Welcome, `v13` Import, `v14` Transcendence, `v15` states, `v1o` Oblivion realm; §6 maps every IA id. C2, C4-C9, T4, T5 and Single drop are marked as compositions, not drawn |
| Major: C1 controls absent | **Fixed.** Class select, Level stepper, Oblivion unlocked toggle, Oblivion level field in a 2 × 2 grid |
| Major: mono in prose | **Fixed.** Rule in `tokens.css` switches numbers in sentences, notes, toasts, banners, legends, hints and button labels to the UI face; §2.9 reworded to "data positions only" |
| Minor: toast covers Effective stats | **Fixed.** Bottom-right stack, persists with actions (4.19) |
| Minor: optimiser shots cropped | **Fixed.** 1440 shots are full page |
| Minor: four ember items | **Fixed.** Selected tabs and segments use brass; ember reserved (Principle 5, 4.4, 4.5) |
| Minor: rarity edge lost on selection | **Fixed.** 4 px edge kept under the ember frame; glow 8 % inset only; tile backgrounds only s3/s4 |
| Minor: Jobs placeholder bullet | **Fixed.** Deleted; §5 has the IA amendment table and §6 the id map |

### Accessibility
| Issue | Resolution |
|---|---|
| Blocker: Drop Check grid at 1100 collapses names | **Fixed.** 4-track definition on `.ci-table.dc-table` at 1100 and 1023; lint fails on any `.name` under 8 px at every width |
| Blocker: `.tool-panes` side by side at 390 | **Fixed.** Single column at ≤ 1023; results first on phone |
| Blocker: no phone CI table / control bar | **Fixed.** Cards with a shared sticky axis, single-column control bar |
| Major: touch targets | **Fixed.** Hard-coded 36 px removed; every type sized from `--hit` under `(max-width:700px),(pointer:coarse)`; lint measures at 390 |
| Major: tab bar / area strip wrong on Tools | **Fixed.** Strip and tab bar follow the page's area; fade mask, snap, scroll-into-view |
| Major: tile and pick borders under 3:1 | **Fixed.** Tile, pick, slot use `--line-control`; rarity edge uses the lifted value |
| Major: rarity text on s3/s4 | **Fixed.** `--r-up` is the unconditional default on raised surfaces |
| Major: pressed primary 3.1:1 | **Fixed.** `--ember-600` with `--on-ember` (5.3:1) plus inset shade |
| Major: inset focus ring touching markers | **Fixed.** 4 px outside marker, ring inside it; tab underline 3 px brass; focused + selected shown in `v15` |
| Minor: forced-colors | **Fixed.** `@media (forced-colors: active)` for ring, selected states, bars; also `prefers-contrast: more` |
| Minor: icon rail without tooltip | **Fixed.** Real Tooltip on hover and focus |
| Minor: desktop link targets 12-19 px | **Fixed.** 24 px minimum on crumbs and link buttons |
| Minor: sticky offsets on phone | **Fixed.** `--context-h: 0` at ≤ 700 and static sticky under 520 px height |
| Minor: reduced motion state | **Fixed.** Static arc, no reveal, counts carry state |
| Minor: toast duration and roles | **Fixed.** Actions and errors persist; `status` / `alert` |
| Found while fixing: top bar overflowed at 701-1000 px | Top bar tightens at ≤ 1023 and ≤ 900 (Import label becomes an accessible name only) |

### System
| Issue | Resolution |
|---|---|
| Blocker: Board, DuelTimeline, Welcome missing | **Fixed.** 4.29, 4.30, 4.31 with state tables and views `v14`, `v9`, `v12` |
| Major: no state matrix | **Fixed.** Matrix before 4.1; CSS for busy button, stale panel, tile hover/active/disabled, quiet-hover underline, skeleton; forced states in `v15` |
| Major: Tooltip, Menu, Checkbox, Textarea, Banner, Skeleton missing | **Fixed.** 4.32-4.37 with CSS |
| Major: literals outside `:root` | **Fixed.** `--glow-page`, `--selection`, `--brass-tint`, `--surface-4` replace the literals |
| Major: IA/system drift | **Fixed.** §5 amendment table |
| Major: unused tokens | **Fixed.** Modal/scrim, tooltip and glow now use `--surface-scrim`, `--z-modal`, `--z-tooltip`, `--glow-ember`; deleted `--elev-1`, `--frame-w`, `--rivet-size`, `--lh-snug`, `--ease-in-out`, `--z-base`, `--sp-12`. `--tier-*` kept with a note |
| Major: `--zero`, unused font weights | **Fixed.** `--zero` documented as per-element with a fallback; Alegreya 800/italic and Grenze 500/600 dropped; self-host table in §5 |
| Minor: magic px | **Fixed.** 30 px sizes and 10 px glyph use the scale; 44 uses `--hit`; new `--rail-item-h`, `--jobs-tray-w`, `--drawer-w(-compact)`, `--modal-w`. Remaining literals are grid track minimums and 1-2 px borders |
| Minor: ornament budget | **Fixed.** Budget in §2.11; tile outer glow removed |
| Minor: clip-path button | **Fixed.** Chamfer dropped; one silhouette |
| Minor: rarity class mapping | **Fixed.** Three-property mapping in §2.8 and unconditional `--r-up` rule |
| Minor: focus offsets selector by selector | **Fixed.** One selector list in `tokens.css` |
| Minor: breakpoint table | **Fixed.** 1440 no longer listed as a breakpoint; 701-1023 column added; `v2-900.png` shows the Optimiser there |
| Minor: queued/failed/cancelled/skipped states | **Fixed.** Status table (4.18), `.st-*` classes, tray rows |
