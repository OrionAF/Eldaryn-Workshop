// The tie look (simulation.md §Sequential comparator, the tie look): rateTieN, the schedule it adds to,
// and a race of never-winning arms that resolves there.
import { describe, it, expect } from 'vitest';
import { rateTieN, makeObjective, resolveTarget } from './objectives.js';
import { looksFor, tieLook, compareSets, contrastSets, setOf, TIE_LOOK_SLACK } from './sampler.js';
import { race } from './race.js';
import { lookSchedule } from '../engine/stats/index.js';
import { stableStringify } from '../engine/metrics.js';
import { optimize, prepare } from './search.js';
import { BLOCKS } from './space.js';
import { normaliseCharacter } from '../model/index.js';
import { gameProfileToCharacter } from '../model/gameProfile.js';
import w73 from '../__fixtures__/real/profile-warrior-l73.json';

const winChance = makeObjective({ kind: 'win-chance' }, resolveTarget({ kind: 'chapter', chapter: 1, level: 1 }));
const winRate = makeObjective({ kind: 'win-rate', target: 0.95 }, resolveTarget({ kind: 'chapter', chapter: 1, level: 1 }));
const dps = makeObjective({ kind: 'dps' }, resolveTarget({ kind: 'dummy' }));

// a one-lane set of n fights, each `v` (a loss below 1, a win at 1 or more)
const flat = (n, v) => setOf([new Array(n).fill(v)]);

describe('rateTieN', () => {
  for (const [alpha, delta] of [[0.05 / 234 / 12, 0.02], [0.05 / 12, 0.02], [0.05 / 40 / 13, 0.01], [0.05 / 9, 0.005]]) {
    it(`matches the comparator at alpha ${alpha.toExponential(2)}, delta ${delta}`, () => {
      const n = rateTieN({ alpha, delta });
      expect(Number.isFinite(n)).toBe(true);
      for (const v of [0.5, 1.5]) {
        // zero discordant pairs, both rates 0 (or both 1): tied on the rate at n*, open at n* - 1
        const at = (m) => contrastSets(winChance, flat(m, v), flat(m, v), { alpha, delta, deltaKind: 'absolute' });
        expect(at(n).verdict).toBe('equivalent');
        expect(at(n - 1).verdict).toBe('unresolved');
      }
      // the ln(8 / alpha) / delta approximation, within a few percent
      expect(n / (Math.log(8 / alpha) / delta)).toBeGreaterThan(0.9);
      expect(n / (Math.log(8 / alpha) / delta)).toBeLessThan(1.1);
    });
  }

  it('is the objective method with its own tau', () => {
    const alpha = 0.05 / 12;
    expect(winChance.rateTieN({ alpha, delta: 0.02 })).toBe(rateTieN({ alpha, delta: 0.02 }));
    expect(winRate.rateTieN({ alpha, delta: 0.02 })).toBe(rateTieN({ alpha, delta: 0.02, tau: 0.95 }));
    expect(dps.rateTieN).toBeUndefined();
  });

  it('is Infinity without a zone', () => {
    expect(rateTieN({ alpha: 0.01, delta: 0 })).toBe(Infinity);
  });
});

