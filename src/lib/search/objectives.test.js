import { describe, it, expect } from 'vitest';
import {
  resolveTarget, makeObjective, objectiveKindsFor, closedFormDps, ehpProxy, SCREEN_SPELL_WEIGHT,
  OBJECTIVE_KINDS, TARGET_KINDS,
} from './objectives.js';
import { buildFighter } from '../build/fighter.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { pairedDelta } from '../engine/metrics.js';

const stats = (o = {}) => ({
  totalHp: 10000, totalAttack: 1000, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0,
  totalPvpAttack: 0, totalPvpDefense: 0, ...o,
});
const fighter = (o = {}) => ({ stats: stats(o), class: 'WARRIOR', spec: null, sigils: [] });

describe('resolveTarget', () => {
  it('resolves every kind to an enemy, a label and a stable key', () => {
    const specs = [
      { kind: 'dummy' },
      { kind: 'chapter', chapter: 1, level: 1 },
      { kind: 'chapter', chapter: 12, level: 3 },
      { kind: 'dungeon', id: 'dungeon_1', step: 2 },
      { kind: 'oblivion', floor: 10 },
      { kind: 'worldBoss', affinity: 'ENRAGED' },
      { kind: 'custom', mob: { hp: 5e5, attack: 800, attackSpeed: 1 } },
    ];
    expect(specs.map((s) => s.kind).sort()).toEqual([...TARGET_KINDS, 'chapter'].sort());
    for (const s of specs) {
      const t = resolveTarget(s);
      expect(t.enemy).toBeTruthy();
      expect(t.label.length).toBeGreaterThan(3);
      expect(t.key).toBe(resolveTarget(s).key);
      expect(JSON.parse(JSON.stringify(t.spec))).toEqual(t.spec);
    }
  });

  it('chapters and dungeon steps are three mobs fought in order; the campaign uses the live-loop rules', () => {
    const c = resolveTarget({ kind: 'chapter', chapter: 2, level: 4 });
    expect(c.enemy).toHaveLength(3);
    expect(c.opts).toEqual({ opening: 'half', liveSpellResist: true });
    expect(c.label).toBe('Chapter 2, level 4');
    expect(resolveTarget({ kind: 'chapter', chapter: 12, level: 1 }).label).toBe('Hard chapter 12, level 1');
    expect(resolveTarget({ kind: 'dungeon', id: 'dungeon_1', step: 8 }).enemy).toHaveLength(3);
  });

  it('Oblivion forces the Oblivion realm and World Boss sets its own window', () => {
    expect(resolveTarget({ kind: 'oblivion', floor: 5 }).realm).toBe('oblivion');
    expect(resolveTarget({ kind: 'dummy' }).realm).toBeNull();
    const w = resolveTarget({ kind: 'worldBoss', affinity: 'ENRAGED' });
    expect([w.maxMs, w.seconds]).toEqual([300000, 300]);
    expect(resolveTarget({ kind: 'worldBoss' }).spec.affinity).toBe('NONE');
  });

  it('different targets get different keys; rejects what does not exist', () => {
    expect(resolveTarget({ kind: 'dummy', seconds: 30 }).key).not.toBe(resolveTarget({ kind: 'dummy' }).key);
    expect(() => resolveTarget({ kind: 'nope' })).toThrow(/unknown target/);
    expect(() => resolveTarget({ kind: 'chapter', chapter: 99, level: 1 })).toThrow(/does not exist/);
    expect(() => resolveTarget({ kind: 'dungeon', id: 'nope', step: 1 })).toThrow(/does not exist/);
    expect(() => resolveTarget({ kind: 'oblivion', floor: 0 })).toThrow(/does not exist/);
    expect(() => resolveTarget({ kind: 'worldBoss', affinity: 'X' })).toThrow(/affinity/);
    expect(() => resolveTarget({ kind: 'custom', mob: { hp: 0, attack: 1, attackSpeed: 1 } })).toThrow(/custom/);
  });
});

