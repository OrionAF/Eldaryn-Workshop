// Replay check of real village raid steps (engine/pve/dungeonReplay.js in the raid mode, Game/combat-pve.md
// §21.1). Two logs of the user's Mystic Mage: a /raid/fight-prepare response of raid_4 step 8 (level 74,
// lost before any mob died) and a /raid/fight-resolve result of raid_5 step 4 (mob 1 dies at 4 000, the
// player at 4 440, in the gap before the next fight). No profile fixture reproduces either sheet (HP
// 913 693 / 3 803 683; the Mystic fixtures are level 50, 79 and 80), so the real logs run without the
// attacker and the sheet rules report skipped. The app's own raid fights run through every rule with an
// attacker.
import { describe, it, expect } from 'vitest';
import run from './raid-run-mystic-r4s8.json';
import run2 from './raid-run-mystic-r5s4.json';
import profile from './profile-mystic-l50.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { buildFighter } from '../../build/fighter.js';
import { raidMobs } from '../../engine/pve/enemies.js';
import { preparePveFighter, simulatePve } from '../../engine/pve/fight.js';
import { laneRng } from '../../engine/rng.js';
import { dungeonReplayCheck, dungeonResponseOf, RAID_REPLAY_RULES } from '../../engine/pve/dungeonReplay.js';

const mobs = raidMobs('raid_4', 8);
const check = (log, opts = {}) => dungeonReplayCheck(log, { mobs, mode: 'raid', ...opts });
const rule = (report, name) => report.rules.find((r) => r.rule === name);
const clone = () => JSON.parse(JSON.stringify(run));
const resort = (log) => log.ticks.sort((a, b) => a.timestamp - b.timestamp);
const at = (log, ts, mobIndex) => log.ticks.find((e) => e.timestamp === ts && e.mobIndex === mobIndex);
const SHEET_RULES = ['player-swings', 'spell-schedule', 'spell-damage', 'spell-heals', 'regen', 'hp-chain', 'shield-chain'];

describe('real raid log (raid_4 step 8, Mystic L74, lost at 2450 ms)', () => {
  it('the mobs are the step\'s five, and every mob hit is that mob\'s attack in full', () => {
    expect(mobs.map((m) => m.name)).toEqual(['Shadow Stalker', 'Shadow Wraith', 'Shadow Ghoul', 'Void Devourer', 'Zarketh, Shadow Overlord']);
    for (const e of run.ticks.filter((r) => r.type === 'mob_attack' || r.type === 'player_death')) expect(e.damage).toBe(mobs[e.mobIndex].attack);
  });

  it('without the attacker no rule fails; the sheet rules skip with a reason; the mob side checks something', () => {
    const report = check(run);
    expect(report.mismatches).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.rules.map((r) => r.rule)).toEqual([...RAID_REPLAY_RULES]);
    for (const name of SHEET_RULES) {
      expect(rule(report, name).status, name).toBe('skipped');
      expect(rule(report, name).note, name).toMatch(/needs the attacker's sheet/);
    }
    for (const name of ['shape', 'tick-grid', 'terminal', 'mobs', 'transitions', 'mob-swings', 'hit-sizes', 'mob-hp', 'ledger', 'shield-cap']) {
      expect(rule(report, name).status, name).toBe('pass');
      expect(rule(report, name).checked, name).toBeGreaterThan(0);
    }
    expect(rule(report, 'terminal').note).toMatch(/loss/);
    // one swing per row: mobs 1 and 4 swing twice, the others once
    expect(rule(report, 'mob-swings').checked).toBe(7);
    expect(rule(report, 'mob-swings').note).toMatch(/^1429 \/ 909 \/ 1667 \/ 2000 \/ 1667 ms/);
    expect(rule(report, 'hit-sizes').checked).toBe(6);
    expect(rule(report, 'ledger').note).toMatch(/max HP 913693, pulse 8680 every 100 ms, shield 1096431; vamp heals refill the shield whole, pulses by the overflow/);
  });

  it('works on the capture as saved (fightId and keys present)', () => {
    const raw = { ...clone(), fightId: 'f-0001', keys: { a: 'x' } };
    delete raw._note;
    const report = check(raw);
    expect(report.ok).toBe(true);
    expect(report.rules.map((r) => [r.rule, r.status])).toEqual(check(run).rules.map((r) => [r.rule, r.status]));
  });

  it('the dungeon mode does not fit a raid log: the mobs behind the target break its shape', () => {
    expect(dungeonReplayCheck(run, { mobs }).ok).toBe(false);
  });

  it('a bystander swing shifted by 10 ms fails its clock', () => {
    const l = clone();
    at(l, 2020, 1).timestamp += 10;
    resort(l);
    expect(rule(check(l), 'mob-swings').status).toBe('fail');
    const k = clone();
    // the killing swing 1 680 ms after the first: a 1 667 ms clock on 10 ms ticks gives 1 660 or 1 670
    at(k, 2450, 4).timestamp += 10;
    k.totalDuration = 2460;
    expect(rule(check(k), 'mob-swings').status).toBe('fail');
    const e = clone();
    at(e, 2450, 4).timestamp -= 10; // 1 660 is a legal gap (a carry of 7-9 ms after the first swing)
    e.totalDuration = 2440;
    expect(rule(check(e), 'mob-swings').status).toBe('pass');
  });

  it('a wrong bystander hit size fails', () => {
    const l = clone();
    at(l, 2020, 1).damage = 600000;
    expect(rule(check(l), 'hit-sizes').status).toBe('fail');
    const k = clone();
    at(k, 1340, 2).damage = 500000; // above Shadow Ghoul's 484 000 attack
    expect(rule(check(k), 'hit-sizes').status).toBe('fail');
  });

  it('a shield value off the rebuilt chain fails', () => {
    const l = clone();
    // 710 434 at 1 700, three full-HP pulses of 8 680, then Shadow Wraith's 638 000: 98 474
    at(l, 2020, 1).playerShieldHp = 98000;
    const report = check(l);
    expect(rule(report, 'ledger').status).toBe('fail');
    expect(report.mismatches.find((m) => m.rule === 'ledger')).toMatchObject({ timestamp: 2020, expected: 98474, actual: 98000 });
  });

  it('a bystander row that shows the mob hurt fails mob-hp', () => {
    const l = clone();
    at(l, 1110, 1).mobHpAfter -= 1;
    expect(rule(check(l), 'mob-hp').status).toBe('fail');
  });
});

