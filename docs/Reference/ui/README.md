# Reference/ui — the app's interface

> **Status:** Current · **Last verified:** 2026-10-15
> **Covers:** the design system and information architecture the 2026-10-15 UI rebuild was built to.

- `design-system.md` is authoritative for tokens, type, panel levels, focus, breakpoints and every
  component's states. Its §5 amends `ia.md`.
- `wording.md` is the voice of every user-facing string: plain words for players, the term glossary,
  and where precise detail goes.
- `ia.md` is the information architecture: three task areas (Character, Builds, Tools), the global
  chrome, the flows, and the parity table. Code comments cite it as `ia.md §n`.
- `tokens.css` and `components.css` are the reference CSS. The tokens live in `src/app.css`, and
  `components.css` is not imported by the app.
- `mockup.html` is the reference mockup (views `#v1` to `#v17`). All of its data is invented.

## Where the app knowingly differs from these documents

These were accepted at build time. Anything else that differs is a bug.

- A1 items 3-5 and isBinary/sd/bootstrap resort notes; Tango and order covered by doc update
- A2 items 1-3,5,6,8,9; A3 untagged assumptions/residual policy; A4 impl/fix items (converged covered in P4)
- B1/D1, E1-E4 impl items (N=300 default), F1 items 1-7 apart from C2/C3, F2 fight-cap text
- H1-H3, J1 postMessage throw, M1/M2/M3/S1 listed items, U0-U12 listed minor items, X1 doc-only items
- Old OblivionScreen/FloorTable already deleted; components/optimiser has no orphans
- U12 StatTable unused until P1 B5 caller added; Activity entry/clearAllData not touching eldaryn_ui_v1 left as minor
