import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import OptimiserScreen from '../screens/OptimiserScreen.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { fixtureCharacter } from '../../lib/build/fixtures.js';
import { cloneAsOpponent } from '../../lib/features/duel.js';
import { SCHEMA_VERSION } from '../../lib/model/index.js';

let target, app, nav;
const q = (sel) => target.querySelector(sel);
const btn = (re) => [...target.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()));
const click = (el) => {
  el.click();
  flushSync();
};

function load(withOpponent) {
  localStorage.clear();
  const base = fixtureCharacter('WARRIOR');
  const raw = JSON.parse(JSON.stringify(base));
  if (withOpponent) raw.opponents = [{ ...cloneAsOpponent(base, 'p1', 'WARRIOR_TANK', 'Tanky'), id: 'opp-a' }];
  rosterStore.importFromJson(JSON.stringify({ schemaVersion: SCHEMA_VERSION, currentId: raw.id, characters: [raw] }));
  target = document.createElement('div');
  document.body.appendChild(target);
  nav = vi.fn();
  app = mount(OptimiserScreen, { target, props: { onNavigate: nav } });
  flushSync();
}
afterEach(() => {
  unmount(app);
  target.remove();
});

const pickPvp = () => {
  const kind = q('[data-testid="target-kind"]');
  kind.value = 'pvp';
  kind.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
};

it('disables the PVP target with a link to the Duel screen when there are no saved opponents', () => {
  load(false);
  const opt = [...q('[data-testid="target-kind"]').options].find((o) => o.value === 'pvp');
  expect(opt.disabled).toBe(true);
  expect(q('[data-testid="pvp-hint"]').textContent).toMatch(/saved opponent/);
  click(btn(/Duel screen/));
  expect(nav).toHaveBeenCalledWith('duel');
});

it('picks opponents and a seat, runs, and shows N and a Wilson interval on every win rate', async () => {
  load(true);
  pickPvp();
  expect([...q('[data-testid="objective-kind"]').options].map((o) => o.value)).toEqual(['pvp-winrate']);
  expect(q('[data-testid="pvp-opponents"]').textContent).toMatch(/Tanky/);
  click(btn(/^Both seats$/));
  for (const label of ['Gear set', 'Talent set', 'Talent points', 'Pet', 'Mount', 'Glyphs', 'Sigils', 'Utility sigil', 'Ancient sigil', 'Sigil conditions', 'Transcendence']) {
    click(btn(new RegExp(`^${label}$`)));
  }
  click(btn(/^Quick$/));
  click(btn(/^Optimise/));
  await vi.waitFor(() => expect(q('[data-testid="optimiser-output"]')).not.toBeNull(), { timeout: 60000 });
  const base = q('[data-testid="baseline-row"]').textContent;
  expect(base).toMatch(/\d+\.\d%/);
  expect(base).toMatch(/\(\d+\.\d% to \d+\.\d%\)/);
  expect(base).toMatch(/N=\d+/);
  const results = q('[data-testid="optimiser-results"]').textContent;
  expect(results).toMatch(/N=\d+ \(\d+ x 2\)/);
  const matchups = q('[data-testid="matchups"]').textContent;
  expect(matchups).toMatch(/Tanky, I attack/);
  expect(matchups).toMatch(/Tanky, I defend/);
  expect(rosterStore.current.runs).toHaveLength(1);
  expect(rosterStore.current.runs[0].target.kind).toBe('pvp');
  expect(rosterStore.current.runs[0].objective.unit).toBe('p');
}, 70000);
