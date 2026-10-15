import { it, expect, beforeEach, afterEach } from 'vitest';
import SheetTable from './SheetTable.svelte';
import { setup } from '../ui/testkit.js';

let t;
let changes;
beforeEach(() => {
  changes = [];
  t = setup(SheetTable, {
    keys: ['totalAttack', 'totalCritChance'],
    values: { totalAttack: 48124 },
    computed: { totalAttack: 48000, totalCritChance: 6 },
    onChange: (k, v) => changes.push([k, v]),
  });
});
afterEach(() => t.done());

it('every body cell is labelled by its column so the table can stack on a phone', () => {
  const row = t.q('tr[data-key="totalAttack"]');
  const labels = [...row.querySelectorAll('td')].map((td) => td.dataset.label);
  expect(labels).toEqual(['Model', 'Your sheet', 'Raw', 'Gap', 'Tolerance', 'Status']);
});

it('the scroll region is keyboard reachable', () => {
  expect(t.q('[role="region"][aria-label="Stat sheet table"]').getAttribute('tabindex')).toBe('0');
});

it('reads a typed value with the percent rule and reports it', () => {
  const input = t.q('#sheet-totalCritChance');
  input.value = '6.2';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  expect(changes).toEqual([['totalCritChance', 6.2]]);
});

it('a row off by more than the tolerance reads "off by"', () => {
  expect(t.q('tr[data-key="totalAttack"]').textContent).toContain('off by');
});
