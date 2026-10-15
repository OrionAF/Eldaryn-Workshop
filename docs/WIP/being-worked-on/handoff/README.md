# Handoff (2026-10-15, cloud session hit its usage limit)

Everything the agents had not merged is preserved here; nothing lives only in the old container.

## Branches (updated 2026-10-15, local session)
Every bundle branch except `rebuild2/S1-wip` is merged into main and deleted locally. `S1-wip` was dropped (§13 replaced it) and is kept only until the user says to delete it. The bundle still holds every branch.

## Queue (user's order); specs are the backlog sections
1. Merged: §10 Push, §14 mount pruning, §10 Fortress shield fix (O3b), §13 glyph pruning (G1), §12 highest chance to win (W3). Full suite on main: 2,808 tests pass.
2. Next: §15 Fortress boss fight from the server log (F2): not started. Fixture `fixtures/fortress-boss-top-fight.json`, attacker `fixtures/profile-sentinel-l85-miss.json`.
3. §11 Celestial Optimiser target (C2): not started. Engine merged; reverse-engineered rules in `celestial/REPORT2.md`.
4. §6 results clarity, §1 step list, then the rest of the backlog table.
5. Follow-up from W3 (backlog §12 open item): on content where almost nothing wins (Hard Forsaken Mines step 6), the highest-chance goal costs about 2x the fights of the old target goal (1.56M vs 0.76M), all in minimise and confirm, which compare progress with no tolerance. A small progress tolerance (a delta for the margin) should fix it.

## Here
- `fixtures/`: sanitised real captures (user's own characters, one leaderboard tank with ids stripped, Celestial and Fortress logs). Copy into `src/lib/__fixtures__/real/` when a slice needs them.
- `celestial/`: Celestial log forensics (round 1 and 2 reports, per-lane findings).
- `tooling/`: the slice workflow (`slice-builder-v3.js`: implement in a worktree, Sonnet review, one fix round, serialized merge) and its merge scripts (Linux paths; adapt for a local run). Model/effort rule: CLAUDE.md "Agents and token use".
- The extracted 2.7.0 client is not here: extract `docs/Extracted game data/` outside the repo.
