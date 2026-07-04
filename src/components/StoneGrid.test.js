import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import StoneGrid from './StoneGrid.svelte';
import { newLoadout, newStoneEntry } from '../lib/model.js';

let target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

it('shows an empty hint when the inventory is empty', () => {
  const app = mount(StoneGrid, {
    target,
    props: { stoneInventory: [], loadouts: [newLoadout('Loadout 1'), newLoadout('Loadout 2')], selectedStoneId: null, onSelect: () => {} },
  });
  flushSync();
  expect(target.textContent).toContain('No stones added yet.');
  unmount(app);
});

it('renders one tile per stone with its type label and quality, and shows socket status per loadout', () => {
  const stone = newStoneEntry({ type: 'verdant', quality: 34, rolledKeys: ['attack_pct'], stats: { attack_pct: 5 } });
  const l1 = newLoadout('Loadout 1');
  const l2 = newLoadout('Loadout 2');
  l1.socketedStones.Head = stone.id;
  const app = mount(StoneGrid, {
    target,
    props: { stoneInventory: [stone], loadouts: [l1, l2], selectedStoneId: null, onSelect: () => {} },
  });
  flushSync();

  expect(target.textContent).toContain('Verdant Wardstone');
  expect(target.textContent).toContain('Q34');
  expect(target.textContent).toContain('Socketed: Head | No');
  unmount(app);
});

it('clicking a tile selects it; clicking the already-selected tile deselects it', () => {
  const stone = newStoneEntry({ type: 'crimson', quality: 1, rolledKeys: [], stats: {} });
  let selected = 'unset';
  const app = mount(StoneGrid, {
    target,
    props: {
      stoneInventory: [stone],
      loadouts: [newLoadout('Loadout 1'), newLoadout('Loadout 2')],
      selectedStoneId: null,
      onSelect: (id) => (selected = id),
    },
  });
  flushSync();
  expect(target.querySelector('.stone-tile .selected-dot')).toBeNull(); // nothing selected yet

  target.querySelector('.stone-tile').click();
  flushSync();
  expect(selected).toBe(stone.id);
  unmount(app);

  // Re-mount with that stone now selected, to exercise the deselect branch.
  const app2 = mount(StoneGrid, {
    target,
    props: {
      stoneInventory: [stone],
      loadouts: [newLoadout('Loadout 1'), newLoadout('Loadout 2')],
      selectedStoneId: stone.id,
      onSelect: (id) => (selected = id),
    },
  });
  flushSync();
  expect(target.querySelector('.stone-tile').getAttribute('aria-pressed')).toBe('true');
  expect(target.querySelector('.stone-tile .selected-dot')).not.toBeNull(); // yellow "this one's selected" marker
  target.querySelector('.stone-tile').click();
  flushSync();
  expect(selected).toBe(null);
  unmount(app2);
});
