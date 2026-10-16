// Setup estimates (backlog §3; simulation.md §Estimates): exact build counts where the space is listed, a
// per-build cost learned from this device's past runs (else the measured prior), and time from the observed
// speed of those runs or the device calibration.
import { describe, it, expect } from 'vitest';
import {
  estimateRun, estimateTime, effortScale, familyOf, matchHistory, usableRun, FIGHT_KIND_OF, LIVE_ENUMERATE_MAX, PRIOR, HISTORY_MAX,
} from './estimate.js';
import { optimize, prepare, enumerateJoint } from './search.js';
import { BLOCKS } from './space.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { presetPower } from '../build/power.js';
import { normaliseCharacter } from '../model/index.js';
import { runFromResult } from '../model/runs.js';
import { cloneAsOpponent } from '../features/duel.js';

const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const TINY = { level: 'quick', n0: 8, maxN: 32, randomStarts: 0 };
const SHORT = { kind: 'dummy', seconds: 10 };
const character = fixtureCharacter('WARRIOR');
const CAL = { profile: 'balanced', workers: 4, fightsPerSec: { dummy: 600, dungeon: 300, duel: 150 }, measuredAt: 1, version: 'dev' };
const req = (o) => ({ character, presetId: 'p1', target: SHORT, effort: TINY, seed: 2, ...o });

/** A saved run as model/runs.js keeps it, shaped like the request `r` (or overridden). */
function pastRun(r, o = {}) {
  const prep = prepare(r);
  const domains = Object.fromEntries(prep.space.blocks.filter((b) => b.enabled).map((b) => [b.id, prep.space.domainSizes(prep.space.start)[b.id] ?? 1]));
  const { fights = 4000, evaluated = 100, strategy = 'local', elapsedMs = 2000, at = '2026-10-01T00:00:00.000Z', ...rest } = o;
  return {
    id: `r-${at}`, schema: 2, at, kind: 'optimise',
    target: { kind: prep.target.kind, key: prep.target.key, seconds: prep.target.seconds },
    objective: { kind: prep.objective.kind }, space: prep.requestEcho.space, budget: { level: prep.effort.level },
    headline: { aborted: false, evaluated },
    cost: { strategy, starts: 1, domains, lanes: Math.max(1, prep.objective.lanes ?? 1), fights: { search: fights * 0.6, minimise: fights * 0.3, confirm: fights * 0.1, total: fights }, elapsedMs },
    ...rest,
  };
}

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
    // full relic sets only (backlog §16): the saved set holds the strongest relics, so swaps cost Power
    const ids = Object.keys(character.relics);
    const weaker = { ...character, extraRelicSlots: 1, relics: Object.fromEntries(ids.map((id, i) => [id, 7 - i])) };
    const floor = presetPower(weaker, 'p1').power;
    const r0 = req({ character: weaker, space: only('relics'), powerFloor: floor });
    const e = estimateRun(r0);
    const free = estimateRun(req({ character: weaker, space: only('relics') }));
    expect(e.builds.exact).toBe(true);
    expect(e.builds.lo).toBeLessThan(free.builds.lo);
    const run = await optimize(r0);
    expect(e.builds.lo).toBe(run.search.evaluated);
  }, 60000);

  it('the talents block makes it local: a range around the measured builds per sweep, from every start', () => {
    const e = estimateRun(req({ space: only('talents', 'pet'), effort: { ...TINY, randomStarts: 3 } }));
    expect(e.strategy).toBe('local');
    expect(e.builds.exact).toBe(false);
    expect(e.starts).toBe(1 + 1 + 3); // the baseline, the talent fill, three random starts
    expect(e.builds.lo).toBeLessThan(e.builds.likely);
    expect(e.builds.likely).toBeLessThan(e.builds.hi);
    expect(e.builds.hi / e.builds.lo).toBeLessThan(7);
    expect(e.builds.basis).toMatch(/from 5 starts/);
  });

  it('a request that cannot run says why instead of estimating', () => {
    expect(estimateRun({ character, presetId: 'p1', target: { kind: 'dungeon', id: 'nope', step: 1 }, objective: { kind: 'win-chance' } })).toMatchObject({ ok: false });
  });
});

