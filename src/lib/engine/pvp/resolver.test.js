import { describe, it, expect } from 'vitest';
import { simulateArenaPvP, runDuel, fighterDuelArgs } from './resolver.js';
import { applyPvpHpBuff } from './hpBuff.js';
import { parseEventType, duelEvent, SIDE_EVENT_KINDS } from './events.js';
import { mulberry32, scripted } from '../rng.js';

// Displayed sheet; the resolver tests apply the x8 PVP HP buff like the server does.
const sheet = (o = {}) => applyPvpHpBuff({
  totalHp: 1000, totalAttack: 100, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0, totalPvpAttack: 0,
  totalPvpDefense: 0, ...o,
});

// Bare duel: no spells, sigils, glyphs, shields or minions.
const bare = (a, d, opts) => simulateArenaPvP(a, d, null, null, null, null, null, null, null, null, null, null, null, null, opts);
const noCrit = () => 0.99; // every swing draws once (crit) and never crits at critChance 0

describe('simulateArenaPvP: the clock (L1456045-1457310)', () => {
  it('10 ms ticks; the first swing lands when the timer reaches round(1000 / speed); the attacker swings first', () => {
    const r = bare(sheet({ totalAttackSpeed: 2 }), sheet({ totalAttackSpeed: 1 }), { rng: noCrit });
    const hits = r.ticks.filter((e) => e.type.endsWith('_hit'));
    expect(hits.slice(0, 4).map((e) => [e.timestamp, e.type])).toEqual([
      [500, 'attacker_hit'],
      [1000, 'attacker_hit'], // same tick: attacker before defender
      [1000, 'defender_hit'],
      [1500, 'attacker_hit'],
    ]);
    expect(r.ticks.every((e) => e.timestamp % 10 === 0)).toBe(true);
  });

  it('the last processed tick is t = FIGHT_DURATION_MS (60000) without minions', () => {
    const r = bare(sheet({ totalAttack: 0 }), sheet({ totalAttack: 0 }), { rng: noCrit });
    expect(r.totalDuration).toBe(60000);
    // swings at speed 1 from t=1000 to t=60000: 60 per side, one draw each
    expect(r.ticks.filter((e) => e.type === 'attacker_hit')).toHaveLength(60);
    expect(r.ticks.filter((e) => e.type === 'defender_hit')).toHaveLength(60);
  });

  it('a swing row carries the HP after the whole swing, clamped at 0 (L1457089-1457120)', () => {
    const r = bare(sheet({ totalAttack: 300 }), sheet(), { rng: noCrit });
    const first = r.ticks[0];
    expect(first).toEqual({ timestamp: 1000, type: 'attacker_hit', damage: 300, attackerHpAfter: 8000, defenderHpAfter: 7700 });
    // the defender's row in the same tick is stamped after its own swing
    expect(r.ticks[1]).toEqual({ timestamp: 1000, type: 'defender_hit', damage: 100, attackerHpAfter: 7900, defenderHpAfter: 7700 });
  });

  it('draw order: one crit draw per swing, attacker then defender', () => {
    // speed 1 both: 2 draws per second -> exactly 120 draws over 60 s with no other randomness
    const rng = scripted(Array(120).fill(0.99));
    const r = bare(sheet({ totalAttack: 0 }), sheet({ totalAttack: 0 }), { rng });
    expect(rng.draws).toBe(120);
    expect(r.attackerWon).toBe(false);
  });
});

describe('simulateArenaPvP: time up (L1457456-1457524)', () => {
  it('goes to strictly higher RAW HP, not percentage', () => {
    // attacker 16000 max, loses 60 x 10 = 600 -> 15400 (96 %); defender untouched 8000 (100 %)
    const r = bare(sheet({ totalHp: 2000, totalAttack: 0 }), sheet({ totalAttack: 10 }), { rng: noCrit });
    expect(r.attackerHpRemaining).toBe(15400);
    expect(r.defenderHpRemaining).toBe(8000);
    expect(r.attackerWon).toBe(true);
    expect(r.ticks.slice(-2)).toEqual([
      { timestamp: 60000, type: 'time_up', damage: 0, attackerHpAfter: 15400, defenderHpAfter: 8000 },
      { timestamp: 60000, type: 'defender_dead', damage: 0, attackerHpAfter: 15400, defenderHpAfter: 8000 },
    ]);
  });

  it('a tie goes to the defender', () => {
    const r = bare(sheet({ totalAttack: 0 }), sheet({ totalAttack: 0 }), { rng: noCrit });
    expect(r.attackerHpRemaining).toBe(r.defenderHpRemaining);
    expect(r.attackerWon).toBe(false);
    expect(r.ticks.at(-1).type).toBe('attacker_dead');
  });

  it('reports both x8 pools', () => {
    const r = bare(sheet({ totalHp: 1234 }), sheet(), { rng: noCrit, log: false });
    expect(r.attackerMaxHp).toBe(9872);
    expect(r.defenderMaxHp).toBe(8000);
  });
});

