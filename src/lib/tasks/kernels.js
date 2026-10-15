// Pool kernels (J2): what one engine worker computes for a fight index range. Contract:
// docs/Reference/simulation.md §Worker pool. A kernel is {prepare(setup) -> ctx, run(ctx, args, from, to)
// -> chunk}: `prepare` runs once per job and worker (the target, objective, opponents), `run` gets only a
// fighter or a selector plus the range. Fight i of every kernel reads the same rng the single-thread
// code reads for index i, so a chunk is a pure function of (setup, args, i) and shards merge by index.
// A chunk is `{main: number[][], side: Object<string, number[][]>, trace?}` (sampler.js sample-set lanes;
// `trace` only when the debug log asked, simulation.md §Debug log).
import { fightRng, mulberry32, hashSeed } from '../engine/rng.js';
import { simulatePve, preparePveFighter, trainingDummy } from '../engine/pve/fight.js';
import { oblivionFloorMob } from '../engine/pve/enemies.js';
import { runDuel, fighterDuelArgs } from '../engine/pvp/resolver.js';
import { makeObjective, resolveTarget } from '../search/objectives.js';
import { duelFighter } from '../features/duel.js';

const range = (from, to, f) => {
  const out = [];
  for (let i = from; i < to; i++) out.push(f(i));
  return out;
};

export const KERNELS = {
  /**
   * The optimiser's objective (search/objectives.js `sample`). args: {fighter, seed, trace?}; `trace`
   * (the debug log) adds the fights' timing to the chunk (sampler.js fightTrace), never changes them.
   */
  objective: {
    prepare: ({ target, objective, character, partner }) => makeObjective(objective, resolveTarget(target, { character, partner })),
    async run(o, { fighter, seed, trace }, from, to) {
      if (!trace) {
        const c = await o.sample(fighter, { seed, from, to });
        return { main: c.main, side: c.side ?? {} };
      }
      const c = await o.sample(fighter, { seed, from, to, trace: true });
      return { main: c.main, side: c.side ?? {}, ...(c.trace ? { trace: c.trace } : {}) };
    },
  },

  /**
   * The Duel task: the attacker's wins as engine/metrics.js pvpWinRate draws them (fightRng(seed, i)).
   * args: {swap, seed}; swap seats the defender as the attacker.
   */
  duel: {
    prepare: ({ attacker, defender }) => ({ a: fighterDuelArgs(duelFighter(attacker)), d: fighterDuelArgs(duelFighter(defender)) }),
    run({ a, d }, { swap, seed }, from, to) {
      const won = [];
      const ms = [];
      const timedOut = [];
      for (let i = from; i < to; i++) {
        const r = runDuel({ attacker: swap ? d : a, defender: swap ? a : d, rng: fightRng(seed, i) });
        won.push(r.attackerWon ? 1 : 0);
        ms.push(r.timeMs);
        timedOut.push(r.timedOut ? 1 : 0);
      }
      return { main: [won], side: { ms: [ms], timedOut: [timedOut] } };
    },
  },

  /**
   * Drop Check's metrics (features/swap.js runSwapMetrics), each as engine/metrics.js draws it.
   * args: {metric: 'sim' | 'survival' | 'pvp:<opponent id>', fighter, seed}.
   */
  swap: {
    prepare: ({ seconds = 60, enemy = null, survivalSeconds = 60, opponents = [] }) => ({
      seconds, enemy, survivalSeconds, opponents: new Map(opponents.map((o) => [o.id, fighterDuelArgs(o.fighter)])),
    }),
    run(p, { metric, fighter, seed }, from, to) {
      if (metric === 'sim') {
        const prepared = preparePveFighter(fighter);
        const enemy = trainingDummy();
        return { main: [range(from, to, (i) => simulatePve({ fighter: prepared, enemy, maxMs: p.seconds * 1000, rng: fightRng(seed, i) }).damageDealt / p.seconds)], side: {} };
      }
      if (metric === 'survival') {
        const prepared = preparePveFighter(fighter);
        const opts = p.enemy.oblivion ? { oblivion: { power: fighter.stats?.totalOblivionPower ?? 0 } } : {};
        const alive = (i) => (simulatePve({ fighter: prepared, enemy: p.enemy.mobs, maxMs: p.survivalSeconds * 1000, rng: fightRng(seed, i), ...opts }).hpLeft > 0 ? 1 : 0);
        return { main: [range(from, to, alive)], side: {} };
      }
      const opp = p.opponents.get(metric.slice(4));
      if (!metric.startsWith('pvp:') || !opp) throw new Error(`swap kernel: unknown metric '${metric}'`);
      const me = fighterDuelArgs(fighter);
      return { main: [range(from, to, (i) => (runDuel({ attacker: me, defender: opp, rng: fightRng(seed, i) }).attackerWon ? 1 : 0))], side: {} };
    },
  },

  /**
   * Stat weights (features/statWeights.js runStatWeights), each metric as engine/metrics.js draws it. The
   * enemy rides in args because the reference enemy's Attack is searched during the job.
   * args: {metric: 'dps' | 'survival', fighter, enemy?, seed}.
   */
  statWeights: {
    prepare: ({ seconds = 60, survivalSeconds = 60 }) => ({ seconds, survivalSeconds }),
    run(p, { metric, fighter, enemy, seed }, from, to) {
      const prepared = preparePveFighter(fighter);
      if (metric === 'dps') {
        const dummy = trainingDummy();
        return { main: [range(from, to, (i) => simulatePve({ fighter: prepared, enemy: dummy, maxMs: p.seconds * 1000, rng: fightRng(seed, i) }).damageDealt / p.seconds)], side: {} };
      }
      if (metric !== 'survival') throw new Error(`statWeights kernel: unknown metric '${metric}'`);
      const alive = (i) => (simulatePve({ fighter: prepared, enemy, maxMs: p.survivalSeconds * 1000, rng: fightRng(seed, i) }).hpLeft > 0 ? 1 : 0);
      return { main: [range(from, to, alive)], side: {} };
    },
  },

  /** Oblivion floors (tasks/oblivionFloors.js): fight k of a floor uses mulberry32(hashSeed(seed, k)). args: {floor, seed}. */
  oblivion: {
    prepare: ({ fighter, power, applyOutputCut = false, maxMs }) => ({ prepared: preparePveFighter(fighter), power, applyOutputCut, maxMs }),
    run({ prepared, power, applyOutputCut, maxMs }, { floor, seed }, from, to) {
      const mob = oblivionFloorMob(floor);
      const won = [];
      const ms = [];
      const timedOut = [];
      for (let k = from; k < to; k++) {
        const r = simulatePve({
          fighter: prepared, enemy: mob, mode: 'oblivion', oblivion: { power }, applyOutputCut,
          ...(maxMs != null ? { maxMs } : {}), rng: mulberry32(hashSeed(seed, k)),
        });
        won.push(r.won ? 1 : 0);
        ms.push(r.timeMs);
        timedOut.push(r.timedOut ? 1 : 0);
      }
      return { main: [won], side: { ms: [ms], timedOut: [timedOut] } };
    },
  },
};
