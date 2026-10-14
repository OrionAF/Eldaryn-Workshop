# tools — the scripts behind the numbers

Run-by-hand analysis scripts. Everything here exists to **produce or re-check a
number that a document in `Reference/` states as fact**.

## Contents

**`gamedata/`** — the scripts that map the decompiled game client. These
produce the line numbers that every `Reference/Game/*.md` document cites.

```
python3 -I docs/tools/gamedata/index_modules.py <decompiled.js> modules.json
python3 -I docs/tools/gamedata/filter_logic_modules.py modules.json logic_modules.tsv
```

- `index_modules.py` lists every Metro module with its line range, deps,
  original function names and top strings.
- `filter_logic_modules.py` keeps only the likely game-logic modules.
- `logic_modules-2.7.0.tsv` is the filtered output for 2.7.0: 1,350 modules.
  Diff a new version's output against it to see which systems changed.

Run them against an extract that sits outside the repo. Never run anything
from inside the extract. The steps are in `Reference/Game/README.md`.

`calibrate-pvp-refs.mjs` was archived on 2026-10-14. The PVP reference
constants it fitted were invented stand-ins for a fight model we could not see.
The 2.7.0 client contains the real one.

## Why these live in `docs/`, not in the published tree

A script whose only job is to generate evidence for a document belongs beside
that document. Nothing in `src/` imports anything here, and `npm test` does not
run it — it takes arguments, prints a report, and asserts nothing, because
"what should this constant be?" is not a pass/fail question.

**The measurement logic is deliberately NOT here.** It lives in
`src/lib/pvpRankAgreement.js` and `src/lib/pvpCalibrationField.js`, which are
imported by both this harness *and* `src/lib/pvpModelContract.test.js`. Two
implementations of "how much do the two models agree" would be free to disagree
with each other, which is precisely the failure this area kept producing. A
script here should orchestrate and report; if it starts *computing* something a
document depends on, that computation belongs in `src/` under test.

## Rules

1. **A script here must name the document it serves**, in its header. A tool
   nobody can trace to a claim is a tool nobody will maintain.
2. **State the invocation, including a realistic argument set.** The defaults
   should be the ones that produced the recorded numbers.
3. **Re-run it before citing its output as current.** These are not in CI, so
   nothing tells you when a change to `src/` has invalidated a recorded result.
   That is the accepted cost of them not being tests.
4. **If a script stops running, fix it or archive it in the same change.** This
   folder's failure mode is worse than a stale document: prose that goes false
   is still readable, but a broken script silently removes a document's ability
   to be re-verified, and the document goes on looking authoritative.