describe('estimateRun: fights without history (the measured prior)', () => {
  it('fights per build follow the objective family; the range stays within the measured band', () => {
    const dps = estimateRun(req({ space: only('relics') }));
    expect(dps.source).toMatchObject({ kind: 'prior', runs: 0, measured: true });
    expect(dps.source.text).toMatch(/reference character/);
    const P = PRIOR.dps;
    expect(dps.fights.likely).toBe(Math.round(dps.builds.likely * P.search.exhaustive[1] * (1 + P.share[1]) + P.later[1]));
    expect(dps.fights.hi / dps.fights.lo).toBeLessThan(10);
    const win = estimateRun(req({ space: only('relics'), target: { kind: 'dungeon', id: 'dungeon_1', step: 1 }, objective: { kind: 'win-chance' } }));
    expect(win.family).toBe('winrate');
    expect(win.fights.perBuild).toBeGreaterThan(20 * dps.fights.perBuild);
    // minimise and confirm vary most on win-rate objectives (simulation.md §Estimates), so this band is wider
    expect(win.fights.hi / win.fights.lo).toBeLessThan(100);
  });

  it('every build is sampled to the first look: the least is never below builds x n0', () => {
    const e = estimateRun(req({ space: only('relics'), effort: { ...TINY, n0: 64 } }));
    expect(e.fights.lo).toBeGreaterThanOrEqual(e.builds.lo * 64);
  });

  it('Standard costs 2 to 4 times Quick per build (labelled as an assumption)', () => {
    const q = estimateRun(req({ space: only('relics'), effort: 'quick' }));
    const s = estimateRun(req({ space: only('relics'), effort: 'standard' }));
    expect(s.fights.likely / q.fights.likely).toBeCloseTo(2 * Math.SQRT2, 1);
    expect(s.assumptions.join(' ')).toMatch(/2 to 4 times/);
    expect(effortScale('quick', 'standard')).toEqual([2, 2 * Math.SQRT2, 4]);
    expect(effortScale('thorough', 'quick')[1]).toBeCloseTo(1 / 8, 9);
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
    expect(two.family).toBe('pvp');
    expect(two.fights.likely).toBeCloseTo(2 * one.fights.likely, -1);
    expect(two.kind).toBe('duel');
  });

  it('the families', () => {
    expect(familyOf('dps', 'dummy')).toBe('dps');
    expect(familyOf('dps', 'fortressBoss')).toBe('fortress');
    expect(familyOf('win-chance', 'dungeon')).toBe('winrate');
    expect(familyOf('push', 'chapter')).toBe('winrate');
    expect(familyOf('survival', 'custom')).toBe('winrate');
    expect(familyOf('pvp-winrate', 'pvp')).toBe('pvp');
    expect(familyOf('win-rate', 'celestial')).toBe('celestial');
  });
});

