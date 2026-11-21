// Replay check of a real Necromancer dungeon log (engine/pve/dungeonReplay.js, Game/combat-pve.md §21):
// a `/dungeon/fight-prepare` response for Howling Ruins (dungeon_2) step 3, captured 2026-11-21 by the live
// feed. The Necromancer fights with a Bone Servant, so the log holds the minion pass fight.js ports: the
// opening summon on the first fight's start (its clocks wait for `summonReadyMs`), the minion's swings
// taking HP off the mob, the mobs swinging at the minion while it lives, and the Soul Link heal after the
// killing blow. There is no profile for this character, so the sheet rules report skipped; a fixture
// Necromancer run through the app's own fight checks the opening's swing clocks with a sheet.
import { describe, it, expect } from 'vitest';
import log from './dungeon-prepare-necromancer-d2s3.json';
import { fixtureCharacter } from '../../build/fixtures.js';
import { buildFighter } from '../../build/fighter.js';
import { dungeonMobs } from '../../engine/pve/enemies.js';
import { preparePveFighter, simulatePve } from '../../engine/pve/fight.js';
import { laneRng } from '../../engine/rng.js';
import { dungeonReplayCheck, dungeonResponseOf } from '../../engine/pve/dungeonReplay.js';
import { verifyFightLog } from '../../features/verifyLog.js';

const mobs = dungeonMobs('dungeon_2', 3);
const rule = (report, name) => report.rules.find((r) => r.rule === name);
const clone = () => JSON.parse(JSON.stringify(log));
const NO_SHEET = ['player-swings', 'spell-schedule', 'spell-damage', 'spell-heals', 'hit-sizes', 'hp-chain', 'shield-chain'];

describe('real dungeon prepare log (dungeon_2 step 3, Necromancer with Bone Servant)', () => {
  it('is the step\'s three mobs, opening on a minion summon', () => {
    expect(mobs.map((m) => m.name)).toEqual(['Dire Wolf', 'Stone Golem', 'Crypt Ghoul']);
    expect(log.ticks[0]).toMatchObject({ timestamp: 500, type: 'minion_summoned', summonReadyMs: 2000 });
  });

  it('passes every rule it can check through Verify, with and without the step', () => {
    for (const target of [{}, { dungeon: 'dungeon_2', step: 3 }]) {
      const report = verifyFightLog(log, { kind: 'dungeon', target });
      expect(report.mismatches, JSON.stringify(target)).toEqual([]);
      expect(report.ok).toBe(true);
      for (const name of ['shape', 'tick-grid', 'terminal', 'transitions', 'mob-hp']) {
        expect(rule(report, name).status, name).toBe('pass');
      }
      for (const name of NO_SHEET) expect(rule(report, name).status, name).toBe('skipped');
    }
    const report = verifyFightLog(log, { kind: 'dungeon', target: { dungeon: 'dungeon_2', step: 3 } });
    expect(rule(report, 'mobs').status).toBe('pass');
    expect(rule(report, 'mob-swings').status).toBe('pass');
    // 4 + 6 + 6 swings: on the minion while it lives, on the player after it died at 14 120
    expect(rule(report, 'mob-swings').note).toBe('1429 / 1667 / 833 ms');
    expect(rule(report, 'mob-hp').checked).toBe(168);
  });

  it('the minion\'s swings take HP off the mob', () => {
    const d = clone();
    d.ticks[5].damage += 1; // the first minion_hit
    expect(rule(dungeonReplayCheck(d, { mobs }), 'mob-hp').status).toBe('fail');
  });

  it('the mobs\' swings at the minion keep their clock', () => {
    const d = clone();
    d.ticks[8].timestamp = 3440; // the Dire Wolf's first swing, at the Bone Servant
    expect(rule(dungeonReplayCheck(d, { mobs }), 'mob-swings').status).toBe('fail');
  });

  it('nothing but the opening summon happens inside its window', () => {
    const d = clone();
    d.ticks[1].timestamp = d.ticks[2].timestamp = d.ticks[3].timestamp = 2000;
    const report = dungeonReplayCheck(d, { mobs });
    expect(rule(report, 'transitions').status).toBe('fail');
    expect(report.mismatches.find((m) => m.rule === 'transitions').message).toMatch(/opening summon window/);
  });

  it('only the minion\'s end-of-tick rows may follow a mob_death', () => {
    const d = clone();
    d.ticks[40] = { ...d.ticks[40], type: 'minion_hit', damage: 0 };
    expect(rule(dungeonReplayCheck(d, { mobs }), 'transitions').status).toBe('fail');
  });
});

describe('the app\'s own Necromancer dungeon fight', () => {
  // dungeon_4 step 4: the fixture kills dungeon_2's mobs before they swing; here both sides swing, and the
  // minion's Soul Link heal follows a kill
  it('a fixture Deathlord with Bone Servant passes the swing clocks after the opening summon', () => {
    const ch = fixtureCharacter('NECROMANCER');
    const prepared = preparePveFighter(buildFighter(ch, ch.presets[0].id));
    const step = dungeonMobs('dungeon_4', 4);
    for (const seed of [1, 2, 3]) {
      const sim = simulatePve({ fighter: prepared, enemy: step, mode: 'dungeon', rng: laneRng(seed), log: true });
      const res = dungeonResponseOf(sim, { shieldMax: prepared.fresh().player.shieldMax });
      const ticks = res.result.ticks;
      expect(ticks[0].type, `seed ${seed}`).toBe('minion_summoned');
      // the end-of-tick minion rows stay on the mob that died, as the server's log has them
      ticks.forEach((e, i) => {
        if (i && ticks[i - 1].type === 'mob_death' && e.timestamp === ticks[i - 1].timestamp) expect(e.mobIndex).toBe(ticks[i - 1].mobIndex);
      });
      const report = dungeonReplayCheck(res, { attacker: prepared, mobs: step });
      expect(report.mismatches, `seed ${seed}`).toEqual([]);
      for (const name of ['tick-grid', 'terminal', 'mobs', 'transitions', 'mob-hp', 'player-swings', 'mob-swings']) {
        const r = rule(report, name);
        expect(r.status, `seed ${seed} ${name}: ${r.note ?? ''}`).toBe('pass');
        expect(r.checked, name).toBeGreaterThan(0);
      }
    }
  });
});
