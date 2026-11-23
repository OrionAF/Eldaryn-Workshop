import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { configDefaults } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// The build id a speed calibration is tied to (lib/calibration.js): package version plus the commit,
// since any engine change can move the speed. Without a repository the version alone.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  // not a checkout
}
const appVersion = commit ? `${pkg.version}+${commit}` : pkg.version;

// For GitHub Pages project sites the app is served from /<repo-name>/.
// Override at build time with BASE_PATH (the deploy workflow sets it from the repo name).
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [svelte()],
  // Under Vitest (plain Node, jsdom just supplies DOM globals) Svelte 5 would
  // otherwise resolve to its server/SSR build, where `mount()` is unavailable -
  // the 'browser' resolve condition makes it resolve the client build instead.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    environment: 'jsdom',
    globals: true,
    // Logic tests (engine, model, search, game data, scripts) never touch the DOM, so they run in plain
    // Node; building a jsdom window per file cost about 0.85 s each. The few src/lib tests that do need
    // localStorage/document/window declare `// @vitest-environment jsdom` on their first line, and one that
    // forgets fails loudly with a ReferenceError. Component tests and src/*.test.js keep the jsdom default.
    environmentMatchGlobs: [
      ['src/lib/**', 'node'],
      ['src/data/**', 'node'],
      ['scripts/**', 'node'],
    ],
    setupFiles: ['./src/test-setup.js'],
    // Agent worktrees live under .claude/worktrees inside the checkout; never collect their copies.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
