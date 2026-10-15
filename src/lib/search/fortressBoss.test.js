import { describe, it, expect } from 'vitest';
import { resolveTarget, makeObjective, objectiveKindsFor, goalRetired } from './objectives.js';
import { targetOut } from './result.js';
import { PVE_MODES } from '../engine/pve/fight.js';
import {
  calculateBossShield, calculateContributionBonus, calculateStarVulnerability, fortressBossMultipliers, fortressBossCredit,
} from '../engine/pve/fortressBoss.js';
import { fortressDamage } from '../ui/optimiserView.js';

const fighter = {
  stats: {
    totalHp: 10000, totalAttack: 1000, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0, totalCritDamage: 1.5,
    totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0, totalMissChance: 0,
    totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0, totalPvpAttack: 0, totalPvpDefense: 0,
  },
  class: 'WARRIOR', spec: null, sigils: [],
};

describe('Fortress boss target', () => {
  it('resolves each group from the boss table, a 60 s window at the 10 ms boss tick, server-model', () => {
    const top = resolveTarget({ kind: 'fortressBoss', group: 'TOP' });
    expect(top.enemy).toMatchObject({ hp: 2e10, attack: 500, attackSpeed: 1, name: 'Fortress Guardian' });
    expect([top.maxMs, top.seconds]).toEqual([60000, 60]);
    expect(top.spec).toEqual({ kind: 'fortressBoss', group: 'TOP', stars: 1, aliveDefenders: 0, server: null, kills: 0 });
    expect(top.fidelity).toBe('server-model');
    expect(top.assumptions.map((a) => a.id)).toContain('fortress-boss-model');
    expect(PVE_MODES.fortressBoss.dtMs).toBe(10);
    const core = resolveTarget({ kind: 'fortressBoss', group: 'CORE' });
    expect(core.enemy).toMatchObject({ hp: 2.7e10, attack: 800, attackSpeed: 1.2 });
    expect('stars' in core.spec).toBe(false);
    expect(resolveTarget({ kind: 'fortressBoss', group: 'BOTTOM', stars: 3 }).label).toBe('Fortress boss (BOTTOM, 3 stars)');
  });

  it('validates the spec', () => {
    const bad = (o) => () => resolveTarget({ kind: 'fortressBoss', group: 'TOP', ...o });
    expect(() => resolveTarget({ kind: 'fortressBoss', group: 'MID' })).toThrow(/group/);
    expect(bad({ stars: 0 })).toThrow(/stars/);
    expect(bad({ stars: 6 })).toThrow(/stars/);
    expect(bad({ stars: 1.5 })).toThrow(/stars/);
    expect(() => resolveTarget({ kind: 'fortressBoss', group: 'CORE', stars: 2 })).toThrow(/no stars/);
    expect(bad({ aliveDefenders: -1 })).toThrow(/alive/);
    expect(bad({ maxClanSize: 0 })).toThrow(/clan size/);
    expect(bad({ server: -1 })).toThrow(/server/);
    expect(bad({ server: 1.5 })).toThrow(/server/);
    expect(bad({ shieldPercent: 61 })).toThrow(/shield percent/);
    expect(bad({ shieldPercent: -1 })).toThrow(/shield percent/);
    expect(bad({ kills: -1 })).toThrow(/kills/);
  });

  it('is scored by dps only', () => {
    expect(objectiveKindsFor('fortressBoss')).toEqual(['dps']);
    expect(goalRetired('fortressBoss', 'win-rate')).toBe(true);
    expect(() => makeObjective({ kind: 'win-rate' }, resolveTarget({ kind: 'fortressBoss', group: 'TOP' }))).toThrow(/cannot score/);
  });

  it('multipliers match hand-computed values', () => {
    expect(calculateStarVulnerability(4)).toBe(6);
    expect(calculateStarVulnerability(2)).toBe(1.5);
    expect(calculateStarVulnerability(1)).toBe(1);
    expect(calculateBossShield(25, 50)).toBe(30);
    expect(calculateBossShield(50, 50)).toBe(60);
    expect(calculateBossShield(0, 50)).toBe(0);
    expect(calculateBossShield(35, 50)).toBeCloseTo(45, 10); // ratio 0.7, between 0.6 -> 40 and 0.8 -> 50
    expect(calculateBossShield(90, 50)).toBe(60);
    expect(calculateContributionBonus(4)).toBeCloseTo(1.2, 12);
    expect(calculateContributionBonus(40)).toBe(2);
    const m = fortressBossMultipliers({ group: 'TOP', stars: 4, aliveDefenders: 25, clanCap: 50, kills: 10 });
    expect(m).toMatchObject({ shieldPercent: 30, contributionBonus: 1.5, starVulnerability: 6 });
    expect(m.total).toBeCloseTo(0.7 * 1.5 * 6, 12);
    expect(fortressBossCredit(m, 1000)).toEqual({ raw: 1000, effective: 6300 });
    expect(fortressBossMultipliers({ group: 'CORE', aliveDefenders: 50, clanCap: 50, kills: 0 }).starVulnerability).toBe(1);
  });

  it('server siege data: 26 alive of server 5\'s cap 30 is 53.333...%, not the defending clan\'s size', () => {
    expect(calculateBossShield(26, 30)).toBe(53.333333333333336);
    expect(calculateBossShield(26, 27)).toBeCloseTo(58.148, 2);
    expect(calculateBossShield(26, 26)).toBe(60);
    const t = resolveTarget({ kind: 'fortressBoss', group: 'TOP', stars: 5, aliveDefenders: 26, server: 5 });
    expect(t.fortress.shieldPercent).toBe(53.333333333333336);
    expect(t.fortress.clanCap).toBe(30);
    expect(t.fortress.starVulnerability).toBe(11);
  });

  it('takes the server from the character, else the default cap of 50', () => {
    const spec = { kind: 'fortressBoss', group: 'TOP', aliveDefenders: 26 };
    expect(resolveTarget(spec, { character: { server: 5 } }).spec.server).toBe(5);
    expect(resolveTarget(spec, { character: { server: 5 } }).fortress.clanCap).toBe(30);
    expect(resolveTarget(spec, { character: { server: 5 } }).fortress.shieldPercent).toBeCloseTo(53.33, 1);
    expect(resolveTarget({ ...spec, server: 7 }, { character: { server: 5 } }).fortress.clanCap).toBe(18);
    expect(resolveTarget({ ...spec, server: null }, { character: { server: 5 } }).fortress.clanCap).toBe(50);
    expect(resolveTarget(spec).fortress.clanCap).toBe(50);
  });

  it('a typed shield percent is used directly', () => {
    const t = resolveTarget({ kind: 'fortressBoss', group: 'TOP', aliveDefenders: 3, server: 5, shieldPercent: 42.5 });
    expect(t.fortress.shieldPercent).toBe(42.5);
    expect(t.fortress.shieldMultiplier).toBeCloseTo(0.575, 12);
    expect(t.spec.shieldPercent).toBe(42.5);
    expect(resolveTarget({ kind: 'fortressBoss', group: 'TOP', shieldPercent: 0 }).fortress.shieldPercent).toBe(0);
  });

  it('an old saved spec with maxClanSize keeps it as an explicit cap', () => {
    const t = resolveTarget({ kind: 'fortressBoss', group: 'TOP', stars: 1, aliveDefenders: 25, maxClanSize: 50, kills: 0 }, { character: { server: 5 } });
    expect(t.fortress).toMatchObject({ shieldPercent: 30, clanCap: 50 });
    expect(t.spec.maxClanSize).toBe(50);
  });

  it('the echoed target carries the multipliers and the display credit follows them', () => {
    const t = resolveTarget({ kind: 'fortressBoss', group: 'TOP', stars: 4, aliveDefenders: 25, kills: 10 });
    const out = targetOut(t);
    expect(out.fortress.total).toBeCloseTo(6.3, 12);
    expect(out.assumptions.find((a) => a.id === 'fortress-boss-model').tag).toBe('SERVER');
    expect(fortressDamage(out.fortress, 1000)).toEqual({ raw: 60000, effective: 378000 });
  });

  it('the multipliers are not in the statistic: a short run scores the raw damage per second', () => {
    const plain = resolveTarget({ kind: 'fortressBoss', group: 'TOP' });
    const shielded = resolveTarget({ kind: 'fortressBoss', group: 'TOP', stars: 5, aliveDefenders: 50, kills: 20 });
    const sturdy = { ...fighter, stats: { ...fighter.stats, totalHp: 1e6 } };
    const a = makeObjective({ kind: 'dps' }, plain).measure(sturdy, { n: 3, seed: 4 });
    const b = makeObjective({ kind: 'dps' }, shielded).measure(sturdy, { n: 3, seed: 4 });
    expect(a.value).toBeGreaterThan(800); // one 1000 swing a second for 60 s; 1e6 HP outlasts the boss's 500 a second
    expect(a.value).toBeLessThan(1100);
    expect(b.value).toBe(a.value);
  });
});
