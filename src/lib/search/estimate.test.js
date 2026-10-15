// Setup estimates (backlog §3; simulation.md §Estimates): exact build counts where the space is listed, a
// fights range that brackets what a real run uses, and time from the device calibration by fight kind.
import { describe, it, expect } from 'vitest';
import { estimateRun, estimateTime, FIGHT_KIND_OF, LIVE_ENUMERATE_MAX } from './estimate.js';
import { optimize, prepare, enumerateJoint } from './search.js';
import { BLOCKS } from './space.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { presetPower } from '../build/power.js';
import { normaliseCharacter } from '../model/index.js';
import { cloneAsOpponent } from '../features/duel.js';

const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const TINY = { level: 'quick', n0: 8, maxN: 32, randomStarts: 0 };
const SHORT = { kind: 'dummy', seconds: 10 };
const character = fixtureCharacter('WARRIOR');
const CAL = { profile: 'balanced', workers: 4, fightsPerSec: { dummy: 600, dungeon: 300, duel: 150 }, measuredAt: 1, version: 'dev' };
const req = (o) => ({ character, presetId: 'p1', target: SHORT, effort: TINY, seed: 2, ...o });

describe('estimateRun: builds', () => {
  it('a small space is counted exactly: the search\'s own enumeration and the builds the run races', async () => {
    const r0 = req({ space: only('relics', 'pet') });
    const e = estimateRun(r0);
    const prep = prepare(r0);
    const listed = enumerateJoint(prep.space, prep.space.start, new Set(['relics', 'pet']));
    expect(e.ok).toBe(true);
    expect(e.strategy).toBe('exhaustive');
    expect(e.builds).toMatchObject({ exact: true, lo: listed.length, likely: listed.length, hi: listed.length });
    expect(listed.length).toBeLessThanOrEqual(LIVE_ENUMERATE_MAX);
    const run = await optimize(r0);
    expect(run.search.strategy).toBe('exhaustive');
    expect(e.builds.lo).toBe(run.search.evaluated);
    expect(e.blocks.filter((b) => b.enabled).map((b) => [b.id, b.values])).toEqual(run.search.blocks.filter((b) => b.enabled).map((b) => [b.id, b.domain]));
  }, 60000);

  it('the Combat Power guard is applied to the exact count, as the search applies it', async () => {
    const floor = presetPower(character, 'p1').power;
    const r0 = req({ space: only('relics'), powerFloor: floor });
    const e = estimateRun(r0);
    const free = estimateRun(req({ space: only('relics') }));
    expect(e.builds.exact).toBe(true);
    expect(e.builds.lo).toBeLessThan(free.builds.lo);
    const run = await optimize(r0);
    expect(e.builds.lo).toBe(run.search.evaluated);
  }, 60000);

  it('the talents block makes it local: a range from one start and one pass to every start at the most passes', () => {
    const e = estimateRun(req({ space: only('talents', 'pet'), effort: { ...TINY, randomStarts: 3 } }));
    expect(e.strategy).toBe('local');
    expect(e.builds.exact).toBe(false);
    expect(e.starts).toBe(1 + 1 + 3); // the baseline, the talent fill, three random starts
    expect(e.builds.lo).toBeLessThan(e.builds.likely);
    expect(e.builds.likely).toBeLessThan(e.builds.hi);
    expect(e.builds.basis).toMatch(/5 starts of 8 passes/);
  });

  it('a request that cannot run says why instead of estimating', () => {
    expect(estimateRun({ character, presetId: 'p1', target: { kind: 'dungeon', id: 'nope', step: 1 }, objective: { kind: 'win-chance' } })).toMatchObject({ ok: false });
  });
});

