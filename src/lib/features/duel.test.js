import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from '../build/fixtures.js';
import { runDuel } from '../engine/pvp/resolver.js';
import { pvpWinRate } from '../engine/metrics.js';
import { mulberry32 } from '../engine/rng.js';
import { newOpponent } from '../model/opponents.js';
import { runTask } from '../tasks/index.js';
import {
  duelFighter,
  opponentFighter,
  presetDuelFighter,
  cloneAsOpponent,
  missingStats,
  arrange,
  fromMySide,
  classifyDuelEvent,
  traceSummary,
} from './duel.js';

const ev = (type, damage = 0, extra = {}) => ({ timestamp: 1000, type, damage, attackerHpAfter: 1, defenderHpAfter: 1, ...extra });

describe('fighters', () => {
  it('maps build/fighter.js formKind onto the engine form field without mutating', () => {
    const f = { formKind: 'WOLF', stats: {} };
    expect(duelFighter(f)).toMatchObject({ form: 'WOLF', formKind: 'WOLF' });
    expect(f.form).toBeUndefined();
    expect(duelFighter({ form: 'BEAR' }).form).toBe('BEAR');
    expect(duelFighter({}).form).toBeNull();
  });

  it('an opponent is its sheet plus its loadout; a Druid with a Form sigil gets its form', () => {
    const o = newOpponent('MYSTIC_DRUID', 'Druid');
    o.sheet.values = { totalHp: 10000, totalAttack: 500 };
    o.utility = { species: 'DIRE_URSINE', level: 3 };
    const f = opponentFighter(o);
    expect(f.stats).toEqual({ totalHp: 10000, totalAttack: 500 });
    expect(f).toMatchObject({ class: 'MYSTIC', spec: 'MYSTIC_DRUID', form: 'BEAR', formKind: 'BEAR' });
    expect(f.formConfig.form).toBe('BEAR');
    expect(opponentFighter(newOpponent('MYSTIC_DRUID')).form).toBeNull();
  });

  it('missingStats names what a duel cannot start without', () => {
    expect(missingStats({ stats: {} })).toEqual(['HP', 'Attack']);
    expect(missingStats({ stats: { totalHp: 5, totalAttack: 0 } })).toEqual(['Attack']);
    expect(missingStats({ stats: { totalHp: 5, totalAttack: 1 } })).toEqual([]);
  });
});

describe('cloneAsOpponent', () => {
  const c = fixtureCharacter('WARRIOR');

  it('copies my effective stats and the loadout legal for the chosen spec', () => {
    const mine = presetDuelFighter(c, 'p1');
    const o = cloneAsOpponent(c, 'p1', 'WARRIOR_TANK', 'Mirror');
    expect(o).toMatchObject({ name: 'Mirror', class: 'WARRIOR', spec: 'WARRIOR_TANK' });
    expect(o.sheet.values.totalHp).toBe(mine.stats.totalHp);
    expect(o.sheet.values.totalAttack).toBe(mine.stats.totalAttack);
    expect(o.sigils.map((s) => s.species)).toEqual(mine.sigils.map((s) => s.species));
    expect(opponentFighter(o).stats.totalHp).toBe(mine.stats.totalHp);
  });

  it('cloning as another class drops sigils that class cannot use', () => {
    const o = cloneAsOpponent(c, 'p1', 'SENTINEL_MARKSMANSHIP');
    expect(o.class).toBe('SENTINEL');
    expect(o.sigils).toEqual([]);
    expect(o.sheet.values.totalHp).toBeGreaterThan(0);
  });

  it('a cloned mirror is a fair fight: roughly even over many duels from either seat', () => {
    const mine = presetDuelFighter(c, 'p1');
    const theirs = opponentFighter(cloneAsOpponent(c, 'p1', 'WARRIOR_DPS'));
    const r = pvpWinRate(mine, theirs, { n: 60, seed: 5 });
    expect(r.n).toBe(60);
    expect(r.lo).toBeLessThanOrEqual(r.p);
    expect(r.hi).toBeGreaterThanOrEqual(r.p);
    expect(r.p).toBeGreaterThan(0.1);
    expect(r.p).toBeLessThan(0.9);
  });
});

describe('sides', () => {
  it('arrange places my fighter in the chosen seat', () => {
    expect(arrange('me', 'them')).toEqual({ attacker: 'me', defender: 'them' });
    expect(arrange('me', 'them', 'defender')).toEqual({ attacker: 'them', defender: 'me' });
  });

  it('fromMySide complements the attacker win rate and flips the interval', () => {
    const s = { p: 0.7, lo: 0.6, hi: 0.78, n: 400, meanMs: 1 };
    expect(fromMySide(s, 'attacker')).toBe(s);
    const d = fromMySide(s, 'defender');
    expect(d.p).toBeCloseTo(0.3);
    expect(d.lo).toBeCloseTo(0.22);
    expect(d.hi).toBeCloseTo(0.4);
    expect(d.n).toBe(400);
  });

  it('a clearly stronger me wins from either seat; the defender view is the complement', () => {
    const c = fixtureCharacter('WARRIOR');
    const mine = presetDuelFighter(c, 'p1');
    const weak = opponentFighter(cloneAsOpponent(c, 'p1', 'WARRIOR_TANK'));
    weak.stats = { ...weak.stats, totalHp: weak.stats.totalHp / 20, totalAttack: weak.stats.totalAttack / 20 };
    const asAttacker = pvpWinRate(mine, weak, { n: 30, seed: 2 });
    const asDefender = fromMySide(pvpWinRate(weak, mine, { n: 30, seed: 2 }), 'defender');
    expect(asAttacker.p).toBe(1);
    expect(asDefender.p).toBe(1);
    expect(asDefender.lo).toBeLessThanOrEqual(asDefender.hi);
  });
});

