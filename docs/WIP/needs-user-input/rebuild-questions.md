# Rebuild — questions for the user

> **Status:** open · **Raised:** 2026-10-14 · **Source:** `../being-worked-on/rebuild-plan.md` §8

None of these block the overnight build. The default in each one is what is being built until you
say otherwise.

## Q1 — Is publishing the extracted game catalogues OK?

The rebuilt app bundles `src/data/game/*.json` (talent trees, sigils, relics, transcendence boards,
…, copied from `docs/Reference/Game/data/`). When the app is deployed to GitHub Pages, those files
are publicly downloadable, even though the repo is private.

- **How to answer:** yes / no, and whether the `source`/line-citation fields should be stripped from
  the shipped copy.
- **What changes:** "no" means the app needs a different hosting/privacy approach before it ships.
  Stripping citations is a small build step.
- **Default meanwhile:** the files are bundled as-is; nothing is deployed.

## Q2 — Should the optimiser also search for PVP win rate (plan slice F5)?

The standalone Duel screen simulates fights against saved opponents either way. F5 would add
"find the build with the best win rate against my saved opponents" to the optimiser. It is slow,
because each candidate needs hundreds of simulated duels.

- **How to answer:** yes / no.
- **What changes:** yes adds slice F5 after the optimiser and duel slices.
- **Default meanwhile:** F5 is not built.

## Q3 — GitHub Pages on a private repo

The repo is private now. GitHub Pages for a private repo requires a paid plan (Pro/Team), so the
live site may already be offline.

- **How to answer:** check repo Settings → Pages; tell me whether to keep deploying there or
  somewhere else.
- **What changes:** only deployment. The rebuild is not merged to `main` until you decide.
