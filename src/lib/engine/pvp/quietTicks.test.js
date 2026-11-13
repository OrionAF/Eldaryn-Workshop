// The duel resolver's quiet-tick skip must change nothing: the same result, the same event rows and the
// same number of draws from every rng lane as the plain loop (`quietTicks: false`), with and without the
// log. Contract: docs/Reference/simulation.md §Exact kernel performance.
import { describe, it, expect } from 'vitest';
import warrior72 from '../../__fixtures__/real/profile-warrior-l72.json';
import warrior73 from '../../__fixtures__/real/profile-warrior-l73.json';
import sentinel from '../../__fixtures__/real/profile-sentinel-l85.json';
import sentinelMiss from '../../__fixtures__/real/profile-sentinel-l85-miss.json';
import sentinelOct from '../../__fixtures__/real/profile-sentinel-l85-oct15b.json';
import mystic50 from '../../__fixtures__/real/profile-mystic-l50.json';
import mystic79 from '../../__fixtures__/real/profile-mystic-l79-291.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { buildFighter } from '../../build/fighter.js';
import { duelFighter, opponentFighter, missingStats } from '../../features/duel.js';
import { forAll, arbOpponent, runsFor, int, float, pick } from '../../harness/arbitrary.js';
import { runDuel, fighterDuelArgs, simulateArenaPvP } from './resolver.js';
import { fightRng, hashSeed, mulberry32 } from '../rng.js';
import { createStackCombat } from '../core/stacks.js';
import {
  DEBUFF_TYPES, applyDebuff, processDebuffsTick, debuffsTickIsQuiet, advanceQuietDebuffs,
} from '../core/debuffs.js';

/** `rng` with every draw counted per lane path. */
function counting(rng, counts, path = '') {
  const f = () => { counts[path] = (counts[path] ?? 0) + 1; return rng(); };
  const kids = Object.create(null);
  f.lane = (name) => kids[name] ?? (kids[name] = counting(rng.lane(name), counts, `${path}/${name}`));
  return f;
}

/** One duel on both loops; returns the fast loop's summary after checking it against the plain loop's. */
function expectSame(attacker, defender, seed, i, label) {
  let last;
  for (const log of [true, false]) {
    const run = (quietTicks) => {
      const counts = {};
      const r = runDuel({ attacker, defender, rng: counting(fightRng(seed, i), counts), log, quietTicks });
      return { r, counts };
    };
    const fast = run(undefined);
    const plain = run(false);
    expect(fast.r, `${label} #${i} log=${log}`).toEqual(plain.r);
    expect(fast.counts, `${label} #${i} log=${log} draws`).toEqual(plain.counts);
    last = fast.r;
  }
  return last;
}

const FIXTURES = { warrior72, warrior73, sentinel, sentinelMiss, sentinelOct, mystic50, mystic79 };
const sides = Object.entries(FIXTURES).flatMap(([name, profile]) => {
  const c = normaliseCharacter(gameProfileToCharacter(profile, { now: '2026-10-17T00:00:00Z' }));
  return c.presets.map((p) => {
    const f = duelFighter(buildFighter(c, p.id, { realm: null }));
    return missingStats(f).length ? null : { name: `${name}/${p.name}`, args: fighterDuelArgs(f) };
  }).filter(Boolean);
});

describe('quiet-tick skip: real builds', () => {
  it('has builds to duel', () => {
    expect(sides.length).toBeGreaterThanOrEqual(7);
  });

  it('every ordered pair gives the plain loop\'s result, rows and draws', () => {
    let timedOut = 0;
    let decided = 0;
    for (const a of sides) {
      for (const d of sides) {
        if (a === d) continue;
        const label = `${a.name} > ${d.name}`;
        for (let i = 0; i < 3; i++) {
          const r = expectSame(a.args, d.args, hashSeed('quiet', label), i, label);
          if (r.timedOut) timedOut += 1;
          else decided += 1;
        }
      }
    }
    // both endings are covered: a kill, and the full 60 s clock
    expect(decided).toBeGreaterThan(0);
    expect(timedOut).toBeGreaterThan(0);
  }, 120000);

  it('holds with the Fortress boss swing spread (defenderDamageVariance)', () => {
    const duel = (a, d, i, quietTicks) => {
      const counts = {};
      const r = simulateArenaPvP(
        a.stats, d.stats, a.spells, d.spells, a.equipped, d.equipped, a.glyphCombat, d.glyphCombat,
        a.shield, d.shield, a.stackCtx, d.stackCtx, a.summon, d.summon,
        { rng: counting(fightRng(41, i), counts), log: true, defenderDamageVariance: 0.2, quietTicks },
      );
      return { r, counts };
    };
    for (let k = 0; k + 1 < sides.length; k += 2) {
      for (let i = 0; i < 2; i++) {
        expect(duel(sides[k].args, sides[k + 1].args, i, undefined)).toEqual(duel(sides[k].args, sides[k + 1].args, i, false));
      }
    }
  });
});

