> **Status:** Superseded 2026-10-14 · **Superseded by:** `Reference/Game/stones.md` and the Gear screen (`src/components/screens/GearScreen.svelte`).
> Describes the pre-rebuild app (v1 model, `src/lib/*Data.js`, legacy components). True on its date, not since.
> **Covers:** the Socketed Stones system — the design spec for a feature that
> has since shipped (`stonesData.js`, `socketedStones` on the loadout, the
> optimizer's stone pass).
>
> ⚠ Carried forward on 2026-07-28 without re-verification. The combat audit
> touched stones only via the optimizer's greedy stone pass, which it found
> sound. Verify against the code before relying on any specific number here.

# Socketed Stones — design spec

Result of a grilling pass (2026-07-04) before implementation. Captures every confirmed
decision so the feature can be built/reviewed against a fixed spec rather than re-derived
from chat history.

## 1. Data model

Replaces the current unused scaffold `Loadout.stones: Record<Slot, OffensiveStats>`
(a flat stat block per slot — same shape as `gear`, never had real UI) with two pieces,
mirroring how Pets already work (shared collection + per-use reference):

- **`Character.stoneInventory: StoneEntry[]`** — one shared inventory per character,
  visible to both loadouts (like `Character.pets`).
- **`Loadout.socketedStones: Record<Slot, stoneId | null>`** — per loadout, per slot,
  just a reference into the inventory. Replacing gear stats in a slot never touches this
  map, so a socketed stone survives a gear swap untouched (it's keyed by slot position,
  not by the gear piece).

```
StoneEntry = {
  id,
  type: 'verdant' | 'crimson' | 'azure' | 'eldaryn' | 'mythic',
  quality: number,                 // display-only ("Q34"), no effect on any calc
  rolledKeys: string[],            // ordered stat keys actually on this stone (incl.
                                    // 'pvp_attack'/'pvp_defense' where fixed) — needed
                                    // because a 0-value stat is otherwise indistinguishable
                                    // from "not rolled"
  stats: OffensiveStats,           // the stone's stat contribution (emptyStats() + the
                                    // rolledKeys' values) — accumulated directly into
                                    // totals.js, same as gear/pet stats
}
```

A stone can be referenced by at most one slot per loadout, but independently by one slot
in *each* loadout at once (stone #3 can sit in Loadout 1's Head and Loadout 2's Leggings
simultaneously).

**Scope**: no cap on inventory size (like Pets/Mounts/Glyph entries), no slot
restrictions (any stone type fits any of the 9 slots), no free-text nickname (identity is
fully derived from type + quality + rolled stats, like Glyphs).

## 2. Stone types & bonus-stat shape

| Type | Fixed rows | Free rows | Total bonus stats |
|---|---|---|---|
| Verdant Wardstone | — | 2 | 2 |
| Crimson Warstone | — | 2 | 2 |
| Azure Duelstone | 1 — user picks PVP Attack **or** PVP Defense (never both) | 1 | 2 |
| Eldaryn Stone | 2 — PVP Attack **and** PVP Defense, both auto-filled | 1 | 3 |
| Mythic Soulstone | 2 — PVP Attack **and** PVP Defense, both auto-filled | 2 | 4 |

- **Free-row stat list**: `fieldsForTab('gear', character.class)` minus PVP Attack/Defense
  — same class-filtered list Gear Loadouts already uses.
- **Duplicate guard**: within one stone, once a stat is picked in one free row it's
  excluded from that stone's other free row(s) (covers "two unique random bonus stats"
  on Mythic, applied consistently to all types).
- **Value formatting**: each row's value input switches parsing rule (flat = `.` as
  thousands separator, pct = `.` as decimal point) based on that row's stat kind, reusing
  `format.js`'s `formatFlat`/`parseFlat`/`formatPct`/`parsePct` — same convention as
  `StatsFields.svelte`.
- **Quality**: plain number, display-only, no calc effect — same principle as gear pieces
  not tracking item level.

## 3. Editing

