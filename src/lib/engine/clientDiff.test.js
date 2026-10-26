// H2 client-transcription differential (redesign plan §C): the engine against hand transcriptions of
// the 2.7.0 client (./__client__/*.client.js) on seeded inputs, exact equality (Object.is on every
// leaf, so NaN = NaN and 0 != -0). The inputs cover the domain the engine is fed: finite numbers,
// plus the client's own edge values (0, the caps, Infinity) where the engine is meant to agree.
// A failure prints the seed, the case index and the input. HARNESS_DEEP=1 runs 10x the cases.
import { describe, it, expect } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import { mulberry32 } from './rng.js';
import * as caps from './core/caps.js';
import * as shield from './core/shield.js';
import * as rolls from './core/rolls.js';
import * as minions from './core/minions.js';
import { processCombatTick } from './pve/tick.js';
import { disruptionEffectFor } from './core/disruption.js';
import { sigilTierStatMult, getSigilBonusAttack, getSigilBonusHp, getSigilSpellScaled } from './sources/sigilScale.js';
import { calculateTranscendenceBonuses } from './sources/transcendence.js';
import { calculateStoneBonuses } from './sources/stones.js';
import {
  hardDungeonRoster, hardDungeonCoins, oblivionFloorMob, oblivionInstability, oblivionEffectiveInstability,
} from './pve/enemies.js';
import { oblivionCombatState } from './pve/fight.js';
import { STATS } from '../game/stats.js';
import { SIGIL_CATALOGUE, SIGIL_CONSTANTS, SIGIL_ALTAR_CONSTANTS } from '../game/sigils.js';
import { TRANSCENDENCE_BOARDS } from '../game/transcendence.js';
import { CLASSIC_DUNGEONS, CLASSIC_DUNGEON_HARD } from '../game/pveContent.js';
import * as C from './__client__/caps.client.js';
import * as CC from './__client__/combat.client.js';
import * as CM from './__client__/minions.client.js';
import * as CS from './__client__/sigils.client.js';
import * as CP from './__client__/progression.client.js';
import * as CV from './__client__/pve.client.js';

const N = process.env.HARNESS_DEEP ? 100_000 : 10_000;
const SEED = 0x5eed2a;

/** Seeded input helpers over one mulberry32 stream. */
function gen(seed) {
  const r = mulberry32(seed);
  const g = {
    r,
    real: (lo, hi) => lo + r() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)),
    pick: (xs) => xs[Math.floor(r() * xs.length)],
    chance: (p) => r() < p,
    /** A real in [lo, hi], or (rarely) one of the edge values. */
    num: (lo, hi, edges = []) => (edges.length && r() < 0.15 ? g.pick(edges) : lo + r() * (hi - lo)),
    /** 0 a third of the time, else a real in [lo, hi]. */
    some: (lo, hi) => (r() < 0.33 ? 0 : lo + r() * (hi - lo)),
  };
  return g;
}

/** An rng that records its draws, so both sides can be checked to draw the same stream. */
function recordingRng(seed) {
  const base = mulberry32(seed);
  const rng = () => {
    rng.draws++;
    return base();
  };
  rng.draws = 0;
  return rng;
}

/**
 * Runs `n` cases: `make(g, i)` builds an input, `pair(input)` returns [engine, client]. Fails on the
 * first case whose outputs are not deep-strict-equal, naming the seed, case and input.
 */
function diff(name, make, pair, n = N, seed = SEED) {
  const g = gen(seed);
  for (let i = 0; i < n; i++) {
    const input = make(g, i);
    const [eng, cli] = pair(input);
    if (!isDeepStrictEqual(eng, cli)) {
      const where = `${name}: seed ${seed}, case ${i}, input ${JSON.stringify(input)}`;
      expect(eng, where).toStrictEqual(cli);
      throw new Error(where); // toStrictEqual can pass where isDeepStrictEqual does not (e.g. -0)
    }
  }
}

