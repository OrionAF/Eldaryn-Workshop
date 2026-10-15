# Handoff (2026-10-15, cloud session hit its usage limit)

Everything the agents had not merged is preserved here; nothing lives only in the old container.

## Restore unfinished branches
`git fetch docs/WIP/being-worked-on/handoff/wip-branches.bundle 'refs/heads/*:refs/heads/*'`
gives back every `rebuild2/*` and `wip/*` branch (each agent's unfinished work is one "WIP (session limit...)" commit on top).

## Queue (user's order); specs are the backlog sections
1. §10 Push: **merged**. §14 mount pruning: **merged**.
2. §10 Fortress shield fix: branch `rebuild2/O3b` (+ `-r1` if present): implemented; needs review, then merge.
3. §13 Glyph dominance pruning (slice G1): branch `rebuild2/G1` / `wip/*`: was mid-build.
4. §12 Highest chance to win: `rebuild2/W3-wip` (+ `rebuild2/W3` if present): mid-build.
5. §15 Fortress boss fight from the server log (F2): not started. Fixture `fixtures/fortress-boss-top-fight.json`, attacker `fixtures/profile-sentinel-l85-miss.json`.
6. §11 Celestial Optimiser target (C2): not started. Engine merged; reverse-engineered rules in `celestial/REPORT2.md`.
7. §6 results clarity, 8. §1 step list, then the rest of the backlog table.

## Here
- `fixtures/`: sanitised real captures (user's own characters, one leaderboard tank with ids stripped, Celestial and Fortress logs). Copy into `src/lib/__fixtures__/real/` when a slice needs them.
- `celestial/`: Celestial log forensics (round 1 and 2 reports, per-lane findings).
- `tooling/`: the slice workflow (`slice-builder-v3.js`: implement in a worktree, Sonnet review, one fix round, serialized merge) and its merge scripts (Linux paths; adapt for a local run). Model/effort rule: CLAUDE.md "Agents and token use".
- The extracted 2.7.0 client is not here: extract `docs/Extracted game data/` outside the repo.
