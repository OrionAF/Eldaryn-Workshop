// World Boss replay check (worldBossReplay.js) on the app's own fights: the codec round-trips, and the app's
// fight (as a server-shaped response) passes the rules that can run and fails them when tampered with. The one
// captured server log is held in __fixtures__/real/worldBossReplay.test.js.
import { describe, it, expect } from 'vitest';
import sentinelProfile from '../../__fixtures__/real/profile-sentinel-l85-miss.json';
import mysticProfile from '../../__fixtures__/real/profile-mystic-l50.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { buildFighter } from '../../build/fighter.js';
import { preparePveFighter } from './fight.js';
import { laneRng } from '../rng.js';
import {
  WORLD_BOSS_REPLAY_RULES, WORLD_BOSS_LOG_FIELDS, decodeWorldBossLog, encodeWorldBossLog, worldBossResponseOf,
  worldBossReplayCheck, worldBossDamageOf, simulateWorldBoss,
} from './worldBossReplay.js';

const fighterOf = (profile) => {
  const c = normaliseCharacter(gameProfileToCharacter(profile));
  return buildFighter(c, c.activePresetId);
};
const sentinel = fighterOf(sentinelProfile);
const mystic = fighterOf(mysticProfile);
const responseOf = (attacker, affinity, seed = 7) => {
  const p = preparePveFighter(attacker);
  const P = p.fresh().player;
  const shield = P.shieldMax > 0 ? { max: P.shieldMax, variant: p.inputs.shield.variant } : null;
  return worldBossResponseOf(simulateWorldBoss(attacker, affinity, laneRng(seed)), { shield });
};
const rule = (report, name) => report.rules.find((r) => r.rule === name);
// a response whose combatLog is the decoded rows (the check takes rows as they are)
const withRows = (res, edit) => {
  const rows = structuredClone(decodeWorldBossLog(res.combatLog));
  edit(rows);
  return { ...res, combatLog: rows };
};

