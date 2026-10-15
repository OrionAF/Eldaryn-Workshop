# WIP/being-worked-on — the active queue

What is in hand right now.

## Contents

**`rebuild-plan.md`**: the architecture, persisted model v2 and slice plan for the 2026-10-14
rebuild. About 50 code comments cite its §2 to §8 (layers and the persisted model). Those sections
still describe the code. Its §5 (the tiered beam search) is superseded by
`Reference/simulation.md`. Once the citations are moved to `Reference/data-model.md` and
`CLAUDE.md`, this file goes to the archive.

**`rebuild-progress.md`**: the 2026-10-14 rebuild log. It goes to the archive with `rebuild-plan.md`.

**`backlog.md`**: features the user asked for, queued after the current speed work: the optimiser step
list, PVP opponents imported from Rankings profiles, setup estimates, and a PVE win-rate goal ("clear without
dying").

**`github-issues-2026-07-29.md`**: triage of the 10 GitHub issues open on 2026-07-29, written
against the v1 app. The 2026-10-15 redesign replaced every component they name, so re-check each
issue against the current app before fixing or closing it. Closing them on GitHub is the user's call.

## Finished on 2026-10-15

The accuracy-first simulator and UI redesign is built and merged. Its plan, audit findings and
summary are archived in `Archive/outdated-notes/redesign-2026-10-15/`. The contracts it produced are
in `Reference/simulation.md`, `Reference/data-model.md` and `Reference/ui/`. Decisions it left open
are in `../needs-user-input/redesign-decisions.md`.
