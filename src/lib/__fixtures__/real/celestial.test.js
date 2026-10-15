// Golden replay of the five Celestial Trial server logs (2026-10-15): the engine, driven by the rolls
// each log reveals, must reproduce every logged event and field (engine/pve/celestialReplay.js).
// A tick the engine cannot reproduce is listed in KNOWN with its reason (and in Game/combat-pve.md
// §20.9); nothing is skipped silently.
import { describe, it, expect } from 'vitest';
import { CELESTIAL_LOGS } from './celestialParties.js';
import { celestialReplay } from '../../engine/pve/celestialReplay.js';

/** Logged fields the engine does not reproduce, per log: [timestamp, field, type, reason]. */
const KNOWN = {
  'hard-l95': [
    [66790, 'playerHpsAfter[1]', 'spell_cast', 'Earthwarden cast row shows the tank HP from before the tick\'s two add hits'],
    [66790, 'playerHpsAfter[1]', 'spell_buff_start', 'same row pair as the cast'],
  ],
};

// per-log totals: events, compared HP fields, and the outcome
const EXPECT = {
  'hard-l85': { events: 3157, hp: 6314, won: true, timeMs: 145000 },
  'normal-l85': { events: 1123, hp: 2246, won: true, timeMs: 75300 },
  'hard-l85-overload-loss': { events: 1426, hp: 2852, won: false, timeMs: 72570 },
  'normal-l85-b': { events: 1032, hp: 2064, won: true, timeMs: 71490 },
  'hard-l95': { events: 7270, hp: 14540, won: true, timeMs: 307630 },
};

describe.each(CELESTIAL_LOGS.map((l) => [l.id, l]))('Celestial replay: %s', (id, L) => {
  const report = celestialReplay(L.fight, {
    party: L.party(), difficulty: L.difficulty, tactics: L.tactics, stackPlayerIndex: L.stackPlayerIndex,
    resync: L.resync, maxMismatches: 100,
  });
  const exp = EXPECT[id];
  const known = KNOWN[id] ?? [];

  it('produces every logged event, in order, and nothing else', () => {
    expect(report.events).toEqual({ logged: exp.events, matched: exp.events, missing: 0, extra: 0 });
  });

  it('ends the same way at the same tick', () => {
    expect(report.engine).toEqual({ won: exp.won, timeMs: exp.timeMs });
    expect(report.server).toEqual({ won: exp.won, timeMs: exp.timeMs });
  });

  it('matches damage, boss HP, add HP, Block Fury, stacks, Chrono Flux and Burden on every row', () => {
    for (const [f, rec] of Object.entries(report.fields)) {
      if (f === 'hp') continue;
      expect(rec.failed, f).toBe(0);
    }
    expect(report.fields.damage.checked).toBe(exp.events);
    expect(report.fields.bossHpAfter.checked).toBe(exp.events);
  });

  it('matches every player HP value except the listed ticks', () => {
    expect(report.fields.hp.checked).toBe(exp.hp);
    expect(report.fields.hp.failed).toBe(known.length);
    expect(report.mismatches.map((m) => [m.timestamp, m.kind, m.type])).toEqual(known.map((k) => k.slice(0, 3)));
  });
});
