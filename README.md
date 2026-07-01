# Eldaryn Gear Optimiser

A PVE DPS/HPS gear-swap comparator for the Eldaryn mobile game. Enter a character's profile
totals and equipped gear per slot, across two loadouts (mirrors the game's Set 1/Set 2), then
compare a candidate drop against both loadouts at once and apply the winner.

Static client-side app: Vite + Svelte 5, no backend, persists to `localStorage` in your browser
(plus explicit Export/Import for `.json` backups). See `CONTEXT.md` for domain terminology and
`docs/adr/` for architectural decisions.

## Development

```
npm install
npm run dev       # dev server with hot reload
npm test          # run the Vitest suite
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
