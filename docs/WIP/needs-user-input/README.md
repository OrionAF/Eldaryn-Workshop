# WIP/needs-user-input — blocked on you

Questions only the user can answer, or measurements only they can take from the
game.

## What belongs here

A document belongs here when work is genuinely **blocked** — not merely when a
question would be nice to have answered. If sensible work can continue under a
stated assumption, do that instead and record the assumption.

## Required shape

Every document states, for each question:

1. **The question**, in one sentence, answerable without reading the codebase.
2. **How to get the answer** — the exact in-game observation, screenshot or
   comparison. The user should never have to design the experiment.
3. **What changes either way** — what we do if the answer is A vs B. If nothing
   changes, it is not blocking and does not belong here.

Questions phrased so the user has to reverse-engineer what is being asked are
the failure mode this folder exists to avoid.

## Exit

When answered, the answer becomes **[RULED]** or **[OBSERVED]** provenance in
`Reference/combat-model.md`, the resulting work moves to `../being-worked-on/`,
and the question is struck from the open list here.

## Contents

- `open-questions.md` — three questions from the 2026-07-28 combat audit
  (tasks #1–#3).