describe('the client codec', () => {
  // every field the codec carries, with the carried ones changing and staying
  const rows = [
    { timestamp: 0, type: 'minion_summoned', damage: 0, attackerHpAfter: 1000, defenderHpAfter: 5000, attackerShieldHpAfter: 200, minionHpAfter: 300, minionMaxHp: 300, summonReadyMs: 400 },
    { timestamp: 500, type: 'attacker_hit', damage: 120, attackerHpAfter: 1000, defenderHpAfter: 4880, attackerShieldHpAfter: 200, minionHpAfter: 300 },
    { timestamp: 500, type: 'attacker_hit', damage: 60, attackerHpAfter: 1000, defenderHpAfter: 4820, attackerShieldHpAfter: 200, minionHpAfter: 300, doubleHit: true },
    { timestamp: 600, type: 'attacker_spell_damage', damage: 90, attackerHpAfter: 1000, defenderHpAfter: 4730, attackerShieldHpAfter: 200, minionHpAfter: 300, spell: { name: 'Fireball', icon: 'f', species: 'FIREBALL' }, isCrit: true, momentumStacks: 2 },
    { timestamp: 600, type: 'attacker_spell_debuff_applied', damage: 0, attackerHpAfter: 1000, defenderHpAfter: 4730, attackerShieldHpAfter: 200, minionHpAfter: 300, spell: { name: 'Rot', icon: 'r', species: 'GRAVE_ROT' }, debuffStacks: 1, debuffMaxStacks: 5, debuffPermanent: false, damagePerTick: 7 },
    { timestamp: 700, type: 'defender_paralyzed', damage: 0, attackerHpAfter: 1000, defenderHpAfter: 4730, attackerShieldHpAfter: 200, minionHpAfter: 300, paralyzeMs: 1500, stunSource: 'REAP' },
    { timestamp: 700, type: 'defender_staggered', damage: 0, attackerHpAfter: 1000, defenderHpAfter: 4730, attackerShieldHpAfter: 200, minionHpAfter: 300, staggerStacks: 2, dazeMs: 300 },
    { timestamp: 800, type: 'minion_damaged', damage: 50, attackerHpAfter: 1000, defenderHpAfter: 4730, attackerShieldHpAfter: 150, minionHpAfter: 250, minionBlocked: true, bulwarkStacks: 3, sunderStacks: 1 },
    { timestamp: 900, type: 'attacker_spell_debuff_tick', damage: 7, attackerHpAfter: 950, defenderHpAfter: 4723, attackerShieldHpAfter: 150, minionHpAfter: 250, spell: { name: 'Rot', icon: 'r', species: 'GRAVE_ROT' }, debuffPermanent: true, chronoFlux: 40 },
    { timestamp: 1000, type: 'minion_dead', damage: 0, attackerHpAfter: 950, defenderHpAfter: 4723, attackerShieldHpAfter: 150, minionRespawnMs: 5000, minionDeathWard: 30, minionWard: 10, chronoFlux: 40 },
    { timestamp: 1100, type: 'defender_hit', damage: 20, attackerHpAfter: 930, defenderHpAfter: 4723, attackerShieldHpAfter: 150, chronoFlux: 55 },
  ];

  it('decode(encode(rows)) returns the rows, every carried field included', () => {
    const log = encodeWorldBossLog(rows, { max: 200, variant: 'arcane' });
    expect(log.v).toBe(1);
    expect(log.shieldMax).toBe(200);
    expect(log.chronoFlux).toBe(true);
    expect(log.spells).toHaveLength(2);
    const back = decodeWorldBossLog(log);
    // the decoder fills chronoFlux on every row once the log has it (0 until the first value)
    const want = rows.map((r, i) => ({ ...r, chronoFlux: r.chronoFlux ?? (i < 8 ? 0 : 40) }));
    expect(back).toEqual(want);
    const used = new Set(rows.flatMap((r) => Object.keys(r)));
    for (const f of WORLD_BOSS_LOG_FIELDS) if (f !== 'spellIndex') expect(used.has(f), f).toBe(true);
  });

  it('leaves out unchanged HP, zero damage and a gone minion as -1', () => {
    const log = encodeWorldBossLog(rows, null);
    expect(log.shieldMax).toBeUndefined();
    // the double hit: damage and the boss HP are written, the unchanged player HP is not
    expect(log.ticks[2][2] & 0b111).toBe(0b101);
    expect(log.ticks[4][2] & 0b001).toBe(0); // zero damage left out
    const dead = log.ticks[9];
    expect(dead.slice(3)).toContain(-1);
    expect(decodeWorldBossLog(log)[9].minionHpAfter).toBeUndefined();
  });

  it('returns null over the byte cap, and decodes garbage to null without throwing', () => {
    expect(encodeWorldBossLog(rows, null, 10)).toBeNull();
    for (const bad of [null, undefined, 42, 'not json', '{"v":2,"ticks":[]}', { v: 1 }, { v: 1, ticks: [5] }, { v: 1, types: ['x'], ticks: [['a', 0, 0]] }]) {
      expect(decodeWorldBossLog(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('passes an array through unchanged and parses a JSON string', () => {
    expect(decodeWorldBossLog(rows)).toBe(rows);
    const log = encodeWorldBossLog(rows, null);
    expect(decodeWorldBossLog(JSON.stringify(log))).toEqual(decodeWorldBossLog(log));
  });
});

describe('the app\'s own fight as a response', () => {
  it.each(['NONE', 'FORTIFIED', 'ENRAGED'])('Sentinel L85, %s: passes every rule that can run', (affinity) => {
    const res = responseOf(sentinel, affinity);
    const report = worldBossReplayCheck(res, { attacker: sentinel, affinity });
    expect(report.mismatches).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.rules.map((r) => r.rule)).toEqual([...WORLD_BOSS_REPLAY_RULES]);
    for (const r of report.rules) {
      if (r.status === 'skipped') expect(r.note, r.rule).toMatch(/\w/);
      else expect(r.checked, r.rule).toBeGreaterThan(0);
    }
    // Elusive Supremacy (a stack sigil) changes the swing sizes and the HP: those comparisons do not run
    expect(rule(report, 'hit-sizes').status).toBe('skipped');
    expect(rule(report, 'regen').status).toBe('skipped');
    expect(rule(report, 'player-swings').status).toBe(affinity === 'ENRAGED' ? 'skipped' : 'pass');
    expect(rule(report, 'boss-swings').status).toBe('pass');
    expect(rule(report, 'terminal').status).toBe('pass');
  });

  it.each(['NONE', 'FORTIFIED'])('Mystic L50, %s: the sheet rules run too', (affinity) => {
    const report = worldBossReplayCheck(responseOf(mystic, affinity), { attacker: mystic, affinity });
    expect(report.mismatches).toEqual([]);
    for (const name of ['player-swings', 'spell-schedule', 'hit-sizes', 'hp-chain', 'affinity']) {
      expect(rule(report, name).status, name).toBe('pass');
    }
  });

  it('Mystic L50, ENRAGED: the app logs spell damage uncut after wrath while the boss loses the cut amount', () => {
    // fight.js cuts the spell and debuff damage it takes off the boss (cutDirect, step 4 and 5) but emits
    // the rows with the uncut value, so the client's sum and the HP chain disagree with the boss HP lost
    const report = worldBossReplayCheck(responseOf(mystic, 'ENRAGED'), { attacker: mystic, affinity: 'ENRAGED' });
    expect(rule(report, 'terminal').status).toBe('fail');
    expect(rule(report, 'hp-chain').status).toBe('fail');
    const firstBad = report.mismatches.find((m) => m.rule === 'hp-chain');
    expect(firstBad.timestamp).toBeGreaterThanOrEqual(30000);
    for (const name of ['player-swings', 'hit-sizes', 'regen', 'spell-schedule', 'tick-grid']) {
      expect(rule(report, name).status, name).toBe('pass');
    }
  });

  it('the response carries the client\'s fields and the client\'s damage sum', () => {
    const res = responseOf(sentinel, 'NONE');
    expect(Object.keys(res).sort()).toEqual(['bossHp', 'combatLog', 'damageDealt', 'fightDurationMs', 'fightId', 'playerDied']);
    expect(res.bossHp).toBe(20000000000);
    expect(res.fightDurationMs).toBe(60000);
    expect(res.playerDied).toBe(false);
    expect(worldBossDamageOf(decodeWorldBossLog(res.combatLog))).toBe(res.damageDealt);
  });
});

describe('tampered logs fail', () => {
  it('a shifted player swing fails player-swings', () => {
    const res = withRows(responseOf(sentinel, 'NONE'), (rows) => {
      rows.find((e) => e.type === 'attacker_hit' && e.timestamp > 20000 && !e.doubleHit).timestamp += 100;
      rows.sort((a, b) => a.timestamp - b.timestamp);
    });
    expect(rule(worldBossReplayCheck(res, { attacker: sentinel, affinity: 'NONE' }), 'player-swings').status).toBe('fail');
  });

  it('a wrong hit size fails hit-sizes', () => {
    const res = withRows(responseOf(mystic, 'NONE'), (rows) => {
      rows.find((e) => e.type === 'attacker_hit').damage += 1;
    });
    expect(rule(worldBossReplayCheck(res, { attacker: mystic, affinity: 'NONE' }), 'hit-sizes').status).toBe('fail');
  });

  it('a wrong damageDealt fails terminal', () => {
    const res = responseOf(sentinel, 'FORTIFIED');
    const report = worldBossReplayCheck({ ...res, damageDealt: res.damageDealt + 1 }, { attacker: sentinel, affinity: 'FORTIFIED' });
    expect(rule(report, 'terminal').status).toBe('fail');
    expect(report.mismatches.some((m) => /damageDealt/.test(m.message))).toBe(true);
  });

  it('an HP chain break fails hp-chain', () => {
    const res = withRows(responseOf(sentinel, 'NONE'), (rows) => {
      const e = rows.find((r) => r.type === 'attacker_crit' && r.timestamp > 10000);
      e.defenderHpAfter -= 5;
    });
    expect(rule(worldBossReplayCheck(res, { attacker: sentinel, affinity: 'NONE' }), 'hp-chain').status).toBe('fail');
  });

  it('a boss swing in a Dormant fight fails boss-swings', () => {
    const res = withRows(responseOf(sentinel, 'NONE'), (rows) => {
      const e = rows.find((r) => r.timestamp > 5000);
      rows.splice(rows.indexOf(e), 0, { ...e, type: 'defender_hit', damage: 0 });
    });
    expect(rule(worldBossReplayCheck(res, { affinity: 'NONE' }), 'boss-swings').status).toBe('fail');
  });

  it('a malformed response fails shape and skips the rest', () => {
    const report = worldBossReplayCheck({ fightId: 1, combatLog: { v: 9 } }, { attacker: sentinel, affinity: 'NONE' });
    expect(report.ok).toBe(false);
    expect(rule(report, 'shape').status).toBe('fail');
    for (const r of report.rules.slice(1)) expect(r.status).toBe('skipped');
  });
});

describe('without the attacker or the affinity', () => {
  const res = responseOf(sentinel, 'NONE');

  it('the sheet rules are skipped with the reason, and nothing passes on zero checks', () => {
    const report = worldBossReplayCheck(res);
    expect(report.ok).toBe(true);
    for (const name of ['player-swings', 'spell-schedule', 'hit-sizes']) {
      expect(rule(report, name).status, name).toBe('skipped');
      expect(rule(report, name).note, name).toMatch(/needs the attacker's sheet and the affinity/);
    }
    for (const name of ['boss-swings', 'affinity']) expect(rule(report, name).note, name).toMatch(/needs the affinity/);
    for (const r of report.rules) if (r.status === 'pass') expect(r.checked, r.rule).toBeGreaterThan(0);
  });

  it('with the affinity alone the sheet rules name the missing sheet', () => {
    const report = worldBossReplayCheck(res, { affinity: 'NONE' });
    for (const name of ['player-swings', 'spell-schedule', 'hit-sizes']) {
      expect(rule(report, name).note, name).toMatch(/needs the attacker's sheet/);
    }
    expect(rule(report, 'boss-swings').status).toBe('pass');
  });

  it('with the attacker alone the rules name the missing affinity', () => {
    const report = worldBossReplayCheck(res, { attacker: sentinel });
    expect(rule(report, 'player-swings').note).toMatch(/needs the affinity/);
  });
});
