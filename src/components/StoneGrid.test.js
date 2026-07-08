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
  expect(target.querySelector('.stone-head').textContent).toContain('Q34'); // quality on the name line
  expect(target.textContent).toContain('L1: Head | L2: No');
  unmount(app);
});

it('lists each stat on its own line, PVP Attack then PVP Defense first, with signed values', () => {
  const stone = newStoneEntry({
    type: 'mythic',
    quality: 77,
    rolledKeys: ['attack_pct', 'crit'],
    stats: { crit: 6, attack_pct: 2, pvp_defense: 25, pvp_attack: 31 },
  });
  const app = mount(StoneGrid, {
    target,
    props: { stoneInventory: [stone], loadouts: [newLoadout('Loadout 1'), newLoadout('Loadout 2')], selectedStoneId: null, onSelect: () => {} },
  });
  flushSync();

  const lines = [...target.querySelectorAll('.stone-stat')].map((el) =>
    [el.querySelector('.stat-label').textContent, el.querySelector('.stat-value').textContent]
  );
  expect(lines).toEqual([
    ['PVP Attack', '+31'],
    ['PVP Defense', '+25'],
    ['Attack', '+2%'], // pct fields drop the label's trailing % - the value carries it
    ['Critical', '+6%'],
  ]);
  unmount(app);
});

it('sorts tiles socketed-first, then by stone type (rarest first), then quality descending', () => {
  const stones = [
    newStoneEntry({ type: 'mythic', quality: 100, rolledKeys: [], stats: {} }),
    newStoneEntry({ type: 'verdant', quality: 12, rolledKeys: [], stats: {} }),
    newStoneEntry({ type: 'verdant', quality: 100, rolledKeys: [], stats: {} }),
    newStoneEntry({ type: 'azure', quality: 48, rolledKeys: [], stats: {} }),
  ];
  const l1 = newLoadout('Loadout 1');
  const l2 = newLoadout('Loadout 2');
  // Socket the two weakest stones - they should still jump above everything unsocketed.
  l1.socketedStones.Head = stones[1].id; // verdant Q12
  l2.socketedStones.Chest = stones[3].id; // azure Q48
  const app = mount(StoneGrid, {
    target,
    props: { stoneInventory: stones, loadouts: [l1, l2], selectedStoneId: null, onSelect: () => {} },
  });
  flushSync();

  const types = [...target.querySelectorAll('.stone-tile')].map((el) => ({
    type: el.querySelector('.stone-type').textContent,
    quality: el.querySelector('.stone-quality').textContent,
  }));
  expect(types).toEqual([
    { type: 'Azure Duelstone', quality: 'Q48' }, // socketed, rarer type
    { type: 'Verdant Wardstone', quality: 'Q12' }, // socketed
    { type: 'Mythic Soulstone', quality: 'Q100' },
    { type: 'Verdant Wardstone', quality: 'Q100' },
  ]);
  unmount(app);
});

it('gives the stone equipped in the selected slot an "equipped" highlight', () => {
  const equipped = newStoneEntry({ type: 'crimson', quality: 60, rolledKeys: [], stats: {} });
  const other = newStoneEntry({ type: 'crimson', quality: 90, rolledKeys: [], stats: {} });
  const l1 = newLoadout('Loadout 1');
  l1.socketedStones.Weapon = equipped.id;
  const app = mount(StoneGrid, {
    target,
    props: {
      stoneInventory: [equipped, other],
      loadouts: [l1, newLoadout('Loadout 2')],
      selectedStoneId: null,
      equippedStoneId: equipped.id,
      onSelect: () => {},
    },
  });
  flushSync();

  const tiles = [...target.querySelectorAll('.stone-tile')];
  expect(tiles.filter((el) => el.classList.contains('equipped'))).toHaveLength(1);
  // The equipped (and therefore socketed) stone also sorts to the front.
  expect(tiles[0].classList.contains('equipped')).toBe(true);
  expect(tiles[0].querySelector('.stone-quality').textContent).toBe('Q60');
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
