import { it, expect } from 'vitest';
import ScopeChip from './ScopeChip.svelte';
import { setup } from './testkit.js';

it('renders no empty detail cell when there is neither a target nor side effects (Tool pages)', () => {
  const t = setup(ScopeChip, { scope: 'tool' });
  expect(t.q('.t')).toBeNull();
  expect(t.q('b').textContent).toBe('Tool');
  t.done();
});

it('keeps the comma and space before "also" as text of the detail cell, not between flex items', () => {
  const t = setup(ScopeChip, { scope: 'character', target: 'Iron Bastion', sideEffects: ['PVP'] });
  const cell = t.q('.t');
  expect(cell.textContent).toBe('Iron Bastion, also PVP');
  const before = [...cell.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('');
  expect(before).toBe('Iron Bastion, ');
  expect(cell.querySelector('em').textContent).toBe('also PVP');
  t.done();
});

it('a side-effect-only chip still shows the cell', () => {
  const t = setup(ScopeChip, { scope: 'preset', sideEffects: ['Boss'] });
  expect(t.q('.t').textContent).toBe('also Boss');
  t.done();
});
