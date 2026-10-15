// The Optimiser's debug log (simulation.md Â§Debug log): it never changes a result, its build rows account
// for every fight of the run with the right phase / block / pass, its fight rows (from every pool worker)
// match the build rows, and it exports as JSONL.
import { describe, it, expect } from 'vitest';
import { forAll, arbCharacter, pick, sample, int } from '../harness/arbitrary.js';
import { HARNESS_SPECS } from '../harness/specs.js';
import { withLegalBaseline } from '../harness/baseline.js';
import { optimize } from './search.js';
import { BLOCKS } from './space.js';
import { stableStringify } from '../engine/metrics.js';
import { fakePoolFactory } from '../tasks/fakePoolWorker.js';
import { poolScope } from '../tasks/pool.js';
import { createDebugLog, debugLogLines, debugLogFileName } from './debugLog.js';
import { normaliseDebugSummary } from '../model/debugLog.js';
import { push } from './push.js';
import { runFromResult } from '../model/runs.js';
import { runTask } from '../tasks/index.js';
import { fixtureCharacter } from '../build/fixtures.js';

const EFFORT = { level: 'quick', n0: 8, maxN: 16, randomStarts: 0 };
const TARGETS = [
  { target: { kind: 'dummy', seconds: 8 } },
  { target: { kind: 'chapter', chapter: 2, level: 3 }, objective: { kind: 'win-rate', target: 1 } },
];
const timeless = (r) => stableStringify({ ...r, stats: { ...r.stats, ms: 0, workers: 0 }, phases: r.phases.map((p) => ({ ...p, ms: 0 })), checkpoint: null });
const withoutLog = ({ debug, ...r }) => r;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

async function onPool(size, req, hooks = {}) {
  if (!size) return optimize(req, hooks);
  const scope = poolScope(fakePoolFactory(size, { seed: size + 3, maxDelayMs: 2 }));
  try {
    return await optimize(req, { ...hooks, pool: scope.open });
  } finally {
    scope.close();
  }
}

function request(rng) {
  const character = withLegalBaseline(arbCharacter(rng, { spec: pick(rng, HARNESS_SPECS) }));
  const blocks = sample(rng, BLOCKS.filter((b) => b !== 'sigils'), 2);
  return {
    character,
    presetId: character.activePresetId,
    ...pick(rng, TARGETS),
    space: Object.fromEntries(BLOCKS.map((b) => [b, blocks.includes(b)])),
    effort: EFFORT,
    seed: int(rng, 1, 1e6),
  };
}

const cases = [];
forAll('debug-log', request, (req) => { cases.push(req); }, { runs: 2 });

