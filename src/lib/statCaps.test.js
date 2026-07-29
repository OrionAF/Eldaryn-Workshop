import { describe, it, expect } from 'vitest';
import { softCapValue, applySoftCaps, clampToHardCaps, marginalGain } from './statCaps.js';
import { offensiveStats } from './dps.js';

describe('softCapValue', () => {
  it('leaves values at or below the soft cap untouched', () => {
    expect(softCapValue(0, 50, 90)).toBe(0);
    expect(softCapValue(49.9, 50, 90)).toBe(49.9);
    expect(softCapValue(50, 50, 90)).toBe(50);
  });

  it('approaches but never reaches the hard cap', () => {
    expect(softCapValue(1e9, 50, 90)).toBeLessThan(90);
    expect(softCapValue(1e9, 50, 90)).toBeGreaterThan(89.9);
    // Strictly increasing past the soft cap: overcapping always helps.
    expect(softCapValue(80, 50, 90)).toBeGreaterThan(softCapValue(70, 50, 90));
  });

  /**
   * The Jul 2026 "gentler overcap" patch notes' own worked examples
   * (Block Chance, soft 40 / hard 80), displayed to one decimal.
   */
  const OBSERVED = [
    // [stat, soft, hard, raw, displayed effective, display precision]
    ['Block Chance at raw = hard cap', 40, 80, 80, 62.2, 0.05],
    ['Block Chance two ranges over', 40, 80, 120, 70.0, 0.05],
  ];

  it.each(OBSERVED)('reproduces the patch-note example: %s', (_name, soft, hard, raw, observed, tol) => {
    expect(Math.abs(softCapValue(raw, soft, hard) - observed)).toBeLessThanOrEqual(tol);
  });

  it('keeps exactly 5/9 of the soft-to-hard range at raw = hard cap', () => {
    expect(softCapValue(90, 50, 90)).toBeCloseTo(50 + (40 * 5) / 9, 10);
  });

  it('strictly dominates the old hyperbola S + K*over/(over+K) - the patch is a pure buff', () => {
    const oldCurve = (raw, soft, hard) => soft + ((hard - soft) * (raw - soft)) / (raw - soft + (hard - soft));
    for (const raw of [50.1, 60, 90, 150, 400]) {
      expect(softCapValue(raw, 50, 90)).toBeGreaterThan(oldCurve(raw, 50, 90));
    }
  });
});

describe('applySoftCaps', () => {
  it('curves only overcapped fields and never mutates its input', () => {
    const raw = offensiveStats({ crit: 110, lifesteal: 20, attack_pct: 500 });
    const eff = applySoftCaps(raw);
    expect(eff.crit).toBeCloseTo(50 + 40 * (1 - (80 / 140) ** 2)); // ~76.94
    expect(eff.lifesteal).toBe(20); // below its 40 soft cap
    expect(eff.attack_pct).toBe(500); // uncapped stat scales freely
    expect(raw.crit).toBe(110);
  });

  it('is applied to the raw total including a stat base (Crit Damage base 150)', () => {
    // soft 300, hard 700: over = 176, effective = 300 + 400*(1 - (800/976)^2)
    const eff = applySoftCaps(offensiveStats({ crit_mult: 476 }));
    expect(eff.crit_mult).toBeCloseTo(431.3, 1);
  });
});

describe('clampToHardCaps', () => {
  it('clamps only past the hard cap - effective values between soft and hard pass through', () => {
    const stats = offensiveStats({ crit: 62.8, paralyze_chance: 99 });
    const clamped = clampToHardCaps(stats);
    expect(clamped.crit).toBe(62.8); // over soft (50) but a legit effective value
    expect(clamped.paralyze_chance).toBe(18); // impossible - over the hard cap
    expect(stats.paralyze_chance).toBe(99); // never mutates
  });
});

// --- marginalGain: the game's "N% GAIN" figure ---

it('marginalGain is 1 below the soft cap - a point there is worth a full point', () => {
  expect(marginalGain(0, 40, 80)).toBe(1);
  expect(marginalGain(39.9, 40, 80)).toBe(1);
  expect(marginalGain(40, 40, 80)).toBe(1);
});

it('marginalGain reproduces the stat sheet: Block raw 56.4 -> 57% GAIN', () => {
  // The same observation that confirmed the curve itself (combat-model.md §2).
  // Matching the SLOPE is the stronger of the two checks.
  expect(softCapValue(56.4, 40, 80)).toBeCloseTo(52.452, 2);
  expect(marginalGain(56.4, 40, 80) * 100).toBeCloseTo(57.15, 1);
});

it('marginalGain IS the derivative of softCapValue, so the two cannot drift apart', () => {
  const h = 1e-6;
  for (const raw of [41, 50, 65, 120, 400]) {
    const numeric = (softCapValue(raw + h, 40, 80) - softCapValue(raw - h, 40, 80)) / (2 * h);
    expect(marginalGain(raw, 40, 80)).toBeCloseTo(numeric, 6);
  }
});

it('marginalGain decays monotonically toward zero and never goes negative', () => {
  const points = [45, 60, 100, 200, 1000].map((r) => marginalGain(r, 40, 80));
  for (let i = 1; i < points.length; i++) expect(points[i]).toBeLessThan(points[i - 1]);
  expect(points[points.length - 1]).toBeGreaterThan(0);
  expect(points[points.length - 1]).toBeLessThan(0.01);
});
