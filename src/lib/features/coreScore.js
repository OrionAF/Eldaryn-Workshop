// Pet Core score (Character > Pets): how good a core is for a spec, from its rolls and from which
// secondaries it carries. An app convention, not a game grade, like the stone roll grade
// (model/stones.js stoneRollGrade). Pure: the stat-priority data is passed in.
//
// Stat weights come from Tools > Stat Priorities (features/statPriority.js): leaderboard keep rates
// of the spec at the character's level bracket. A core rolls from the same class pool as gear
// (Game/pet-cores.md §5), so the same keep rates apply. Weight is the keep rate on a fixed log
// scale: kept at KEEP_FULL x drop odds or more is 1, at drop odds 0.5, at 1 / KEEP_FULL or less 0.
// Fixed rather than stretched over the pool, so a bracket whose keep rates all sit near 1 (a weak
// signal) yields mild weights instead of decisive ones.
//
//   roll   mean position of base ATK, base HP and every secondary in its possible range (dice only)
//   fit    sum of the secondaries' weights / the best weights a core of this rarity could hold
//          (its top N for N slots; an empty slot counts 0)
//   score  BASE_SHARE x mean base roll + (1 - BASE_SHARE) x secondary value, where each secondary
//          is worth weight x (0.5 + 0.5 x roll) against that same best: picking a stat earns half,
//          its roll the other half
import { coreSlots, coreBaseRollFraction, coreSecondaryRollFraction } from '../model/pets.js';
import { gradeLetter } from '../format.js';
import { presetBrackets } from './statPriority.js';

/** Keep rate that earns full weight (statPriority.js keepStep's top step). */
export const KEEP_FULL = 2;
/** Share of the score the base ATK/HP roll carries; the secondaries carry the rest. */
export const BASE_SHARE = 0.25;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => sum(xs) / xs.length;

/** One scored bracket (statPriority.js scoreRange) -> Map type -> weight 0..1 (see top); null without stats. */
export function statWeights(scored) {
  const stats = scored?.stats;
  if (!stats?.length) return null;
  const w = (kr) => Math.min(1, Math.max(0, 0.5 + (0.5 * Math.log(kr)) / Math.log(KEEP_FULL)));
  return new Map(stats.map((s) => [s.type, w(s.keepRate)]));
}

/**
 * The weights to score with: the class's specs, the chosen one (`specKey`, else the class's first),
 * and its preset bracket holding `level` (else its top bracket). null for a class the data lacks;
 * bracket and weights are null when the spec has no bracket with enough players.
 */
export function coreScoreBasis(data, cls, level, specKey = null) {
  const specs = data.specs.filter((s) => s.class === String(cls ?? '').toUpperCase());
  if (!specs.length) return null;
  const spec = specs.find((s) => s.spec === specKey) ?? specs[0];
  const brackets = presetBrackets(data, spec.spec);
  const bracket = brackets.find((b) => level >= b.lo && level <= b.hi) ?? brackets.at(-1) ?? null;
  return { specs, spec, bracket, weights: statWeights(bracket) };
}

/**
 * Score one core. Without weights only `roll` is set (fit, score and grade null).
 * @returns {{roll:number, fit:number|null, score:number|null, grade:string|null,
 *   secondaries:{type:string, roll:number|null, weight:number|null}[]}|null} null when nothing grades
 */
export function coreScore(core, weights) {
  const base = [coreBaseRollFraction(core.rarity, 'attack', core.baseAttack), coreBaseRollFraction(core.rarity, 'hp', core.baseHp)].filter((f) => f != null);
  const secondaries = core.secondaries.map((s) => ({
    type: s.type,
    roll: coreSecondaryRollFraction(s.type, s.value),
    weight: weights ? (weights.get(s.type) ?? 0) : null,
  }));
  const rolls = [...base, ...secondaries.map((s) => s.roll).filter((f) => f != null)];
  if (!rolls.length) return null;
  const roll = mean(rolls);
  if (!weights) return { roll, fit: null, score: null, grade: null, secondaries };

  const best = sum([...weights.values()].sort((a, b) => b - a).slice(0, coreSlots(core.rarity)));
  const fit = best > 0 ? Math.min(1, sum(secondaries.map((s) => s.weight)) / best) : 0;
  const value = best > 0 ? Math.min(1, sum(secondaries.map((s) => s.weight * (0.5 + 0.5 * (s.roll ?? 0)))) / best) : 0;
  const score = BASE_SHARE * (base.length ? mean(base) : 0) + (1 - BASE_SHARE) * value;
  return { roll, fit, score, grade: gradeLetter(score), secondaries };
}