describe('estimateRun: learning from past runs', () => {
  const r0 = req({ space: only('talents', 'pet') });

  it('a past run of this setup sets the likely value (fights per build and builds per sweep) and a narrow range', () => {
    const e0 = estimateRun(r0);
    const past = pastRun(r0, { evaluated: 120, fights: 9000 });
    const e = estimateRun(r0, { history: [past] });
    expect(e.source).toMatchObject({ kind: 'history', tier: 'same', runs: 1 });
    expect(e.source.text).toMatch(/^From your past run/);
    // the past run had 1 + 1 + 3 nominal starts (randomStarts is not saved); this request has 2
    const scale = e0.starts / 5;
    expect(e.builds.likely).toBe(Math.round(120 * scale));
    // search fights scale with the builds, minimise and confirm keep their ratio to the search (40% of the run)
    expect(e.fights.likely).toBeCloseTo(9000 * scale, -1);
    expect(e.fights.hi / e.fights.lo).toBeCloseTo(1.5 * 1.5, 1);
    expect(e.fights.laterShare).toBeCloseTo(0.4, 6);
  });

  it('several runs: the likely value is their geometric mean, the range spans them with a margin', () => {
    const runs = [pastRun(r0, { evaluated: 100, fights: 4000, at: '2026-10-01' }), pastRun(r0, { evaluated: 100, fights: 16000, at: '2026-10-02' })];
    const e = estimateRun(r0, { history: runs });
    const per = e.fights.likely / 8000;
    expect(per).toBeGreaterThan(0);
    expect(e.fights.hi / e.fights.lo).toBeCloseTo(4 * 1.25 * 1.25, 1);
    expect(e.source.runs).toBe(2);
  });

  it('falls back from this setup to runs like it, then the same family, then another Effort (scaled, wider)', () => {
    const like = pastRun(req({ space: only('relics', 'talents'), target: { kind: 'dummy', seconds: 30 } }));
    expect(estimateRun(r0, { history: [like] }).source.tier).toBe('like');
    const wb = pastRun(req({ space: only('talents'), target: { kind: 'worldBoss', affinity: 'ENRAGED' } }));
    expect(estimateRun(r0, { history: [wb] }).source.tier).toBe('family');
    const std = pastRun(req({ space: only('talents', 'pet'), effort: { ...TINY, level: 'standard' } }));
    const e = estimateRun(r0, { history: [std] });
    expect(e.source).toMatchObject({ tier: 'other-effort', scaled: true });
    expect(e.assumptions.join(' ')).toMatch(/Scaled from runs at another Effort/);
    const same = estimateRun(r0, { history: [{ ...std, budget: { level: 'quick' } }] });
    expect(e.fights.likely).toBeLessThan(same.fights.likely); // standard -> quick is cheaper
    expect(e.fights.hi / e.fights.lo).toBeGreaterThan(same.fights.hi / same.fights.lo);
  });

  it('ignores aborted, Push, cost-less and other-family or other-strategy runs', () => {
    const p = pastRun(r0);
    const bad = [
      { ...p, headline: { ...p.headline, aborted: true } },
      { ...p, objective: { kind: 'push' } },
      { ...p, headline: { ...p.headline, push: { status: 'pushed' } } },
      { ...p, cost: undefined },
      { ...p, schema: 1 },
      { ...p, cost: { ...p.cost, strategy: 'exhaustive' } },
      { ...p, objective: { kind: 'win-chance' }, target: { kind: 'dungeon', key: 'x' } },
    ];
    expect(bad.slice(0, 5).some(usableRun)).toBe(false);
    expect(estimateRun(r0, { history: bad }).source.kind).toBe('prior');
  });

  it('reads the newest few runs only', () => {
    const many = Array.from({ length: HISTORY_MAX + 4 }, (_, i) => pastRun(r0, { at: `2026-10-${String(10 + i).padStart(2, '0')}` }));
    const m = matchHistory({ family: 'dps', strategy: 'local', level: 'quick', targetKey: many[0].target.key, targetKind: 'dummy', objectiveKind: 'dps', blocks: 'pet,talents' }, many);
    expect(m.runs).toHaveLength(HISTORY_MAX);
    expect(m.runs[0].at).toBe(many.at(-1).at);
  });

  it('a real run fed back as history: the likely value is the run\'s own cost', async () => {
    for (const space of [only('relics'), only('talents')]) {
      const r = req({ space, effort: { level: 'quick', n0: 8, maxN: 32 } });
      const res = await optimize(r);
      const run = runFromResult(res, { id: 'x' });
      const prior = estimateRun(r);
      const fed = estimateRun(r, { history: [run] });
      const used = res.search.fights.total;
      expect(prior.fights.lo).toBeLessThanOrEqual(used);
      expect(used).toBeLessThanOrEqual(prior.fights.hi);
      expect(Math.abs(fed.fights.likely - used) / used).toBeLessThan(0.3);
      expect(fed.fights.lo).toBeLessThanOrEqual(used);
      expect(used).toBeLessThanOrEqual(fed.fights.hi);
    }
  }, 120000);
});

describe('estimateRun: time', () => {
  it('time = fights / the calibrated speed of the target\'s kind (the pool\'s speed: not divided by workers again)', () => {
    const e = estimateRun(req({ space: only('relics'), target: { kind: 'dummy', seconds: 60 } }), { calibration: CAL });
    expect(e.kind).toBe('dummy');
    expect(e.time.lo).toBeCloseTo(e.fights.lo / 600, 9);
    expect(e.time.likely).toBeCloseTo(e.fights.likely / 600, 9);
    expect(e.time.hi).toBeCloseTo(e.fights.hi / 600, 9);
    expect(e.time).toMatchObject({ rate: 600, workers: 4, source: 'calibration' });
    // a 10 s window costs a sixth of the 60 s calibration fight
    const short = estimateRun(req({ space: only('relics') }), { calibration: CAL });
    expect(short.time.likely).toBeCloseTo(short.fights.likely / 600 / 6, 9);
    expect(short.time.basis).toMatch(/scaled to a 10 s fight/);
  });

  it('runs like this one with a wall time give the observed speed instead, and say so', () => {
    const r0 = req({ space: only('talents') });
    const e = estimateRun(r0, { calibration: CAL, history: [pastRun(r0, { fights: 6000, elapsedMs: 3000 })] });
    expect(e.time).toMatchObject({ source: 'observed', rate: 2000, workers: null });
    expect(e.time.likely).toBeCloseTo(e.fights.likely / 2000, 9);
    expect(e.time.basis).toMatch(/speed your past run like this ran at/);
    // a run of another window length does not say how fast this one's fights are
    const other = pastRun(req({ space: only('talents'), target: { kind: 'dummy', seconds: 30 } }), { elapsedMs: 3000 });
    expect(estimateRun(r0, { calibration: CAL, history: [other] }).time.source).toBe('calibration');
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
    expect(e).toMatchObject({ ok: true, push: true, family: 'winrate' });
  });
});