describe('looksFor', () => {
  it('adds the tie look between two doubling looks, at alpha / (looks + 1)', () => {
    const o = { n0: 8, maxN: 8192, alpha: 0.05 / 234, delta: 0.02, deltaKind: 'absolute' };
    const base = lookSchedule(8, 8192);
    const t = tieLook(winChance, o);
    expect(t).toBe(rateTieN({ alpha: o.alpha / (base.length + 1), delta: 0.02 }));
    expect(t).toBeGreaterThan(512);
    expect(t).toBeLessThan(1024 / (1 + TIE_LOOK_SLACK));
    expect(looksFor(winChance, o)).toEqual([...base.filter((n) => n < t), t, ...base.filter((n) => n > t)]);
  });

  it('adds nothing when a doubling look sits within the slack above n*', () => {
    // looks 8 .. 512 then maxN (8 looks): put maxN 5 % above the n* of a 9-look schedule
    const o = { n0: 8, alpha: 0.05 / 234, delta: 0.02, deltaKind: 'absolute' };
    const t = rateTieN({ alpha: o.alpha / 9, delta: 0.02 });
    expect(t).toBeGreaterThan(512);
    const maxN = Math.ceil(t * 1.05);
    expect(lookSchedule(8, maxN)).toHaveLength(8);
    expect(tieLook(winChance, { ...o, maxN })).toBeNull();
    // 20 % above: outside the slack, so the look is added
    expect(tieLook(winChance, { ...o, maxN: Math.ceil(t * 1.2) })).toBe(t);
  });

  it('adds nothing outside (n0, maxN), for other objectives or a relative zone', () => {
    const o = { n0: 8, maxN: 8192, alpha: 0.05 / 234, delta: 0.02, deltaKind: 'absolute' };
    expect(looksFor(winChance, { ...o, maxN: 256 })).toEqual(lookSchedule(8, 256));
    expect(looksFor(winChance, { ...o, n0: 2048 })).toEqual(lookSchedule(2048, 8192));
    expect(looksFor(dps, { ...o, deltaKind: 'relative' })).toEqual(lookSchedule(8, 8192));
    expect(looksFor(winChance, { ...o, deltaKind: 'relative' })).toEqual(lookSchedule(8, 8192));
    expect(looksFor(winChance, { ...o, delta: 0 })).toEqual(lookSchedule(8, 8192));
  });

  it('compareSets stops two never-winning builds at the tie look', async () => {
    const o = { n0: 8, maxN: 8192, alpha: 0.05, delta: 0.02, deltaKind: 'absolute' };
    const t = tieLook(winChance, o);
    expect(t).not.toBeNull();
    // X gets 10 points further every fight: the margin decides once the rate ties
    const c = await compareSets(winChance, (n) => flat(n, 0.6), (n) => flat(n, 0.5), o);
    expect(c.n).toBe(t);
    expect(c.verdict).toBe('better');
    expect(c.basis).toBe('margin');
  });
});

describe('resume', () => {
  it('a checkpoint from before the tie look stops replaying at its first tie-bearing step', async () => {
    const character = normaliseCharacter(gameProfileToCharacter(w73));
    // no build wins chapter 10-7 (about 37 % of the step's HP); mounts only, maxN 1024 keeps it small
    const req = {
      character, presetId: character.activePresetId, target: { kind: 'chapter', chapter: 10, level: 7 },
      objective: { kind: 'win-chance' }, space: Object.fromEntries(BLOCKS.map((b) => [b, b === 'mount'])), seed: 1,
    };
    const fresh = await optimize({ ...req, effort: { level: 'quick', maxN: 1024 } });
    let old = null;
    const before = await optimize({ ...req, effort: { level: 'quick', maxN: 1024, tieLook: false } }, { onCheckpoint: (c) => { old = c; } });
    expect(old).not.toBeNull();
    // the tie look matters here: the run without it drew more fights
    expect(before.search.fights.total).toBeGreaterThan(fresh.search.fights.total);
    // the same request apart from the schedule: pretend the checkpoint was written before the tie look existed
    const cp = { ...old, requestKey: prepare({ ...req, effort: { level: 'quick', maxN: 1024 } }).requestKey };
    const resumed = await optimize({ ...req, effort: { level: 'quick', maxN: 1024 }, resumeFrom: cp });
    expect(resumed.warnings.map((w) => w.code)).not.toContain('checkpoint-ignored');
    const timeless = (r) => stableStringify({ ...r, stats: { ...r.stats, ms: 0, workers: 0 }, phases: r.phases.map((p) => ({ ...p, ms: 0 })), checkpoint: null });
    expect(timeless(resumed)).toBe(timeless(fresh));
  }, 120000);
});

describe('race', () => {
  it('resolves never-winning arms with different progress at the tie look, not the next doubling', async () => {
    const effort = { n0: 8, maxN: 8192, alpha: 0.05, delta: 0.02, deltaKind: 'absolute' };
    // 234 arms as in the real run: progress 0.40 .. 0.633, every fight a loss; noise keeps the margin finite
    const arms = Array.from({ length: 234 }, (_, i) => ({ key: `a${i}`, dist: i, p: 0.4 + i * 0.001 }));
    const noise = (i) => ((i * 2654435761) % 1000) / 1e4;
    const getSet = async (a, n) => setOf([Array.from({ length: n }, (_, i) => Math.min(0.99, a.p + noise(i)))]);
    const t = tieLook(winChance, { ...effort, alpha: effort.alpha / arms.length });
    expect(t).toBeGreaterThan(512);
    expect(t).toBeLessThan(1024);
    const r = await race(arms, { objective: winChance, getSet, effort, seed: 1 });
    expect(r.n).toBe(t);
    expect(r.unresolved).toEqual([]);
    expect(r.leader).toBe(233);
    // the arms far behind on progress left as worse at the tie look
    expect(r.eliminated.length).toBeGreaterThan(200);
    expect(r.eliminated.every((e) => e.contrast.n === t)).toBe(true);
  });
});
