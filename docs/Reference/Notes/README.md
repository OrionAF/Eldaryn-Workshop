# Reference/Notes — current derived notes

Records of decisions, design work, reviews and fixes that are **still accurate
today**. Anything here can be cited without checking it first — that is the
whole promise of this folder, and it only holds if the promise is enforced.

## Required header

Every file starts with a status block:

```markdown
> **Status:** Current · **Last verified:** YYYY-MM-DD
> **Covers:** one line on what this document is authoritative about.
```

`Last verified` is deliberately not `Created`. The question a reader has is
"is this still true", and a creation date cannot answer it. Update the date
when you re-check the document against the code — and only then.

## The archive rule

**When later work makes a note wrong, move it to
`../../Archive/outdated-notes/` in the same change.** Not next sprint, not
when someone notices.

Wrong means *contradicts current behaviour*, not *incomplete*. A note that
describes three of four systems is current-but-partial and stays. A note that
says the health multiplier is a user setting when it is now a constant is
wrong and goes.

When you archive one, add a `Superseded by:` line pointing at whatever replaced
it, so the trail is followable in both directions.

## Why this is enforced hard

The 2026-07-28 combat audit found that every expensive error in this project
had the same shape: documentation that was accurate when written, silently
became false, and then *prevented* re-examination because it read as
authoritative. Four separate code comments had been lying for weeks. A stale
note is worse than no note, because it answers the question you would otherwise
have gone and checked.
