import { it, expect, vi, afterEach } from 'vitest';

const values = { a: 1000, b: 2000 };
vi.mock('../../lib/build/stats.js', () => ({
  computePresetStats: (_c, id) => ({ effective: { totalAttack: values[id], totalHp: 500 }, source: 'model', sheetStatus: 'none' }),
}));

import PresetCompare from './PresetCompare.svelte';
import { setup } from '../ui/testkit.js';

const preset = (id) => ({
  id, name: id, equipmentSet: 1, talentSet: 1, petId: null, mountId: null, relicIds: [], sigilSpecies: [],
});
const character = () => ({ class: 'WARRIOR', level: 100, presets: [preset('a'), preset('b')], activePresetId: 'a', extraRelicSlots: 0, talentSets: [{}, {}], pets: { cores: [] }, mounts: [], equipmentSets: {}, transcendencePresets: [] });

let t;
afterEach(() => t?.done());

it('marks the higher cell with a bold class and hidden text; ties and other rows get none', () => {
  t = setup(PresetCompare, { character: character() });
  const cells = [...t.q('tr[data-row="totalAttack"]').querySelectorAll('td')];
  expect(cells[0].classList.contains('best')).toBe(false);
  expect(cells[1].classList.contains('best')).toBe(true);
  expect(cells[1].textContent).toContain('(highest)');
  expect(t.q('tr[data-row="totalHp"]').querySelector('td.best')).toBeNull();
  expect(t.q('tr[data-row="gear"]')?.querySelector('td.best') ?? null).toBeNull();
});

it('a loadout cell is a button that activates its preset and opens Loadout; stat cells have none', async () => {
  const { rosterStore } = await import('../../lib/rosterStore.svelte.js');
  const spy = vi.spyOn(rosterStore, 'setActivePreset').mockImplementation(() => {});
  location.hash = '#/builds/presets';
  t = setup(PresetCompare, { character: character() });
  expect(t.q('tr[data-row="totalAttack"]').querySelector('button')).toBeNull();
  expect(t.q('tr[data-row="checks"]').querySelector('button')).toBeNull();
  const btn = t.q('tr[data-row="pet"]').querySelectorAll('button')[1];
  expect(btn.getAttribute('aria-label')).toBe('Edit Pet of b');
  btn.click();
  expect(spy).toHaveBeenCalledWith('b');
  expect(location.hash).toBe('#/builds/loadout');
  spy.mockRestore();
});

it('Move buttons are disabled at the ends and call movePreset otherwise', async () => {
  const { rosterStore } = await import('../../lib/rosterStore.svelte.js');
  const spy = vi.spyOn(rosterStore, 'movePreset').mockImplementation(() => true);
  t = setup(PresetCompare, { character: character() });
  const btn = (label) => t.qa('button').find((b) => b.getAttribute('aria-label') === label);
  expect(btn('Move a left').getAttribute('aria-disabled')).toBe('true');
  expect(btn('Move b right').getAttribute('aria-disabled')).toBe('true')
  btn('Move a left').click();
  expect(spy).not.toHaveBeenCalled();
  btn('Move a right').click();
  expect(spy).toHaveBeenCalledWith('a', 1);
  btn('Move b left').click();
  expect(spy).toHaveBeenCalledWith('b', -1);
  spy.mockRestore();
});

it('Confirm delete deletes the preset and offers Undo on the toast', async () => {
  const { rosterStore } = await import('../../lib/rosterStore.svelte.js');
  const { notifications, resetNotifications } = await import('../../lib/notify.svelte.js');
  resetNotifications();
  const del = vi.spyOn(rosterStore, 'deletePreset').mockImplementation(() => true);
  const c = character();
  c.presets.push(preset('c'));
  t = setup(PresetCompare, { character: c });
  const named = (text) => t.qa('button').filter((b) => b.textContent.trim() === text);
  named('Delete')[2].click();
  await Promise.resolve();
  named('Confirm delete')[0].click();
  expect(del).toHaveBeenCalledWith('c');
  expect(notifications.toasts.at(-1)).toMatchObject({ message: 'Deleted c', action: { label: 'Undo' } });
  del.mockRestore();
  resetNotifications();
});
