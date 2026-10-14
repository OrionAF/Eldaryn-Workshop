# Eldaryn Gear Optimiser

A build optimiser for the Eldaryn mobile game (client 2.7.0), built on ports of the game's own
stat pipeline and combat engines. All four classes and eight specs.

- **Drop Check** — is this drop an upgrade? Per equipment set, with simulated DPS, survival and
  optional PVP win-rate deltas, each with a confidence interval.
- **Optimiser** — searches talents, sigils, relics, pet, mount and glyphs, transcendence preset and
  gear set for the best PVE result against a dummy, campaign chapter, dungeon step, Oblivion floor,
  World Boss or custom mob.
- **Duel** — simulates PVP fights against saved opponents with the game's own arena resolver.
- **Oblivion** — the second hero: its realm stats, Oblivion Power and a floor-by-floor win table.

Enter your in-game stat sheet on a preset and the app shows, stat by stat, how far its own
calculation is from the game's.

Static client-side app: Vite + Svelte 5, no backend, persists to `localStorage` in your browser
(plus explicit Export/Import for `.json` backups). Game mechanics are documented in
`docs/Reference/Game/`; `CONTEXT.md` has the glossary.

## Development

```
npm install
npm run dev       # dev server with hot reload
npm test          # run the Vitest suite
npm run sync:data # copy docs/Reference/Game/data/*.json into src/data/game
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds, and publishes to
GitHub Pages via `actions/deploy-pages`. One-time repo setup required: **Settings → Pages →
Build and deployment → Source: GitHub Actions**.

## Legacy reference

`EldarynTracker/` (gitignored, not part of the deployed app) is the original Python/Streamlit
prototype and gear-data collection tooling this app was ported from. It's kept locally as
historical reference only.
