import { describe, it, expect } from 'vitest';
import {
  defaultRuns, normaliseRuns, normaliseRun, migrateRunsFromV1, runFromResult, sortRuns, compactRuns,
  enforceRunsBudget, RUN_DETAIL_LIMIT, RUN_DETAIL_RESULTS, RUN_DETAIL_FULL_LINES, RUN_KIND,
} from './runs.js';
import { normaliseCharacter, migrateCharacterFromV1, newCharacter } from './index.js';

const entry = (rank, o = {}) => ({
  rank, isBaseline: rank === 0, key: `k${rank}`, candidate: { relicIds: ['a'], talentAllocation: null },
  value: 1000 + rank, lo: 990, hi: 1010, n: 64, score: 1000 + rank,
  vsBaseline: rank ? { delta: 10, lo: 2, hi: 18, significant: true, pct: 0.01 } : null,
  changes: [{ label: 'Relics', from: 'None', to: 'A' }], lines: [{ label: 'Relics', value: 'A' }], ...o,
});
const result = (o = {}) => ({
  aborted: false, truncated: null, tier: 2, realm: 'base', presetId: 'p1', seed: 3,
  target: { kind: 'dummy', seconds: 60, label: 'Training dummy, 60 s', key: '{}' },
  objective: { kind: 'dps', label: 'Damage per second', unit: 'dps', higherIsBetter: true },
  space: { relics: true }, budget: { n1: 16 },
  baseline: entry(0), results: [entry(1), entry(0)], stats: { tier1: 42 }, ...o,
});
const run = (i, o = {}) => runFromResult(result(), { id: `r${i}`, at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(), presetName: 'Main', ...o });

describe('runFromResult', () => {
  it('builds a run with a headline and a detail from an OptimiserResult', () => {
    const r = run(1);
    expect(r).toMatchObject({
      id: 'r1', kind: RUN_KIND, presetId: 'p1', presetName: 'Main', realm: 'base', pinned: false, notes: '', seed: 3,
      target: { kind: 'dummy' }, objective: { kind: 'dps' },
      headline: { unit: 'dps', higherIsBetter: true, tier: 2, aborted: false, truncated: null, baseline: 1000, best: 1001, gainPct: 0.01, significant: true, n: 64, evaluated: 42, changes: 1 },
    });
    expect(r.detail.results).toHaveLength(2);
    expect(r.detail.baseline.isBaseline).toBe(true);
    expect(r.name).toBe('Damage per second - Training dummy, 60 s');
  });

  it('a run whose best build is the current one records no gain', () => {
    const r = runFromResult(result({ results: [entry(0)] }), { id: 'x' });
    expect(r.headline.gainPct).toBe(0);
    expect(r.headline.significant).toBeNull();
  });

  it('an empty aborted result still makes a valid run', () => {
    const r = runFromResult(result({ aborted: true, baseline: null, results: [] }), { id: 'x' });
    expect(r.headline).toMatchObject({ aborted: true, baseline: null, best: null });
    expect(r.detail).toBeNull();
  });

  it('is plain JSON and idempotent through normaliseRun', () => {
    const r = run(1);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    expect(normaliseRun(r)).toEqual(r);
  });

  it('only the first few entries keep their long describe lines; all keep their changes', () => {
    const many = Array.from({ length: 6 }, (_, i) => entry(i + 1));
    const d = runFromResult(result({ results: many }), { id: 'x' }).detail;
    expect(d.results.map((e) => e.lines.length)).toEqual([1, 1, 1, 0, 0, 0]);
    expect(RUN_DETAIL_FULL_LINES).toBe(3);
    expect(d.results.every((e) => e.changes.length === 1)).toBe(true);
    expect(d.baseline.lines).toHaveLength(1);
  });

  it('keeps at most RUN_DETAIL_RESULTS entries', () => {
    const many = Array.from({ length: 25 }, (_, i) => entry(i + 1));
    expect(runFromResult(result({ results: many }), { id: 'x' }).detail.results).toHaveLength(RUN_DETAIL_RESULTS);
  });
});

