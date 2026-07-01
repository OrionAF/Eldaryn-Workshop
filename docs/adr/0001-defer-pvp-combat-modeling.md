# Defer PVP combat modeling; add its stat fields now

The Phase 0 UI grilling session surfaced a full PVP damage formula (rating-based PVP
Attack/Defense with a diminishing-returns conversion to effect %, chained with DMG Reduction —
see `CONTEXT.md`) plus several defensive stats (Block/Miss/Blind/Penetration/Paralyze Chance)
that don't exist in the original handoff's PVE-only scope. We decided to add all of these to
`OffensiveStats` (`src/lib/dps.js`, `constants.js`'s `STAT_FIELDS`) and carry them through gear-swap
math now, but not implement any PVP-facing damage calculation, opponent-stat modeling, or UI in
this phase. Rationale: building the full PVP combat system (which needs an opponent's stats, not
just the player's) is a materially larger scope-add than a Phase 0 UI build, but retrofitting the
stat schema later — after other Phase 1+ work is already built on top of it — would be more
disruptive than defining the fields (unused) now. Without this note, a future reader would
reasonably wonder why `pvp_attack`/`pvp_defense`/etc. exist on every gear piece and profile total
but are never read by `computeDps`/`computeHps`/`compareSwap`.