describe('quiet-tick skip: random sheets, sigils and activation conditions', () => {
  it('gives the plain loop\'s result, rows and draws', () => {
    forAll('quiet-ticks', (rng) => ({
      a: arbOpponent(rng, { blankRate: 0.15 }).opponent,
      d: arbOpponent(rng, { blankRate: 0.15 }).opponent,
      seed: int(rng, 1, 1e9),
    }), ({ a, d, seed }) => {
      const fa = opponentFighter(a);
      const fd = opponentFighter(d);
      if (missingStats(fa).length || missingStats(fd).length) return;
      expectSame(fighterDuelArgs(fa), fighterDuelArgs(fd), seed, 0, `${a.spec} > ${d.spec}`);
    }, { runs: runsFor(250) });
  }, 120000);

  // Bulwark, Elusive and Sunder counters move on swings and decay: the cached tick values must be dropped then
  it('holds when a side carries a stack sigil', () => {
    const stacked = (rng) => {
      for (let tries = 0; tries < 200; tries++) {
        const o = arbOpponent(rng, { blankRate: 0.1 }).opponent;
        const f = opponentFighter(o);
        if (missingStats(f).length) continue;
        const args = fighterDuelArgs(f);
        if (createStackCombat(args.equipped, true, args.glyphCombat?.stack, args.stackCtx).active) return args;
      }
      throw new Error('no stack build generated');
    };
    forAll('quiet-ticks-stacks', (rng) => {
      const other = () => {
        for (;;) {
          const f = opponentFighter(arbOpponent(rng, { blankRate: 0.1 }).opponent);
          if (!missingStats(f).length) return fighterDuelArgs(f);
        }
      };
      const first = rng() < 0.5;
      return { a: first ? stacked(rng) : other(), d: first ? other() : stacked(rng), seed: int(rng, 1, 1e9) };
    }, ({ a, d, seed }) => {
      expectSame(a, d, seed, 0, 'stacks');
    }, { runs: runsFor(120) });
  }, 120000);
});

describe('debuffsTickIsQuiet / advanceQuietDebuffs', () => {
  const TYPES = [DEBUFF_TYPES.BLEED, DEBUFF_TYPES.POISON, DEBUFF_TYPES.WOUND, DEBUFF_TYPES.SLOW, DEBUFF_TYPES.CRIT_DOWN];
  const arbList = (rng) => {
    const state = [];
    const n = int(rng, 0, 4);
    for (let k = 0; k < n; k++) {
      const type = pick(rng, TYPES);
      const dot = type === DEBUFF_TYPES.BLEED || type === DEBUFF_TYPES.POISON;
      applyDebuff(state, {
        type,
        config: {
          durationMs: rng() < 0.2 ? 0 : int(rng, 1, 12) * 10 + (rng() < 0.3 ? float(rng, 0, 9) : 0),
          maxStacks: int(rng, 1, 5),
          tickIntervalMs: dot && rng() < 0.85 ? int(rng, 1, 6) * 10 : 0,
          regenReductionPercent: 20, attackSpeedReductionPercent: 10, critChanceReduction: 5,
        },
        damagePerTickFlat: dot ? int(rng, 1, 500) : 0,
        critChance: rng() < 0.5 ? 30 : 0,
        critMult: 1.5,
        source: { species: 'X' },
      }, 0);
    }
    return state;
  };

  it('a quiet tick is exactly the tick processDebuffsTick only counts down', () => {
    forAll('debuffs-quiet', (rng) => ({ state: arbList(rng), ticks: int(rng, 1, 30), seed: int(rng, 1, 1e9) }), ({ state, ticks, seed }) => {
      const plain = structuredClone(state);
      const fast = structuredClone(state);
      const rngPlain = mulberry32(seed);
      const rngFast = mulberry32(seed);
      for (let t = 1; t <= ticks; t++) {
        const quiet = debuffsTickIsQuiet(fast, 10);
        const r = processDebuffsTick(plain, 10, t * 10, rngPlain);
        if (quiet) {
          expect(r.events).toEqual([]);
          expect(r.targetHpDelta).toBe(0);
          advanceQuietDebuffs(fast, 10);
        } else {
          expect(r.events.length).toBeGreaterThan(0);
          processDebuffsTick(fast, 10, t * 10, rngFast);
        }
        expect(fast).toEqual(plain);
      }
      expect(rngFast()).toBe(rngPlain());
    }, { runs: runsFor(400) });
  });
});
