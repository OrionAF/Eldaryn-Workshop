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

When answered, the answer goes into the owning `Reference/Game/<system>.md`
(or the app's own docs, if it is about the app). The resulting work moves to
`../being-worked-on/`, and the question is struck from the open list here.

Since 2026-10-14 most game questions can be answered from the decompiled
client (`Reference/Game/`), not by asking. Ask the user only about what the
client cannot show: [SERVER] values, and their own goals and preferences.

## Contents

Nothing is currently blocked on the user. The 2026-07-28 questions were all
answered and are archived as `Archive/outdated-notes/open-questions-2026-07-28.md`.
The 2.7.0 client refutes one of those answers (Q2, how Attack % buffs stack);
see `Reference/Game/combat-pve.md`.