describe('objective / target compatibility', () => {
  it('lists the sensible objectives per target kind', () => {
    expect(objectiveKindsFor('dummy')).toEqual(['dps']);
    expect(objectiveKindsFor('chapter')).toEqual(['ttk-median', 'ttk-p90', 'survival']);
    expect(objectiveKindsFor('worldBoss')).toEqual(['dps', 'survival']);
    expect(objectiveKindsFor('custom')).toEqual(OBJECTIVE_KINDS);
    expect(objectiveKindsFor('bogus')).toEqual([]);
  });

  it('makeObjective throws on a pair that makes no sense', () => {
    expect(() => makeObjective({ kind: 'ttk-median' }, resolveTarget({ kind: 'dummy' }))).toThrow(/cannot score/);
    expect(() => makeObjective({ kind: 'dps' }, resolveTarget({ kind: 'chapter', chapter: 1, level: 1 }))).toThrow(/cannot score/);
    expect(() => makeObjective({ kind: 'nope' })).toThrow(/unknown objective/);
  });
});

describe('closed-form screens (combat-pve.md §7)', () => {
  it('expected auto-attack DPS: attack x (1 + c(m-1) + h) x swings per second', () => {
    // interval round(1000 / 1.25) = 800 ms -> 1.25 swings/s; crit 20 % x1.5 -> 1.1; double hit 10 % -> +0.1
    // 1000 * 1.2 * 1.25 = 1500
    const s = stats({ totalAttackSpeed: 1.25, totalCritChance: 20, totalCritDamage: 1.5, totalDoubleHit: 10 });
    expect(closedFormDps(s)).toBeCloseTo(1500, 6);
    expect(closedFormDps(s, { damageReduction: 50 })).toBeCloseTo(750, 6);
  });

  it('block and penetration: (1-b) R A (1+c(m-1)+h) + b p R A (1+c(m-1))', () => {
    const s = stats({ totalAttackSpeed: 1.25, totalCritChance: 20, totalCritDamage: 1.5, totalDoubleHit: 10 });
    // (0.5)(1000)(1.2) + (0.5)(0.2)(1000)(1.1) = 600 + 110 = 710 per swing, x 1.25 swings
    expect(closedFormDps(s, { blockChance: 50, penetration: 20 })).toBeCloseTo(887.5, 6);
  });

  it('the swing interval is rounded to whole ms, as the engine does', () => {
    // round(1000 / 3) = 333 ms -> 3.003 swings/s
    expect(closedFormDps(stats({ totalAttackSpeed: 3 }))).toBeCloseTo(1000 * (1000 / 333), 6);
    expect(closedFormDps(stats({ totalAttackSpeed: 0 }))).toBe(0);
  });

  it('spell damage and minion attack add the assumed screen weight', () => {
    const base = closedFormDps(stats());
    expect(closedFormDps(stats({ totalSpellDamage: 100 }))).toBeCloseTo(base * (1 + SCREEN_SPELL_WEIGHT), 6);
  });

  it('ehpProxy grows with HP, Damage Reduction, Block and Miss', () => {
    const base = ehpProxy(stats());
    expect(base).toBe(10000);
    expect(ehpProxy(stats({ totalDamageReduction: 50 }))).toBeCloseTo(20000, 6);
    expect(ehpProxy(stats({ totalBlockChance: 20, totalMissChance: 30 }))).toBeCloseTo(20000, 6);
  });
});

