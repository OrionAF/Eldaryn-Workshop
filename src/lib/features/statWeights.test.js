import { describe, it, expect } from 'vitest';
import {
  STAT_WEIGHT_STEPS, stepsFor, probeStats, statWeightsRequest, chartBars, runStatWeights, calibrateAttack,
  referenceEnemy, metricsSampler,
} from './statWeights.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { capConfig, applySoftCap } from '../engine/core/caps.js';
import { dpsVsDummy, survival } from '../engine/metrics.js';
import { KERNELS } from '../tasks/kernels.js';

const stats = (o = {}) => ({
  totalHp: 10000, totalAttack: 1000, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 10,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0,
  totalPvpAttack: 0, totalPvpDefense: 0, ...o,
});
const fighter = (o = {}) => ({ stats: stats(o), class: 'WARRIOR', spec: null, sigils: [] });

describe('step table', () => {
  it('keeps the v1 step sizes in one table and filters by class', () => {
    const by = Object.fromEntries(STAT_WEIGHT_STEPS.map((s) => [s.key, s.step]));
    expect(by).toMatchObject({ totalAttack: 100, totalAttackPercent: 1, totalCritChance: 1, totalCritDamage: 0.1, totalAttackSpeed: 0.1, totalHp: 1000 });
    expect(stepsFor('NECROMANCER').some((s) => s.key === 'totalCritChance')).toBe(false);
    expect(stepsFor('NECROMANCER').some((s) => s.key === 'totalMinionAttack')).toBe(true);
    expect(stepsFor('WARRIOR').some((s) => s.key === 'totalMinionAttack')).toBe(false);
  });
});

describe('probes apply the cap once', () => {
  it('a step past the soft cap is curved from the raw total, and a stat at the hard cap does not move', () => {
    const cfg = capConfig('totalCritChance');
    const raw = cfg.soft + 20;
    const eff = Number(applySoftCap(raw, cfg).toFixed(1));
    const s = probeStats(stats({ totalCritChance: eff, rawCritChance: raw }), { key: 'totalCritChance', step: 1 });
    expect(s.totalCritChance).toBe(Number(applySoftCap(raw + 1, cfg).toFixed(1)));
    expect(s.totalCritChance - eff).toBeGreaterThan(0);
    expect(s.totalCritChance - eff).toBeLessThan(0.9); // never the linear +1 of a step added after the cap
    const capped = probeStats(stats({ totalCritChance: cfg.hard }), { key: 'totalCritChance', step: 1 });
    expect(capped.totalCritChance).toBe(cfg.hard);
  });

  it('a capped stat measures about 0: its probe is the base fight, so no measurable effect and no rank', async () => {
    const cfg = capConfig('totalCritChance');
    const base = fighter({ totalCritChance: cfg.hard });
    const probe = { key: 'totalCritChance', label: 'Crit', unit: '+1%', chart: 'damage', fighter: { ...base, stats: probeStats(base.stats, { key: 'totalCritChance', step: 1 }) } };
    const atk = { key: 'totalAttack', label: 'Attack', unit: '+100', chart: 'damage', fighter: { ...base, stats: probeStats(base.stats, { key: 'totalAttack', step: 100 }) } };
    const r = await runStatWeights({ base, probes: [probe, atk], nDps: 16, seconds: 5, seed: 3 });
    const crit = r.damage.bars.find((b) => b.key === 'totalCritChance');
    expect(crit.delta).toBe(0);
    expect(crit.measurable).toBe(false);
    expect(crit.rank).toBeNull();
    expect(r.damage.bars[0]).toMatchObject({ key: 'totalAttack', rank: 1, measurable: true });
  });

  it('the request builds every probe from the preset Fighter with one stat changed', () => {
    const ch = fixtureCharacter('WARRIOR');
    const req = statWeightsRequest(ch, ch.presets[0].id, { precision: 'quick' });
    expect(req).toMatchObject({ mode: 'statWeights', nDps: 128, nSurvival: 512, seed: 1 });
    const atk = req.probes.find((p) => p.key === 'totalAttack');
    expect(atk.fighter.stats.totalAttack).toBeGreaterThan(req.base.stats.totalAttack);
    expect(atk.fighter.stats.totalCritChance).toBe(req.base.stats.totalCritChance);
    expect(atk.fighter.class).toBe(req.base.class);
  });
});

