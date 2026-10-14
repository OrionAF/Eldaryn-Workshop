# Progression systems — canonical reference

> **Status:** Current · **Last verified:** 2026-07-28
> **Covers:** Transcendence, Talents, Awakening and Mounts — the *rules* of
> each progression system.

**This is the source of truth for how these systems behave.** The numbers stay
in code (`constants.js`, `talentTreeData.js`, `transcendenceData.js`,
`awakeningData.js`, `mountsData.js`) — a value lives in exactly one place, and
that place is the data table. This document owns the rules that operate on it.

Combat math is `combat-model.md`. Persisted shape is `data-model.md`.

---

## 1. Transcendence

A **sparse grid**: nodes exist only at specific `"col:row"` positions, not at
every cell. Positions are 1-indexed and `1:1` is top-left, matching the source
transcription's own notation.

### Node types

| `type` | Fills | Notes |
|---|---|---|
| `common` | 1 slot | exactly 1 stat entry |
| `uncommon` | `TRANSCENDENCE_UNCOMMON_SLOTS` (3) | exactly 2 stat entries |
| `glyph` | — | **inert placeholder**, matching the in-game "SOON" badge |
| `sigil` | — | grants an Ancient sigil, not a stat |

`category` (`offense` / `defense` / `glyph` / `sigil`) is stored explicitly per
node rather than derived from the stat key — **Penetration sits on the offense
side of this tree's own split**, despite reading like a defensive stat name.
Deriving it would get that wrong.

### Unlocking

Gated purely by **orthogonal adjacency** to an already-unlocked node. No
diagonals, no skipping gaps, blank cells, or other un-unlocked nodes.

**Glyph sockets are excluded from the walkable graph entirely**, so a path can
never route *through* one.

The tree's `startPosition` is **not unlocked by default**. It is simply the one
node with no adjacency prerequisite, so it is always the first thing a player
has to unlock themselves.

**Removing a node cascades**: every other unlocked node that becomes
disconnected from the start is removed with it (`rosterStore
.setTranscendenceNode` recomputes reachability and keeps only what survives).

### Ichor cost

Tiered by **slot number**, not by node. The Nth slot filled (1-indexed,
counting only common/uncommon nodes) costs whatever tier `n` falls into —
the table is `TRANSCENDENCE_COST_TIERS` in `constants.js`.

- A common node pays slot `n`'s price.
- An uncommon node fills the next 3 slots at once and pays those three prices
  **combined**, which can straddle a tier boundary (slots 4+5+6 = 1+2+2 = 5).
- An **Ancient Sigil costs a flat `TRANSCENDENCE_SIGIL_COST`** and does *not*
  advance the tiered slot count.

Ichor is **shown as information only**. It is not a tracked balance and
nothing is gated on affordability — the app never knows how much Ichor a
player actually has.

### Resetting is free

In-game, resetting the board costs nothing. That is why the optimizer rebuilds
Transcendence from an **empty board** every pass rather than searching outward
from the current one, budgeting with the Ichor refunded by the reset plus
whatever extra the player enters.

---

## 2. Talents

Four specs — `arms`, `protection` (Warrior), `marksmanship`, `disruption`
(Sentinel). Each is a real, fully transcribed tree: **6 tiers**, 14–15 talents.

- **Tier thresholds** are `[0, 5, 10, 15, 20, 25]`: the points required across
  **all previous tiers combined** to unlock that tier. Tier 0 is always open.
- **`TALENT_TOTAL_POINTS` (29)** caps a single build.
- `ranks[i]` is the **assigned** value at rank `i+1` — read from the game, not
  computed from a curve.
- A tier may hold several talents.

**Talent IDs are stable, hand-chosen strings**, never the runtime `newId()`
used for user-created entities. A build persists `{talentId: rank}`, so a
regenerated id would silently orphan a saved allocation.

`talentTreeData.js` is deliberately self-contained (no `model.js` import) to
avoid a circular import — `model.js` reads `TALENT_TREES` for normalisation.

**Saved Talent Sets are not searched by the optimizer.** It searches spec plus
allocation from scratch and only takes the point *budget* from the sets (the
most points spent in either, since that is how many the player demonstrably
owns). The recommendation is "make your talents look like this", not "switch
to Set B".

---

## 3. Awakening

**Path-only — there is no in-path point allocation.** A character picks one
path and accumulates points in it.

- `AWAKENING_PATHS` defines the per-point stats. **Shadow is pure offense,
  Radiant pure survival/PVP**, which is exactly why the two paths pull a
  DPS preset and a PVP preset apart, and why the linking simulation exists.
- Points are level-derived, capped at `AWAKENING_TOTAL_POINTS`.
- **Changing path resets points to 0** — a different path's stats do not carry
  over.
- Awakening is **character-wide**: every preset shares it. That is what makes
  the choice contentious between two linked presets with different goals.

The linking simulation evaluates both paths at the **endgame projection**
(`AWAKENING_TOTAL_POINTS`), not the current level, because the lock is
near-permanent — see `Notes/goals-linking-redesign-notes.md`.

---

## 4. Mounts

A **fixed catalogue** — every character always has exactly the mounts in
`MOUNT_DEFS`, ordered by rarity as the in-game stable lists them. Name and
rarity are static; only the player's star level and rolled values persist.

- **`star === 0` means NOT OWNED.** There is no separate owned flag.
- Each mount's HP%/ATK% bonus is a **roll within the star level's observed
  range**, not a fixed number, so the UI offers a bounded slider per value.
  Raising a star re-clamps existing rolls into the new range rather than
  resetting them.
- Which mount is **ridden is per-preset** (`preset.mountId`), while the star
  and rolls are character-wide. Glyph equip state rides on the mount — see
  `data-model.md` §2 for that three-way scope split.
