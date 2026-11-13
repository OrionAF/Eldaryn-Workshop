// Replay check of a real World Boss fight (Adamant Scales) against the app's World Boss rules
// (engine/pve/worldBossReplay.js, Game/combat-pve.md §16.1 and §16.2). The capture has no matching profile,
// so the rules that need the attacker's sheet stay skipped: what is held here is the client codec on a
// server log and the rules that run on the log alone.
import { describe, it, expect } from 'vitest';
import fight from './world-boss-fortified-mystic.json';
import { decodeWorldBossLog, worldBossReplayCheck, worldBossDamageOf } from '../../engine/pve/worldBossReplay.js';
import { detectFightKind, fightLogEvents } from '../../features/verifyLog.js';

const rows = decodeWorldBossLog(fight.combatLog);
const check = (log, opts = {}) => worldBossReplayCheck(log, { affinity: 'FORTIFIED', ...opts });
const rule = (report, name) => report.rules.find((r) => r.rule === name);
// the response with its log as decoded rows, edited (the check takes rows as they are)
const edited = (edit, top = {}) => {
  const copy = structuredClone(rows);
  edit(copy);
  return { ...fight, ...top, combatLog: copy };
};
const SWING = ['attacker_hit', 'attacker_crit', 'defender_block'];
const sizes = (type) => [...new Set(rows.filter((e) => e.type === type).map((e) => e.damage))].sort((a, b) => a - b);

describe('real World Boss fight (Adamant Scales, Mystic Mage)', () => {
  it('the codec port decodes the server\'s log: every row, the 60 s end and the damage total', () => {
    expect(rows).toHaveLength(fight.combatLog.ticks.length);
    expect(rows.at(-1)).toMatchObject({ timestamp: 60000, type: 'time_up', damage: 0 });
    expect(worldBossDamageOf(rows)).toBe(fight.damageDealt);
    expect(fight.bossHp - rows.at(-1).defenderHpAfter).toBe(fight.damageDealt);
    expect(rows[0]).toMatchObject({ timestamp: 700, type: 'defender_block', attackerHpAfter: 3099080, attackerShieldHpAfter: fight.combatLog.shieldMax });
    expect(rows[1]).toMatchObject({ type: 'attacker_spell_debuff_applied', spell: { species: 'ARCANE_CORRUPTION' }, debuffStacks: 1, debuffMaxStacks: 8, debuffPermanent: true });
  });

  it('is read as a World Boss log', () => {
    expect(detectFightKind(fight)).toBe('worldBoss');
    expect(fightLogEvents(fight)).toBe(rows.length);
  });

  it('no rule fails; the rules that need the sheet are skipped with the reason', () => {
    const report = check(fight);
    expect(report.mismatches).toEqual([]);
    expect(report.ok).toBe(true);
    for (const name of ['shape', 'terminal', 'tick-grid', 'boss-swings', 'hp-chain', 'affinity']) {
      expect(rule(report, name), name).toMatchObject({ status: 'pass', failed: 0 });
      expect(rule(report, name).checked, name).toBeGreaterThan(0);
    }
    for (const name of ['player-swings', 'spell-schedule', 'hit-sizes']) {
      expect(rule(report, name), name).toMatchObject({ status: 'skipped', checked: 0 });
      expect(rule(report, name).note, name).toMatch(/needs the attacker's sheet/);
    }
    expect(check(fight, { affinity: null }).ok).toBe(true);
  });

  // what combat-pve.md §16.2 reads from this log
  it('the dragon blocks about four swings in five and never hits back', () => {
    const swings = rows.filter((e) => SWING.includes(e.type));
    const blocked = swings.filter((e) => e.type === 'defender_block');
    expect([swings.length, blocked.length]).toEqual([92, 74]);
    expect(rows.some((e) => /^defender_(hit|crit)$/.test(e.type) || e.type === 'attacker_dead')).toBe(false);
    expect(rows.every((e) => e.attackerHpAfter === 3099080)).toBe(true);
  });

  it('a blocked swing lets the pierce through first, and a crit multiplies what got through', () => {
    const [hit] = sizes('attacker_hit');
    const [crit] = sizes('attacker_crit');
    const [blockedHit, blockedCrit] = sizes('defender_block');
    expect(sizes('defender_block')).toHaveLength(2);
    expect(blockedHit).toBe(Math.round(hit * 0.227));
    expect(crit).toBe(Math.round(hit * 4.83));
    expect(blockedCrit).toBe(Math.round(blockedHit * 4.83));
    expect(blockedCrit).not.toBe(Math.round(crit * 0.227)); // the other order is 2 off
  });

  it('a time_up off the fight\'s end, a wrong total, a broken HP chain or a boss hit fails', () => {
    const late = check({ ...fight, fightDurationMs: 60100 }, { affinity: null });
    expect(rule(late, 'terminal').status).toBe('fail');
    const notLast = check(edited((r) => { r.push({ ...r.at(-2), timestamp: 60000 }); }));
    expect(rule(notLast, 'terminal').status).toBe('fail');
    const total = check({ ...fight, damageDealt: fight.damageDealt + 1 });
    expect(rule(total, 'terminal').status).toBe('fail');
    const chain = check(edited((r) => { r[11].defenderHpAfter += 1000; }));
    expect(rule(chain, 'hp-chain').status).toBe('fail');
    const hit = check(edited((r) => { r.splice(12, 0, { ...r[11], type: 'defender_hit', damage: 500000, attackerHpAfter: 2599080 }); }));
    expect(hit.ok).toBe(false);
    expect(rule(hit, 'boss-swings').status).toBe('fail');
  });
});