describe('classifyDuelEvent', () => {
  it('puts swings and spells in the actor lane, avoid and status rows in the target lane', () => {
    expect(classifyDuelEvent(ev('attacker_hit', 50))).toEqual({ lane: 'attacker', mark: 'damage', amount: 50 });
    expect(classifyDuelEvent(ev('defender_crit', 90))).toMatchObject({ lane: 'defender', mark: 'damage' });
    expect(classifyDuelEvent(ev('defender_miss'))).toMatchObject({ lane: 'defender', mark: 'avoid' });
    expect(classifyDuelEvent(ev('attacker_blinded'))).toMatchObject({ lane: 'attacker', mark: 'status' });
    expect(classifyDuelEvent(ev('attacker_blind'))).toMatchObject({ lane: 'attacker', mark: 'lost' });
    expect(classifyDuelEvent(ev('defender_spell_damage', 30))).toMatchObject({ lane: 'defender', mark: 'damage' });
    expect(classifyDuelEvent(ev('attacker_spell_cast'))).toMatchObject({ lane: 'attacker', mark: 'spell' });
    expect(classifyDuelEvent(ev('attacker_regen', 10))).toMatchObject({ mark: 'heal', amount: 10 });
    expect(classifyDuelEvent(ev('attacker_minion_summoned'))).toMatchObject({ mark: 'minion' });
    expect(classifyDuelEvent(ev('defender_dead'))).toMatchObject({ lane: 'defender', mark: 'death' });
    expect(classifyDuelEvent(ev('time_up'))).toEqual({ lane: null, mark: 'end', amount: 0 });
  });

  it('classifies every row of a real traced duel without an unknown lane', () => {
    const c = fixtureCharacter('WARRIOR');
    const t = runDuel({
      attacker: presetDuelFighter(c, 'p1'),
      defender: opponentFighter(cloneAsOpponent(c, 'p1', 'WARRIOR_TANK')),
      rng: mulberry32(11),
      log: true,
    });
    expect(t.log.length).toBeGreaterThan(10);
    for (const row of t.log) {
      const k = classifyDuelEvent(row);
      expect(['attacker', 'defender', null]).toContain(k.lane);
      expect(k.mark).toBeTruthy();
    }
    expect(t.log.some((r) => classifyDuelEvent(r).mark === 'damage')).toBe(true);
  });
});

describe('traceSummary', () => {
  it('counts swings, crits, avoided and lost swings, disrupts and damage per side', () => {
    const log = [
      ev('attacker_hit', 100),
      ev('attacker_hit', 40, { doubleHit: true }), // not a second swing
      ev('attacker_crit', 300),
      ev('defender_miss'), // an attacker swing the defender avoided
      ev('defender_blinded'), // the attacker blinded the defender
      ev('defender_hit', 70),
      ev('defender_blind'), // the defender lost a swing to blindness
      ev('attacker_spell_damage', 25),
      ev('time_up'),
    ];
    const s = traceSummary(log);
    expect(s.attacker).toEqual({ swings: 3, crits: 1, avoided: 1, lost: 0, disrupts: 1, damage: 465 });
    expect(s.defender).toEqual({ swings: 2, crits: 0, avoided: 0, lost: 1, disrupts: 0, damage: 70 });
    expect(traceSummary(null).attacker.swings).toBe(0);
  });
});

describe('duel task', () => {
  const c = fixtureCharacter('MYSTIC');
  const mine = presetDuelFighter(c, 'p1');
  const theirs = opponentFighter(cloneAsOpponent(c, 'p1', 'MYSTIC_DRUID'));

  it('runs Fighters straight from buildFighter (formKind) and a different traceSeed gives a different trace', async () => {
    expect(mine.formKind).toBe('BEAR');
    const a = await runTask('duel', { attacker: mine, defender: theirs, n: 4, seed: 3, trace: true });
    expect(a.n).toBe(4);
    expect(a.trace.length).toBeGreaterThan(5);
    const b = await runTask('duel', { attacker: mine, defender: theirs, n: 0, trace: true, traceSeed: 99 });
    expect(b.n).toBe(0);
    expect(b.trace).not.toEqual(a.trace);
    const again = await runTask('duel', { attacker: mine, defender: theirs, n: 0, seed: 3, trace: true });
    expect(again.trace).toEqual(a.trace);
  });
});
