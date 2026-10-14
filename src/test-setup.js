/**
 * Global vitest setup (see vite.config.js `test.setupFiles`).
 *
 * rosterStore is a module-level singleton loaded once at import time. Since
 * loadRoster() returns an empty roster (no characters - the landing page
 * state) whenever localStorage is empty, and component tests assume there is
 * already a current character to render/act on, this guarantees one exists
 * before every test regardless of what a given test file's own beforeEach does
 * with localStorage. The seeded 'Test' character is a Warrior on the v2 model
 * (rebuild-plan §3); tests that need another class call setCharacterClass.
 */
import { beforeEach } from 'vitest';
import { rosterStore } from './lib/rosterStore.svelte.js';

beforeEach(() => {
  if (rosterStore.roster.characters.length === 0) rosterStore.addCharacter('Test', 'WARRIOR');
});
