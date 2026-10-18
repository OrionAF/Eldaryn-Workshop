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
(plus explicit Export/Import for `.json` backups). Game references in `docs/Reference/Game/`
and the glossary in `CONTEXT.md` are kept locally and are not included in a clone.
The app's required catalogues are tracked in `src/data/game/`.

## Development

```
npm install
npm run dev       # dev server with hot reload
npm test          # run the Vitest suite
npm run sync:data # optional: refresh catalogues from local docs/Reference/Game/data
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

Running and building the app do not require the local `docs/` or `graphify-out/` folders.
`sync:data` requires the local reference files; the data parity tests skip when they are absent.

## Running it

Local only for now: `npm install`, then `npm run dev` and open the printed URL
(http://localhost:5173). The build bundles the extracted game catalogues, which are not to be
published, so the GitHub Pages workflow (`.github/workflows/deploy.yml`) is manual-only.

## Legacy reference

`EldarynTracker/` (gitignored, not part of the deployed app) is the original Python/Streamlit
prototype and gear-data collection tooling this app was ported from. It's kept locally as
historical reference only.

The local optimiser includes the targeted Eldaryn 2.7.4 upgrade: Warrior stances, renamed auras and PvP cast lockout. Celestial class-ranking/Mythic rule references are refreshed; the fight simulator remains Normal/Hard. Source/version boundaries: [game references](docs/Reference/Game/README.md) and [2.7.4 evidence](docs/2.7.4/README.md). Do not publish the extracted catalogues.
