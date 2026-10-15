import { it, expect } from 'vitest';
import { flat, signedFlat, ciFlat, metricTables, dropStatRows } from './dropFormat.js';
import { formatFlat } from '../../lib/format.js';

it('flat numbers group thousands with "." like every other screen (lib/format.js)', () => {
  expect(flat(12345.6)).toBe('12.346');
  expect(flat(56375)).toBe(formatFlat(56375));
  expect(flat(NaN)).toBe('—');
  expect(signedFlat(1400)).toBe('+1.400');
  expect(signedFlat(-1400)).toBe('-1.400');
  expect(signedFlat(0)).toBe('0');
  expect(ciFlat({ lo: 800, hi: 1400 })).toBe('+800 to +1.400');
});

const m = (id, label, unit, delta, verdict, base = 1000) => ({
  id, label, unit, m: { before: { mean: unit === 'dps' ? base : 0.5 }, after: { mean: 0 }, delta: { delta, lo: delta - 0.01 * base, hi: delta + 0.01 * base, n: 256, verdict } },
});

it('metricTables: one table per metric, Set 2 and PVP rows on their own point axis', () => {
  const cards = [
    { setKey: 'set1', setLabel: 'Set 1', presets: [{ presetId: 'a', name: 'Farm', metrics: [m('sim', 'DPS vs training dummy', 'dps', 50, 'better')] }] },
    { setKey: 'set2', setLabel: 'Set 2', presets: [{ presetId: 'b', name: 'PVP build', metrics: [m('sim', 'DPS vs training dummy', 'dps', -10, 'unresolved'), m('pvp:o1', 'PVP win rate vs Rival', 'p', 0.03, 'worse')] }] },
  ];
  const t = metricTables(cards);
  expect(t.map((x) => x.id)).toEqual(['sim', 'pvp:o1']);
  expect(t[0].unit).toBe('pct');
  expect(t[0].rows.map((r) => [r.label, r.tone, +r.est.toFixed(1)])).toEqual([['Set 1 · Farm', 'up', 5], ['Set 2 · PVP build', 'side', -1]]);
  expect(t[1].unit).toBe('pts');
  expect(t[1].rows[0]).toMatchObject({ label: 'Set 2 · PVP build', tone: 'down', n: 256 });
  expect(t[1].rows[0].est).toBeCloseTo(3);
});

it('dropStatRows: attack and HP as flat sheet keys, secondaries as displayed', () => {
  const rows = dropStatRows({ primaryStats: { attack: 9000, hp: 0 }, secondaryStats: [{ type: 'CRIT_CHANCE', value: 4 }] });
  expect(rows.map((r) => r.label)).toEqual(['Attack', 'Crit Chance']);
  expect(rows[0]).toMatchObject({ key: 'totalAttack', value: 9000 });
  expect(dropStatRows(null)).toEqual([]);
});
