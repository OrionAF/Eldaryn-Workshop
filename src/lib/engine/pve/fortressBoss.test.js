// The Fortress boss fight on the duel engine (backlog §15; rules Game/clan-fortress.md §1.4): each
// FORTRESS_FIGHT_RULES departure from the arena, the boss's spread, and the replay check on the engine's own log.
import { describe, it, expect } from 'vitest';
import profile from '../../__fixtures__/real/profile-sentinel-l85-miss.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { buildFighter } from '../../build/fighter.js';
import { fightRng, laneRng } from '../rng.js';
import { simulateArenaPvP } from '../pvp/resolver.js';
import { getPvpHpMultiplier } from '../pvp/hpBuff.js';
import { DEFAULT_PVP_BALANCE } from '../pvp/balance.js';
import {
  simulateFortressBoss, fortressPlayerDuelArgs, fortressBossDuelArgs, FORTRESS_FIGHT_RULES,
} from './fortressBoss.js';
import { fortressReplayCheck } from './fortressReplay.js';

const c = normaliseCharacter(gameProfileToCharacter(profile));
const sentinel = buildFighter(c, c.activePresetId);
const fightLog = (fighter, i, rules = FORTRESS_FIGHT_RULES, group = 'TOP') => simulateFortressBoss({ fighter, group, rng: fightRng(5, i), log: true, rules }).combatLog;
const rowsOf = (n, f, type, rules) => Array.from({ length: n }, (_, i) => fightLog(f, i, rules)).flat().filter((e) => type(e.type, e));
const plain = {
  class: 'WARRIOR', spec: null, sigils: [],
  stats: {
    totalHp: 1000, totalAttack: 1000, totalAttackSpeed: 1, totalCritChance: 0, totalCritDamage: 1.5, totalPvpAttack: 216,
    totalPvpDefense: 197, totalHpRegen: 0,
  },
};

