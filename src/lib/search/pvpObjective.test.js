import { describe, it, expect } from 'vitest';
import { resolveTarget, makeObjective, objectiveKindsFor, TARGET_KINDS } from './objectives.js';
import { resolvePvpTarget, matchupsOf, PVP_MAX_OPPONENTS } from './pvpObjective.js';
import { BLOCKS } from './space.js';
import { runTask } from '../tasks/index.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { cloneAsOpponent, presetDuelFighter, opponentFighter } from '../features/duel.js';
import { normaliseCharacter } from '../model/index.js';
import { wilsonInterval, pvpWinRate } from '../engine/metrics.js';
import { hashSeed } from '../engine/rng.js';
import { contrastSets } from './sampler.js';

/** The Warrior fixture with two saved opponents (ids opp-a, opp-b), cloned from its own preset. */
function withOpponents() {
  const base = fixtureCharacter('WARRIOR');
  const raw = JSON.parse(JSON.stringify(base));
  raw.opponents = [
    { ...cloneAsOpponent(base, 'p1', 'WARRIOR_TANK', 'Tanky'), id: 'opp-a' },
    { ...cloneAsOpponent(base, 'p1', 'SENTINEL_MARKSMANSHIP', 'Archer'), id: 'opp-b' },
  ];
  return normaliseCharacter(raw);
}
const pvp = (opponentIds, seats = 'attacker') => ({ kind: 'pvp', opponentIds, seats });
const OBJ = { kind: 'pvp-winrate' };

describe('pvp target', () => {
  it('is its own target kind whose only objective is the win rate (the PVE lists are untouched)', () => {
    expect(TARGET_KINDS).not.toContain('pvp');
    expect(objectiveKindsFor('pvp')).toEqual(['pvp-winrate']);
    expect(objectiveKindsFor('dummy')).not.toContain('pvp-winrate');
  });

  it('resolves against the saved opponents and expands to matchups', () => {
    const c = withOpponents();
    const t = resolveTarget(pvp(['opp-a', 'opp-b'], 'both'), { character: c });
    expect(t.spec).toEqual(pvp(['opp-a', 'opp-b'], 'both'));
    expect(t.matchups).toEqual([
      { opponentId: 'opp-a', seat: 'attacker' }, { opponentId: 'opp-a', seat: 'defender' },
      { opponentId: 'opp-b', seat: 'attacker' }, { opponentId: 'opp-b', seat: 'defender' },
    ]);
    expect(t.label).toBe('PVP vs Tanky and 1 more, both seats');
    expect(t.realm).toBeNull();
    expect(matchupsOf(['x'], 'defender')).toEqual([{ opponentId: 'x', seat: 'defender' }]);
  });

  it('rejects what it cannot score, with a message the UI can show', () => {
    const c = withOpponents();
    expect(() => resolveTarget(pvp(['opp-a']))).toThrow(/saved opponent/);
    expect(() => resolvePvpTarget(pvp(['opp-a']), { opponents: [] })).toThrow(/saved opponent/);
    expect(() => resolvePvpTarget(pvp([]), c)).toThrow(/at least one/);
    expect(() => resolvePvpTarget(pvp(['nope']), c)).toThrow(/not saved/);
    expect(() => resolvePvpTarget(pvp(Array.from({ length: PVP_MAX_OPPONENTS + 1 }, (_, i) => `o${i}`)), c)).toThrow(/at most/);
    const blank = JSON.parse(JSON.stringify(c));
    blank.opponents[0].sheet.values = {};
    expect(() => resolvePvpTarget(pvp(['opp-a']), normaliseCharacter(blank))).toThrow(/no HP/);
    const t = resolveTarget(pvp(['opp-a', 'opp-a', 'opp-b'], 'sideways'), { character: c });
    expect(t.spec).toEqual(pvp(['opp-a', 'opp-b'], 'attacker'));
    expect(() => makeObjective({ kind: 'pvp-winrate' }, resolveTarget({ kind: 'dummy' }))).toThrow(/cannot score/);
    expect(() => makeObjective({ kind: 'dps' }, t)).toThrow(/cannot score/);
  });
});

