import { it, expect } from 'vitest';
import { compareReports } from './compare.mjs';
const report = () => ({ schema: 1, command: 'run', datasetDigest: 'dataset', seed: 17, reps: 3, fights: 16, warmup: 8,
  stoppingReason: 'completed', elapsedMs: 100, cases: [{ name: 'case', inputDigest: 'input', checksum: 'outcome', msPerFight: { median: 1 },
    search: { outcomeDigest: 'validated', elapsedMs: 50, status: 'done' } }] });
it('refuses different workloads, seeds, missing input digests and outcomes even when timings improve', () => {
  const a = report();
  for (const field of ['seed', 'fights', 'datasetDigest']) expect(() => compareReports(a, { ...report(), [field]: 'different' })).toThrow();
  for (const field of ['inputDigest', 'checksum']) {
    const b = report(); delete b.cases[0][field]; expect(() => compareReports(a, b)).toThrow();
  }
  const b = report(); b.cases[0].search.outcomeDigest = 'unvalidated'; expect(() => compareReports(a, b)).toThrow(/outcomes/);
});
it('rejects partial runs and reports regressions alongside gains', () => {
  const a = report(), b = report();
  expect(() => compareReports(a, { ...b, stoppingReason: 'time-budget-between-cases' })).toThrow(/Partial/);
  b.cases[0].msPerFight.median = 0.8; b.cases[0].search.elapsedMs = 60;
  const result = compareReports(a, b);
  expect(result.cases[0].kernelTimeReduction).toBeCloseTo(0.2);
  expect(result.cases[0].searchTimeReduction).toBeCloseTo(-0.2);
});
it('refuses partial last-case searches and missing searches despite a completed outer report', () => {
  const a = report(), b = report();
  a.cases[0].search.status = 'cancelled'; b.cases[0].search.status = 'cancelled';
  expect(() => compareReports(a, b)).toThrow(/Incomplete/);
  const c = report(); delete c.cases[0].search;
  expect(() => compareReports(report(), c)).toThrow(/mismatched search/);
});
