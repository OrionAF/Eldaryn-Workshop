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

const cb = (x) => x.q('input[type="checkbox"]');
const flush = () => new Promise((r) => setTimeout(r, 0));

it('"Only rows that are off" hides matching and blank rows and says so when none are left', async () => {
  const o = setup(SheetTable, {
    keys: ['totalAttack', 'totalCritChance', 'totalHealth'],
    values: { totalAttack: 48124, totalCritChance: 6 },
    computed: { totalAttack: 48000, totalCritChance: 6, totalHealth: 10 },
    onChange: () => {},
  });
  cb(o).click();
  await flush();
  expect(o.qa('tr[data-key]').map((r) => r.dataset.key)).toEqual(['totalAttack']);
  o.done();
  const m = setup(SheetTable, { keys: ['totalCritChance'], values: { totalCritChance: 6 }, computed: { totalCritChance: 6 }, onChange: () => {} });
  cb(m).click();
  await flush();
  expect(m.qa('tr[data-key]').length).toBe(0);
  expect(m.target.textContent).toContain('All rows match.');
  m.done();
});

it('the filter hides blank and matching rows when nothing is focused', async () => {
  const o = setup(SheetTable, { keys: ['totalAttack', 'totalCritChance'], values: { totalCritChance: 6 }, computed: { totalAttack: 1, totalCritChance: 6 }, onChange: () => {} });
  cb(o).click();
  await flush();
  expect(o.qa('tr[data-key]').length).toBe(0);
  o.done();
});

it('the filter keeps the focused row visible', async () => {
  const o = setup(SheetTable, { keys: ['totalAttack', 'totalCritChance'], values: { totalCritChance: 6 }, computed: { totalAttack: 1, totalCritChance: 6 }, onChange: () => {} });
  o.q('#sheet-totalCritChance').dispatchEvent(new Event('focus'));
  cb(o).click();
  await flush();
  expect(o.qa('tr[data-key]').map((r) => r.dataset.key)).toEqual(['totalCritChance']);
  o.done();
});

it('Expand all opens every source row, Collapse all closes them; opponents get neither control', async () => {
  const contributions = () => ({ sources: [], total: {} });
  const o = setup(SheetTable, { keys: ['totalAttack', 'totalCritChance'], values: {}, computed: { totalAttack: 1, totalCritChance: 2 }, contributions, onChange: () => {} });
  const btn = () => o.qa('button').find((b) => /all$/.test(b.textContent.trim()));
  expect(btn().textContent.trim()).toBe('Expand all');
  btn().click();
  await flush();
  expect(o.qa('button.expand').every((b) => b.getAttribute('aria-expanded') === 'true')).toBe(true);
  expect(btn().textContent.trim()).toBe('Collapse all');
  btn().click();
  await flush();
  expect(o.qa('button.expand').every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
  o.done();
  const p = setup(SheetTable, { keys: ['totalAttack'], values: {}, computed: null, onChange: () => {} });
  expect(p.q('input[type="checkbox"]')).toBeNull();
  expect(p.qa('button').some((b) => /all$/.test(b.textContent.trim()))).toBe(false);
  p.done();
});

it('the filter on a sheet with nothing entered says so instead of "All rows match."', async () => {
  const o = setup(SheetTable, { keys: ['totalAttack'], values: {}, computed: { totalAttack: 5 }, onChange: () => {} });
  cb(o).click();
  await flush();
  expect(o.qa('tr[data-key]').length).toBe(0);
  expect(o.target.textContent).toContain('No in-game stats entered yet.');
  expect(o.target.textContent).not.toContain('All rows match.');
  o.done();
});
