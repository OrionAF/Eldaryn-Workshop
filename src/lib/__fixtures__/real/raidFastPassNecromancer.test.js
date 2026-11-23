// Replay check of two real Village Raid fast-pass fights (engine/pve/dungeonReplay.js in the raid mode,
// Game/combat-pve.md §21.3): `/raid/fast-pass` results for raid_2 steps 1 and 2 of 2026-11-23, both won, by
// a level-31 Necromancer with Bone Servant, Graveborn Vigor and Withering Hex. The profile captured a minute
// earlier reproduces the server's sheet (attack 10 083, attack speed 1.31), so the sheet rules run. The logs
// show that a raid waits only before its first fight: the next target is fought at once, on the swing,
// spell, minion and mob clocks that ran before, and the opening summon caps every mob's clock.
import { describe, it, expect } from 'vitest';
import log from './raid-fastpass-necromancer-r2.json';
import profile from './profile-necromancer-l31.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { buildFighter } from '../../build/fighter.js';
import { raidMobs } from '../../engine/pve/enemies.js';
import { preparePveFighter, simulatePve } from '../../engine/pve/fight.js';
import { laneRng } from '../../engine/rng.js';
import { dungeonReplayCheck, dungeonResponseOf, RAID_REPLAY_RULES } from '../../engine/pve/dungeonReplay.js';
import { verifyFightLog, detectFightKind } from '../../features/verifyLog.js';

const c = normaliseCharacter(gameProfileToCharacter(profile));
const fighter = buildFighter(c, c.activePresetId);
const rule = (report, name) => report.rules.find((r) => r.rule === name);
const fight = (n) => log.fights[n];
const verify = (result, step, attacker = fighter) => verifyFightLog({ result }, { kind: 'raid', attacker, target: { raid: 'raid_2', step } });
// a copy of fight n with `fn` applied to its rows, re-sorted by time
const mutated = (n, fn) => {
  const r = structuredClone(fight(n).result);
  fn(r.ticks);
  r.ticks.sort((a, b) => a.timestamp - b.timestamp);
  return r;
};
const row = (ticks, ts, pred = () => true) => ticks.find((e) => e.timestamp === ts && pred(e));
// the rules that need the sheet and run on these logs (the HP chain skips: a minion takes every hit)
const SHEET_RULES = ['player-swings', 'spell-schedule', 'spell-damage', 'spell-heals', 'hit-sizes'];
const MOB_RULES = ['shape', 'tick-grid', 'terminal', 'mobs', 'transitions', 'mob-swings', 'mob-hp'];