// ---------------------------------------------------------------------------------------------
describe('caps (stats.md §2, L1080181-1080486)', () => {
  const ids = Object.keys(C.SOFT_CAPS);
  const cfgOf = (g) => (g.chance(0.8)
    ? C.SOFT_CAPS[g.pick(ids)]
    : { soft: g.real(-5, 100), hard: g.real(-5, 100) }); // includes hard <= soft
  const valueFor = (g, cfg) => g.num(-10, Math.max(cfg.hard, cfg.soft) * 1.5 + 5,
    [cfg.soft, cfg.hard, 0, -0, Infinity, -Infinity, cfg.soft + 1e-9, cfg.hard - 1e-9]);

  it('caps match the 2.7.0 literals except the verified Spell Resist update (2.7.5, then 2.8.2)', () => {
    for (const s of STATS) {
      const id = s.enumName;
      expect(caps.capConfig(id), id).toStrictEqual(id === 'SPELL_RESIST' ? { soft: 25, hard: 70 } : C.SOFT_CAPS[id] ?? null);
      expect(caps.ceilingFor(id), id).toBe(C.COMBAT_CEILINGS[id] ?? null);
    }
    for (const id of [...ids, ...Object.keys(C.COMBAT_CEILINGS)]) expect(STATS.some((s) => s.enumName === id), id).toBe(true);
  });

  it('applySoftCap', () => diff('applySoftCap', (g) => {
    const cfg = cfgOf(g);
    return { x: valueFor(g, cfg), cfg };
  }, ({ x, cfg }) => [caps.applySoftCap(x, cfg), C.applySoftCap(x, cfg)]));

  it('rawFromSoftCapped', () => diff('rawFromSoftCapped', (g) => {
    const cfg = cfgOf(g);
    return { x: valueFor(g, cfg), cfg };
  }, ({ x, cfg }) => [caps.rawFromSoftCapped(x, cfg), C.rawFromSoftCapped(x, cfg)]));

  it('applyCombatCeiling', () => diff('applyCombatCeiling', (g) => {
    const c = g.chance(0.7) ? C.COMBAT_CEILINGS[g.pick(Object.keys(C.COMBAT_CEILINGS))] : g.real(0, 100);
    return { x: g.num(-10, c * 2, [c, 0, -0, Infinity]), c };
  }, ({ x, c }) => [caps.applyCombatCeiling(x, c), C.applyCombatCeiling(x, c)]));

  it('softCapGainFromSheet', () => diff('softCapGainFromSheet', (g) => {
    const cfg = cfgOf(g);
    return { sheet: valueFor(g, cfg), delta: g.num(-5, cfg.hard + 10, [0, -0, Infinity, 1e-12]), cfg };
  }, ({ sheet, delta, cfg }) => [caps.softCapGainFromSheet(sheet, delta, cfg), C.softCapGainFromSheet(sheet, delta, cfg)]));

  it('softCapEfficiency', () => diff('softCapEfficiency', (g) => {
    const cfg = cfgOf(g);
    return { x: valueFor(g, cfg), cfg };
  }, ({ x, cfg }) => [caps.softCapEfficiency(x, cfg), C.softCapEfficiency(x, cfg)]));

  it('pvpRatingToPercent', () => diff('pvpRatingToPercent', (g) => ({ x: g.num(-100, 5000, [0, -0, Infinity]) }),
    ({ x }) => [caps.pvpRatingToPercent(x), C.pvpRatingToPercent(x)]));
});

