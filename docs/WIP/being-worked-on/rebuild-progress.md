# Rebuild progress log

> **Status:** in progress · **Plan:** `rebuild-plan.md` · **Branch:** `claude/sweet-cannon-klhjs3`

How the build runs: each wave's slices run in parallel, one agent per slice in its own git
worktree. The orchestrator cherry-picks each slice's commit, runs `npm test` and `npm run build`
on the merged tip, and pushes only when both are green.

## Waves

| Wave | Slice | Status | Commit | Notes |
|---|---|---|---|---|
| 1 | S00 Branch CI | merged | `325f93c` | `.github/workflows/ci.yml` runs on every non-main push |
| 1 | S01 Retire invented screens | merged | `d9b53dc` | 14 placeholder screens; 11 old screen tests quarantined as `*.legacy-test.js`; the EldarynTracker CSV tests are deleted |
| 1 | D1 Data sync + core catalogues | merged | `c964a2b` | `npm run sync:data`, `src/data/game/`, `game/{stats,classes}.js` |
| 1 | E0 RNG + types | merged | `f8daa3c` | `engine/rng.js`, `engine/types.js` |
| — | Vitest excludes `.claude/**` | merged | `2d12e4e` | agent worktrees live inside the checkout |

After wave 1: 50 test files, 612 tests, build green.

## Findings to fold back into docs

Things the slices found that contradict or extend a `Reference/Game` doc. Each is resolved in the
owning doc once confirmed.

- (none yet)

## Left for X1 (cleanup)

- Unrouted legacy components still import deleted ones: `PresetEditor.svelte` imports
  `GoalSliders`, and `RunHistoryPanel.svelte` imports `GoalTimelineChart`. Nothing routed reaches
  them; X1 deletes both.
