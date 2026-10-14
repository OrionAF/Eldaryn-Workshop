# WIP/being-worked-on — the active queue

What is in hand right now.

## Contents

**`combat-audit-2026-07-28.md`** — the combat and search-layer audit. Findings
F1–F29 plus deferred fixes D1–D3, ranked by blast radius × likelihood of being
wrong.

Coverage: dps, statCaps, totals, both simulators, sigilEffects, every
objective, dropGoals, statWeights, gauntlet/archetypes, optimizer,
relicSuggester, linkingSimulation.

**Status: 22 closed, 2 closed in part, 4 open.** Its own Status block is the
authority; read that before assuming a finding is live.

**Nothing is waiting on a decision.** The three that were — F13 (DR's double
weighting: intended, now documented), F17 (talent budget: always endgame) and
F27 (the "Attack %" probe: now a true percentage point) — were ruled on
2026-07-29 and applied.

**What is left is one piece of work: §C item 1, the PVP survivability factor.**
F4 and F6 *are* that item; F15 and F19 are documented search-redesign notes
that are not urgent.

Item 2 (constant calibration) ran and changed nothing — deliberately:
`REF_BLOCK` turned out to already be optimal, `REF_MISS` turned out not to
matter, and the best full refit gained nothing on held-out data. That is the
audit's own stated test for "the shape is wrong", so the redesign is promoted.

Before starting it, read **F28** — the obvious physical fix (capping overheal)
has been tested and makes agreement worse — and **F29**, on why the damage
factor's negative correlation is correct and must not be tuned away.
`docs/tools/calibrate-pvp-refs.mjs` is the acceptance test: beat ρ = 0.664 on the
16-build field and 0.714 on the held-out contract field.

**`github-issues-2026-07-29.md`** — triage of all 10 open GitHub issues, each
traced to a root cause in the source. **Status: investigated, nothing fixed.**

Two need a user decision before they can land (#3's wipe scope, #8's
roster-replacing import); #10 wants a confirmation but does not block.

**Read §10 before touching sigil effect magnitudes.** It overturns a finding in
`Reference/Notes/big-rework-v1-notes.md`: the "OCR-mangled cell" that the
309/310 fit explained away was real data, and the missing piece is a 25% cap on
two stats. The fix carries a doc correction and a test rewrite with it.

**`comment-to-docs-migration.md`** — moving source-of-truth out of code
comments into `Reference/`. **Done**, with the definition of done deliberately
rewritten: the original ("every file has been read") was a claim about an
afternoon rather than a property of the code, so it was replaced by checks that
re-run in seconds — every `§` citation resolves, no comment names a missing
file, none points into `docs/WIP/`. Nine defects found across the two passes,
five of them the same species: a comment describing work as pending after it
shipped.

One residual risk is stated and left open: a comment that quietly stopped
matching its own function without tripping any check. That needs reading the
code, and is why `rosterStore` and the data catalogues got verified properly
rather than everything getting a promise.

## How to use it

Findings are a work queue, not a record. Mark them resolved *in the document*
as they land, recording what was done and where — the closed entries are the
pattern. When every finding is closed or archived, this document moves to
`Reference/Notes/` as the record of what the audit found.

**A closed finding's fact belongs in `Reference/`, not in this file and not in
a code comment.** Each closed entry above says which reference section now owns
what it established. Do not cite audit IDs from `src/` — this folder is
transient by design, so a source comment pointing at `docs/WIP/` becomes a
dangling reference the moment the audit moves.

`../needs-user-input/` is currently empty of open questions.
