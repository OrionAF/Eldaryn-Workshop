import { it, expect } from 'vitest';
import { benchmarkCases } from './cases.mjs';
import { prepare } from '../../src/lib/search/search.js';
import { digest } from './dataset.mjs';

it('creates repeatable semantic inputs and Celestial search seeds despite fresh imports', () => {
  const a = benchmarkCases({ records: [] }), b = benchmarkCases({ records: [] });
  const changed = [];
  const diff = (x, y, path) => {
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) diff(x[key], y[key], `${path}.${key}`);
    } else if (x !== y) changed.push(path);
  };
  diff(a, b, 'cases');
  expect(changed).toEqual([]);
  expect(digest(a)).toBe(digest(b));
  for (let i = 0; i < a.length; i++) {
    const req = (row) => ({ ...row, seed: 17 });
    expect(prepare(req(a[i])).target.key, a[i].name).toBe(prepare(req(b[i])).target.key);
    expect(prepare(req(a[i])).requestKey, a[i].name).toBe(prepare(req(b[i])).requestKey);
  }
});
it('keeps both servers in bounded opponent workloads even when the manifest is server-sorted', () => {
  const records = ['server-11', 'server-5'].flatMap((server) => Array.from({ length: 10 }, (_, i) => ({
    partition: 'held-out', realm: 'BASE', server, identity: `${server}-${i}`, opponent: { id: 'opponent' }, spec: 'WARRIOR_DPS', level: 70,
  })));
  const cases = benchmarkCases({ records }).filter((r) => r.partition === 'held-out');
  expect(cases).toHaveLength(8);
  expect(cases.filter((r) => r.server === 'server-11')).toHaveLength(4);
  expect(cases.filter((r) => r.server === 'server-5')).toHaveLength(4);
});
