import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// For GitHub Pages project sites the app is served from /<repo-name>/.
// Override at build time with BASE_PATH (the deploy workflow sets it from the repo name).
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [svelte()],
  // Under Vitest (plain Node, jsdom just supplies DOM globals) Svelte 5 would
  // otherwise resolve to its server/SSR build, where `mount()` is unavailable -
  // the 'browser' resolve condition makes it resolve the client build instead.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
  },
});
