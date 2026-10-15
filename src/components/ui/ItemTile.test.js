import { it, expect, vi } from 'vitest';
import ItemTile from './ItemTile.svelte';
import { setup, html, click } from './testkit.js';

it('is a button whose accessible text names the rarity', () => {
  const { q, done } = setup(ItemTile, { name: 'Dawnblade', rarity: 'Mythic', meta: html('Weapon · 74') });
  expect(q('button.tile')).not.toBeNull();
  expect(q('.name').textContent).toContain('Dawnblade');
  expect(q('.name').textContent).toContain('(Mythic)');
  expect(q('.meta').textContent).toContain('Weapon · 74');
  done();
});

it('draws the rarity edge and name from the on-raised token', () => {
  const { q, done } = setup(ItemTile, { name: 'x', rarity: 'Rare' });
  const style = q('.tile').getAttribute('style');
  expect(style).toContain('--r-edge: var(--rarity-rare-fg-on-raised)');
  expect(style).toContain('--r-up: var(--rarity-rare-fg-on-raised)');
  done();
});

it('selected reflects aria-pressed; click fires', () => {
  const onclick = vi.fn();
  const { q, done } = setup(ItemTile, { name: 'x', rarity: 'Epic', selected: true, onclick });
  expect(q('.tile').getAttribute('aria-pressed')).toBe('true');
  click(q('.tile'));
  expect(onclick).toHaveBeenCalledTimes(1);
  done();
});

it('disabled is aria-disabled and does not fire', () => {
  const onclick = vi.fn();
  const { q, done } = setup(ItemTile, { name: 'x', disabled: true, onclick });
  expect(q('.tile').getAttribute('aria-disabled')).toBe('true');
  click(q('.tile'));
  expect(onclick).not.toHaveBeenCalled();
  done();
});

it('empty renders the dashed add tile with its label and no pressed state', () => {
  const { q, done } = setup(ItemTile, { name: 'Trinket: empty', empty: true, emptyLabel: 'Add an item' });
  expect(q('.tile').classList.contains('is-empty')).toBe(true);
  expect(q('.meta').textContent).toBe('Add an item');
  expect(q('.tile').getAttribute('aria-pressed')).toBeNull();
  expect(q('.gem')).toBeNull();
  done();
});

it('an unknown rarity falls back to plain ink (no rarity variables)', () => {
  const { q, done } = setup(ItemTile, { name: 'x', rarity: 'Nope' });
  expect(q('.tile').getAttribute('style') ?? '').not.toContain('--r-edge');
  done();
});
