# LOST — Preset redesign design handoff bundle (2026-07-03)

> **⚠️ PERMANENT LOSS. This bundle is gone and cannot be reconstructed.**
> Destroyed 2026-07-28; see `../DATA-LOSS-2026-07-28.md`.

## What it was

`design_handoff_preset_redesign/`, 21 files, ~500 KB — the handoff bundle for
the Preset redesign, dated 2026-07-03:

- `README.md` (21 KB) — the handoff brief itself
- `Current UI.dc.html` (77 KB) — a working snapshot of the UI as it then was
- `Preset Prototype.dc.html` (101 KB) — the proposed redesign, interactive
- `Redesign Directions.dc.html` (83 KB) — alternative directions explored
- `support.js` (58 KB) — the harness driving those prototypes
- `lib/` — 17 copied `src/lib` files (9 modules + 8 test files)

## What the loss actually costs

**Irreplaceable:** the three HTML prototypes, the handoff README, and
`support.js`. They were the only record of how the Preset redesign was
explored and presented. That redesign has since shipped, so their forward
value was low — but as a design record they are simply gone.

**No unique information:** the 17 `lib/` copies were a 2026-07-03 snapshot of
`src/lib`, which has evolved far past them (the goals/linking redesign and
BigReworkV1 both landed since).

**No coverage impact:** the 8 test files ran in the vitest suite (123 tests),
which is why the suite dropped from 74 files / 838 tests to 66 / 715. Every
one of them tested the *copies* above, not live `src/lib`. Coverage of the
actual application is unchanged.

## Where the shipped result lives

The redesign this bundle described is documented in `model.js`'s header
comment (the character-wide vs per-preset split) and in
`Reference/Notes/goals-linking-redesign-notes.md`, which supersedes it.
