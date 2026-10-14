# WIP — work in flight

Documents about work that is happening now, or blocked waiting on something.

Nothing here is settled truth. A WIP document describes intent, open questions
and findings — read the status line before acting on it.

## Two folders

**`being-worked-on/`** — the active work queue. Findings, plans and specs for
what is currently in hand.

**`needs-user-input/`** — blocked. Each document names a question only the user
can answer, or a measurement only they can take from the game, and states
exactly what would unblock it.

## Exit paths

When a WIP document is finished, it leaves — it never just sits here going
stale:

- The work landed and the document still describes current behaviour →
  `Reference/Notes/`, with a status header.
- The work landed and the document was only a plan → archive it under
  `Archive/outdated-notes/`; the code is now the truth.
- The approach was dropped → `Archive/scrapped/`, with the reasoning.
- The document established a game fact → fold it into the owning
  `Reference/Game/<system>.md` and archive the rest.
