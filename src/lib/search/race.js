// search/race.js (A4): sequential multi-arm racing with family-wise elimination. Contract:
// docs/Reference/simulation.md §Search (racing). Pure apart from the injected sample getter: the
// same arms, getter and effort give the same answer.
import { lookSchedule } from '../engine/stats/index.js';
import { contrastSets } from './sampler.js';

/**
 * @typedef {Object} RaceArm
 * @property {string} key       canonical candidate key
 * @property {number} dist      distance from the baseline (search.js distanceOf; the smallest wins a tie)
 *
 * @typedef {Object} RaceResult
 * @property {number} winner    index of the winner: the arm nearest the baseline among the leader and its ties
 * @property {number} leader    index of the best estimate at the last look
 * @property {number[]} ties    indexes resolved `equivalent` to the leader (the leader itself excluded)
 * @property {Array<{i: number, contrast: Object}>} unresolved   still open against the leader at maxN
 * @property {Array<{i: number, contrast: Object}>} eliminated   resolved `worse` than the leader
 * @property {number} looks     looks taken
 * @property {number} n         fights per arm (per lane) at the last look
 * @property {number} alphaLook the two-sided level of every elimination test
 */

/**
 * Race arms against the current leader: every arm is sampled to n0, the leader is the best estimate,
 * and an arm leaves once its paired contrast against the leader is `worse` at
 * alpha / (arms x looks) (Bonferroni over both). The race stops when one arm is left, when every
 * survivor is `equivalent` to the leader, or at maxN (the open ones are then `unresolved`).
 *
 * @param {RaceArm[]} arms   at least one; arms[0] is the incumbent by convention (not special-cased)
 * @param {Object} o
 * @param {Object} o.objective   makeObjective(...): `score`, `contrast`, `higherIsBetter`, `deltaKind`
 * @param {(arm: RaceArm, n: number) => Promise<Object>} o.getSet   the arm's first n fights on the race stage
 * @param {{alpha: number, delta: number, deltaKind: string, n0: number, maxN: number}} o.effort
 * @param {number} o.seed        the stage seed (seeds the bootstrap of quantile contrasts)
 * @param {(look: {k: number, n: number, alive: number}) => void} [o.onLook]
 * @returns {Promise<RaceResult>}
 */
export async function race(arms, { objective, getSet, effort, seed, onLook }) {
  if (!arms.length) throw new RangeError('race: no arms');
  const looks = lookSchedule(effort.n0, effort.maxN);
  const alphaLook = effort.alpha / arms.length / looks.length;
  if (arms.length === 1) return { winner: 0, leader: 0, ties: [], unresolved: [], eliminated: [], looks: 0, n: 0, alphaLook };

  const sets = new Array(arms.length);
  const alive = new Set(arms.map((_, i) => i));
  const eliminated = [];
  let leader = 0;
  let open = new Map();
  let ties = [];
  let k = 0;
  for (; k < looks.length; k++) {
    const n = looks[k];
    for (const i of [...alive].sort((a, b) => a - b)) sets[i] = await getSet(arms[i], n);
    const score = (i) => objective.score(sets[i]);
    leader = [...alive].sort((a, b) => score(b) - score(a) || arms[a].dist - arms[b].dist || a - b)[0];
    open = new Map();
    ties = [];
    const final = k === looks.length - 1;
    for (const i of [...alive].sort((a, b) => a - b)) {
      if (i === leader) continue;
      const c = contrastSets(objective, sets[i], sets[leader], { ...effort, alpha: alphaLook, seed });
      if (c.verdict === 'worse') {
        alive.delete(i);
        eliminated.push({ i, contrast: c });
      } else if (c.verdict === 'equivalent') ties.push(i);
      else open.set(i, c); // 'unresolved' at this look; 'better' cannot beat the best estimate, kept open
    }
    onLook?.({ k, n, alive: alive.size });
    if (!final && open.size === 0) break;
  }
  const last = Math.min(k, looks.length - 1);
  const pool = [leader, ...ties];
  const winner = pool.sort((a, b) => arms[a].dist - arms[b].dist
    || objective.score(sets[b]) - objective.score(sets[a]) || a - b)[0];
  return {
    winner,
    leader,
    ties: [leader, ...ties].filter((i) => i !== winner).sort((a, b) => a - b),
    unresolved: [...open].map(([i, contrast]) => ({ i, contrast })),
    eliminated,
    looks: last + 1,
    n: looks[last],
    alphaLook,
  };
}
