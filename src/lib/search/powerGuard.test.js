// The Combat Power guard (simulation.md §Build space): a hard legality rule of the build space. A build
// below the floor is not admissible, never sampled, and never reported; a baseline below it cannot run.
import { describe, it, expect } from 'vitest';
import { optimize } from './search.js';
import { BLOCKS, createBuildSpace, normalisePowerFloor } from './space.js';
import { rowViolations } from './result.js';
import { makeObjective, resolveTarget } from './objectives.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { presetPower } from '../build/power.js';
import { stableStringify } from '../engine/metrics.js';

const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const TINY = { level: 'quick', n0: 8, maxN: 32, randomStarts: 0 };
const SHORT = { kind: 'dummy', seconds: 10 };
// Full relic sets only are tried (stat dominance, backlog §16), so the saved set holds the strongest relics and the
// others are weaker: swapping one in costs Power, which is what the guard must catch.
const character = (() => {
  const c = fixtureCharacter('WARRIOR');
  const ids = Object.keys(c.relics);
  return { ...c, extraRelicSlots: 1, relics: Object.fromEntries(ids.map((id, i) => [id, 7 - i])) };
})();
const P0 = presetPower(character, 'p1').power;

describe('normalisePowerFloor', () => {
  it('keeps a positive whole number, null otherwise', () => {
    expect([12000, 11000.7, 1, 0, -5, NaN, '13000', null, undefined].map(normalisePowerFloor)).toEqual([12000, 11000, 1, null, null, null, null, null, null]);
  });
});

describe('the build space with a floor', () => {
  it('powerOf is the materialised preset\'s Combat Power; admissible compares it with the floor', () => {
    const free = createBuildSpace(character, 'p1');
    expect(free.powerFloor).toBeNull();
    expect(free.powerOf(free.start)).toBe(P0);
    expect(free.admissible(free.start)).toBe(true);
    expect(createBuildSpace(character, 'p1', { powerFloor: P0 }).admissible(free.start)).toBe(true);
    expect(createBuildSpace(character, 'p1', { powerFloor: P0 + 1 }).admissible(free.start)).toBe(false);
  });

  it('every relic or pet choice below the floor is inadmissible, every one at or above it admissible', () => {
    const space = createBuildSpace(character, 'p1', { powerFloor: P0 });
    const values = ['relics', 'pet'].flatMap((id) => space.blocks.find((b) => b.id === id).domain(space.start));
    const below = values.filter((c) => space.powerOf(c) < P0);
    expect(below.length).toBeGreaterThan(0);
    expect(space.admissible(space.start)).toBe(true);
    for (const c of values) expect(space.admissible(c)).toBe(space.powerOf(c) >= P0);
  });

  it('rowViolations flags a row below the floor (I1)', () => {
    const space = createBuildSpace(character, 'p1', { powerFloor: P0 });
    const low = space.blocks.find((b) => b.id === 'relics').domain(space.start).find((c) => space.powerOf(c) < P0);
    expect(space.powerOf(low)).toBeLessThan(P0);
    const v = rowViolations(space, space.start, { candidate: low, isBaseline: false, changes: [] });
    expect(v.some((x) => x.startsWith('I1 below the Combat Power floor'))).toBe(true);
  });
});

/** A pool hook that runs the objective in-process and records every fighter it is asked to sample. */
function recordingPool(seen) {
  return (kind, setup) => {
    const objective = makeObjective(setup.objective, resolveTarget(setup.target, { character }));
    return {
      size: 1,
      run: async ({ fighter, seed }, from, to, o) => {
        seen.push(fighter);
        return objective.sample(fighter, { seed, from, to, signal: o?.signal });
      },
      close() {},
    };
  };
}

describe('optimize with a floor', { timeout: 120000 }, () => {
  const req = { character, presetId: 'p1', target: SHORT, space: only('relics', 'pet'), effort: TINY, seed: 4 };

  it('a baseline below the floor fails with a powerFloor violation and no fights', async () => {
    const r = await optimize({ ...req, powerFloor: P0 + 1 });
    expect(r.status).toBe('failed');
    expect(r.baselineViolations.map((v) => v.gate)).toEqual(['powerFloor']);
    expect(r.error.message).toMatch(/below the floor/);
  });

  it('never samples a build below the floor, reports none, and records the floor and every row\'s Power', async () => {
    const seen = [];
    const r = await optimize({ ...req, powerFloor: P0 }, { pool: recordingPool(seen) });
    expect(r.status).toBe('done');
    expect(r.request.powerFloor).toBe(P0);
    expect(r.search.belowFloor).toBeGreaterThan(0);
    expect(r.baseline.power).toBe(P0);
    for (const row of r.rows) expect(row.power).toBeGreaterThanOrEqual(P0);

    // every sampled fighter belongs to at least one admissible build of the joint space
    const space = createBuildSpace(character, 'p1', { powerFloor: P0 });
    const ok = new Set();
    const relics = space.blocks.find((b) => b.id === 'relics');
    const pets = space.blocks.find((b) => b.id === 'pet');
    for (const a of [space.start, ...relics.domain(space.start)]) {
      for (const c of [a, ...pets.domain(a)]) {
        if (space.admissible(c)) ok.add(stableStringify(space.fighterOf(c).stats));
      }
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const f of seen) expect(ok.has(stableStringify(f.stats))).toBe(true);
  });

  it('without a floor the request echo has no powerFloor (request keys of older runs are unchanged)', async () => {
    const r = await optimize({ ...req, space: only('relics') });
    expect('powerFloor' in r.request).toBe(false);
    expect(r.search.belowFloor).toBe(0);
  });
});