describe('simulateArenaPvP: deaths and the mutual kill (L1457311-1457455, L1457525-1457543)', () => {
  // totalHp 10 -> 80 HP pools; both swing at t=1000 for 100+: the defender still swings after dying.
  it('a defender killed by the first swing still swings back; equal HP -> the defender wins', () => {
    const r = bare(sheet({ totalHp: 10 }), sheet({ totalHp: 10 }), { rng: noCrit });
    expect(r.ticks.map((e) => e.type)).toEqual(['attacker_hit', 'defender_hit', 'attacker_dead']);
    expect(r.ticks[2]).toEqual({ timestamp: 1000, type: 'attacker_dead', damage: 0, attackerHpAfter: 0, defenderHpAfter: 0 });
    expect(r.attackerWon).toBe(false);
    expect(r.totalDuration).toBe(1000);
    expect(r.attackerHpRemaining).toBe(0);
    expect(r.defenderHpRemaining).toBe(0);
  });

  it('the less negative unclamped HP wins the mutual kill', () => {
    // A hits for 110 -> D at -30; D hits for 100 -> A at -20: A is higher
    const r = bare(sheet({ totalHp: 10, totalAttack: 110 }), sheet({ totalHp: 10 }), { rng: noCrit });
    expect(r.attackerWon).toBe(true);
    expect(r.ticks.at(-1)).toEqual({ timestamp: 1000, type: 'defender_dead', damage: 0, attackerHpAfter: 0, defenderHpAfter: 0 });
    const r2 = bare(sheet({ totalHp: 10 }), sheet({ totalHp: 10, totalAttack: 110 }), { rng: noCrit });
    expect(r2.attackerWon).toBe(false);
  });

  it('a one-sided kill ends the fight on that tick with the loser\'s dead row', () => {
    // A swings at 500 ms (speed 2) for 100 x 1: D (80 HP) dies before its own first swing at 1000 ms
    const r = bare(sheet({ totalAttackSpeed: 2 }), sheet({ totalHp: 10 }), { rng: noCrit });
    expect(r.ticks.map((e) => [e.timestamp, e.type])).toEqual([[500, 'attacker_hit'], [500, 'defender_dead']]);
    expect(r.attackerWon).toBe(true);
    expect(r.attackerHpRemaining).toBe(8000);
  });
});

describe('simulateArenaPvP: regen pulse and status timers', () => {
  it('regen heals every 100 ms off rawMaxHp and logs unclamped HP (L1456886-1456988)', () => {
    // A: 1000 raw, 8000 pool, regen 10 % -> max(1, round(1000 * 10 / 100 / 10)) = 10 per pulse
    const r = bare(sheet({ totalHpRegen: 10, totalAttack: 0 }), sheet({ totalAttack: 50 }), { rng: noCrit });
    const regen = r.ticks.filter((e) => e.type === 'attacker_regen');
    expect(regen[0]).toEqual({ timestamp: 1100, type: 'attacker_regen', damage: 10, attackerHpAfter: 7960, defenderHpAfter: 8000 });
  });

  it('a paralyzed swinger loses its swing (status set on the copy is synced back, then counts down)', () => {
    // A paralyzes on every hit (draws: crit, paralyze); D's swing at 1000 ms is lost
    const rng = scripted([0.99, 0.0, ...Array(400).fill(0.99)]);
    const r = bare(sheet({ totalParalyzeChance: 50 }), sheet(), { rng });
    expect(r.ticks.slice(0, 3).map((e) => e.type)).toEqual(['attacker_hit', 'defender_paralyzed', 'defender_paralyze']);
    expect(r.ticks.find((e) => e.type === 'defender_hit').timestamp).toBe(2000);
  });
});

// Fighters exercising spells, debuffs, stacks, thorns, shields and minions.
const fighter = (cls, spec, sigils, o = {}, extra = {}) => ({
  class: cls,
  spec,
  sigils: sigils.map((species) => ({ species, level: 5 })),
  stats: {
    totalHp: 20000, totalAttack: 900, totalAttackSpeed: 1.6, totalDoubleHit: 12, totalCritChance: 25,
    totalCritDamage: 1.8, totalLifesteal: 6, totalHpRegen: 4, totalDamageReduction: 15, totalBlockChance: 8,
    totalMissChance: 0, totalBlindChance: 6, totalParalyzeChance: 4, totalPenetration: 20, totalPvpAttack: 60,
    totalPvpDefense: 80, totalDisruptionChance: 5, totalSpellDamage: 20, totalSpellCritChance: 15,
    totalSpellVamp: 5, totalSpellResist: 10, totalMinionAttack: 10, totalMinionHealth: 10, totalMinionCritChance: 10,
    totalMinionLifesteal: 5, totalSoulLink: 10, totalMinionAttackSpeed: 0, ...o,
  },
  ...extra,
});
const warrior = fighter('WARRIOR', 'WARRIOR_TANK', ['BLADE_OF_JUDGMENT', 'IRON_BASTION', 'HEMORRHAGE', 'BULWARK_OF_THORNS']);
const sentinel = fighter('SENTINEL', 'SENTINEL_DISRUPTION', ['CRIMSON_ARROW', 'VENOM_WOUND', 'SIEGEBREAKER_MARK', 'ELUSIVE_SUPREMACY'],
  { totalMissChance: 12, totalBlockChance: 0, totalDisruptionChance: 8, totalDisruptionEffect: undefined }, { conditions: {} });
