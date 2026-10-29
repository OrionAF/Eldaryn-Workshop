import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ToolsSpecGuidePage from './ToolsSpecGuidePage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { __resetJobs, jobsStore, startJob } from '../../lib/jobs.svelte.js';
import { statWeightsRequest } from '../../lib/features/statWeights.js';
import guide from '../../data/specGuide.json';

let target;
let app;

const RESULT = {
  aborted: false,
  damage: {
    bars: [
      { key: 'totalAttackSpeed', label: 'Attack Speed', pct: 8, pctLo: 7.6, pctHi: 8.4, delta: 4000, measurable: true },
      { key: 'totalCritChance', label: 'Crit Chance', pct: 1, pctLo: 0.6, pctHi: 1.4, delta: 500, measurable: true },
    ],
  },
  survival: null,
};

beforeEach(() => {
  localStorage.clear();
  __resetJobs({ run: () => ({ cancel() {}, promise: Promise.resolve(RESULT) }) });
  rosterStore.addCharacter('Guide', 'WARRIOR');
  target = document.createElement('div');
  document.body.appendChild(target);
});
afterEach(() => {
  if (app) unmount(app);
  app = null;
  target.remove();
});

const rows = (list) => [...target.querySelectorAll(`[data-list="${list}"] [data-stat]`)];
const entry = (id, level) => guide.entries.find((e) => e.id === id && e.level === level);

it('opens on the active preset\'s spec and the highest band at or below the character\'s level', () => {
  rosterStore.setTalentSetSpec(0, 'WARRIOR_TANK');
  rosterStore.setCharacterLevel(85);
  app = mount(ToolsSpecGuidePage, { target });
  flushSync();
  expect(target.querySelector('select').value).toBe('WARRIOR_TANK');
  expect(rows('damage').map((r) => r.dataset.stat)).toEqual(entry('WARRIOR_TANK', 80).damage.map((r) => r.key));
  expect(rows('survival')).toHaveLength(entry('WARRIOR_TANK', 80).survival.length);
  expect(rows('damage')[0].querySelector('[data-testid="score"]').textContent).toBe('100');
  expect(target.querySelector('[data-testid="spec-guide-text"]').textContent).toContain('Warrior · Protection, level 80');
});

it('with no talent spec it opens on the class\'s first spec', () => {
  rosterStore.addCharacter('No spec', 'NECROMANCER');
  app = mount(ToolsSpecGuidePage, { target });
  flushSync();
  expect(target.querySelector('select').value).toBe('NECROMANCER_DEATHLORD');
});

it('switching spec and band changes the table; an inert stat says so', () => {
  app = mount(ToolsSpecGuidePage, { target });
  flushSync();
  const select = target.querySelector('select');
  select.value = 'MYSTIC_MAGE';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Level 100').click();
  flushSync();
  const e = entry('MYSTIC_MAGE', 100);
  expect(rows('damage').map((r) => r.dataset.stat)).toEqual(e.damage.map((r) => r.key));
  const inert = [...e.damage, ...e.survival].find((r) => r.inert);
  if (inert) expect(target.querySelector(`[data-stat="${inert.key}"]`).textContent).toContain('No effect for this class');
  // a Warrior's own scores are not shown beside a Mystic table
  expect(target.textContent).not.toContain('Open Stat Sheet');
});

it('puts this preset\'s Stat weights scores beside the reference damage list', async () => {
  rosterStore.setTalentSetSpec(0, 'WARRIOR_DPS');
  const ch = rosterStore.current;
  app = mount(ToolsSpecGuidePage, { target });
  flushSync();
  expect(target.textContent).toContain('Open Stat Sheet');
  startJob({ tool: 'stat-weights', title: 'Stat weights', request: { ...statWeightsRequest(ch, ch.activePresetId, { realm: 'base' }), characterId: ch.id } });
  await vi.waitFor(() => expect(jobsStore.list[0].status).toBe('finished'));
  flushSync();
  expect(target.querySelector('[data-list="damage"].with-own')).not.toBeNull();
  const own = target.querySelector('[data-list="damage"] [data-stat="totalAttackSpeed"] .own');
  expect(own.textContent).not.toBe('–');
});
