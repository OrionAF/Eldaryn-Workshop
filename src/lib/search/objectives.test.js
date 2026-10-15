import { describe, it, expect } from 'vitest';
import {
  resolveTarget, makeObjective, objectiveKindsFor, closedFormDps, ehpProxy, SCREEN_SPELL_WEIGHT,
  TARGET_KINDS, residualFor, goalRetired, WIN_RATE_TARGET,
} from './objectives.js';
import { contrastSets } from './sampler.js';
import { buildFighter } from '../build/fighter.js';
import { fixtureCharacter } from '../build/fixtures.js';

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
      { kind: 'raid', id: 'raid_3', step: 4 },
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
    // the engine's mode picks the tick, opening, resist rule and sequencing (fight.js PVE_MODES)
    expect(c.opts).toEqual({ mode: 'campaign' });
    expect(resolveTarget({ kind: 'dungeon', id: 'dungeon_1', step: 1 }).opts).toEqual({ mode: 'dungeon' });
    expect(resolveTarget({ kind: 'raid', id: 'raid_1', step: 1 }).opts).toEqual({ mode: 'raid' });
    expect(resolveTarget({ kind: 'oblivion', floor: 3 }).opts).toEqual({ mode: 'oblivion' });
    expect(resolveTarget({ kind: 'worldBoss', affinity: 'ENRAGED' }).opts).toEqual({ mode: 'worldBoss' });
    expect(c.label).toBe('Chapter 2, level 4');
    expect(resolveTarget({ kind: 'chapter', chapter: 12, level: 1 }).label).toBe('Hard chapter 12, level 1');
    expect(resolveTarget({ kind: 'dungeon', id: 'dungeon_1', step: 8 }).enemy).toHaveLength(3);
  });

  it('a village raid step is five mobs, labelled by name, with the dungeon objectives', () => {
    const t = resolveTarget({ kind: 'raid', id: 'raid_1', step: 8 });
    expect(t.enemy).toHaveLength(5);
    expect(t.label).toBe('Village raid Bandit Village, step 8');
    expect(objectiveKindsFor('raid')).toEqual(objectiveKindsFor('dungeon'));
    expect(() => resolveTarget({ kind: 'raid', id: 'nope', step: 1 })).toThrow(/does not exist/);
    expect(() => resolveTarget({ kind: 'raid', id: 'raid_1', step: 9 })).toThrow(/does not exist/);
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
    for (const k of ['chapter', 'dungeon', 'raid', 'oblivion']) expect(objectiveKindsFor(k)).toEqual(['win-rate']);
    expect(objectiveKindsFor('worldBoss')).toEqual(['dps']);
    // with the target itself: survival only where something can hurt the player (#61)
    expect(objectiveKindsFor('worldBoss', { kind: 'worldBoss', affinity: 'NONE' })).toEqual(['dps']);
    expect(objectiveKindsFor('worldBoss', { kind: 'worldBoss', affinity: 'ENRAGED' })).toEqual(['dps']);
    expect(objectiveKindsFor('custom')).toEqual(['dps', 'win-rate', 'survival']);
    expect(objectiveKindsFor('bogus')).toEqual([]);
  });

  it('makeObjective throws on a pair that makes no sense', () => {
    expect(() => makeObjective({ kind: 'ttk-median' }, resolveTarget({ kind: 'dummy' }))).toThrow(/unknown objective/);
    expect(() => makeObjective({ kind: 'ttk-p90' }, resolveTarget({ kind: 'custom', mob: { hp: 1e6, attack: 1, attackSpeed: 1 } }))).toThrow(/unknown objective/);
    expect(() => makeObjective({ kind: 'dps' }, resolveTarget({ kind: 'chapter', chapter: 1, level: 1 }))).toThrow(/cannot score/);
    expect(() => makeObjective({ kind: 'nope' })).toThrow(/unknown objective/);
  });

  it('survival cannot score a target that deals no damage (#61)', () => {
    for (const affinity of ['NONE', 'FORTIFIED']) {
      expect(() => makeObjective({ kind: 'survival' }, resolveTarget({ kind: 'worldBoss', affinity }))).toThrow(/cannot score/);
    }
    expect(() => makeObjective({ kind: 'survival' }, resolveTarget({ kind: 'custom', mob: { hp: 1e6, attack: 0, attackSpeed: 1 } }))).toThrow(/cannot score/);
    expect(makeObjective({ kind: 'survival' }, resolveTarget({ kind: 'custom', mob: { hp: 1e6, attack: 5, attackSpeed: 1 } })).kind).toBe('survival');
  });

  it('survival stays for custom mobs only (retired on chapter, dungeon, raid, Oblivion and World Boss)', () => {
    for (const t of [
      { kind: 'chapter', chapter: 1, level: 1 }, { kind: 'dungeon', id: 'dungeon_1', step: 1 },
      { kind: 'raid', id: 'raid_1', step: 1 }, { kind: 'oblivion', floor: 3 }, { kind: 'worldBoss', affinity: 'ENRAGED' },
    ]) {
      expect(() => makeObjective({ kind: 'survival' }, resolveTarget(t))).toThrow(/cannot score/);
      expect(goalRetired(t.kind, 'survival')).toBe(true);
    }
    expect(goalRetired('custom', 'survival')).toBe(false);
  });

  it('goalRetired flags the kill-time kinds on every target and keeps the live pairs', () => {
    for (const k of TARGET_KINDS) {
      expect(goalRetired(k, 'ttk-median')).toBe(true);
      expect(goalRetired(k, 'ttk-p90')).toBe(true);
    }
    expect(goalRetired('chapter', 'win-rate')).toBe(false);
    expect(goalRetired('dummy', 'dps')).toBe(false);
    expect(goalRetired('pvp', 'pvp-winrate')).toBe(false);
  });

  it('the win-rate target accepts 10 % to 100 % and rejects below', () => {
    const t = resolveTarget({ kind: 'chapter', chapter: 1, level: 1 });
    expect(WIN_RATE_TARGET.min).toBe(0.1);
    expect(makeObjective({ kind: 'win-rate', target: 0.1 }, t).spec.target).toBe(0.1);
    expect(() => makeObjective({ kind: 'win-rate', target: 0.09 }, t)).toThrow(/between 0.1 and 1/);
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

  it('block and the player\'s own penetration: (1-b) R A (1+c(m-1)+h) + b p R A (1+c(m-1))', () => {
    const s = stats({ totalAttackSpeed: 1.25, totalCritChance: 20, totalCritDamage: 1.5, totalDoubleHit: 10, totalPenetration: 20 });
    // (0.5)(1000)(1.2) + (0.5)(0.2)(1000)(1.1) = 600 + 110 = 710 per swing, x 1.25 swings
    expect(closedFormDps(s, { blockChance: 50 })).toBeCloseTo(887.5, 6);
  });

  it('raising totalPenetration raises the estimate vs a blocking target; the enemy\'s own penetration does not (#67)', () => {
    const at = (pen) => closedFormDps(stats({ totalPenetration: pen }), { blockChance: 80, penetration: 12 });
    expect(at(60)).toBeGreaterThan(at(0));
    expect(at(0)).toBeCloseTo(200, 6); // 20 % of swings land, none pierce
  });

  it('any Miss on the defender negates fully: no pierce (combat-pve.md §5.4)', () => {
    const s = stats({ totalPenetration: 50 });
    expect(closedFormDps(s, { blockChance: 20, missChance: 10 })).toBeCloseTo(700, 6);
    expect(closedFormDps(s, { blockChance: 30 })).toBeCloseTo(700 + 300 * 0.5, 6);
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

describe('targets carry the fight mode and its labelled assumptions', () => {
  it('a hard dungeon resolves, labelled by name, with the dungeon mode', () => {
    const t = resolveTarget({ kind: 'dungeon', id: 'dungeon_1_hard', step: 2 });
    expect(t.enemy).toHaveLength(3);
    expect(t.label).toBe('Hard dungeon Forsaken Mines, step 2');
    expect(resolveTarget({ kind: 'dungeon', id: 'dungeon_1', step: 2 }).label).toBe('Dungeon Forsaken Mines, step 2');
    expect(t.mode).toBe('dungeon');
    expect(t.key).not.toBe(resolveTarget({ kind: 'dungeon', id: 'dungeon_1', step: 2 }).key);
    expect(() => resolveTarget({ kind: 'dungeon', id: 'dungeon_9_hard', step: 1 })).toThrow(/does not exist/);
  });

  it('server-run fights say so; the campaign and the dummy are the client', () => {
    const d = resolveTarget({ kind: 'dungeon', id: 'dungeon_1', step: 1 });
    expect(d.fidelity).toBe('server-model');
    expect(d.assumptions.map((a) => a.id)).toContain('server-fight');
    expect(resolveTarget({ kind: 'worldBoss', affinity: 'ENRAGED' }).assumptions.map((a) => a.id)).toContain('world-boss-model');
    const c = resolveTarget({ kind: 'chapter', chapter: 1, level: 1 });
    expect([c.mode, c.fidelity]).toEqual(['campaign', 'client']);
    expect(c.assumptions.map((a) => a.id)).toEqual(['campaign-cap']);
    expect(resolveTarget({ kind: 'dummy' }).assumptions).toEqual([]);
    for (const a of d.assumptions) expect(a.label.length).toBeGreaterThan(10);
  });

  it('Oblivion: the instability output cut is off by default and a toggle turns it on (Q2)', () => {
    const off = resolveTarget({ kind: 'oblivion', floor: 5 });
    const on = resolveTarget({ kind: 'oblivion', floor: 5, applyOutputCut: true });
    expect(off.opts.applyOutputCut).toBeUndefined();
    expect(on.opts).toEqual({ mode: 'oblivion', applyOutputCut: true });
    expect(on.key).not.toBe(off.key);
    expect(off.assumptions.find((a) => a.id === 'oblivion-output-cut').value).toBe('off');
    expect(on.assumptions.find((a) => a.id === 'oblivion-output-cut').value).toBe('on');
  });
});

describe('residualFor (only a confirmed sheet carries a residual)', () => {
  it('fresh: carried, with an info note', () => {
    const r = residualFor({ sheetStatus: 'fresh', residual: { totalAttack: 5 } });
    expect(r.residual).toEqual({ totalAttack: 5 });
    expect(r.warnings.map((w) => w.code)).toEqual(['residual-applied']);
  });

  it('unverified or stale: not carried, with a warning', () => {
    const u = residualFor({ sheetStatus: 'unverified', residual: { totalAttack: 5 } });
    expect(u.residual).toEqual({});
    expect(u.warnings).toMatchObject([{ code: 'sheet-unverified', severity: 'warn' }]);
    expect(residualFor({ sheetStatus: 'stale', residual: {} }).warnings[0].code).toBe('sheet-stale');
    expect(residualFor({ sheetStatus: 'none', residual: {} })).toEqual({ residual: {}, warnings: [] });
  });
});

describe('measures', () => {
  const dummy = resolveTarget({ kind: 'dummy' });

  it('dps: deterministic for a seed, increasing in Attack, with an interval and a paired contrast', () => {
    const o = makeObjective({ kind: 'dps' }, dummy);
    const weak = o.measure(fighter({ totalAttack: 1000 }), { n: 8, seed: 7 });
    const strong = o.measure(fighter({ totalAttack: 2000 }), { n: 8, seed: 7 });
    expect(o.measure(fighter({ totalAttack: 1000 }), { n: 8, seed: 7 }).value).toBe(weak.value);
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(weak.value).toBeCloseTo(1000, 0); // 1 swing/s, no crit
    expect(weak.lo).toBeLessThanOrEqual(weak.value);
    expect(weak.hi).toBeGreaterThanOrEqual(weak.value);
    expect(weak.samples.n).toBe(8);
    const d = contrastSets(o, strong.samples, weak.samples);
    expect(d.delta).toBeGreaterThan(900);
    expect(d.verdict).toBe('better');
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

  it('survival: p with a Wilson interval; certain survivors tie exactly, with no effective-HP tie-break (#61)', () => {
    const target = resolveTarget({ kind: 'custom', mob: { hp: 1e6, attack: 50, attackSpeed: 1 }, seconds: 20 });
    const o = makeObjective({ kind: 'survival', seconds: 20 }, target);
    const a = o.measure(fighter({ totalHp: 100000 }), { n: 8, seed: 1 });
    const b = o.measure(fighter({ totalHp: 200000 }), { n: 8, seed: 1 });
    expect([a.value, b.value]).toEqual([1, 1]);
    expect([b.score, b.tie]).toEqual([a.score, a.tie]);
    const dies = o.measure(fighter({ totalHp: 100 }), { n: 8, seed: 1 });
    expect(dies.value).toBe(0);
    expect(dies.score).toBeLessThan(a.score);
    expect(a.hi).toBe(1);
  });

  it("survival's window defaults to the target's own length (#78)", () => {
    // 1000 damage a second against 45 000 HP: dead at about 45 s, alive at 30 s
    const target = resolveTarget({ kind: 'custom', mob: { hp: 1e12, attack: 1000, attackSpeed: 1 }, seconds: 30 });
    const o = makeObjective({ kind: 'survival' }, target);
    expect(o.window).toBe(30);
    expect(o.label).toBe('Survival chance (30 s)');
    expect(o.measure(fighter({ totalHp: 45000 }), { n: 4, seed: 1 }).value).toBe(1);
    const longer = makeObjective({ kind: 'survival', seconds: 60 }, target);
    expect(longer.measure(fighter({ totalHp: 45000 }), { n: 4, seed: 1 }).value).toBe(0);
    expect(longer.key).not.toBe(o.key);
  });

  it('an aborted signal returns an aborted measure', () => {
    const ctl = new AbortController();
    ctl.abort();
    const m = makeObjective({ kind: 'dps' }, dummy).measure(fighter(), { n: 8, seed: 1, signal: ctl.signal });
    expect(m.aborted).toBe(true);
  });

  it('Oblivion: the fighter\'s Oblivion Power rides into the fight', () => {
    const target = resolveTarget({ kind: 'oblivion', floor: 12 });
    const o = makeObjective({ kind: 'win-rate' }, target);
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
