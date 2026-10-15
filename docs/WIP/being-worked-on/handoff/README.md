# Handoff (2026-10-15, cloud session hit its usage limit)

Everything the agents had not merged is preserved here; nothing lives only in the old container.

## Branches (updated 2026-10-15, local session)
Every bundle branch except `rebuild2/S1-wip` is merged into main and deleted locally. `S1-wip` was dropped (§13 replaced it) and is kept only until the user says to delete it. The bundle still holds every branch.

## Queue
The live order and status are in `backlog.md` (its table). Merged on 2026-10-15: §15 Fortress boss on the duel engine (F2), §11 Celestial Optimiser target (C2), §1 step list, §3 setup estimates. Also merged: §6 results clarity (Drop Check session, 0fb35ba). Follow-ups: the §12 progress tolerance and Push on the Celestial Trial.

## Here
- `fixtures/`: sanitised real captures (user's own characters, one leaderboard tank with ids stripped, Celestial and Fortress logs). Copy into `src/lib/__fixtures__/real/` when a slice needs them.
- `celestial/`: Celestial log forensics (round 1 and 2 reports, per-lane findings).
- `tooling/`: the slice workflow (`slice-builder-v3.js`: implement in a worktree, Sonnet review, one fix round, serialized merge) and its merge scripts (Linux paths; adapt for a local run). Model/effort rule: CLAUDE.md "Agents and token use".
- The extracted 2.7.0 client is not here: extract `docs/Extracted game data/` outside the repo.