describe('pvp-winrate measure', () => {
  const c = withOpponents();
  const mine = presetDuelFighter(c, 'p1');
  const objFor = (ids, seats) => {
    const t = resolveTarget(pvp(ids, seats), { character: c });
    return makeObjective(OBJ, t);
  };

  it('reports the mean win rate over every matchup with N and a Wilson interval', async () => {
    const o = objFor(['opp-a', 'opp-b'], 'both');
    const m = await o.measure(mine, { n: 20, seed: 5 });
    expect(m.n).toBe(80);
    expect(m.value).toBeGreaterThanOrEqual(0);
    expect(m.value).toBeLessThanOrEqual(1);
    expect(m.score).toBe(m.value);
    expect(m.lo).toBeLessThanOrEqual(m.value);
    expect(m.hi).toBeGreaterThanOrEqual(m.value);
    const wins = Math.round(m.value * m.n);
    expect(m.lo).toBeCloseTo(wilsonInterval(wins, 80).lo, 12);
    expect(m.extra.matchups).toHaveLength(4);
    expect(m.extra.perMatchupN).toBe(20);
    const mean = m.extra.matchups.reduce((s, x) => s + x.p, 0) / 4;
    expect(m.value).toBeCloseTo(mean, 12);
    expect(o.unit).toBe('p');
  });

  it('is deterministic for a seed (common random numbers); one 0/1 lane per matchup averages to the win rate', async () => {
    const o = objFor(['opp-a'], 'both');
    const a = await o.measure(mine, { n: 24, seed: 9 });
    const b = await o.measure(mine, { n: 24, seed: 9 });
    expect(b).toEqual(a);
    expect(a.samples.main).toHaveLength(2);
    expect(a.samples.n).toBe(24);
    const flat = a.samples.main.flat();
    expect(flat.every((x) => x === 0 || x === 1)).toBe(true);
    expect(flat.reduce((s, x) => s + x, 0) / 48).toBeCloseTo(a.value, 12);
    const other = await o.measure(mine, { n: 24, seed: 10 });
    expect(other.n).toBe(48);
  });

  it('two builds at a 0 % win rate tie: no tie-break on duel length (#63)', async () => {
    const o = objFor(['opp-a'], 'attacker');
    const weak = { ...mine, stats: { ...mine.stats, totalAttack: 1 } };
    const glass = { ...weak, stats: { ...weak.stats, totalHp: Math.max(1, Math.round(mine.stats.totalHp / 4)) } };
    const a = await o.measure(weak, { n: 12, seed: 2 });
    const b = await o.measure(glass, { n: 12, seed: 2 });
    expect([a.value, b.value]).toEqual([0, 0]);
    expect(b.extra.meanMs).not.toBe(a.extra.meanMs); // they lose at different speeds...
    expect([b.score, b.tie]).toEqual([a.score, a.tie]); // ...and still rank equal, so the baseline stays first
  });

  it('the contrast is stratified by matchup and estimates carry per-matchup intervals', async () => {
    const o = objFor(['opp-a'], 'both');
    const strong = { ...mine, stats: { ...mine.stats, totalAttack: mine.stats.totalAttack * 4 } };
    const a = await o.measure(strong, { n: 32, seed: 2 });
    const b = await o.measure(mine, { n: 32, seed: 2 });
    const c = contrastSets(o, a.samples, b.samples);
    expect(c.method).toBe('stratified-tango');
    expect(c.delta).toBeCloseTo(a.value - b.value, 12);
    const e = o.estimate(a.samples);
    expect(e.value.n).toBe(64);
    expect(e.aux.matchups.map((m) => [m.seat, m.value.n])).toEqual([['attacker', 32], ['defender', 32]]);
  });

  it('the defender seat is the complement of the engine attacker rate (ties go to the defender)', async () => {
    const att = await objFor(['opp-a'], 'attacker').measure(mine, { n: 30, seed: 4, keepSamples: true });
    const def = await objFor(['opp-a'], 'defender').measure(mine, { n: 30, seed: 4, keepSamples: true });
    expect(att.n).toBe(30);
    expect(def.n).toBe(30);
    expect(def.extra.matchups[0].seat).toBe('defender');
    const theirs = opponentFighter(c.opponents[0]);
    const direct = pvpWinRate(theirs, mine, { n: 30, seed: hashSeed(4, 'opp-a', 'defender'), cache: false });
    expect(def.value).toBeCloseTo(1 - direct.p, 12);
    expect(def.lo).toBeCloseTo(1 - wilsonInterval(Math.round(direct.p * 30), 30).hi, 12);
    expect(def.hi).toBeCloseTo(1 - wilsonInterval(Math.round(direct.p * 30), 30).lo, 12);
    const directAtt = pvpWinRate(mine, theirs, { n: 30, seed: hashSeed(4, 'opp-a', 'attacker'), cache: false });
    expect(att.value).toBeCloseTo(directAtt.p, 12);
  });

  it('an aborted signal returns aborted without a number', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const m = await objFor(['opp-a'], 'attacker').measure(mine, { n: 20, seed: 1, signal: ctl.signal });
    expect(m.aborted).toBe(true);
    expect(m.value).toBeNull();
  });

  it('refuses a preset that has no HP or Attack', async () => {
    const o = objFor(['opp-a'], 'attacker');
    await expect(o.measure({ ...mine, stats: {} }, { n: 4, seed: 1 })).rejects.toThrow(/no HP/);
  });
});

describe('the optimiser with the pvp objective', () => {
  const c = withOpponents();
  const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
  const TINY = { level: 'quick', n0: 8, maxN: 16, randomStarts: 0 };

  it('measures every row per matchup with a Wilson interval, through the worker task', async () => {
    const r = await runTask('optimize', { character: c, presetId: 'p1', target: pvp(['opp-b'], 'both'), objective: OBJ, space: only('pet'), effort: TINY, seed: 3 });
    expect(r.status).toBe('done');
    expect(r.objective).toMatchObject({ kind: 'pvp-winrate', unit: 'p', higherIsBetter: true });
    expect(r.target).toMatchObject({ kind: 'pvp', opponentIds: ['opp-b'], seats: 'both', fidelity: 'server-model' });
    expect(r.target.assumptions.map((a) => a.tag)).toEqual(['SERVER']);
    for (const row of [r.baseline, ...r.rows]) {
      expect(row.aux.matchups.map((m) => m.seat)).toEqual(['attacker', 'defender']);
      expect(row.value.n).toBe(row.aux.matchups[0].value.n * 2);
      expect(row.value.method).toBe('wilson');
    }
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('fails clearly with no opponent', async () => {
    const none = fixtureCharacter('WARRIOR');
    await expect(runTask('optimize', { character: none, presetId: 'p1', target: pvp(['opp-b']), objective: OBJ })).rejects.toThrow(/saved opponent/);
  });
});