describe('common random numbers', () => {
  it('base and every probe draw the same seed and fight indices; calibration uses its own seed', async () => {
    const calls = [];
    const sample = async (metric, f, enemy, from, to, { seed }) => {
      calls.push({ metric, seed, from, to, attack: enemy?.attack ?? null });
      return metricsSampler(metric, f, enemy, from, to, { seed, seconds: 5, survivalSeconds: 5 });
    };
    const base = fighter();
    const mk = (key, step, chart) => ({ key, label: key, unit: '', chart, fighter: { ...base, stats: probeStats(base.stats, { key, step }) } });
    const r = await runStatWeights(
      { base, probes: [mk('totalAttack', 100, 'damage'), mk('totalHp', 1000, 'survival')], nDps: 8, nSurvival: 32, seed: 7, seconds: 5, survivalSeconds: 5 },
      { sample },
    );
    const measured = calls.filter((c) => c.metric === 'dps' || c.attack === r.calibration.attack && c.to === 32);
    expect(measured.length).toBe(4);
    for (const c of measured) expect(c).toMatchObject({ seed: 7, from: 0 });
    const cal = calls.filter((c) => c.metric === 'survival' && c.to !== 32);
    expect(cal.length).toBeGreaterThan(0);
    for (const c of cal) expect(c.seed).not.toBe(7);
  });

  it('the pool kernel draws fight i exactly as engine/metrics.js does', () => {
    const f = fighter();
    const enemy = referenceEnemy(400);
    const ctx = KERNELS.statWeights.prepare({ seconds: 5, survivalSeconds: 5 });
    expect(KERNELS.statWeights.run(ctx, { metric: 'dps', fighter: f, seed: 2 }, 3, 7).main[0])
      .toEqual(dpsVsDummy(f, { n: 7, seed: 2, seconds: 5, keepSamples: true, cache: false }).samples.slice(3));
    expect(KERNELS.statWeights.run(ctx, { metric: 'survival', fighter: f, enemy, seed: 2 }, 0, 20).main[0])
      .toEqual(survival(f, enemy, { n: 20, seed: 2, seconds: 5, keepSamples: true, cache: false }).samples);
  });
});

describe('chartBars', () => {
  const base = [10, 12, 11, 9, 10, 13, 12, 11];
  const shift = (d) => base.map((x) => x + d);
  const noisy = base.map((x, i) => x + (i % 2 ? 0.5 : -0.5));

  it('orders measurable bars largest first, ranks them, and never ranks an interval that spans 0', () => {
    const bars = chartBars('damage', base, [
      { key: 'a', label: 'A', samples: shift(1) },
      { key: 'noise', label: 'N', samples: noisy },
      { key: 'b', label: 'B', samples: shift(3) },
      { key: 'c', label: 'C', samples: shift(-2) },
    ]);
    expect(bars.map((b) => b.key)).toEqual(['b', 'a', 'c', 'noise']);
    expect(bars.map((b) => b.rank)).toEqual([1, 2, 3, null]);
    const n = bars.find((b) => b.key === 'noise');
    expect(n.lo).toBeLessThan(0);
    expect(n.hi).toBeGreaterThan(0);
    expect(n.measurable).toBe(false);
    expect(bars[0].pct).toBeCloseTo((3 / 11) * 100, 6);
  });

  it('splits the family level over the chart (Bonferroni) and uses the paired proportion for survival', () => {
    const b = [1, 0, 1, 0, 1, 0, 1, 0];
    const bars = chartBars('survival', b, [{ key: 'x', samples: [1, 1, 1, 0, 1, 0, 1, 0] }, { key: 'y', samples: b }]);
    expect(bars[0].alpha).toBeCloseTo(0.025, 12);
    expect(bars[0].method).toBe('tango');
    expect(bars.every((x) => x.rank === null)).toBe(true);
  });
});

describe('reference enemy calibration', () => {
  it('lands the base build inside the band, deterministically', async () => {
    const f = fighter({ totalBlockChance: 30 }); // a block roll per swing makes survival a chance, not a step
    const survive = async (attack, seed, n) => survival(f, referenceEnemy(attack), { n, seed, seconds: 10, keepSamples: true, cache: false }).samples;
    const a = await calibrateAttack(f, survive, { seed: 1 });
    const b = await calibrateAttack(f, survive, { seed: 1 });
    expect(a).toEqual(b);
    expect(a.inBand).toBe(true);
    expect(a.p).toBeGreaterThanOrEqual(0.35);
    expect(a.p).toBeLessThanOrEqual(0.65);
  });

  it('a build whose survival jumps from always to never is reported out of band, with the try closest to one half', async () => {
    const f = fighter(); // no avoidance or crit on either side: every fight is the same
    const survive = async (attack, seed, n) => survival(f, referenceEnemy(attack), { n, seed, seconds: 10, keepSamples: true, cache: false }).samples;
    const a = await calibrateAttack(f, survive, { seed: 1 });
    expect(a.inBand).toBe(false);
    expect([0, 1]).toContain(a.p);
    expect(Number.isFinite(a.attack)).toBe(true);
  });
});
