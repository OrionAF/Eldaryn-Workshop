import { it, expect, afterEach } from 'vitest';
import RosterTable from './RosterTable.svelte';
import { rosterRows } from '../../lib/features/duel.js';
import { setup, click } from '../ui/testkit.js';

let view;
afterEach(() => view?.done());

const s = (p, n = 3200) => ({ p, lo: p - 0.02, hi: p + 0.02, n });

it('shows win rate, range and fights per opponent; a name opens that opponent; skipped and pending rows say why', () => {
  const picked = [];
  const rows = rosterRows([
    { id: 'a', name: 'Alpha', status: 'finished', summary: s(0.75) },
    { id: 'b', name: 'Beta', status: 'running' },
    { id: 'c', name: 'Gamma', status: 'skipped', reason: 'Gamma has no Attack.' },
    { id: 'd', name: 'Delta', status: 'failed' },
    { id: 'e', name: 'Eps', status: 'finished', summary: s(0.5), stale: true },
  ]);
  view = setup(RosterTable, { rows, onpick: (id) => picked.push(id) });
  const a = view.q('[data-testid="roster-row-a"]').textContent;
  expect(a).toContain('75.0%');
  expect(a).toContain('73.0% to 77.0%');
  expect(a).toContain('3.200');
  expect(a).toContain('Likely to win');
  expect(view.q('[data-testid="roster-row-e"]').textContent).toContain('Too close to call');
  expect(view.q('[data-testid="roster-row-e"]').textContent).toContain('Setup changed');
  expect(view.q('[data-testid="roster-row-b"]').textContent).toContain('Simulating');
  expect(view.q('[data-testid="roster-row-d"]').textContent).toContain('Failed');
  expect(view.q('[data-testid="roster-row-c"]').textContent).toContain('Skipped: Gamma has no Attack.');
  expect(view.q('[data-testid="roster-row-c"] button')).toBeNull();
  click(view.q('[data-testid="roster-row-a"] button'));
  expect(picked).toEqual(['a']);
});

it('an empty list renders just the header', () => {
  view = setup(RosterTable, { rows: [] });
  expect(view.qa('tbody tr')).toHaveLength(0);
  expect(view.q('thead').textContent).toContain('Likely range');
});