Type and which stats were rolled (`rolledKeys`) are locked in at creation — a real
stone's rolled stats don't change, only your recorded numbers might need correcting. Edit
mode exposes **Quality** and each rolled stat's **value** only (stat labels shown
read-only). To get a different type/stat combo, remove and re-add.

## 4. Layout (Gear Loadouts screen)

Two-column layout already exists (`.silhouette-col` | `.field-col`); this feature adds to
both:

- **Left column** (below the 9-slot `SlotSilhouette`): one panel with two modes —
  - **Add mode** (default): type dropdown → bonus-stat rows (per §2's per-type shape) →
    Quality → "Add to Inventory" button.
  - **Details mode** (after clicking a grid tile in the right column): the same stone's
    type/quality/bonus rows, quality+values editable per §3, plus action buttons:
    **Save**, **Remove** (`ConfirmButton`, same pattern as Pets/Mounts/Glyphs — silently
    clears any socket(s) referencing it, no extra warning), and **Socket Stone** — targets
    whichever slot is currently selected in the silhouette above; the button reads
    **Unsocket** instead if the selected stone is already socketed into that exact slot.
- **Right column** (below the selected slot's `StatsFields`): the **Socketed Stones**
  inventory — a grid (not a list), one tile per stone, auto-expanding downward as stones
  are added (no cap). Each tile is color-coded by type (§5) and shows Quality; clicking a
  tile selects it and switches the left panel into Details mode.

## 5. Type colors

New tokens (`--stone-verdant`, `--stone-crimson`, `--stone-azure`, `--stone-eldaryn`,
`--stone-mythic` + `-light`/`-tint` variants, following the existing `--nav-<domain>`
convention in `app.css`):

- Verdant Wardstone → green `#22c55e`
- Crimson Warstone → red `#ef4444`
- Azure Duelstone → blue `#3b82f6`
- Eldaryn Stone → purple `#a855f7`
- Mythic Soulstone → pink `#ec4899`

## 6. Socketing mechanics

- Flow: click a grid tile (selects stone, left panel → Details mode) → click a slot on
  the silhouette (already-existing selection state, shared with the gear stat editor) →
  click **Socket Stone**.
- **Auto-move**: if the selected stone is already socketed elsewhere in the *same*
  loadout, socketing it to the new slot silently vacates the old slot in that loadout (one
  socket per stone per loadout, enforced by moving rather than blocking).
- **Cross-loadout independence**: the same stone can be socketed in Loadout 1 and Loadout
  2 at once — the move rule above only applies within one loadout.
- **Socket status display**: format is `Socketed: {slot|No} | {slot|No}`, positionally
  mapped to Loadout 1 / Loadout 2 (no loadout names in the string) — shown on grid tiles
  and/or in the Details panel.
- **Silhouette indicator**: a new dot in the **top-left** corner of a slot button (the
  existing gold dot for "currently selected slot" stays top-right, unchanged), shown when
  that slot has a stone socketed **in the loadout currently open**, colored to match the
  socketed stone's type color from §5.

## 7. Totals / Drop Check boundary

- `totals.js`'s `computePresetTotals` currently does
  `accumulate(acc, loadout.stones[slot])` for the old scaffold field. This becomes: for
  each slot, resolve `loadout.socketedStones[slot]` → look up the `StoneEntry` in
  `character.stoneInventory` → `accumulate(acc, stone.stats)` if present. Net effect on
  Preset Calculated Totals is unchanged in kind (stones already contributed to totals via
  the scaffold) — only the resolution path changes from "stat block stored inline" to
  "stat block resolved via ID".
- **Drop Check is untouched** — `DropCheckScreen`/`LoadoutColumn`/`VerdictCard`/`dps.js`'s
  swap math only ever reads `loadout.gear`, never `loadout.stones`/`socketedStones`, so
  stones structurally cannot affect a verdict. No changes to those files in this pass
  (explicitly out of scope).

## 8. Out of scope for this pass

- Any Drop Check / LoadoutColumn / VerdictCard changes.
- A total-inventory cap.
- Slot-type restrictions per stone type.
- Free-text nicknames on stones.
- Changing a stone's type or rolled-stat selection after creation.
