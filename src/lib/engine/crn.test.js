// Common random numbers through rng lanes (docs/Reference/simulation.md §Common random numbers):
// lanes leave every fight's distribution unchanged and pair two builds more tightly than one shared
// stream. HARNESS_DEEP=1 runs the marginal check at N = 4 000 per arm.
import { describe, it, expect } from 'vitest';
import { mulberry32, laneRng, lane, fightRng, hashSeed, scripted } from './rng.js';
import { simulatePve, preparePveFighter } from './pve/fight.js';
import { buildFighter } from '../build/fighter.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { resolveTarget } from '../search/objectives.js';
import { runDuel, fighterDuelArgs } from './pvp/resolver.js';

const take = (r, n) => Array.from({ length: n }, () => r());
const CLASSES = ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER'];
const TARGETS = [
  { kind: 'dummy', seconds: 10 },
  { kind: 'dungeon', id: 'dungeon_3', step: 4 },
  { kind: 'chapter', chapter: 8, level: 10 },
];

const fighterOf = (cls) => {
  const ch = fixtureCharacter(cls);
  return buildFighter(ch, ch.presets[0].id);
};
const faster = (f, k = 1.05) => ({ ...f, stats: { ...f.stats, totalAttackSpeed: f.stats.totalAttackSpeed * k } });

/** One scalar per fight: damage on a fixed window, else the fight time, negated for a loss. */
function outcomeFn(target) {
  const t = resolveTarget(target);
  return (prepared, rng) => {
    const r = simulatePve({ fighter: prepared, enemy: t.enemy, maxMs: t.maxMs, rng, ...t.opts });
    return t.maxMs ? r.damageDealt : r.won ? r.timeMs : -r.timeMs;
  };
}

const sd = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Two-sample Kolmogorov-Smirnov p-value (asymptotic Kolmogorov distribution; conservative with ties). */
function ksP(a, b) {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < x.length && j < y.length) {
    const v = Math.min(x[i], y[j]);
    while (i < x.length && x[i] === v) i++;
    while (j < y.length && y[j] === v) j++;
    d = Math.max(d, Math.abs(i / x.length - j / y.length));
  }
  const ne = (x.length * y.length) / (x.length + y.length);
  const lam = (Math.sqrt(ne) + 0.12 + 0.11 / Math.sqrt(ne)) * d;
  let p = 0;
  for (let k = 1; k <= 100; k++) p += 2 * (-1) ** (k - 1) * Math.exp(-2 * k * k * lam * lam);
  return Math.min(1, Math.max(0, p));
}

describe('lane rng', () => {
  it('the base stream of laneRng(s) is mulberry32(s); a lane is its own stream', () => {
    expect(take(laneRng(42), 20)).toEqual(take(mulberry32(42), 20));
    const r = laneRng(42);
    expect(take(r.lane('a'), 20)).not.toEqual(take(mulberry32(42), 20));
    expect(r.lane('a')).toBe(r.lane('a'));
    expect(typeof r.lane('a').lane).toBe('function'); // lanes nest
  });

  it('a lane does not depend on which other lanes were drawn, or in what order', () => {
    const r1 = laneRng(7);
    const a1 = take(r1.lane('a'), 10);
    const r2 = laneRng(7);
    take(r2.lane('b'), 13);
    take(r2, 5);
    expect(take(r2.lane('a'), 10)).toEqual(a1);
  });

  it('a plain or scripted rng is its own lanes, so its draw order is unchanged', () => {
    const p = mulberry32(1);
    expect(lane(p, 'player')).toBe(p);
    const s = scripted([0.1]);
    expect(lane(lane(s, 'enemy'), 'crit')).toBe(s);
  });

  it('fightRng(seed, i) is the lane rng of hashSeed(seed, i)', () => {
    const r = fightRng(3, 5);
    expect(typeof r.lane).toBe('function');
    expect(take(r, 10)).toEqual(take(mulberry32(hashSeed(3, 5)), 10));
    expect(take(fightRng(3, 5).lane('x'), 10)).toEqual(take(laneRng(hashSeed(3, 5)).lane('x'), 10));
  });

  it('determinism: one seed gives the same fight, event for event', () => {
    const prepared = preparePveFighter(fighterOf('MYSTIC'));
    const t = resolveTarget(TARGETS[1]);
    const run = () => simulatePve({ fighter: prepared, enemy: t.enemy, rng: fightRng(11, 3), log: true, ...t.opts });
    expect(run()).toEqual(run());
  });
});