describe('normaliseRun / normaliseRuns', () => {
  it('drops junk and repairs fields', () => {
    expect(normaliseRun(null)).toBeNull();
    expect(normaliseRun({ id: '' })).toBeNull();
    expect(normaliseRun([])).toBeNull();
    const r = normaliseRun({
      id: 'x', kind: 'sim', at: 5, name: '', pinned: 'yes', realm: 'weird', seed: 'a', target: 'no', detail: { results: 'no' },
      headline: { baseline: NaN, best: '3', tier: 9, truncated: 'bad', higherIsBetter: false },
    });
    expect(r).toMatchObject({
      id: 'x', kind: 'optimise', name: 'Optimiser run', pinned: false, realm: 'base', seed: 1, target: {}, detail: null,
      headline: { baseline: null, best: null, tier: 1, truncated: null, higherIsBetter: false },
    });
  });

  it('entries are sanitised: non-finite numbers become null, other keys vanish', () => {
    const r = normaliseRun({ id: 'x', detail: { results: [{ rank: 1, value: Infinity, lo: 'a', hi: 5, n: 'x', score: NaN, junk: 1, vsBaseline: { delta: 1, significant: 'y' }, changes: [null, { label: 'L', from: 1, to: 'z' }], lines: 'no' }] } });
    expect(r.detail.results[0]).toEqual({
      rank: 1, isBaseline: false, key: '', candidate: {}, value: null, lo: null, hi: 5, n: 0, score: 0,
      vsBaseline: { delta: 1, lo: null, hi: null, significant: false, pct: null },
      changes: [{ label: 'L', from: '', to: 'z' }], lines: [],
    });
  });

  it('dedupes ids, sorts newest first and is idempotent', () => {
    const raw = { runs: [run(1), run(3), { ...run(2), id: 'r3' }, run(2, { id: 'r2' }), 'junk'] };
    const out = normaliseRuns(raw).runs;
    expect(out.map((r) => r.id)).toEqual(['r3', 'r2', 'r1']);
    expect(normaliseRuns({ runs: out }).runs).toEqual(out);
    expect(normaliseRuns({}).runs).toEqual([]);
    expect(normaliseRuns({ runs: 'no' })).toEqual(defaultRuns());
  });

  it('survives the full character round trip, and a new character starts empty', () => {
    expect(newCharacter('A', 'WARRIOR').runs).toEqual([]);
    const raw = { ...newCharacter('A', 'WARRIOR'), runs: [run(1)] };
    const c = normaliseCharacter(JSON.parse(JSON.stringify(raw)));
    expect(c.runs).toEqual([run(1)]);
    expect(normaliseCharacter(c).runs).toEqual(c.runs);
  });

  it('v1 run history is dropped on migration', () => {
    expect(migrateRunsFromV1({ runHistory: [{ id: 'a' }] })).toEqual({ value: { runs: [] }, idMap: {} });
    const c = migrateCharacterFromV1({ id: 'v1', name: 'Old', class: 'Warrior', runHistory: [{ id: 'a', kind: 'sim' }], loadouts: [], presets: [] });
    expect(c.runs).toEqual([]);
  });
});

describe('compaction and budget', () => {
  const list = (n, o = () => ({})) => sortRuns(Array.from({ length: n }, (_, i) => run(i, o(i))));

  it(`detail is kept for the newest ${RUN_DETAIL_LIMIT} runs only`, () => {
    const runs = compactRuns(list(60));
    expect(runs.filter((r) => r.detail).length).toBe(RUN_DETAIL_LIMIT);
    expect(runs[0].detail).not.toBeNull();
    expect(runs.at(-1).detail).toBeNull();
    expect(runs.at(-1).headline.best).toBe(1001); // the headline row stays
  });

  it('pinned runs keep their detail and do not count against the limit', () => {
    const runs = compactRuns(list(60, (i) => ({ pinned: i === 0 })));
    expect(runs.find((r) => r.id === 'r0').detail).not.toBeNull();
    expect(runs.filter((r) => r.detail).length).toBe(RUN_DETAIL_LIMIT + 1);
  });

  it('the byte budget drops the oldest detail first, then whole rows, never a pinned run', () => {
    const runs = list(10, (i) => ({ pinned: i === 0 }));
    const full = JSON.stringify(runs).length;
    const trimmed = enforceRunsBudget(structuredClone(runs), { byteBudget: Math.floor(full / 2) });
    expect(JSON.stringify(trimmed).length).toBeLessThanOrEqual(Math.floor(full / 2));
    expect(trimmed.find((r) => r.id === 'r0').detail).not.toBeNull();
    const detailed = trimmed.filter((r) => r.detail).map((r) => r.id);
    const newestDetailed = trimmed.filter((r) => !r.pinned).findIndex((r) => r.detail);
    expect(newestDetailed === -1 || newestDetailed === 0).toBe(true);
    expect(detailed).toContain('r0');

    const tiny = enforceRunsBudget(structuredClone(runs), { byteBudget: 10, maxRows: 3 });
    expect(tiny.map((r) => r.id)).toEqual(expect.arrayContaining(['r0']));
    expect(tiny.filter((r) => !r.pinned)).toHaveLength(3);
    expect(tiny.every((r) => r.pinned || r.detail === null)).toBe(true);
  });

  it('an under-budget history is returned as is', () => {
    const runs = list(3);
    expect(enforceRunsBudget(runs)).toBe(runs);
  });

  it('normalising an imported oversized history repairs it', () => {
    const runs = list(60);
    const c = normaliseRuns({ runs: JSON.parse(JSON.stringify(runs)) }).runs;
    expect(c.filter((r) => r.detail).length).toBe(RUN_DETAIL_LIMIT);
  });
});
