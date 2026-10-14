# Reference/Source — raw truth

The evidence the app is designed on. Screenshots of the game, scraped tables,
patch notes, and the user's own answers about how the game behaves.

**Source material is never archived.** A screenshot of the game in July 2026 is
permanently a true record of July 2026, even after a patch changes the numbers
it shows. If newer captures supersede older ones, keep both and datestamp them
— the old capture is how we know what changed.

**Nothing in here is interpretation.** The moment you write down what a
screenshot *means* for the app, that belongs in `../Game/` (game facts)
or `../Notes/` (app decisions), and it inherits a provenance tag there.

## The primary source since 2026-10-14

`../../Extracted game data/idlehunt_2.7.0.zip.001`–`.007` is a split zip of the
extracted 2.7.0 client. It contains the decompiled bundle, string tables, the
earlier line-cited JSON builds, art and the original APKs. Everything in
`../Game/` was read from it, and it outranks every capture below. The captures
stay as the record of what the game showed before.

## Layout

- `screenshots/` — game captures, by system: `mounts/`, `relics/`, `talents/`,
  `transcendence/`, `misc/`. Notable: `misc/IMG_7384-mutual-kill-defeated.png`
  is the evidence that a mutual kill counts as a loss, cited by
  `pvpSimulation.js`.
- `game-data/` — scraped tables in text form (relic lists per class, the
  Sentinel transcendence tree).
- `investigations/` — paired artifacts from a specific question.
  `skewed-calculations/` holds a roster export plus the screenshot of the
  discrepancy it was captured to explain.
- `grilling.txt` — the user's raw answers from the goals/linking grilling
  session. Primary source: their words about their own game.

## Sources that live outside this folder

- `EldarynTracker/eldaryn_gear_optimiser_handoff.md` — the original domain
  spec (stat mechanics, formulas, stacking rules, per-source data). It belongs
  to the Python project and is referenced there rather than copied here, so
  there is exactly one of it.
- `EldarynTracker/combat_power_observations.csv` — 124 observed profiles.
  Valid raw data; the Combat Power derivation built on it is retired, but the
  measurements are untouched.
