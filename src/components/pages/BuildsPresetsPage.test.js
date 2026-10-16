import { it, expect, beforeEach, afterEach } from 'vitest';
import BuildsPresetsPage from './BuildsPresetsPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { computePresetStats } from '../../lib/build/stats.js';
import { setup, click } from '../ui/testkit.js';

let t;
function open() {
  t = setup(BuildsPresetsPage, {});
}
beforeEach(() => {
  localStorage.clear();
  const id = rosterStore.addCharacter('Test', 'WARRIOR');
  for (const c of [...rosterStore.roster.characters]) if (c.id !== id) rosterStore.deleteCharacter(c.id);
  open();
});
afterEach(() => t.done());

const btn = (label) => t.qa('button').find((b) => b.textContent.trim() === label);

it('one column per preset (two minimum) with the active one marked', () => {
  expect(t.qa('thead th[data-preset-id]')).toHaveLength(2);
  expect(t.qa('thead th.active')).toHaveLength(1);
  expect(t.q('thead th.active').dataset.presetId).toBe(rosterStore.current.activePresetId);
});

it('New preset adds a column and selects it; clicking a column name switches the active preset', () => {
  click(btn('New preset'));
  expect(rosterStore.current.presets).toHaveLength(3);
  expect(t.qa('thead th[data-preset-id]')).toHaveLength(3);
  expect(t.q('thead th.active').dataset.presetId).toBe(rosterStore.current.activePresetId);
  click(t.qa('.colname')[0]);
  expect(rosterStore.current.activePresetId).toBe(rosterStore.current.presets[0].id);
});

it('Delete is disabled at the two-preset minimum, and the footer says so', () => {
  for (const b of t.qa('thead button').filter((b) => b.textContent.trim() === 'Delete')) expect(b.disabled).toBe(true);
  expect(t.q('.panel-foot').textContent).toContain('You need at least 2');
});

it('New preset is disabled at 8 with the reason on the button', () => {
  while (rosterStore.current.presets.length < 8) rosterStore.addPreset();
  unmountAndReopen();
  const b = btn('New preset');
  expect(b.getAttribute('aria-disabled')).toBe('true');
  expect(b.title).toContain('At most 8');
});

function unmountAndReopen() {
  t.done();
  open();
}

it('renaming a column writes the preset name', () => {
  const p = rosterStore.current.presets[0];
  const input = t.q(`input[aria-label="Rename ${p.name}"]`);
  input.value = 'Farm Build';
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  expect(rosterStore.current.presets[0].name).toBe('Farm Build');
});

it('the source row tags in-game stats as In-game, a stale sheet as Out of date, otherwise App', () => {
  const [a, b] = rosterStore.current.presets;
  const cell = (id) => t.q(`thead th[data-preset-id="${id}"]`) && t.qa('tbody tr')[0].children[rosterStore.current.presets.findIndex((p) => p.id === id) + 1];
  expect(cell(a.id).textContent).toContain('App');
  rosterStore.setPresetSheet(a.id, { totalAttack: 5000 });
  unmountAndReopen();
  expect(cell(a.id).textContent).toContain('In-game');
  expect(cell(b.id).textContent).toContain('App');
});

it('a sheet goes Stale after a gear edit: the column says Out of date and shows the model value again', () => {
  const a = rosterStore.current.presets[0];
  rosterStore.setPresetSheet(a.id, { totalAttack: 5000 });
  unmountAndReopen();
  expect(t.q('tr[data-row="totalAttack"]').children[1].textContent).toContain('5.000');
  rosterStore.setEquipmentItem('set1', 'WEAPON', {
    rarity: 'ETERNAL', itemLevel: 200, quality: 80, primaryStats: { attack: 4200, hp: 0 }, secondaryStats: [],
  });
  unmountAndReopen();
  expect(computePresetStats(rosterStore.current, a.id).sheetStatus).toBe('stale');
  expect(t.qa('tbody tr')[0].children[1].textContent).toContain('Out of date');
  expect(t.q('tr[data-row="totalAttack"]').children[1].textContent).not.toContain('5.000');
});

it('Differences only hides rows where every preset agrees', () => {
  const before = t.qa('tbody tr').length;
  const check = t.q('input[type="checkbox"]');
  click(check);
  expect(t.qa('tbody tr').length).toBeLessThan(before);
});

it('the compare table scrolls sideways with a visible hint and a sticky property column', () => {
  expect(t.q('.scroll-hint')).not.toBeNull();
  expect(t.q('.scroll-hint').textContent).toMatch(/scroll/i);
  expect(t.q('tbody th.lbl').classList.contains('sticky')).toBe(true);
});
