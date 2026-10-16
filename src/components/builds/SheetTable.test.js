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
  expect(labels).toEqual(['App', 'In-game stats', 'Before cap', 'Gap', 'Allowed gap', 'Status']);
});

it('the scroll region is keyboard reachable', () => {
  expect(t.q('[role="region"][aria-label="In-game stats table"]').getAttribute('tabindex')).toBe('0');
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

it('without a computed build (an opponent) the empty App, Gap, Allowed gap and Status columns are not drawn', () => {
  const o = setup(SheetTable, { keys: ['totalAttack', 'totalCritChance'], values: { totalAttack: 48124 }, computed: null, onChange: () => {} });
  const heads = o.qa('thead th').map((th) => th.textContent.trim());
  expect(heads).toEqual(['Stat', 'In-game stats', 'Before cap']);
  const labels = [...o.q('tr[data-key="totalAttack"]').querySelectorAll('td')].map((td) => td.dataset.label);
  expect(labels).toEqual(['In-game stats', 'Before cap']);
  expect(o.q('[data-testid="diff-summary"]').textContent.trim()).toBe('1/2 entered');
  expect(o.target.textContent).not.toMatch(/no app number/);
  o.done();
});