describe('the minion has its own lane', () => {
  /** An rng whose 'minion' lane records every draw. */
  function recording(seed, i) {
    const rng = fightRng(seed, i);
    const drawn = [];
    const orig = rng.lane;
    rng.lane = (name) => {
      const k = orig(name);
      if (name !== 'minion') return k;
      const tap = () => {
        const v = k();
        drawn.push(v);
        return v;
      };
      tap.lane = k.lane;
      return tap;
    };
    return { rng, drawn };
  }
  const run = (cls, rng) => {
    const t = resolveTarget({ kind: 'dummy', seconds: 10 });
    return simulatePve({ fighter: preparePveFighter(fighterOf(cls)), enemy: t.enemy, maxMs: t.maxMs, rng, ...t.opts });
  };

  it('Necromancer: every minion draw comes from the minion lane, in order, whatever the other lanes do', () => {
    const quiet = recording(7, 3);
    run('NECROMANCER', quiet.rng);
    expect(quiet.drawn.length).toBeGreaterThan(0);
    expect(quiet.drawn).toEqual(take(fightRng(7, 3).lane('minion'), quiet.drawn.length));
    // a build that makes extra player-lane draws leaves the minion's draws untouched
    const busy = recording(7, 3);
    take(busy.rng.lane('player'), 57);
    take(busy.rng.lane('enemy'), 31);
    run('NECROMANCER', busy.rng);
    const n = Math.min(quiet.drawn.length, busy.drawn.length);
    expect(busy.drawn.slice(0, n)).toEqual(quiet.drawn.slice(0, n));
  });

  it('Mystic: no minion in the fixture build, so its minion lane is never drawn', () => {
    const r = recording(7, 3);
    run('MYSTIC', r.rng);
    expect(r.drawn).toEqual([]);
  });
});

describe('fightRng lanes', () => {
  it('(seed, i) names one lane family: same everywhere, different per fight, independent per lane', () => {
    const a = fightRng(5, 2);
    const b = fightRng(5, 2);
    expect(take(a.lane('player'), 5)).toEqual(take(b.lane('player'), 5));
    expect(take(fightRng(5, 2).lane('enemy'), 5)).not.toEqual(take(fightRng(5, 3).lane('enemy'), 5));
    // drawing the base stream or another lane does not move a lane
    const c = fightRng(5, 2);
    take(c, 10);
    take(c.lane('enemy'), 10);
    expect(take(c.lane('player'), 5)).toEqual(take(fightRng(5, 2).lane('player'), 5));
    expect(take(fightRng(5, 2).lane('player'), 5)).not.toEqual(take(fightRng(5, 2).lane('enemy'), 5));
  });
});

describe('lanes keep the distribution (marginal invariance)', () => {
  const N = process.env.HARNESS_DEEP ? 4000 : 300;
  for (const cls of CLASSES) {
    for (const target of TARGETS) {
      it(`${cls} vs ${target.kind}: lane and single-stream samples agree (KS p > 0.01, N = ${N})`, () => {
        const prepared = preparePveFighter(fighterOf(cls));
        const out = outcomeFn(target);
        const single = Array.from({ length: N }, (_, i) => out(prepared, mulberry32(hashSeed('single', i))));
        const lanes = Array.from({ length: N }, (_, i) => out(prepared, laneRng(hashSeed('lanes', i))));
        expect(ksP(single, lanes)).toBeGreaterThan(0.01);
      }, 120_000);
    }
  }
});

// The measurement asked for by finding #75: paired sd of a +5 % Attack Speed change, lanes vs one
// shared stream, on the same fight seeds. Recorded in simulation.md §Common random numbers.
describe('lanes pair builds more tightly than one shared stream', () => {
  const N = 120;
  const pairedSd = (cls, target, mk) => {
    const f = fighterOf(cls);
    const a = preparePveFighter(f);
    const b = preparePveFighter(faster(f));
    const out = outcomeFn(target);
    return sd(Array.from({ length: N }, (_, i) => {
      const s = hashSeed('crn', i);
      return out(b, mk(s)) - out(a, mk(s));
    }));
  };
  for (const cls of ['WARRIOR', 'MYSTIC']) {
    it(`${cls}, dungeon_3 step 4 time to kill: paired sd at least 20 % lower`, () => {
      const t = TARGETS[1];
      const single = pairedSd(cls, t, mulberry32);
      const lanes = pairedSd(cls, t, laneRng);
      expect(lanes).toBeLessThan(0.8 * single);
    }, 60_000);
  }

  it('PVP, Sentinel attacking Mystic: at most 70 % of the discordant duels (per side lanes)', () => {
    const f = fighterOf('SENTINEL');
    const A = fighterDuelArgs(f);
    const G = fighterDuelArgs(faster(f));
    const B = fighterDuelArgs(fighterOf('MYSTIC'));
    const discordant = (mk) => {
      let n = 0;
      for (let i = 0; i < 100; i++) {
        const s = hashSeed('crn-pvp', i);
        n += runDuel({ attacker: A, defender: B, rng: mk(s) }).attackerWon !== runDuel({ attacker: G, defender: B, rng: mk(s) }).attackerWon;
      }
      return n;
    };
    expect(discordant(laneRng)).toBeLessThan(0.7 * discordant(mulberry32));
  }, 120_000);
});
