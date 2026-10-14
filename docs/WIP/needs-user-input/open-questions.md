# Open questions — blocked on the user

> **Status:** All answered · **Raised:** 2026-07-28 · **Closed:** 2026-07-28
> **Source:** combat audit F7, F3, D3 · **Tasks:** #1, #2, #3 — all complete

Nothing is currently blocked on the user.

The three questions raised by the combat audit were answered on 2026-07-28 and
the answers are applied. Full outcomes are recorded where they belong — the
answers themselves in `Reference/`, the findings in the audit — rather than
here, so this file does not become a second source of truth.

## What was settled

| Q | Answer | Landed in |
|---|---|---|
| **Q1 / F7** — does the stat sheet show raw or effective? | **Both.** The big number is EFFECTIVE (the only one combat uses), with RAW beneath it and an `N% GAIN` marginal figure. The app's assumption was correct. | `combat-model.md` §2; audit F7 |
| **Q2 / F3** — how do timed Attack % buffs stack? | **Additive into the % total** (175% + 20% = 195%). The documented rule was right; all three engines were wrong. | `dps.js` `buffedAttack`; audit F3 |
| **Q3 / D3** — keep the "Self-Healing / s" tile? | **Remove**, redesign properly later. | `SimulationScreen.svelte`; audit D3 |

## Evidence, filed

The `temp-Q1/` folder has been emptied into `Reference/Source/`, where source
material belongs:

- `Source/screenshots/misc/stat-sheet-block-chance.png` — the stat sheet
  showing 52.5% / RAW 56.4% / 57% GAIN. **Cited by `combat-model.md` §2** as
  the confirmation of the soft-cap curve; do not move or rename it.
- `Source/investigations/stat-sheet-2026-07-28-roster.json` — the matching
  roster export, so the screenshot's numbers can be reproduced from the app.

## Unexpected result worth remembering

Q1 was asked to settle whether Manual totals were being handled correctly. They
were. But the screenshot also carried the game's own **GAIN** figure, which let
us check the soft-cap curve's *derivative*, not just a point on it:

| | Game | Our curve |
|---|---|---|
| Block, raw 56.4 → effective | 52.5% | 52.452% |
| marginal value of next point | 57% | 57.15% |

A wrong curve shape can coincidentally match one value. Matching its slope at
the same time is much harder to fake. **A question asked to check one thing
verified something else entirely** — worth remembering when deciding whether a
screenshot is worth capturing.

---

## Adding a new question here

Follow the shape in this folder's README: the question in one sentence, exactly
how to get the answer, and what changes either way. If nothing changes either
way, it is not blocking and does not belong here.