describe('estimateRun: fights', () => {
  it('the range brackets the fights a real run used (exhaustive and local)', async () => {
    for (const space of [only('relics'), only('talents')]) {
      const r0 = req({ space });
      const e = estimateRun(r0);
      const run = await optimize(r0);
      expect(run.status).toBe('done');
      const used = run.search.fights.total;
      expect(e.fights.lo).toBeLessThanOrEqual(used);
      expect(used).toBeLessThanOrEqual(e.fights.hi);
      expect(e.fights.lo).toBeLessThanOrEqual(e.fights.likely);
      expect(e.fights.likely).toBeLessThanOrEqual(e.fights.hi);
    }
  }, 120000);

  it('the least is every build at the first look; effort scales it', () => {
    const e = estimateRun(req({ space: only('relics') }));
    expect(e.fights.lo).toBe(e.builds.lo * TINY.n0);
    const e2 = estimateRun(req({ space: only('relics'), effort: { ...TINY, n0: 16, maxN: 64 } }));
    expect(e2.fights.lo).toBe(2 * e.fights.lo);
    expect(e2.fights.hi).toBe(2 * e.fights.hi);
  });

  it('PVP multiplies every count by its matchups', () => {
    const opp = (id) => ({ ...cloneAsOpponent(fixtureCharacter('WARRIOR'), 'p1', 'WARRIOR_TANK', id), id });
    const raw = JSON.parse(JSON.stringify(character));
    raw.opponents = [opp('a'), opp('b')];
    const c = normaliseCharacter(raw);
    const pvp = (ids) => estimateRun({ ...req({ space: only('relics') }), character: c, target: { kind: 'pvp', opponentIds: ids, seats: 'attacker' }, objective: { kind: 'pvp-winrate' } });
    const one = pvp(['a']);
    const two = pvp(['a', 'b']);
    expect(two.lanes).toBe(2);
    expect(two.fights.lo).toBe(2 * one.fights.lo);
    expect(two.fights.hi).toBe(2 * one.fights.hi);
    expect(two.kind).toBe('duel');
  });
});

describe('estimateRun: time', () => {
  it('time = fights / the calibrated speed of the target\'s kind (the pool\'s speed: not divided by workers again)', () => {
    const e = estimateRun(req({ space: only('relics'), target: { kind: 'dummy', seconds: 60 } }), { calibration: CAL });
    expect(e.kind).toBe('dummy');
    expect(e.time.lo).toBeCloseTo(e.fights.lo / 600, 9);
    expect(e.time.likely).toBeCloseTo(e.fights.likely / 600, 9);
    expect(e.time.hi).toBeCloseTo(e.fights.hi / 600, 9);
    expect(e.time).toMatchObject({ rate: 600, workers: 4 });
    // a 10 s window costs a sixth of the 60 s calibration fight
    const short = estimateRun(req({ space: only('relics') }), { calibration: CAL });
    expect(short.time.likely).toBeCloseTo(short.fights.likely / 600 / 6, 9);
    expect(short.time.basis).toMatch(/scaled to a 10 s fight/);
  });

  it('maps each target to its fight kind: mob fights to dungeon, the Fortress boss and PVP to duel', () => {
    const dungeon = estimateRun(req({ space: only('pet'), target: { kind: 'dungeon', id: 'dungeon_1', step: 1 }, objective: { kind: 'win-chance' } }), { calibration: CAL });
    expect(dungeon.kind).toBe('dungeon');
    expect(dungeon.time.likely).toBeCloseTo(dungeon.fights.likely / 300, 9);
    const fortress = estimateRun(req({ space: only('pet'), target: { kind: 'fortressBoss', group: 'TOP' } }), { calibration: CAL });
    expect(fortress.kind).toBe('duel');
    expect(fortress.time.likely).toBeCloseTo(fortress.fights.likely / 150, 9);
    expect(fortress.assumptions.join(' ')).toMatch(/assumed to cost like the calibration's duel fight/);
    expect(FIGHT_KIND_OF).toMatchObject({ pvp: 'duel', fortressBoss: 'duel', chapter: 'dungeon', raid: 'dungeon', oblivion: 'dungeon' });
  });

  it('a kind the calibration did not measure counts at the slowest measured speed, and says so', () => {
    const cal = { ...CAL, fightsPerSec: { dummy: 600, dungeon: 300 } };
    const t = estimateTime({ lo: 300, likely: 600, hi: 900 }, { kind: 'fortressBoss', label: 'Fortress boss' }, cal);
    expect(t.time.likely).toBeCloseTo(2, 9);
    expect(t.assumption).toMatch(/slowest measured speed/);
  });

  it('no calibration or a target kind with no calibrated fight: builds and fights, no time, and the reason', () => {
    const e = estimateRun(req({ space: only('relics') }));
    expect(e.time).toBeNull();
    expect(e.timeReason).toBe('no-calibration');
    expect(e.fights.likely).toBeGreaterThan(0);
    const t = estimateTime({ lo: 1, likely: 2, hi: 3 }, { kind: 'celestial' }, CAL);
    expect(t).toMatchObject({ kind: null, time: null, reason: 'unmapped-kind' });
  });

  it('Push estimates one build search at its start rung', () => {
    const e = estimateRun(req({ space: only('pet'), target: { kind: 'dungeon', id: 'dungeon_1', step: 1 }, objective: { kind: 'push' } }));
    expect(e).toMatchObject({ ok: true, push: true });
  });
});
