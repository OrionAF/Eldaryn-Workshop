/**
 * Global vitest setup (see vite.config.js `test.setupFiles`).
 *
 * rosterStore is a module-level singleton loaded once at import time. Since
 * loadRoster() now returns an empty roster (no characters - the landing
 * page state) whenever localStorage is empty, and many existing component
 * tests assume there's already a current character to render/act on, this
 * guarantees one exists before every test regardless of what a given test
 * file's own beforeEach does with localStorage.
 */
import { beforeEach } from 'vitest';
import { rosterStore } from './lib/rosterStore.svelte.js';

beforeEach(() => {
  if (rosterStore.roster.characters.length === 0) rosterStore.addCharacter('Test');
});