describe('debug log', { timeout: 600000 }, () => {
  it('never changes a result: Off, Builds and Builds and fights give the same result, inline and on a pool', async () => {
    let done = 0;
    for (const [k, req] of cases.entries()) {
      // a pool is slow under the fake workers' delays: the first case covers it
      for (const size of k === 0 ? [0, 3] : [0]) {
        const off = await onPool(size, req);
        expect(off.debug, 'Off: no log on the result').toBeUndefined();
        if (off.status !== 'done') continue;
        done++;
        for (const debug of ['builds', 'fights']) {
          const on = await onPool(size, { ...req, debug });
          expect(on.debug?.level).toBe(debug);
          expect(timeless(withoutLog(on)), `${debug} on ${size} workers changed the result`).toBe(timeless(off));
        }
      }
    }
    expect(done).toBeGreaterThan(0);
  });

  it('Builds: one row per build raced, with its phase, block and pass, and fight counts that sum to the run', async () => {
    let checked = 0;
    for (const req of cases) {
      const r = await optimize({ ...req, debug: 'builds' });
      if (r.status !== 'done') continue;
      checked++;
      const { builds, summary, fights } = r.debug;
      expect(fights).toBeNull();
      // inline every fight drawn is read by a step, so the rows add up to the run's own count, phase by phase
      expect(sum(builds.map((b) => b.fights))).toBe(sum(r.phases.map((p) => p.fights)));
      for (const p of r.phases) expect(sum(builds.filter((b) => b.phase === p.id).map((b) => b.fights)), p.id).toBe(p.fights);
      expect(summary.totals.fights).toBe(sum(r.phases.map((p) => p.fights)));
      for (const p of summary.phases) expect(p.fights).toBe(sum(builds.filter((b) => b.phase === p.id).map((b) => b.fights)));
      // the search's rows name the block and pass the step list shows
      const search = builds.filter((b) => b.phase === 'search');
      expect(search.length).toBeGreaterThan(0);
      for (const b of search) {
        expect([...BLOCKS, 'all']).toContain(b.block);
        expect(b.pass).toBeGreaterThanOrEqual(1);
        expect(b.pass).toBeLessThanOrEqual(r.search.steps.find((s) => s.id === b.block)?.pass ?? 1);
      }
      for (const b of builds.filter((x) => x.phase !== 'search')) expect(b.block).toBeNull();
      // every build of a race has a row, with the race's decision
      const races = builds.filter((b) => b.step === 'race');
      expect(races.length).toBeGreaterThanOrEqual(r.search.evaluated);
      for (const b of races) expect(['kept', 'dropped', 'tied', 'unresolved']).toContain(b.decision);
      for (const b of builds) expect(b.cpuMs).toBeGreaterThanOrEqual(0);
      expect(builds.every((b) => Array.isArray(b.changes) && typeof b.key === 'string')).toBe(true);
      expect(r.debug.slowest.length).toBe(Math.min(20, builds.length));
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('Builds and fights: one row per fight, per build matching the build rows, including the pool workers\' fights', async () => {
    let checked = 0;
    for (const req of cases) {
      for (const size of [0, 3]) {
        const r = await onPool(size, { ...req, debug: 'fights' });
        if (r.status !== 'done') continue;
        checked++;
        const { builds, fights, summary } = r.debug;
        expect(fights.rows).toBe(summary.totals.fights);
        expect(fights.rows).toBe(sum(builds.map((b) => b.fights)));
        const perBuild = new Map();
        for (let i = 0; i < fights.rows; i++) perBuild.set(fights.build[i], (perBuild.get(fights.build[i]) ?? 0) + 1);
        expect(perBuild.has(-1), 'a fight no build row claimed').toBe(false);
        for (const b of builds) expect(perBuild.get(b.id) ?? 0, `build ${b.id}`).toBe(b.fights);
        // the fight's own game length is read where the engine reports it
        expect([...fights.gameMs].some((x) => x > 0)).toBe(true);
        if (size) expect(sum([...fights.cpuMs])).toBeGreaterThan(0);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('rides in the optimize task\'s request to its worker pool', async () => {
    const req = cases[0];
    const r = await runTask('optimize', { ...req, mode: 'optimize', debug: 'fights' }, { pool: fakePoolFactory(2, { seed: 9 }) });
    expect(r.debug.level).toBe('fights');
    expect(r.debug.fights.rows).toBe(r.debug.summary.totals.fights);
    expect((await runTask('optimize', { ...req, mode: 'optimize' }, {})).debug).toBeUndefined();
  });

  it('a cancelled run keeps the log up to the cancel', async () => {
    const req = cases[0];
    const ctl = new AbortController();
    let seen = 0;
    const r = await optimize({ ...req, debug: 'fights' }, { signal: ctl.signal, onProgress: () => { if (++seen === 4) ctl.abort(); } });
    expect(r.status).toBe('cancelled');
    expect(r.debug.level).toBe('fights');
    expect(r.debug.summary.totals.fights).toBe(r.debug.fights.rows);
    expect(sum(r.debug.builds.map((b) => b.fights))).toBe(r.debug.fights.rows);
  });

  it('exports as JSONL: a header with the run, then the build rows, then the fight rows', async () => {
    const req = cases.find((c) => c.target.kind === 'dummy') ?? cases[0];
    const r = await optimize({ ...req, debug: 'fights' });
    const lines = [...debugLogLines(r.debug)];
    const rows = lines.map((l) => JSON.parse(l));
    expect(rows[0]).toMatchObject({ type: 'header', schema: 'optimiser-debug-log/1', level: 'fights', seed: req.seed, objective: r.objective.spec ?? expect.anything() });
    expect(rows[0].effort).toEqual(r.request.effort);
    expect(rows[0].targetSpec).toBeTruthy();
    const types = rows.slice(1).map((x) => x.type);
    expect(types.filter((t) => t === 'build')).toHaveLength(r.debug.builds.length);
    expect(types.filter((t) => t === 'fight')).toHaveLength(r.debug.fights.rows);
    expect(types.indexOf('fight')).toBeGreaterThan(types.lastIndexOf('build'));
    expect(rows.find((x) => x.type === 'fight')).toEqual(expect.objectContaining({ build: expect.any(Number), lane: 0, index: expect.any(Number), value: expect.any(Number), cpuMs: expect.any(Number) }));
    // a saved run keeps the summary only
    const run = runFromResult(r, { presetName: 'Main' });
    expect(run.debug).toEqual(normaliseDebugSummary(r.debug.summary));
    expect(JSON.stringify(run.debug)).not.toMatch(/"builds":\[|"fights":\{/);
    expect(debugLogFileName('Orion the Bold', new Date('2026-10-15T12:34:56.789Z'))).toBe('optimiser-log-orion-the-bold-2026-10-15-12-34-56.jsonl');
  });
});

describe('debug log store', () => {
  it('is null when off, and caps fight rows saying how many it dropped', () => {
    expect(createDebugLog('off')).toBeNull();
    expect(createDebugLog('junk')).toBeNull();
    const log = createDebugLog('fights', { fightCap: 5 });
    log.useContext(() => ({ phase: 'search', block: 'relics', pass: 1, rung: null }));
    const e = log.entry('search', 'ek');
    log.drew(e, { main: [[1, 0, 1, 1]], trace: { cpu: [[1, 2, 3, 4]], ms: [[10, 20, 30, 40]] } }, 0, 99);
    log.drew(e, { main: [[0, 0, 1]] }, 4, 6);
    log.build({ step: 'race', stage: 'search', key: 'k', entry: e, changes: [], looks: 1, n: 7, decision: 'kept' });
    const out = log.finish({});
    expect(out.builds[0]).toMatchObject({ fights: 7, cpuMs: 16, phase: 'search', block: 'relics', pass: 1 });
    expect(out.fights.rows).toBe(5);
    expect(out.summary.totals).toMatchObject({ fights: 7, truncatedFights: 2 });
    expect([...out.fights.build]).toEqual([0, 0, 0, 0, 0]);
    expect(Number.isNaN(out.fights.gameMs[4])).toBe(true);
    // a saved run keeps only the summary
    const saved = normaliseDebugSummary({ ...out.summary, builds: out.builds });
    expect(saved).toEqual({ level: 'fights', phases: [expect.objectContaining({ id: 'search', fights: 7 })], blocks: [expect.objectContaining({ id: 'relics' })], totals: expect.objectContaining({ fights: 7, truncatedFights: 2 }) });
    expect(saved.builds).toBeUndefined();
    expect(normaliseDebugSummary({ level: 'off' })).toBeNull();
  });
});

describe('debug log of a Push run', { timeout: 600000 }, () => {
  const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
  const REQUEST = {
    character: fixtureCharacter('WARRIOR'), presetId: 'p1', target: { kind: 'chapter', chapter: 9, level: 1 },
    objective: { kind: 'push', target: 0.9 }, space: only('relics', 'pet'), effort: { level: 'quick', n0: 8, maxN: 256, randomStarts: 0 }, seed: 1,
  };
  const pushTimeless = (r) => stableStringify({ ...r, stats: { ...r.stats, ms: 0 }, phases: r.phases.map((p) => ({ ...p, ms: 0 })) });

  async function pushOnPool(size, req) {
    const scope = poolScope(fakePoolFactory(size, { seed: 5, maxDelayMs: 2 }));
    try {
      return await push(req, { pool: scope.open });
    } finally {
      scope.close();
    }
  }

  it('logs the climb, the screen and each step\'s own run, every fight on a row, without changing the result', async () => {
    const off = await push(REQUEST);
    expect(off.debug).toBeUndefined();
    const on = await pushOnPool(2, { ...REQUEST, debug: 'fights' });
    expect(pushTimeless(withoutLog(on))).toBe(pushTimeless(off));
    const { builds, fights, summary } = on.debug;
    expect(fights.rows).toBe(summary.totals.fights);
    expect(sum(builds.map((b) => b.fights))).toBe(fights.rows);
    expect(fights.rows).toBeGreaterThanOrEqual(off.stats.fights);
    const phases = new Set(builds.map((b) => b.phase));
    expect(phases.has('push-climb')).toBe(true);
    expect(phases.has('search')).toBe(true);
    expect(builds.filter((b) => b.phase === 'search').every((b) => typeof b.rung === 'string')).toBe(true);
    expect(builds.filter((b) => b.phase === 'push-climb').every((b) => b.step === 'check' && typeof b.rung === 'string')).toBe(true);
    // inline, every fight drawn is read: the rows add up to the Push's own count
    const inline = await push({ ...REQUEST, debug: 'builds' });
    expect(sum(inline.debug.builds.map((b) => b.fights))).toBe(off.stats.fights);
    expect(normaliseDebugSummary({ level: 'off' })).toBeNull();
  });
});
