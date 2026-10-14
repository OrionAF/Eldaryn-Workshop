# Archive/outdated-notes — superseded notes

Notes that were accurate and got overtaken by later work. They describe a state
the app has genuinely moved past.

These are usually *right about the past*, which makes them more dangerous than
scrapped work: they read as correct because they were. Treat every claim here
as "true on the date at the top, and not since".

**Every file needs a `Superseded by:` pointer** to whatever replaced it, so the
trail runs both directions.

## Contents

| Document | Superseded | By |
|---|---|---|
| `combat-model.md` | 2026-10-14 | `Reference/Game/stats.md`, `combat-pve.md`, `combat-pvp.md`. Still describes what the pre-rebuild `src/` does. Its game claims were measured or invented; the client refutes several (avoidance roll, penetration, timeout winner, Attack % buff stacking, Miss hard cap) |
| `combat-audit-2026-07-28.md` | 2026-10-14 | `Reference/Game/combat-pve.md`, `combat-pvp.md`. Its open item (the PVP survivability factor's shape) is moot: the client ships the real fight model |
| `calibrate-pvp-refs.mjs` | 2026-10-14 | nothing. It fitted invented PVP reference constants, which the real fight model replaces. Imports `src/` modules that the rebuild will remove |
| `game-systems.md` | 2026-10-14 | `Reference/Game/*` (progression systems per document) |
| `big-rework-v1-notes.md` | 2026-10-14 | `Reference/Game/mounts-glyphs.md`, `sigils.md`, `pets.md`. Its data derivations were fitted to screenshots; the client gives the exact tables |
| `private-repo-setup.md` | 2026-10-14 | nothing. `docs/`, `CLAUDE.md` and `CONTEXT.md` moved into the main repo, which is now private; the separate `edoc` repo is no longer used |
| `comment-to-docs-migration.md` | 2026-10-14 | finished work; the rule it enforced lives in `docs/README.md` |
| `open-questions-2026-07-28.md` | 2026-10-14 | `Reference/Game/stats.md` (Q1) and `combat-pve.md`. Q2's answer, that Attack % buffs add into the % total, is refuted by the client: they multiply final Attack |
| `0001-defer-pvp-combat-modeling.md` | 2026-07-28 | `Reference/combat-model.md` — the defensive/PVP stats it deferred now drive the duel engine, both goal objectives and the gauntlet |
| `LOST-2026-07-09-pvp-build-optimizer-design.md` | 2026-07-28 | the shipped implementation (`pvpOptimizer.js`, `optimizerObjectives.js`, `PvpScreen.svelte`) — placeholder only, the document was destroyed |
| `LOST-design_handoff_preset_redesign.md` | 2026-07-28 | `model.js`'s header + `Reference/Notes/goals-linking-redesign-notes.md` — placeholder only, the bundle was destroyed |

The `LOST-` prefix marks a placeholder for a document that no longer exists at
all. See `../DATA-LOSS-2026-07-28.md`.
