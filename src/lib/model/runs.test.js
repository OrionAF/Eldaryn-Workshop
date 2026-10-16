import { describe, it, expect } from 'vitest';
import {
  defaultRuns, normaliseRuns, normaliseRun, migrateRunsFromV1, runFromResult, sortRuns, compactRuns,
  enforceRunsBudget, RUN_DETAIL_LIMIT, RUN_DETAIL_RESULTS, RUN_DETAIL_FULL_LINES, RUN_KIND,
} from './runs.js';
import { normaliseCharacter, migrateCharacterFromV1, newCharacter } from './index.js';
import { richResult, pvpResult, ttkResult } from '../__fixtures__/optimiser/index.js';

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

describe('schema 2 runs (optimiser-result/2)', () => {
  const v2 = (o = {}) => runFromResult(richResult(), { id: 'v2', at: '2026-10-01T00:00:00.000Z', presetName: 'Main', ...o });

  it('records the request, the headline text and compact rows with per-change effects', () => {
    const r = v2();
    expect(r).toMatchObject({
      schema: 2, presetId: 'p1', realm: 'base', seed: 2, budget: { level: 'quick', n0: 8, maxN: 32 },
      headline: { unit: 'dps', tier: 2, aborted: false, baseline: expect.any(Number), best: expect.any(Number), n: 8, changes: 2, text: expect.stringContaining('too close to call') },
    });
    expect(r.characterKey).toMatch(/^character:/);
    expect(r.detail.rows).toHaveLength(3);
    const row = r.detail.rows[0];
    expect(row.changes[0]).toMatchObject({ id: 'talents:0', scope: 'character', own: { verdict: 'better' }, needed: { verdict: 'better' }, keptBecause: 'own-effect' });
    expect(row.changes[0].sideEffects[0]).toMatchObject({ name: 'Boss build' });
    expect(row.remainder).toMatchObject({ delta: 1200, lo: null });
    expect(row.writes.map((w) => w.title)).toEqual(['Talents (set 1)', 'Preset Main']);
    expect(row).not.toHaveProperty('runMore');
    expect(row.provisional).toBe(false);
  });

  it('keeps full describe lines only on the leading rows and survives a normalise round trip', () => {
    const r = v2();
    expect(r.detail.rows[0].lines.length).toBeGreaterThan(0);
    expect(normaliseRun(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it('a pvp run keeps its per-matchup Wilson estimates', () => {
    const r = runFromResult(pvpResult(), { id: 'pv' });
    const m = r.detail.rows[0].aux.matchups;
    expect(m.map((x) => x.seat)).toEqual(['attacker', 'defender']);
    expect(m[0].value).toMatchObject({ est: 0.7, n: 32 });
    expect(r.headline.unit).toBe('p');
  });

  it('a time-to-kill run records the contrast as measured (raw sign, higherIsBetter false)', () => {
    const r = runFromResult(ttkResult(), { id: 'tk' });
    expect(r.headline.unit).toBe('ms');
    expect(r.headline.higherIsBetter).toBe(false);
    expect(r.detail.rows[0].vsBaseline).toMatchObject({ higherIsBetter: false, basis: 'quantile' });
  });

  it('junk in a schema 2 row is repaired, not trusted', () => {
    const raw = JSON.parse(JSON.stringify(v2()));
    raw.detail.rows[0].vsBaseline.verdict = 'amazing';
    raw.detail.rows[0].changes[0].scope = 'galaxy';
    raw.detail.rows[0].value.est = 'lots';
    const r = normaliseRun(raw);
    expect(r.detail.rows[0].vsBaseline.verdict).toBe('unresolved');
    expect(r.detail.rows[0].vsBaseline.significant).toBe(false);
    expect(r.detail.rows[0].changes[0].scope).toBe('preset');
    expect(r.detail.rows[0].value.est).toBeNull();
  });

  it('a legacy run stays schema 1 with its RunEntry detail', () => {
    const r = run(1);
    expect(r.schema).toBe(1);
    expect(r.detail.results).toHaveLength(2);
    expect(r.applied).toBeNull();
  });

  it('the applied mark survives normalisation', () => {
    const r = normaliseRun({ ...v2(), applied: { at: '2026-10-02T00:00:00.000Z', rank: 1 } });
    expect(r.applied).toEqual({ at: '2026-10-02T00:00:00.000Z', rank: 1 });
  });
});

describe('write groups survive the save (a saved run can be applied)', () => {
  it('keeps each row\'s writes through normalisation, and a row without any gets an empty list', () => {
    const r = richResult();
    const run = runFromResult(r, { presetName: 'Main' });
    expect(run.detail.rows[0].writes).toEqual([
      { scope: 'character', title: 'Talents (set 1)', owner: { talentSet: 0 }, changeIds: ['talents:0'], sideEffects: [{ presetId: 'p2', name: 'Boss build', reason: 'uses Talent Set 1' }] },
      { scope: 'preset', title: 'Preset Main', owner: { presetId: 'p1' }, changeIds: ['relics'], sideEffects: [] },
    ]);
    const again = normaliseRun(JSON.parse(JSON.stringify(run)));
    expect(again.detail.rows[0].writes).toEqual(run.detail.rows[0].writes);
    expect(Array.isArray(run.detail.rows[1].writes)).toBe(true);
  });
});

describe('Combat Power on saved runs', () => {
  it('keeps the floor and each row\'s Power; older runs read null; power-floor is a kept-because reason', () => {
    const res = richResult();
    res.request = { ...res.request, powerFloor: 13000 };
    res.baseline.power = 20000;
    res.rows[0].power = 21500;
    res.rows[0].changes[0].keptBecause = 'power-floor';
    const r = runFromResult(res, { id: 'p', at: '2026-10-01T00:00:00.000Z' });
    expect(r.powerFloor).toBe(13000);
    expect(r.detail.baseline.power).toBe(20000);
    expect(r.detail.rows[0].power).toBe(21500);
    expect(r.detail.rows[1]).not.toHaveProperty('power');
    expect(r.detail.rows[0].changes[0].keptBecause).toBe('power-floor');
    const fill = runFromResult({ ...res, rows: [{ ...res.rows[0], changes: [{ ...res.rows[0].changes[0], keptBecause: 'free', free: true }] }, ...res.rows.slice(1)] }, { id: 'f' });
    expect(fill.detail.rows[0].changes[0]).toMatchObject({ keptBecause: 'free', free: true });
    expect(r.detail.rows[0].changes[0]).not.toHaveProperty('free');
    expect('powerFloor' in normaliseRun({ ...r, powerFloor: -3 })).toBe(false);
    expect('powerFloor' in runFromResult(richResult(), { id: 'q' })).toBe(false);
  });
});

describe('run cost (simulation.md §Estimates)', () => {
  const v2 = (r = richResult()) => runFromResult(r, { id: 'c', at: '2026-10-01T00:00:00.000Z' });

  it('a finished run keeps what it cost: strategy, starts, enabled block sizes, lanes, fights per phase, wall time', () => {
    const r = v2();
    expect(r.cost).toEqual({
      strategy: 'local', starts: 2, domains: { relics: 31, talents: 170 }, lanes: 1,
      fights: { search: 19256, minimise: 1376, confirm: 1376, total: 22008 }, elapsedMs: 8941,
    });
    expect(normaliseRun(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it('a PVP run counts its matchups as lanes', () => {
    const r = runFromResult(pvpResult(), { id: 'pv' });
    expect(r.cost.lanes).toBe(2); // attacker and defender seats
  });

  it('a run that stopped at its first check (no search) has no cost', () => {
    const res = richResult();
    res.search = null;
    expect(v2(res)).not.toHaveProperty('cost');
  });

  it('junk is repaired or the cost dropped: total recomputed, bad sizes and times removed', () => {
    const base = v2();
    const fix = (cost) => normaliseRun({ ...base, cost });
    expect(fix({ ...base.cost, fights: { search: 10, minimise: 2, confirm: 3, total: 999 } }).cost.fights.total).toBe(15);
    expect(fix({ ...base.cost, domains: { relics: 0, talents: 3.5, pet: 4, 'x y': 2 }, lanes: -1, elapsedMs: -5 }).cost)
      .toMatchObject({ domains: { pet: 4 }, lanes: 1, elapsedMs: null });
    expect(fix({ ...base.cost, strategy: 'greedy' })).not.toHaveProperty('cost');
    expect(fix({ ...base.cost, fights: { search: 1 } })).not.toHaveProperty('cost');
    expect(fix({ ...base.cost, starts: 0 })).not.toHaveProperty('cost');
    expect(fix('lots')).not.toHaveProperty('cost');
    expect(fix({ ...base.cost, rung: { key: '' }, evaluated: 2.5 }).cost).toEqual(base.cost);
  });

  it('a Push run keeps its first optimised rung\'s search as its cost, with that rung and its builds', () => {
    const inner = richResult();
    const push = {
      ...inner, search: null, stats: { ms: 99999 },
      // the Optimise phase ran two rungs: the first's share of its time by fights
      phases: [{ id: 'climb', fights: 50, ms: 400 }, { id: 'optimise', fights: 44016, ms: 17882 }],
      objective: { kind: 'push', target: 0.95, label: 'Push' },
      push: { status: 'pushed', target: 0.95, ladder: { kind: 'chapter', label: 'Campaign', size: 110 }, start: { index: 60, label: 'level 7-1' }, baseline: { deepest: null }, reached: { deepest: 61 }, stop: null, rungs: [] },
      optimised: { index: 61, label: 'level 7-2', key: '{"chapter":7,"kind":"chapter","level":2}', rungs: 2, search: inner.search },
    };
    const r = runFromResult(push, { id: 'p' });
    expect(r.cost).toEqual({
      strategy: 'local', starts: 2, domains: { relics: 31, talents: 170 }, lanes: 1,
      fights: { search: 19256, minimise: 1376, confirm: 1376, total: 22008 }, elapsedMs: 8941,
      evaluated: inner.search.evaluated, rung: { key: '{"chapter":7,"kind":"chapter","level":2}', label: 'level 7-2' },
    });
    // the headline keeps counting no builds of its own; a saved run without the new fields still loads
    expect(r.headline.evaluated).toBe(0);
    expect(normaliseRun(JSON.parse(JSON.stringify(r)))).toEqual(r);
    const { evaluated, rung, ...old } = r.cost;
    expect(normaliseRun({ ...r, cost: old }).cost).toEqual(old);
    expect([evaluated, rung.label]).toEqual([inner.search.evaluated, 'level 7-2']);
    // a Push run that optimised nothing has no cost
    expect(runFromResult({ ...push, optimised: null }, { id: 'q' })).not.toHaveProperty('cost');
  });
});