describe('Fortress boss fight (duel engine)', () => {
  it('the engine\'s own log passes every rule of the Fortress replay check', () => {
    for (let i = 0; i < 3; i++) {
      const combatLog = fightLog(sentinel, i);
      const last = combatLog.at(-1);
      const response = { combatLog, bossMaxHp: 2e10, rawDamage: 2e10 - last.defenderHpAfter, fightDurationMs: 60000, bossName: 'Fortress Guardian', bossSpellResist: 20 };
      const report = fortressReplayCheck(response, { attacker: sentinel, group: 'TOP' });
      expect(report.mismatches).toEqual([]);
      for (const r of report.rules) expect(r.status, `${r.rule}: ${r.note ?? ''}`).toBe('pass');
    }
  });

  it('no PVP HP buff: the player fights at the sheet HP; the arena rule would give x22.4 at level 85', () => {
    const r = simulateFortressBoss({ fighter: sentinel, group: 'TOP', rng: fightRng(1, 0) });
    expect(r.playerHpLeft).toBeLessThanOrEqual(2757745);
    expect(fortressPlayerDuelArgs(sentinel).stats.totalHp).toBe(2757745);
    expect(getPvpHpMultiplier(sentinel.level, DEFAULT_PVP_BALANCE)).toBeCloseTo(22.4, 12);
    expect(fortressPlayerDuelArgs(sentinel, { ...FORTRESS_FIGHT_RULES, pvpHpBuff: true }).stats.totalHp)
      .toBe(Math.floor(2757745 * getPvpHpMultiplier(85, DEFAULT_PVP_BALANCE)));
  });

  it('no PVP ratings: hits are the sheet attack and boss hits are not cut by PVP Defense', () => {
    const big = { ...plain, stats: { ...plain.stats, totalHp: 1e7 } };
    const hits = rowsOf(2, big, (t) => t === 'attacker_hit', FORTRESS_FIGHT_RULES);
    expect(hits.length).toBeGreaterThan(100);
    expect(new Set(hits.map((e) => e.damage))).toEqual(new Set([1000]));
    const boss = rowsOf(2, big, (t) => t === 'defender_hit', FORTRESS_FIGHT_RULES);
    expect(Math.min(...boss.map((e) => e.damage))).toBeGreaterThanOrEqual(425);
    const rated = rowsOf(1, big, (t) => t === 'attacker_hit', { ...FORTRESS_FIGHT_RULES, pvpRatings: true });
    expect(rated[0].damage).toBe(Math.round(1000 * (1 + 216 / 416)));
  });

  it('no sigil stacks: Elusive Supremacy never raises a hit; the arena stacks would', () => {
    const plainSize = (e) => e.damage === 2280378 || e.damage === 10991422;
    const hits = rowsOf(2, sentinel, (t) => t === 'attacker_hit' || t === 'attacker_crit');
    expect(hits.every(plainSize)).toBe(true);
    const stacked = rowsOf(2, sentinel, (t) => t === 'attacker_hit' || t === 'attacker_crit', { ...FORTRESS_FIGHT_RULES, stackSigils: true });
    expect(stacked.some((e) => !plainSize(e))).toBe(true);
  });

  it('the boss is never blinded, though Blinding Mark keeps its attack-speed buff; the arena rule would blind it', () => {
    expect(rowsOf(3, sentinel, (t) => t === 'defender_blind' || t === 'defender_blinded')).toEqual([]);
    const mark = fortressPlayerDuelArgs(sentinel).spells.find((s) => s.species === 'BLINDING_MARK');
    expect(mark.spell.effects.map((e) => e.stat)).toEqual(['ATTACK_SPEED']);
    expect(rowsOf(3, sentinel, (t) => t === 'defender_blind', { ...FORTRESS_FIGHT_RULES, bossBlindable: true }).length).toBeGreaterThan(0);
  });

  it('boss hits spread uniformly over 500 ±15%, and the boss has the log\'s spell resist', () => {
    const big = { ...plain, stats: { ...plain.stats, totalHp: 1e7 } };
    const d = rowsOf(10, big, (t) => t === 'defender_hit').map((e) => e.damage);
    expect(d.length).toBe(600);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(425);
    expect(Math.max(...d)).toBeLessThanOrEqual(575);
    expect(Math.min(...d)).toBeLessThan(435);
    expect(Math.max(...d)).toBeGreaterThan(565);
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    expect(Math.abs(mean - 500)).toBeLessThan(5);
    expect(fortressBossDuelArgs('TOP').stats.totalSpellResist).toBe(20);
    expect(fortressBossDuelArgs('CORE').stats).toMatchObject({ totalHp: 2.7e10, totalAttack: 800, totalAttackSpeed: 1.2 });
  });

  it('the log ends at time_up with no death row, and a double hit\'s first row carries the HP after that strike', () => {
    const log = fightLog(sentinel, 0);
    expect(log.at(-1).type).toBe('time_up');
    expect(log.at(-1).timestamp).toBe(60000);
    const i = log.findIndex((e) => e.doubleHit);
    expect(log[i - 1].defenderHpAfter).toBe(log[i].defenderHpAfter + log[i].damage);
  });

  it('a player the boss kills stops dealing damage', () => {
    const r = simulateFortressBoss({ fighter: plain, group: 'CORE', rng: fightRng(2, 0) });
    expect(r.playerDied).toBe(true);
    expect(r.timeMs).toBeLessThan(5000);
    expect(r.damageDealt).toBeLessThan(5000);
    expect(r.damageDealt % 1000).toBe(0);
  });

  it('the spread draws from its own lane: the player\'s swings are the same draw for draw with it on or off', () => {
    const a = fortressPlayerDuelArgs({ ...plain, stats: { ...plain.stats, totalHp: 1e7, totalCritChance: 50, totalDoubleHit: 20 } });
    const d = fortressBossDuelArgs('TOP');
    const run = (v) => simulateArenaPvP(
      a.stats, d.stats, a.spells, d.spells, a.equipped, d.equipped, a.glyphCombat, d.glyphCombat, a.shield, d.shield,
      a.stackCtx, d.stackCtx, a.summon, d.summon, { rng: laneRng(9), log: true, defenderDamageVariance: v },
    ).ticks.filter((e) => e.type.startsWith('attacker_') && e.type !== 'attacker_regen').map((e) => `${e.timestamp}${e.type}${e.damage}`);
    expect(run(0.15)).toEqual(run(0));
  });
});