describe('real raid log with a mob death (raid_5 step 4, lost at 4440 ms in the gap after mob 1 died)', () => {
  const mobs2 = raidMobs('raid_5', 4);
  const check2 = (log) => dungeonReplayCheck(log, { mobs: mobs2, mode: 'raid' });
  const clone2 = () => JSON.parse(JSON.stringify(run2));
  const ticks = (log) => log.result.ticks;
  const at2 = (log, ts, mobIndex) => ticks(log).find((e) => e.timestamp === ts && e.mobIndex === mobIndex);

  it('every mob hit is that mob\'s attack in full; mob 1 dies at 4000 and the player at 4440', () => {
    for (const e of ticks(run2).filter((r) => r.type === 'mob_attack' || r.type === 'player_death')) expect(e.damage).toBe(mobs2[e.mobIndex].attack);
    expect(ticks(run2).find((e) => e.type === 'mob_death')).toMatchObject({ timestamp: 4000, mobIndex: 0 });
    expect(run2.result).toMatchObject({ success: false, totalDuration: 4440, mobsDefeated: 1, playerHpRemaining: 0 });
  });

  it('without the attacker no rule fails; the sheet rules skip with a reason; the mob side checks something', () => {
    const report = check2(run2);
    expect(report.mismatches).toEqual([]);
    expect(report.ok).toBe(true);
    for (const name of SHEET_RULES) expect(rule(report, name).status, name).toBe('skipped');
    for (const name of ['shape', 'tick-grid', 'terminal', 'mobs', 'transitions', 'mob-swings', 'hit-sizes', 'mob-hp', 'ledger', 'shield-cap']) {
      expect(rule(report, name).status, name).toBe('pass');
      expect(rule(report, name).checked, name).toBeGreaterThan(0);
    }
    // every logged mob swing, the four in the gap included
    expect(rule(report, 'mob-swings').checked).toBe(16);
    expect(rule(report, 'ledger').note).toMatch(/max HP 3803683, pulse 18258 every 100 ms, shield 7394359; .* pulses whole/);
  });

  it('works on the resolve response as captured (action, keys, progress around the result)', () => {
    const raw = { action: 'x', result: clone2().result, keys: { a: 'x' }, progress: {}, influence: {}, newlyCompletedQuests: [] };
    expect(check2(raw).rules.map((r) => [r.rule, r.status])).toEqual(check2(run2).rules.map((r) => [r.rule, r.status]));
  });

  it('the mobs keep their clocks through the gap: a gap swing moved by 10 ms fails', () => {
    const l = clone2();
    at2(l, 4080, 2).timestamp += 10; // 1 440 after 2 650 on a 1 429 ms clock (1 420 or 1 430)
    ticks(l).sort((a, b) => a.timestamp - b.timestamp);
    expect(rule(check2(l), 'mob-swings').status).toBe('fail');
  });

  it('the next target keeps its own clock: a swing on a clock reset at the death, or a paused one, fails', () => {
    const reset = clone2();
    at2(reset, 4170, 1).timestamp = 4380; // a fresh clock from the death could swing here; 1 210 after 3 170
    ticks(reset).sort((a, b) => a.timestamp - b.timestamp);
    expect(rule(check2(reset), 'mob-swings').status).toBe('fail');
    const paused = clone2();
    // a clock paused in the gap would swing at 4 670, after the log ends: drop the 4 170 swing
    const i = ticks(paused).findIndex((e) => e.timestamp === 4170 && e.mobIndex === 1);
    ticks(paused).splice(i, 1);
    expect(rule(check2(paused), 'mob-swings').status).toBe('fail');
  });

  it('regen keeps pulsing in the gap: HP at 4120 without the 4100 pulse fails the ledger', () => {
    const l = clone2();
    // 1 885 649 + 18 258 (the 4 100 pulse at full HP) - 2 304 000 leaves 3 803 683 - 400 093 = 3 403 590
    at2(l, 4120, 4).playerHpAfter -= 18258;
    const report = check2(l);
    expect(rule(report, 'ledger').status).toBe('fail');
    expect(report.mismatches.find((m) => m.rule === 'ledger')).toMatchObject({ timestamp: 4120, expected: 3403590 });
  });

  it('every row of a tick carries the shield at its end (2170: the target\'s blinded swing, then mob 2\'s hit)', () => {
    const l = clone2();
    at2(l, 2170, 0).playerShieldHp = 4427391; // the shield before mob 2's 2 080 000 hit
    expect(rule(check2(l), 'ledger').status).toBe('fail');
  });
});