// ---------------------------------------------------------------------------------------------
describe('swing rolls and damage mitigation (combat-pve.md §5, §7, §8.3)', () => {
  const EFFECTS = ['SILENCE', 'STAGGER', 'FEAR'];

  it('applyDamageReduction', () => diff('applyDamageReduction', (g) => ({
    d: g.chance(0.5) ? g.int(-5, 200000) : g.num(-5, 200000, [0, -0, 0.4, 0.5, 1.5]),
    dr: g.num(-10, 100, [0, -0, 100, 75]),
  }), ({ d, dr }) => [rolls.applyDamageReduction(d, dr), CC.applyDamageReduction(d, dr)]));

  it('rollAttackDamage draws and rounds as the client', () => diff('rollAttackDamage', (g) => ({
    e: { attack: g.int(0, 500000), critChance: g.some(0, 100), critDamage: g.real(1, 8), doubleHit: g.some(0, 100) },
    seed: g.int(0, 2 ** 31),
  }), ({ e, seed }) => {
    const a = recordingRng(seed);
    const b = recordingRng(seed);
    return [[rolls.rollAttackDamage(e, a), a.draws], [CC.rollAttackDamage(e, b), b.draws]];
  }));

  it('rollPenetrationCritMult', () => diff('rollPenetrationCritMult', (g) => ({
    e: { critChance: g.some(0, 100), critDamage: g.real(1, 8) },
    seed: g.int(0, 2 ** 31),
  }), ({ e, seed }) => {
    const a = recordingRng(seed);
    const b = recordingRng(seed);
    return [[rolls.rollPenetrationCritMult(e, a), a.draws], [CC.rollPenetrationCritMult(e, b), b.draws]];
  }));

  it('rollDisruption (every effect, including an unknown one)', () => diff('rollDisruption', (g) => ({
    e: { disruptionChance: g.some(-5, 100), disruptionEffect: g.pick([...EFFECTS, 'BOGUS']) },
    silenced: g.chance(0.5) ? 0 : g.int(-100, 3000),
    stacks: g.int(0, 3),
    feared: g.chance(0.5) ? 0 : g.int(-100, 1000),
    seed: g.int(0, 2 ** 31),
  }), ({ e, silenced, stacks, feared, seed }) => {
    const a = recordingRng(seed);
    const b = recordingRng(seed);
    return [
      [rolls.rollDisruption(e, silenced, stacks, feared, a), a.draws],
      [CC.rollDisruption(e, silenced, stacks, feared, b), b.draws],
    ];
  }));

  it('the status constants are the client literals', () => {
    expect([rolls.DISRUPTION_SILENCE_MS, rolls.STAGGER_STACKS_TO_STUN, rolls.STAGGER_STUN_MS, rolls.FEAR_DURATION_MS, rolls.PARALYZE_DURATION_MS])
      .toStrictEqual([CC.SILENCE_MS, CC.STAGGER_STACKS_TO_STUN, CC.STAGGER_STUN_MS, CC.FEAR_MS, CC.PARALYZE_MS]);
  });

  // One processCombatTick against the transcription: every branch of both swings, the regen pulse,
  // the heal budget, shields, statuses and the minion, compared output, rng draws and mutated state.
  const entity = (g, side) => ({
    maxHp: g.int(1, 2_000_000),
    rawMaxHp: 0,
    hp: 0,
    attack: g.chance(0.1) ? g.int(0, 3) : g.int(0, 400_000), // 0-3: the zero-damage DR edge (combat-pve.md §7)
    attackSpeed: g.num(0.2, 4.5, [0.2, 1, 4.5]),
    doubleHit: g.some(0, 90),
    critChance: g.some(0, 95),
    critDamage: g.real(1, 8),
    lifesteal: g.some(0, 80),
    hpRegen: side === 'player' ? g.some(0, 70) : 0,
    damageReduction: g.some(0, 75),
    blockChance: g.some(0, 60),
    missChance: g.chance(0.6) ? 0 : g.real(0, 60),
    blindChance: g.some(0, 60),
    paralyzeChance: g.some(0, 18),
    penetration: g.some(0, 80),
    disruptionChance: g.some(0, 20),
    disruptionEffect: g.pick(EFFECTS),
    shieldHp: 0,
    shieldMax: g.chance(0.4) ? g.int(1, 500_000) : 0,
    ...(side === 'player' && g.chance(0.5) ? { shieldMitigation: g.pick([0, 0.5, g.real(0, 0.9)]) } : {}),
    ...(side === 'player' && g.chance(0.5) ? { shieldRegenAlwaysRefills: g.chance(0.5) } : {}),
  });
  const minionFor = (g, player) => {
    if (!g.chance(0.4)) return null;
    const m = CM.createMinion(
      { species: 'S', name: 'M', icon: 'i', minion: 'SKELETON', hpPercent: g.real(5, 60), attackPercent: g.real(5, 60), respawnCooldownMs: g.pick([0, 5000]), summonCastMs: 0 },
      player,
      { totalMinionAttack: g.some(0, 50), totalMinionHealth: g.some(0, 50), totalMinionAttackSpeed: g.some(0, 2), totalMinionCritChance: g.some(0, 90), totalMinionLifesteal: g.some(0, 70), totalSoulLink: g.some(0, 70) },
    );
    if (g.chance(0.8)) CM.summonMinion(m);
    m.timer = g.int(0, 2000);
    if (g.chance(0.3)) m.hp = g.int(1, m.maxHp);
    if (g.chance(0.3)) m.frenzy = { attackPercent: g.some(0, 50), attackSpeedPercent: g.some(0, 50), lifesteal: g.some(0, 30) };
    return m;
  };
  const tickInput = (g) => {
    const player = entity(g, 'player');
    const enemy = entity(g, 'enemy');
    const maxHp = g.chance(0.5) ? undefined : g.int(1, 2_000_000);
    const cap = maxHp ?? player.maxHp;
    const budgetMax = g.real(0, 50_000);
    return {
      player,
      enemy,
      attackerHp: g.chance(0.2) ? cap : g.int(1, cap),
      defenderHp: g.int(1, enemy.maxHp),
      timers: { attackerTimer: g.int(0, 3000), defenderTimer: g.int(0, 3000), regenTimer: g.int(0, 150) },
      dtMs: g.pick([100, 100, 50, g.int(1, 1500)]),
      timestamp: g.int(0, 100_000),
      attackerMaxHp: maxHp,
      defenderBlinded: g.chance(0.2),
      defenderParalyzedMs: g.chance(0.7) ? 0 : g.int(0, 2000),
      defenderSilencedMs: g.chance(0.7) ? 0 : g.int(0, 3000),
      defenderStaggerStacks: g.int(0, 2),
      defenderFearedMs: g.chance(0.7) ? 0 : g.int(0, 1000),
      attackerShieldHp: g.chance(0.5) ? 0 : g.int(0, 500_000),
      defenderShieldHp: g.chance(0.7) ? 0 : g.int(0, 500_000),
      healBudget: g.chance(0.5) ? null : { remaining: g.real(0, budgetMax), perMs: budgetMax / 1000, max: budgetMax },
      blocksShieldOverflow: g.chance(0.3),
      minion: minionFor(g, player),
      seed: g.int(0, 2 ** 31),
    };
  };

  // every event type the tick can emit, so the comparison is known to reach each branch
  const TICK_EVENTS = [
    'attacker_regen', 'attacker_hit', 'attacker_crit', 'defender_blinded', 'defender_paralyzed', 'defender_silenced',
    'defender_staggered', 'defender_feared', 'defender_miss', 'defender_block', 'defender_dead', 'minion_hit',
    'minion_crit', 'defender_paralyze', 'defender_fear', 'defender_blind', 'minion_damaged', 'minion_dead',
    'defender_hit', 'attacker_dead', 'attacker_miss', 'attacker_block',
  ];
  const seen = new Set();
  it('processCombatTick matches the client tick (outputs, draws, minion and heal budget)', () => diff('processCombatTick', tickInput, (t) => {
    const e = structuredClone(t);
    const c = structuredClone(t);
    const ra = recordingRng(t.seed);
    const rb = recordingRng(t.seed);
    const opts = {
      attackerMaxHp: e.attackerMaxHp, defenderBlinded: e.defenderBlinded, defenderParalyzedMs: e.defenderParalyzedMs,
      defenderSilencedMs: e.defenderSilencedMs, defenderStaggerStacks: e.defenderStaggerStacks,
      defenderFearedMs: e.defenderFearedMs, attackerShieldHp: e.attackerShieldHp, defenderShieldHp: e.defenderShieldHp,
      healBudget: e.healBudget, blocksShieldOverflow: e.blocksShieldOverflow, minion: e.minion,
    };
    const eng = processCombatTick(e.player, e.enemy, e.attackerHp, e.defenderHp, e.timers, e.dtMs, e.timestamp, opts, ra);
    const cli = CC.processCombatTick(c.player, c.enemy, c.attackerHp, c.defenderHp, c.timers, c.dtMs, c.timestamp,
      c.attackerMaxHp, c.defenderBlinded, c.defenderParalyzedMs, c.defenderSilencedMs, c.defenderStaggerStacks,
      c.defenderFearedMs, c.attackerShieldHp, c.defenderShieldHp, c.healBudget, c.blocksShieldOverflow, c.minion, rb);
    for (const ev of cli.events) seen.add(ev.type);
    return [
      { out: eng, draws: ra.draws, minion: e.minion, budget: e.healBudget },
      { out: cli, draws: rb.draws, minion: c.minion, budget: c.healBudget },
    ];
  }));

  it('the tick inputs reach every event type', () => {
    expect(TICK_EVENTS.filter((t) => !seen.has(t))).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('absorbWithShield and the heal budget (combat-pve.md §13)', () => {
  it('absorbWithShield', () => diff('absorbWithShield', (g) => ({
    s: g.num(-10, 500_000, [0, -0]),
    d: g.chance(0.5) ? g.int(-5, 500_000) : g.num(-5, 500_000, [0, -0]),
    m: g.chance(0.3) ? undefined : g.num(0, 0.99, [0, -0, 0.5]),
  }), ({ s, d, m }) => [shield.absorbWithShield(s, d, m), CC.absorbWithShield(s, d, m)]));

  it('regenShieldRefillAmount and spendHealBudget', () => diff('heal budget', (g) => ({
    pulse: g.int(1, 50_000), applied: g.int(0, 50_000), always: g.chance(0.5),
    budget: g.chance(0.2) ? null : { remaining: g.num(0, 50_000, [0, 0.5, 1]), perMs: 1, max: 50_000 },
    want: g.num(-5, 60_000, [0, -0, 0.5, 1]),
  }), ({ pulse, applied, always, budget, want }) => {
    const a = structuredClone(budget);
    const b = structuredClone(budget);
    return [
      [shield.regenShieldRefillAmount(pulse, applied, always), shield.spendHealBudget(a, want), a],
      [CC.regenShieldRefillAmount(pulse, applied, always), CC.spendHealBudget(b, want), b],
    ];
  }));
});

// ---------------------------------------------------------------------------------------------
describe('minions (combat-pve.md §12)', () => {
  const summon = (g) => ({
    species: g.pick(['SKELETON', 'GHOUL']), name: 'n', icon: 'i', minion: 'k',
    hpPercent: g.real(1, 80), attackPercent: g.real(1, 80),
    ...(g.chance(0.7) ? { respawnCooldownMs: g.int(0, 10_000) } : {}),
    ...(g.chance(0.7) ? { summonCastMs: g.int(0, 3000) } : {}),
  });
  const stats = (g) => {
    const s = {};
    for (const k of ['totalMinionAttack', 'totalMinionHealth', 'totalMinionAttackSpeed', 'totalMinionCritChance', 'totalMinionLifesteal', 'totalSoulLink']) {
      if (g.chance(0.8)) s[k] = k === 'totalMinionAttackSpeed' ? g.some(0, 3) : g.some(0, 100);
    }
    return s;
  };
  const player = (g) => ({ maxHp: g.int(1, 3_000_000), attack: g.int(1, 500_000), attackSpeed: g.num(0.2, 4.5, [2, 4, 4.5]), critDamage: g.real(1, 8) });

  it('createMinion (with minionAttackSpeed)', () => diff('createMinion', (g) => ({
    d: g.chance(0.05) ? null : summon(g), p: player(g), s: stats(g),
  }), ({ d, p, s }) => [minions.createMinion(d, p, s), CM.createMinion(d, p, s)]));

  it('minion swing interval, time to swing, attack, lifesteal and soul link', () => diff('minion intervals', (g) => {
    const m = CM.createMinion(summon(g), player(g), stats(g));
    m.alive = g.chance(0.8);
    m.timer = g.int(0, 3000);
    if (g.chance(0.1)) m.attackSpeed = g.pick([0, -1]);
    if (g.chance(0.5)) m.frenzy = { attackPercent: g.some(-10, 80), attackSpeedPercent: g.some(-10, 80), lifesteal: g.some(-10, 50) };
    if (g.chance(0.5)) m.soulLinkBonus = g.some(-10, 60);
    return m;
  }, (m) => {
    const run = (L) => [L.minionSwingIntervalMs(m), L.minionMsUntilSwing(m), L.minionCurrentAttack(m), L.minionCurrentLifesteal(m), L.currentSoulLink(m)];
    return [run(minions), run(CM)];
  }));

  it('minionSwing, mitigation, lifesteal, soul link and damage mutate as the client', () => diff('minion swing', (g) => {
    const m = CM.createMinion(summon(g), player(g), stats(g));
    if (g.chance(0.85)) CM.summonMinion(m);
    m.timer = g.int(0, 3000);
    if (g.chance(0.3)) m.hp = g.int(1, m.maxHp);
    if (g.chance(0.4)) m.frenzy = { attackPercent: g.some(0, 80), attackSpeedPercent: g.some(0, 80), lifesteal: g.some(0, 50) };
    if (g.chance(0.3)) { m.empowerBonusHp = g.int(0, m.maxHp); m.maxHp += m.empowerBonusHp; }
    if (g.chance(0.3)) m.soulLinkBonus = g.some(0, 60);
    return {
      m, dt: g.pick([100, g.int(1, 2000)]), dr: g.some(0, 75), dealt: g.int(-5, 400_000),
      hit: g.int(-5, 3_000_000), seed: g.int(0, 2 ** 31),
    };
  }, (t) => {
    const run = (L, m, rng) => {
      const sw = L.minionSwing(m, t.dt, rng);
      return [
        sw, L.mitigateMinionHit(sw ? sw.damage : t.dealt, t.dr), L.healMinionLifesteal(m, t.dealt),
        L.soulLinkHeal(m, t.dealt), L.damageMinion(m, t.hit), L.minionDeathMeta(m), rng.draws, m,
      ];
    };
    return [run(minions, structuredClone(t.m), recordingRng(t.seed)), run(CM, structuredClone(t.m), recordingRng(t.seed))];
  }));

  it('openingSwingTimerStart', () => diff('openingSwingTimerStart', (g) => ({
    interval: g.int(1, 5000), win: g.num(-100, 3000, [0, -0]), fb: g.chance(0.3) ? undefined : g.int(0, 3000),
  }), ({ interval, win, fb }) => [minions.openingSwingTimerStart(interval, win, fb), CM.openingSwingTimerStart(interval, win, fb)]));
});

// ---------------------------------------------------------------------------------------------
describe('sigil scaling (sigils.md §4, §5)', () => {
  it('the growth and tier constants are the client literals', () => {
    expect(SIGIL_CONSTANTS.STAT_GROWTH_PER_LEVEL).toBe(CS.STAT_GROWTH_PER_LEVEL);
    expect(SIGIL_CONSTANTS.SPELL_GROWTH_PER_LEVEL).toBe(CS.SPELL_GROWTH_PER_LEVEL);
    expect(SIGIL_ALTAR_CONSTANTS.TIER_STAT_MULT).toBe(CS.TIER_STAT_MULT);
  });

  it('flat Attack / HP for every catalogue sigil, level 1-30 and tier', () => {
    for (const def of SIGIL_CATALOGUE) {
      for (let level = 1; level <= 30; level++) {
        for (const tier of [undefined, null, 0, 1, 2, 3, 4, 5, 6, 7, 8]) {
          const where = `${def.species} L${level} tier ${tier}`;
          expect(getSigilBonusAttack(def, level, tier), where).toBe(CS.getSigilBonusAttack(def, level, tier));
          expect(getSigilBonusHp(def, level, tier), where).toBe(CS.getSigilBonusHp(def, level, tier));
        }
      }
    }
  });

  it('flat Attack / HP and the tier multiplier on random inputs', () => diff('sigil flat', (g) => ({
    def: { baseAttack: g.real(0, 20000), baseHp: g.real(0, 100000) },
    level: g.chance(0.7) ? g.int(1, 30) : g.real(0, 40),
    tier: g.chance(0.8) ? g.int(0, 9) : g.pick([undefined, null, g.real(0, 9)]),
  }), ({ def, level, tier }) => [
    [getSigilBonusAttack(def, level, tier), getSigilBonusHp(def, level, tier), sigilTierStatMult(tier)],
    [CS.getSigilBonusAttack(def, level, tier), CS.getSigilBonusHp(def, level, tier), CS.sigilTierStatMult(tier)],
  ]));

  // Every catalogue spell as the client sees it: the spell object carrying its spellType.
  const catalogueSpells = [];
  for (const def of SIGIL_CATALOGUE) {
    catalogueSpells.push({ where: `${def.species}`, spell: { ...def.spell, spellType: def.spellType } });
    const dv = def.druidVariant;
    if (dv?.spell) catalogueSpells.push({ where: `${def.species} druid`, spell: dv.spell });
    for (const form of Object.keys(dv?.formSpell ?? {})) catalogueSpells.push({ where: `${def.species} ${form}`, spell: dv.formSpell[form] });
  }

  it('getSigilSpellScaled for every catalogue spell at level 1-30', () => {
    expect(catalogueSpells.length).toBeGreaterThan(SIGIL_CATALOGUE.length);
    for (const { where, spell } of catalogueSpells) {
      for (let level = 1; level <= 30; level++) {
        const eng = getSigilSpellScaled(spell, level, spell.spellType);
        const cli = CS.getSigilSpellScaled(spell, level);
        if (!isDeepStrictEqual(eng, cli)) expect(eng, `${where} L${level}`).toStrictEqual(cli);
      }
    }
  });

  const TYPES = ['AURA', 'DAMAGE', 'BUFF', 'HEAL', 'DEBUFF', 'TRANSFORM', 'SHIELD', 'STACK', 'SUMMON', 'FORM', 'DEFENSE', 'BOGUS'];
  const maybe = (g, o, key, v) => { if (g.chance(0.7)) o[key] = v; };
  const randomSpell = (g) => {
    const t = g.pick(TYPES);
    const s = { spellType: t, cooldownMs: g.int(1000, 20000) };
    const pct = () => g.real(0, 60);
    if (t === 'AURA') { s.bonusStat = g.pick(['ATTACK_SPEED', 'CRIT_CHANCE', 'LIFESTEAL']); s.bonusValue = g.real(0, 30); }
    if (t === 'DAMAGE') {
      maybe(g, s, 'baseDamage', g.int(0, 5000));
      maybe(g, s, 'attackPercent', pct()); maybe(g, s, 'maxAttackPercent', pct() * 3);
      maybe(g, s, 'damagePerTick', g.int(0, 2000));
      if (g.chance(0.3)) s.slow = { attackSpeedReductionPercent: pct(), maxAttackSpeedReductionPercent: pct() * 2 };
      if (g.chance(0.3)) s.wound = { regenReductionPercent: pct(), maxRegenReductionPercent: pct() * 2 };
      if (g.chance(0.3)) s.critDown = { critChanceReduction: pct(), maxCritChanceReduction: pct() * 2 };
    }
    if (t === 'BUFF' || t === 'TRANSFORM') {
      s.effects = Array.from({ length: g.int(0, 3) }, () => {
        const e = { stat: 'X', value: g.real(0, 40) };
        maybe(g, e, 'maxValue', g.real(0, 80));
        return e;
      });
      if (t === 'BUFF') {
        maybe(g, s, 'thornsPercent', pct()); maybe(g, s, 'maxThornsPercent', pct() * 2);
        if (g.chance(0.2)) s.minionEmpower = { maxHpPercent: pct(), maxMaxHpPercent: pct() * 2, regenPercentPerTick: g.real(0, 5), maxRegenPercentPerTick: g.real(0, 10) };
        if (g.chance(0.2)) s.minionFrenzy = { attackPercent: pct(), maxAttackPercent: pct() * 2, attackSpeedPercent: pct(), maxAttackSpeedPercent: pct() * 2, lifesteal: pct(), maxLifesteal: pct() * 2 };
      }
    }
    if (t === 'HEAL') s.healPercentPerTick = g.real(0, 10);
    if (t === 'DEBUFF') {
      s.initialAttackPercent = pct(); maybe(g, s, 'maxInitialAttackPercent', pct() * 2);
      s.debuff = {};
      maybe(g, s.debuff, 'regenReductionPercent', pct()); maybe(g, s.debuff, 'maxRegenReductionPercent', pct() * 2);
      maybe(g, s.debuff, 'damagePerTickPercent', g.real(0, 5)); maybe(g, s.debuff, 'maxDamagePerTickPercent', g.real(0, 10));
    }
    if (t === 'SHIELD') { s.shieldHpPercent = pct(); maybe(g, s, 'maxShieldHpPercent', pct() * 2); }
    if (t === 'SUMMON') { s.attackPercent = pct(); s.maxAttackPercent = pct() * 2; s.hpPercent = pct(); s.maxHpPercent = pct() * 2; }
    return s;
  };

  it('getSigilSpellScaled on random spells of every type', () => diff('getSigilSpellScaled', (g) => ({
    spell: randomSpell(g), level: g.chance(0.8) ? g.int(1, 30) : g.real(0, 40),
  }), ({ spell, level }) => [getSigilSpellScaled(spell, level, spell.spellType), CS.getSigilSpellScaled(spell, level)]));
});

// ---------------------------------------------------------------------------------------------
describe('transcendence bonus sum (transcendence.md §8)', () => {
  const boards = Object.entries(TRANSCENDENCE_BOARDS);
  it('calculateTranscendenceBonuses on every board', () => diff('calculateTranscendenceBonuses', (g) => {
    const [key, board] = g.pick(boards);
    const ids = Array.from({ length: g.int(0, 60) }, () => (g.chance(0.9) ? g.pick(board.nodes).id : g.pick(['core', 'nope', ''])));
    return { key, ids };
  }, ({ key, ids }) => {
    const board = TRANSCENDENCE_BOARDS[key];
    const byId = Object.fromEntries(board.nodes.map((n) => [n.id, n]));
    return [calculateTranscendenceBonuses(ids, board), CP.calculateTranscendenceBonuses(ids, byId)];
  }));
});

// ---------------------------------------------------------------------------------------------
describe('enchant-stone bonuses (stones.md §5, §7, §8)', () => {
  const TYPES = ['PVE_ATTACK', 'PVE_DEFENSE', 'PVP', 'ULTIMATE', 'MYTHIC', 'OBLIVION'];
  const STAT_TYPES = [...CP.STONE_STAT_TYPES, 'FLAT_ATTACK', 'FLAT_HP', 'crit_chance', 'BOGUS'];
  // `activated` is always present: the client skips a missing flag, the engine (by design, for
  // engine-level callers) counts it; every stone the app builds carries the flag (model/stones.js).
  const stone = (g) => ({
    type: g.pick(TYPES),
    activated: g.pick([true, true, true, false, 0, 1, null]),
    stats: Array.from({ length: g.int(0, 5) }, () => ({ type: g.pick(STAT_TYPES), value: g.real(0, 30) })),
    quality: g.chance(0.8) ? g.int(1, 100) : g.pick([null, undefined, 0, 150, g.real(-10, 120), Infinity]),
    amplifyLevel: g.chance(0.8) ? g.int(0, 10) : g.pick([null, undefined]),
    oblivionLevel: g.chance(0.8) ? g.int(1, 5) : g.pick([null, undefined, 0, 9, g.real(0, 7), NaN, Infinity]),
  });

  it('a stat row of a type outside the client switch adds nothing (was: FLAT_ATTACK fed flatAttack)', () => {
    const s = { type: 'PVP', activated: true, stats: [{ type: 'FLAT_ATTACK', value: 15 }, { type: 'crit_chance', value: 2 }] };
    expect(calculateStoneBonuses([s])).toStrictEqual(CP.calculateEnchantStoneBonuses([s]));
    expect(calculateStoneBonuses([s]).flatAttack).toBe(0);
  });

  it('Oblivion Power clamps an infinite quality as the client (was: 8 instead of 30)', () => {
    const s = { type: 'OBLIVION', activated: true, oblivionLevel: 1, stats: [{ type: 'OBLIVION_POWER', value: 0 }] };
    for (const quality of [Infinity, -Infinity, null, undefined, 0, 1, 50.5, 100, 250]) {
      expect(calculateStoneBonuses([{ ...s, quality }]).oblivionPower, String(quality))
        .toBe(CP.calculateEnchantStoneBonuses([{ ...s, quality }]).oblivionPower);
    }
    expect(calculateStoneBonuses([{ ...s, quality: Infinity }]).oblivionPower).toBe(30);
  });

  it('calculateEnchantStoneBonuses', () => diff('calculateEnchantStoneBonuses', (g) => Array.from({ length: g.int(0, 8) }, () => stone(g)),
    (stones) => [calculateStoneBonuses(stones), CP.calculateEnchantStoneBonuses(stones)]));
});

// ---------------------------------------------------------------------------------------------
describe('hard dungeons (pve-content.md §4, L1062171-1062963)', () => {
  it('the catalogue hard constants are the client literals', () => {
    const H = CLASSIC_DUNGEON_HARD;
    expect(H.configs).toStrictEqual(CV.HARD_CONFIGS);
    expect(H.stepMultipliers).toStrictEqual(CV.HARD_STEP_MULTIPLIERS);
  });

  it('every shipped dungeon builds the client hard roster and coins', () => {
    CLASSIC_DUNGEONS.forEach((d, k) => {
      expect(hardDungeonRoster(d.mobRoster, CV.HARD_CONFIGS[k], k), d.id).toStrictEqual(CV.hardVariant(d.mobRoster, CV.HARD_CONFIGS[k], k));
      expect(hardDungeonCoins(k), d.id).toStrictEqual(CV.hardCoinRewards(k));
    });
  });

  it('hardVariant on random rosters, configs and indexes', () => diff('hardVariant', (g) => ({
    roster: Array.from({ length: g.int(1, 8) }, (_, i) => ({
      id: `m${i}`, name: 'x', baseHp: g.real(1, 1e6), baseAtk: g.real(1, 1e5), baseSpd: g.real(0.3, 3),
    })),
    cfg: { hpScale: g.real(1, 3e5), atkScale: g.real(1, 1e5), blockChance: g.int(0, 40), penetration: g.int(0, 80), damageReduction: g.pick([0, 30, g.real(0, 60)]) },
    k: g.int(0, 8),
  }), ({ roster, cfg, k }) => [hardDungeonRoster(roster, cfg, k), CV.hardVariant(roster, cfg, k)]));

  it('hardCoinRewards', () => {
    for (let k = 0; k < 40; k++) expect(hardDungeonCoins(k)).toStrictEqual(CV.hardCoinRewards(k));
  });
});

// ---------------------------------------------------------------------------------------------
describe('Oblivion instability and strain (pve-content.md §11)', () => {
  it('floor mob stats and instability, floors 1-400', () => {
    for (let f = 1; f <= 400; f++) {
      const m = oblivionFloorMob(f);
      const c = CV.getFloorMobStats(f);
      const eng = { hp: m.hp, attack: m.attack, attackSpeed: m.attackSpeed, blockChance: m.blockChance, penetration: m.penetration };
      expect(eng, `floor ${f}`).toStrictEqual(c);
      expect(m.instability, `floor ${f}`).toBe(CV.getFloorInstability(f));
      expect(oblivionInstability(f), `floor ${f}`).toBe(CV.getFloorInstability(f));
    }
  });

  it('net strain (getEffectiveInstability / getFloorEffectiveInstability)', () => diff('strain', (g) => ({
    floor: g.int(1, 200), inst: g.num(-50, 5000, [0, -0, 0.5, 1.5, 2.5]), power: g.num(-10, 3000, [0, -0, 0.5, 2.5]),
  }), ({ floor, inst, power }) => [
    [oblivionEffectiveInstability(inst, power), oblivionEffectiveInstability(oblivionFloorMob(floor).instability, power)],
    [CV.getEffectiveInstability(inst, power), CV.getFloorEffectiveInstability(floor, power)],
  ]));

  it('getInstabilityCombatState', () => diff('getInstabilityCombatState', (g) => ({
    eff: g.num(-50, 3000, [0, -0, 6, 12, 200]), inst: g.num(-10, 5000, [0, -0, 0.49, 0.5, 1]),
  }), ({ eff, inst }) => [oblivionCombatState(eff, inst), CV.getInstabilityCombatState(eff, inst)]));
});

// ---------------------------------------------------------------------------------------------
describe('disruptionEffect (stats.md §3.2, L1216943-1216988)', () => {
  it('every class and form', () => {
    for (const cls of ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER', 'BOGUS', null, undefined]) {
      for (const form of ['BEAR', 'WOLF', 'CAT', null, undefined]) {
        expect(disruptionEffectFor(cls, form), `${cls} ${form}`).toBe(CP.disruptionEffect(cls, form ? { form } : null));
      }
    }
  });
});
