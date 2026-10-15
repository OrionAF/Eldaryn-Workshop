import { describe, it, expect } from 'vitest';
import { createSampler, compareSets, contrastSets, setOf, sliceSet, isAbort } from './sampler.js';
import { resolveTarget, makeObjective } from './objectives.js';

const stats = (o = {}) => ({
  totalHp: 10000, totalAttack: 1000, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 20,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0,
  totalPvpAttack: 0, totalPvpDefense: 0, ...o,
});
const fighter = (o = {}) => ({ stats: stats(o), class: 'WARRIOR', spec: null, sigils: [] });
const dps = () => makeObjective({ kind: 'dps' }, resolveTarget({ kind: 'dummy', seconds: 10 }));
const S1 = { id: 'search', seed: 11 };

describe('sample sets', () => {
  it('setOf checks lane lengths; sliceSet copies a prefix', () => {
    const s = setOf([[1, 2, 3], [4, 5, 6]], { ms: [[7, 8, 9], [1, 1, 1]] });
    expect(s.n).toBe(3);
    expect(sliceSet(s, 2)).toEqual({ main: [[1, 2], [4, 5]], side: { ms: [[7, 8], [1, 1]] }, n: 2 });
    expect(() => setOf([[1], [1, 2]])).toThrow(/differ/);
    expect(() => sliceSet(s, 4)).toThrow(/holds 3/);
  });
});

describe('createSampler (keyed by engine key and stage, never by N: #76)', () => {
  it('raising N extends the stored prefix instead of restarting', async () => {
    const o = dps();
    const sm = createSampler(o);
    const f = fighter();
    const a = await sm.get('k1', S1, f, 8);
    expect(sm.stats().fights).toBe(8);
    const b = await sm.get('k1', S1, f, 32);
    expect(sm.stats().fights).toBe(32);
    expect(b.main[0].slice(0, 8)).toEqual(a.main[0]);
    // the extension is the same vector a one-shot draw of 32 fights gives
    expect(b.main[0]).toEqual(o.sample(f, { seed: S1.seed, from: 0, to: 32 }).main[0]);
    const again = await sm.get('k1', S1, f, 16);
    expect(again.n).toBe(16);
    expect(sm.stats()).toMatchObject({ fights: 32, hits: 1 });
  });

  it('builds with the same engine key share one vector; another stage seed does not', async () => {
    const sm = createSampler(dps());
    await sm.get('same', S1, fighter(), 8);
    await sm.get('same', S1, fighter(), 8);
    expect(sm.stats().fights).toBe(8);
    await sm.get('same', { id: 'confirm', seed: 99 }, fighter(), 8);
    expect(sm.stats().fights).toBe(16);
    expect(sm.held('same', S1)).toBe(8);
    expect(sm.held('other', S1)).toBe(0);
  });

  it('concurrent requests for one entry simulate each fight once', async () => {
    const sm = createSampler(dps());
    const [x, y] = await Promise.all([sm.get('k', S1, fighter(), 8), sm.get('k', S1, fighter(), 16)]);
    expect(sm.stats().fights).toBe(16);
    expect(y.main[0].slice(0, 8)).toEqual(x.main[0]);
  });

  it('an aborted signal rejects with AbortError and keeps nothing half-drawn', async () => {
    const sm = createSampler(dps());
    const ctl = new AbortController();
    ctl.abort();
    const err = await sm.get('k', S1, fighter(), 8, { signal: ctl.signal }).catch((e) => e);
    expect(isAbort(err)).toBe(true);
    expect(sm.held('k', S1)).toBe(0);
    expect((await sm.get('k', S1, fighter(), 4)).n).toBe(4);
  });
});

describe('comparisons over the store', () => {
  it('compareSets: a clearly stronger build resolves better at the first look', async () => {
    const o = dps();
    const sm = createSampler(o);
    const strong = fighter({ totalAttack: 2000 });
    const weak = fighter();
    const c = await compareSets(o, (n) => sm.get('strong', S1, strong, n), (n) => sm.get('weak', S1, weak, n),
      { delta: 0.01, n0: 8, maxN: 32, seed: 1 });
    expect(c).toMatchObject({ verdict: 'better', significant: true, looks: 1, n: 8, method: 'paired-t' });
    expect(c.pct).toBeGreaterThan(0.9);
  });

  it('compareSets: one engine key against itself is equivalent within any positive zone', async () => {
    const o = dps();
    const sm = createSampler(o);
    const f = fighter();
    const c = await compareSets(o, (n) => sm.get('a', S1, f, n), (n) => sm.get('a', S1, f, n), { delta: 0.01, n0: 8, maxN: 32 });
    expect(c.verdict).toBe('equivalent');
  });

  it('contrastSets at fixed n: unresolved carries a power hint', () => {
    const o = makeObjective({ kind: 'survival', seconds: 20 }, resolveTarget({ kind: 'custom', mob: { hp: 1e6, attack: 1, attackSpeed: 1 } }));
    const x = setOf([[1, 0, 1, 1, 0, 1, 1, 1]]);
    const y = setOf([[1, 1, 0, 1, 0, 1, 1, 0]]);
    const c = contrastSets(o, x, y);
    expect(c.verdict).toBe('unresolved');
    expect(c.method).toBe('tango');
    expect(c.nNeeded).toBeGreaterThan(8);
  });
});