const mystic = fighter('MYSTIC', 'MYSTIC_MAGE', ['ARCANE_SHARD', 'WITHERING_BRAND', 'ARCANE_SURGE'], {},
  { utility: { species: 'ARCANE_BARRIER', level: 5 } });
const necro = fighter('NECROMANCER', 'NECROMANCER_DEATHLORD', ['SOUL_SPIKE', 'GRAVEBORN_VIGOR', 'GRAVE_ROT'], {},
  { utility: { species: 'BONE_SERVANT', level: 5 } });

const counted = (seed) => {
  const base = mulberry32(seed);
  const rng = () => { rng.n++; return base(); };
  rng.n = 0;
  return rng;
};

describe('fighterDuelArgs', () => {
  it('builds spells, stack sources, shield and summon from a Fighter, with the x8 HP buff', () => {
    const m = fighterDuelArgs(mystic);
    expect(m.stats.totalHp).toBe(160000);
    expect(m.stats.pvpBaseHp).toBe(20000);
    expect(m.shield.hpPercent).toBeGreaterThan(0);
    expect(m.spells.length).toBeGreaterThan(0);
    const n = fighterDuelArgs(necro);
    expect(n.summon?.species).toBe('BONE_SERVANT');
    expect(fighterDuelArgs(warrior).equipped).toContain('BULWARK_OF_THORNS');
  });
});

describe('runDuel: event-free mode equals log mode for the same seed', () => {
  const pairs = [['warrior', warrior, sentinel], ['mystic', mystic, warrior], ['necro', necro, mystic], ['necro-mirror', necro, necro],
    ['sentinel', sentinel, necro]];
  for (const [name, a, d] of pairs) {
    it(`${name}: same outcome, HP, duration and number of draws`, () => {
      for (const seed of [1, 2, 3]) {
        const r1 = counted(seed);
        const r2 = counted(seed);
        const withLog = runDuel({ attacker: a, defender: d, rng: r1, log: true });
        const without = runDuel({ attacker: a, defender: d, rng: r2, log: false });
        expect(without.log).toBeUndefined();
        expect(without.result.ticks).toEqual([]);
        expect(withLog.log.length).toBeGreaterThan(0);
        const strip = ({ result, log, ...rest }) => ({ ...rest, ...result, ticks: undefined });
        expect(strip(without)).toEqual(strip(withLog));
        expect(r2.n).toBe(r1.n);
      }
    });
  }

  it('logs spells, debuffs, stacks, shields and minions in DuelEvent shape', () => {
    const w = runDuel({ attacker: necro, defender: warrior, rng: mulberry32(7), log: true });
    const kinds = new Set(w.log.map((e) => parseEventType(e.type).kind));
    for (const k of ['minion_summoned', 'spell_cast', 'hit']) expect(kinds.has(k)).toBe(true);
    for (const k of kinds) expect([...SIDE_EVENT_KINDS, 'time_up']).toContain(k);
    for (const e of w.log) {
      expect(typeof e.timestamp).toBe('number');
      expect(typeof e.damage).toBe('number');
      expect(e).toHaveProperty('attackerHpAfter');
      expect(e).toHaveProperty('defenderHpAfter');
    }
    expect(w.log[0]).toMatchObject({ timestamp: 0, type: 'attacker_minion_summoned', damage: 0 });
    expect(w.log.some((e) => e.defenderBulwarkStacks !== undefined)).toBe(true);
    expect(w.winner).toBe(w.attackerWon ? 'attacker' : 'defender');
  });

  it('is deterministic for a seed', () => {
    const x = runDuel({ attacker: sentinel, defender: mystic, rng: mulberry32(42), log: true });
    const y = runDuel({ attacker: sentinel, defender: mystic, rng: mulberry32(42), log: true });
    expect(y.log).toEqual(x.log);
  });
});

describe('events.js', () => {
  it('parseEventType splits the side prefix', () => {
    expect(parseEventType('defender_spell_damage')).toEqual({ side: 'defender', kind: 'spell_damage' });
    expect(parseEventType('time_up')).toEqual({ side: null, kind: 'time_up' });
  });
  it('duelEvent clamps HP unless asked not to', () => {
    expect(duelEvent(10, 'attacker_hit', 5, { hp: -3 }, { hp: 4 })).toEqual({
      timestamp: 10, type: 'attacker_hit', damage: 5, attackerHpAfter: 0, defenderHpAfter: 4,
    });
    expect(duelEvent(10, 'time_up', 0, { hp: -3 }, { hp: 4 }, false).attackerHpAfter).toBe(-3);
  });
});