describe('the app\'s raid fight (simulatePve raid mode) against the replay rules', () => {
  const c = normaliseCharacter(gameProfileToCharacter(profile));
  const prepared = preparePveFighter(buildFighter(c, c.activePresetId));
  const shieldMax = prepared.fresh().player.shieldMax;
  const cases = [['raid_3', 7, true], ['raid_3', 8, false]];
  for (const [id, step, won] of cases) {
    it(`${id} step ${step}: every rule passes with substantive checks, none skipped (seeds 1-10)`, () => {
      const stepMobs = raidMobs(id, step);
      for (let seed = 1; seed <= 10; seed++) {
        const sim = simulatePve({ fighter: prepared, enemy: stepMobs, mode: 'raid', rng: laneRng(seed), log: true });
        expect(sim.won, `seed ${seed}`).toBe(won);
        const response = dungeonResponseOf(sim, { shieldMax });
        // the mobs behind the first target swing during its fight
        expect(response.result.ticks.filter((e, i, a) => e.mobIndex > 0 && a.slice(0, i).every((r) => r.type !== 'mob_death')).length).toBeGreaterThan(0);
        const report = dungeonReplayCheck(response, { attacker: prepared, mobs: stepMobs, mode: 'raid' });
        expect(report.mismatches, `seed ${seed}`).toEqual([]);
        expect(report.rules.map((r) => r.rule)).toEqual([...RAID_REPLAY_RULES]);
        for (const r of report.rules) {
          expect(r.status, `seed ${seed} ${r.rule}: ${r.note ?? ''}`).toBe('pass');
          expect(r.checked, `seed ${seed} ${r.rule}`).toBeGreaterThan(0);
        }
        // four target deaths: five fights, plus a check per row logged in a gap
        if (won) expect(rule(report, 'transitions').checked).toBeGreaterThanOrEqual(13);
      }
    });
  }

  it('the app\'s rows for the mobs behind the target carry their own index and full HP', () => {
    const stepMobs = raidMobs('raid_3', 8);
    const sim = simulatePve({ fighter: prepared, enemy: stepMobs, mode: 'raid', rng: laneRng(1), log: true });
    const behind = dungeonResponseOf(sim, { shieldMax }).result.ticks.filter((e) => e.mobIndex > 0);
    expect(behind.length).toBeGreaterThan(0);
    for (const e of behind) expect(e.mobHpAfter).toBe(stepMobs[e.mobIndex].hp);
  });

  it('the app runs the mobs and the regen pulse through the 500 ms after a target dies', () => {
    const stepMobs = raidMobs('raid_3', 7);
    const sim = simulatePve({ fighter: prepared, enemy: stepMobs, mode: 'raid', rng: laneRng(1), log: true });
    const t = dungeonResponseOf(sim, { shieldMax }).result.ticks;
    const gapRows = [];
    let death = null;
    for (const e of t) {
      if (e.type === 'mob_death') death = e.timestamp;
      else if (death !== null && e.timestamp > death && e.timestamp <= death + 500) gapRows.push(e);
    }
    expect(gapRows.some((e) => e.type === 'mob_attack')).toBe(true);
    expect(gapRows.every((e) => e.type === 'mob_attack' || e.type === 'player_regen' || e.type === 'player_block')).toBe(true);
  });
});