describe('real raid fast-pass logs (raid_2 steps 1-2, Necromancer L31, both won)', () => {
  it('the profile gives the server\'s sheet; the logs read as raids of the step\'s five mobs', () => {
    const p = preparePveFighter(fighter).fresh().player;
    expect([p.attack, p.attackSpeed, p.maxHp]).toEqual([10083, 1.31, 25317]);
    for (const [n, step] of [[0, 1], [1, 2]]) {
      expect(fight(n).request).toEqual({ raidId: 'raid_2', stepNumber: step });
      expect(detectFightKind({ result: fight(n).result })).toBe('raid');
      expect(raidMobs('raid_2', step)).toHaveLength(5);
    }
  });

  it('every rule it can run passes, with the sheet and without it', () => {
    for (const [n, step] of [[0, 1], [1, 2]]) {
      const report = verify(fight(n).result, step);
      expect(report.mismatches, `fight ${n}`).toEqual([]);
      expect(report.rules.map((r) => r.rule)).toEqual([...RAID_REPLAY_RULES]);
      for (const name of [...MOB_RULES, ...SHEET_RULES]) {
        expect(rule(report, name).status, `fight ${n} ${name}`).toBe('pass');
        expect(rule(report, name).checked, `fight ${n} ${name}`).toBeGreaterThan(0);
      }
      expect(rule(report, 'player-swings').note).toBe('763 ms');
      const bare = verify(fight(n).result, step, null);
      expect(bare.mismatches, `fight ${n} without the sheet`).toEqual([]);
      for (const name of MOB_RULES) expect(rule(bare, name).status, `fight ${n} ${name}`).toBe('pass');
    }
  });

  it('the next target is fought at once: a player swing 110 ms after a minion kill, on the clock that ran before', () => {
    const t = fight(1).result.ticks;
    expect(row(t, 5710, (e) => e.type === 'mob_death')).toMatchObject({ mobIndex: 1 });
    expect(row(t, 5820, (e) => e.type === 'player_attack')).toMatchObject({ mobIndex: 2 });
    // 5 060 + 760: the 763 ms clock, carried, not one restarted at the death (5 710 + 763) or after a wait
    expect(row(t, 5060, (e) => e.type === 'player_attack')).toBeTruthy();
    // the old rule (no player row in the 500 ms after a death) would not hold
    const r = mutated(1, (ticks) => { row(ticks, 5820, (e) => e.type === 'player_attack').timestamp = 6470; });
    expect(rule(verify(r, 2), 'player-swings').status).toBe('fail');
  });

  it('a tick whose spell pass killed the target still steps the clocks (mob 4 dies to Withering Hex at 11 000)', () => {
    const t = fight(1).result.ticks;
    expect(row(t, 11000, (e) => e.type === 'spell_dot_tick')).toMatchObject({ mobHpAfter: 0, mobIndex: 3 });
    const late = mutated(1, (ticks) => { row(ticks, 11160, (e) => e.type === 'player_attack').timestamp = 11170; });
    expect(rule(verify(late, 2), 'player-swings').status).toBe('fail');
    const mob = mutated(1, (ticks) => { row(ticks, 12410, (e) => e.mobIndex === 4).timestamp = 12420; });
    expect(rule(verify(mob, 2), 'mob-swings').status).toBe('fail');
  });

  it('the spells run on through every target: Withering Hex ticks every 2 s on whichever mob is fought', () => {
    const t = fight(0).result.ticks;
    expect(t.filter((e) => e.type === 'spell_dot_tick').map((e) => [e.timestamp, e.mobIndex]))
      .toEqual([[3010, 0], [5000, 1], [7000, 2], [9000, 4], [11000, 4]]);
    const moved = mutated(0, (ticks) => { row(ticks, 9000, (e) => e.type === 'spell_dot_tick').timestamp = 9500; });
    expect(rule(verify(moved, 1), 'spell-schedule').status).toBe('fail');
  });

  it('the opening summon caps every mob\'s clock at its interval less 400 ms: no swing before 2 400', () => {
    for (const n of [0, 1]) {
      const first = Math.min(...fight(n).result.ticks.filter((e) => e.type === 'minion_damaged').map((e) => e.timestamp));
      expect(first).toBe(2400);
    }
    const early = mutated(0, (ticks) => { row(ticks, 2400, (e) => e.mobIndex === 4).timestamp = 2390; });
    expect(rule(verify(early, 1), 'mob-swings').status).toBe('fail');
  });
});

describe('the app\'s raid fight for this character against the replay rules', () => {
  const prepared = preparePveFighter(fighter);
  for (const step of [1, 2]) {
    it(`raid_2 step ${step}: won, and every rule it can run passes (seeds 1-10)`, () => {
      const mobs = raidMobs('raid_2', step);
      for (let seed = 1; seed <= 10; seed++) {
        const sim = simulatePve({ fighter: prepared, enemy: mobs, mode: 'raid', rng: laneRng(seed), log: true });
        expect(sim.won, `seed ${seed}`).toBe(true);
        const response = dungeonResponseOf(sim);
        const report = dungeonReplayCheck(response, { attacker: prepared, mobs, mode: 'raid' });
        expect(report.mismatches, `seed ${seed}`).toEqual([]);
        for (const name of [...MOB_RULES, ...SHEET_RULES]) expect(rule(report, name).status, `seed ${seed} ${name}`).toBe('pass');
        // every mob's first swing comes at least 400 ms after the summon window ends
        const swings = response.result.ticks.filter((e) => e.type === 'minion_damaged' || e.type === 'mob_attack');
        expect(Math.min(...swings.map((e) => e.timestamp)), `seed ${seed}`).toBeGreaterThanOrEqual(2400);
      }
    });
  }

  it('the app reproduces both logs row for row, apart from the mobs\' swings (random start points)', () => {
    // nothing else draws: no crit, and the minion never dies, so the mobs' swings change only its HP
    const key = (e) => `${e.timestamp} ${e.type} ${e.damage} ${e.mobIndex} ${e.mobHpAfter}`;
    const keep = (rows) => rows.filter((e) => e.type !== 'minion_damaged').map(key);
    for (const [n, step] of [[0, 1], [1, 2]]) {
      for (let seed = 1; seed <= 5; seed++) {
        const sim = simulatePve({ fighter: prepared, enemy: raidMobs('raid_2', step), mode: 'raid', rng: laneRng(seed), log: true });
        expect(keep(dungeonResponseOf(sim).result.ticks), `step ${step} seed ${seed}`).toEqual(keep(fight(n).result.ticks));
        expect(sim.timeMs).toBe(fight(n).result.totalDuration);
      }
    }
  });
});
