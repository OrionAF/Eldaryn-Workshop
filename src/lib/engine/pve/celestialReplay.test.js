import { describe, it, expect } from 'vitest';
import { compareCelestialLogs, celestialLogRolls } from './celestialReplay.js';

const row = (o) => ({ timestamp: 1000, playerIndex: 0, addId: -1, damage: 0, bossHpAfter: 10, playerHpsAfter: [5, 6], ...o });

describe('compareCelestialLogs', () => {
  it('pairs rows by timestamp, type, player and add, and counts field mismatches', () => {
    const log = [row({ type: 'player_attack', damage: 3 }), row({ type: 'boss_attack', playerIndex: 1, damage: 7 })];
    const eng = [row({ type: 'player_attack', damage: 3 }), row({ type: 'boss_attack', playerIndex: 1, damage: 8 })];
    const r = compareCelestialLogs(log, eng);
    expect(r.events).toEqual({ logged: 2, matched: 2, missing: 0, extra: 0 });
    expect(r.fields.damage).toEqual({ checked: 2, failed: 1 });
    expect(r.ticksChecked).toBe(1);
    expect(r.mismatches[0]).toMatchObject({ kind: 'damage', expected: 7, actual: 8 });
  });

  it('reports a logged row the engine did not produce, and one it produced on its own', () => {
    const r = compareCelestialLogs([row({ type: 'add_attack', addId: 2 })], [row({ type: 'add_attack', addId: 3 })]);
    expect(r.events).toEqual({ logged: 1, matched: 0, missing: 1, extra: 1 });
  });

  it('compares HP with a 0.01 tolerance (the server keeps fractional HP)', () => {
    const r = compareCelestialLogs([row({ type: 'player_regen', playerHpsAfter: [5.25, 6] })], [row({ type: 'player_regen', playerHpsAfter: [5.250000001, 6] })]);
    expect(r.fields.hp).toEqual({ checked: 2, failed: 0 });
  });
});

describe('celestialLogRolls', () => {
  it('reads crits, double hits, avoids and add phases from the log', () => {
    const rolls = celestialLogRolls({ ticks: [
      row({ type: 'player_crit', isCrit: true }),
      row({ type: 'player_attack', doubleHit: true }),
      row({ type: 'add_spawn', playerIndex: -1, addId: 1, timestamp: 900 }),
      row({ type: 'add_block', playerIndex: 1, addId: 1, timestamp: 1230 }),
    ] });
    expect(rolls.crit(0, 50, 1000)).toBe(true);
    expect(rolls.double(0, 50, 1000)).toBe(true);
    expect(rolls.crit(0, 50, 1010)).toBe(false);
    expect(rolls.avoid(1, 50, 1230, 1)).toBe(true);
    expect(rolls.avoid(1, 50, 1230, -1)).toBe(false);
    expect(rolls.addPhase(1, 900)).toBe(330);
    expect(rolls.addPhase(2, 900)).toBe(1000);
  });
});
