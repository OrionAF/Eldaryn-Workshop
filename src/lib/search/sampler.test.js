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
  it('appends a very long chunk without overflowing the call stack', async () => {
    const N = 400000;
    const sm = createSampler({ sample: (f, { from, to }) => ({ main: [new Array(to - from).fill(1)], side: { ms: [new Array(to - from).fill(2)] } }) });
    const set = await sm.get('k', S1, fighter(), N);
    expect(set.n).toBe(N);
    expect(set.side.ms[0]).toHaveLength(N);
  });
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

  describe('futility (A5): a challenger that cannot beat the incumbent by δ stops early', () => {
    // synthetic paired sets: y_i = 1000 + noise, x_i = y_i + shift + small noise (δ = 0.5 % of 1000 = 5)
    const meanObj = (higherIsBetter) => ({
      higherIsBetter, deltaKind: 'relative',
      contrast: (x, y, { alpha }) => {
        const d = x.main[0].map((v, i) => v - y.main[0][i]);
        const m = d.reduce((a, b) => a + b, 0) / d.length;
        const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (d.length - 1));
        const w = (alpha < 0.01 ? 3.5 : 2.5) * sd / Math.sqrt(d.length);
        return { delta: m, lo: m - w, hi: m + w, sd, method: 'paired-t', ref: 1000 };
      },
    });
    const wave = (i) => Math.sin(i * 12.9898) * 20;
    const sets = (shift) => ({
      getX: (n) => setOf([Array.from({ length: n }, (_, i) => 1000 + wave(i) + shift + Math.cos(i * 7.1) * 20)]),
      getY: (n) => setOf([Array.from({ length: n }, (_, i) => 1000 + wave(i))]),
    });
    const o = { delta: 0.005, n0: 8, maxN: 4096, alpha: 0.05 };

    it('higher is better: X 2 below Y resolves futile, long before the old rule resolves it', async () => {
      const { getX, getY } = sets(-2);
      const f = await compareSets(meanObj(true), getX, getY, { ...o, futility: true });
      const old = await compareSets(meanObj(true), getX, getY, o);
      expect(f.verdict).toBe('futile');
      expect(f).toMatchObject({ futile: true, significant: false, nNeeded: null });
      expect(f.hi).toBeLessThan(f.zone);
      expect(old.verdict).not.toBe('futile');
      expect(f.n).toBeLessThan(old.n);
    });

    it('lower is better: X 2 above Y (slower) resolves futile; a clearly better X still resolves better', async () => {
      const slow = sets(2);
      expect((await compareSets(meanObj(false), slow.getX, slow.getY, { ...o, futility: true })).verdict).toBe('futile');
      const fast = sets(-30);
      expect((await compareSets(meanObj(false), fast.getX, fast.getY, { ...o, futility: true })).verdict).toBe('better');
    });
  });
});