describe('measures', () => {
  const dummy = resolveTarget({ kind: 'dummy' });

  it('dps: deterministic for a seed, increasing in Attack, with an interval and CRN samples', () => {
    const o = makeObjective({ kind: 'dps' }, dummy);
    const weak = o.measure(fighter({ totalAttack: 1000 }), { n: 8, seed: 7, keepSamples: true });
    const strong = o.measure(fighter({ totalAttack: 2000 }), { n: 8, seed: 7, keepSamples: true });
    expect(o.measure(fighter({ totalAttack: 1000 }), { n: 8, seed: 7 }).value).toBe(weak.value);
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(weak.value).toBeCloseTo(1000, 0); // 1 swing/s, no crit
    expect(weak.lo).toBeLessThanOrEqual(weak.value);
    expect(weak.hi).toBeGreaterThanOrEqual(weak.value);
    expect(weak.scoreSamples).toHaveLength(8);
    const d = pairedDelta(weak.scoreSamples, strong.scoreSamples);
    expect(d.delta).toBeGreaterThan(900);
    expect(d.significant).toBe(true);
  });

  it('dps against a World Boss is damage per second over its window', () => {
    const o = makeObjective({ kind: 'dps' }, resolveTarget({ kind: 'worldBoss', affinity: 'NONE' }));
    const m = o.measure(fighter({ totalAttack: 1000 }), { n: 4, seed: 2 });
    // 60 s window, one 1000-damage swing a second, Block 0 on the NONE affinity -> about 1000 per second
    expect(m.value).toBeGreaterThan(800);
    expect(m.value).toBeLessThan(1100);
    expect(m.aborted).toBe(false);
  });

  it('dps against a finite-HP mob measures the window without the mob dying, so builds stay comparable', () => {
    // 30 000 HP would die in 30 s to the weak build and 10 s to the strong one; both used to score hp / 60 = 500.
    const target = resolveTarget({ kind: 'custom', mob: { hp: 30000, attack: 0, attackSpeed: 1 }, seconds: 60 });
    const o = makeObjective({ kind: 'dps' }, target);
    const weak = o.measure(fighter({ totalAttack: 1000 }), { n: 4, seed: 1 });
    const strong = o.measure(fighter({ totalAttack: 3000 }), { n: 4, seed: 1 });
    expect(weak.value).toBeCloseTo(1000, 0);
    expect(strong.value).toBeCloseTo(3000, 0);
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it('ttk: a stronger fighter is faster; a fighter that loses ranks below any winner and by win rate', () => {
    const target = resolveTarget({ kind: 'custom', mob: { hp: 20000, attack: 100, attackSpeed: 1 }, seconds: 120 });
    const o = makeObjective({ kind: 'ttk-median' }, target);
    const slow = o.measure(fighter({ totalAttack: 500 }), { n: 6, seed: 1, keepSamples: true });
    const fast = o.measure(fighter({ totalAttack: 2000 }), { n: 6, seed: 1, keepSamples: true });
    expect(fast.value).toBeLessThan(slow.value);
    expect(fast.score).toBeGreaterThan(slow.score);
    const dead = o.measure(fighter({ totalAttack: 500, totalHp: 50 }), { n: 6, seed: 1 });
    expect(dead.value).toBeNull();
    expect(dead.score).toBeLessThan(slow.score);
    expect(dead.extra.winRate).toBe(0);
    expect(fast.lo).toBeLessThanOrEqual(fast.value);
  });

  it('ttk-p90 needs 90 % wins before it reports a time', () => {
    const target = resolveTarget({ kind: 'custom', mob: { hp: 20000, attack: 100, attackSpeed: 1 }, seconds: 120 });
    const m = makeObjective({ kind: 'ttk-p90' }, target).measure(fighter({ totalAttack: 2000 }), { n: 6, seed: 1 });
    expect(m.value).toBeGreaterThan(0);
    expect(m.extra.winRate).toBe(1);
  });

  it('survival: p with a Wilson interval; the effective-HP proxy breaks ties between certain survivors', () => {
    const target = resolveTarget({ kind: 'custom', mob: { hp: 1e6, attack: 50, attackSpeed: 1 }, seconds: 20 });
    const o = makeObjective({ kind: 'survival', seconds: 20 }, target);
    const a = o.measure(fighter({ totalHp: 100000 }), { n: 8, seed: 1 });
    const b = o.measure(fighter({ totalHp: 200000 }), { n: 8, seed: 1 });
    expect([a.value, b.value]).toEqual([1, 1]);
    expect(b.tie).toBeGreaterThan(a.tie);
    const dies = o.measure(fighter({ totalHp: 100 }), { n: 8, seed: 1 });
    expect(dies.value).toBe(0);
    expect(dies.score).toBeLessThan(a.score);
    expect(a.hi).toBe(1);
  });

  it('an aborted signal returns an aborted measure', () => {
    const ctl = new AbortController();
    ctl.abort();
    const m = makeObjective({ kind: 'dps' }, dummy).measure(fighter(), { n: 8, seed: 1, signal: ctl.signal });
    expect(m.aborted).toBe(true);
  });

  it('Oblivion: the fighter\'s Oblivion Power rides into the fight', () => {
    const target = resolveTarget({ kind: 'oblivion', floor: 12 });
    const o = makeObjective({ kind: 'survival', seconds: 30 }, target);
    const f = (power) => fighter({ totalHp: 300000, totalAttack: 20000, totalOblivionPower: power });
    const low = o.measure(f(0), { n: 6, seed: 3 });
    const high = o.measure(f(500), { n: 6, seed: 3 });
    expect(high.value).toBeGreaterThanOrEqual(low.value);
  });

  it('works on a real fixture fighter', () => {
    const f = buildFighter(fixtureCharacter('WARRIOR'), 'p1');
    const m = makeObjective({ kind: 'dps' }, dummy).measure(f, { n: 4, seed: 5 });
    expect(m.value).toBeGreaterThan(0);
  });
});
