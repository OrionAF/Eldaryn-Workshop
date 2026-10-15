import { describe, it, expect } from 'vitest';
import { optimize } from './search.js';
import { BLOCKS } from './space.js';
import { fixtureCharacter } from '../build/fixtures.js';

const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const SHORT = { kind: 'dummy', seconds: 10 };
const QUICK = { level: 'quick', n0: 4, maxN: 8, randomStarts: 0 };
const run = (space, effort = QUICK, seed = 6) => {
  const seen = [];
  return optimize({ character: fixtureCharacter('WARRIOR'), presetId: 'p1', target: SHORT, space: only(...space), effort, seed }, { onProgress: (p) => seen.push(p) })
    .then((result) => ({ result, seen }));
};
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe('search steps: one row per block (simulation.md §Progress, searchSteps)', { timeout: 120000 }, () => {
  it('progress carries one row per block, in block order, once the search starts', async () => {
    const { seen } = await run(['talents', 'pet']);
    const first = seen.find((p) => p.searchSteps);
    expect(first.phase).toBe('search');
    expect(first.searchSteps.map((r) => r.id)).toEqual([...BLOCKS]);
    expect(seen.filter((p) => p.phase === 'screen').every((p) => !('searchSteps' in p))).toBe(true);
    for (const r of first.searchSteps) {
      expect(Object.keys(r).sort()).toEqual(['fights', 'id', 'improved', 'pass', 'reason', 'state', 'tried']);
    }
    expect(JSON.parse(JSON.stringify(seen))).toEqual(seen); // plain JSON: it crosses the worker boundary
  });

  it('a block goes queued, running, then done; the last report has no block running', async () => {
    const { result, seen } = await run(['talents', 'pet']);
    const states = (id) => seen.filter((p) => p.searchSteps).map((p) => byId(p.searchSteps)[id].state);
    for (const id of ['talents', 'pet']) {
      const s = states(id);
      expect(s[0]).toBe('queued');
      expect(s).toContain('running');
      expect(s.at(-1)).toBe('done');
      expect(s.indexOf('running')).toBeGreaterThan(s.indexOf('queued'));
    }
    const last = seen.filter((p) => p.searchSteps).at(-1).searchSteps;
    expect(last.some((r) => r.state === 'running' || r.state === 'queued')).toBe(false);
    const talents = byId(result.search.steps).talents;
    expect(talents.tried).toBeGreaterThan(0);
    expect(talents.fights).toBeGreaterThan(0);
    expect(typeof talents.improved).toBe('boolean');
    expect(byId(last).talents).toEqual(talents);
  });

  it('a block that is off, or has nothing to try, is skipped with the reason', async () => {
    const { result } = await run(['talents', 'pet', 'utility', 'transcendence', 'minorGlyphs']);
    const rows = byId(result.search.steps);
    expect(rows.relics).toMatchObject({ state: 'skipped', reason: 'off', tried: 0 });
    expect(rows.mount).toMatchObject({ state: 'skipped', reason: 'off' });
    for (const id of ['utility', 'transcendence', 'minorGlyphs']) expect(rows[id]).toMatchObject({ state: 'skipped', reason: 'nothing-to-try', tried: 0 });
    expect(rows.pet).toMatchObject({ state: 'done', reason: null });
  });

  it('a multi-start run carries the pass number: more starts, more passes over a block', async () => {
    const one = (await run(['talents', 'pet'])).result.search.steps;
    const multi = await run(['talents', 'pet'], { ...QUICK, randomStarts: 2 });
    const many = multi.result.search.steps;
    expect(byId(one).pet.pass).toBeGreaterThanOrEqual(1);
    expect(byId(many).pet.pass).toBeGreaterThan(byId(one).pet.pass);
    // a second visit of a block is reported running again, with its pass number
    const running = multi.seen.filter((p) => p.searchSteps).map((p) => byId(p.searchSteps).pet).filter((r) => r.state === 'running');
    expect(Math.max(...running.map((r) => r.pass))).toBeGreaterThan(1);
    expect(running.map((r) => r.pass)).toEqual([...running.map((r) => r.pass)].sort((a, b) => a - b));
  });

  it('an exhaustive search races the open blocks together: each shows the joint race', async () => {
    const { result, seen } = await run(['relics']);
    expect(result.search.strategy).toBe('exhaustive');
    const rows = byId(result.search.steps);
    expect(rows.relics).toMatchObject({ state: 'done', pass: 1, improved: true });
    expect(rows.relics.tried).toBeGreaterThan(1);
    expect(rows.relics.fights).toBeGreaterThan(0);
    expect(rows.pet).toMatchObject({ state: 'skipped', reason: 'off' });
    expect(seen.some((p) => p.searchSteps && byId(p.searchSteps).relics.state === 'running')).toBe(true);
  });
});
