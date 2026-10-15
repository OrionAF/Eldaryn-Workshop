// Route smoke test (plan U12): every routed page mounts without throwing for a classless
// character, a fresh one with a class, and the full fixture character.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import App from './App.svelte';
import { PAGES } from './lib/routes.js';
import { syncRouter } from './lib/router.svelte.js';
import { rosterStore } from './lib/rosterStore.svelte.js';
import { fixtureCharacter } from './lib/build/fixtures.js';
import { setup } from './components/ui/testkit.js';

function only(c) {
  rosterStore.roster.characters.splice(0, rosterStore.roster.characters.length, c);
  rosterStore.roster.currentId = c.id;
}
function fresh(cls) {
  only(fixtureCharacter('WARRIOR'));
  const id = rosterStore.addCharacter('Fresh', cls);
  const c = rosterStore.roster.characters.find((x) => x.id === (id?.id ?? id)) ?? rosterStore.roster.characters.at(-1);
  only(c);
}
const CASES = {
  'empty (no class)': () => fresh(null),
  'fresh (class, nothing else)': () => fresh('WARRIOR'),
  'fixture character': () => only(fixtureCharacter('WARRIOR')),
};

let t;
afterEach(() => {
  t?.done();
  t = null;
});

for (const [label, prep] of Object.entries(CASES)) {
  describe(label, () => {
    for (const page of PAGES) {
      it(`renders ${page.id}`, () => {
        localStorage.clear();
        prep();
        location.hash = `#/${page.id}`;
        syncRouter();
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
          t = setup(App, {});
          flushSync();
          const main = t.q('main#main');
          expect(main).not.toBeNull();
          expect(main.textContent.length).toBeGreaterThan(0);
          // Page marker: the context header heading names the routed page (ia.md §6).
          expect(t.q('h1')?.textContent.trim()).toBe(page.title);
          expect(err).not.toHaveBeenCalled();
        } finally {
          err.mockRestore();
        }
      });
    }
  });
}
