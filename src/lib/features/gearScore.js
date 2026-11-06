// Gear score (Character > Gear): how good an item's secondaries are for a spec, from their rolls and
// from which stats it carries. An app convention, not a game grade, like the Pet Core score
// (features/coreScore.js), whose stat weights it shares: a gear item rolls from the same class pool.
//
//   roll   mean position of every secondary between its minimum and its ceiling at the item's
//          level (the fraction the game's quality rounds, gear.md §5)
//   fit    sum of the secondaries' weights / the best weights an item of this rarity could hold
//          (its top N for N slots; an empty slot counts 0)
//   score  each secondary is worth weight x (0.5 + 0.5 x roll) against that same best: picking a
//          stat earns half, its roll the other half. Attack and Health are not rolled (gear.md §3).
import { itemStatLevel, secondaryRollFraction } from '../game/gear.js';
import { secondarySlots } from '../model/equipment.js';
import { gradeLetter } from '../format.js';

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/**
 * Score one item. Without weights only `roll` is set (fit, score and grade null).
 * @param {Object} item  model Item
 * @param {Map<string, number>|null} weights  coreScore.js statWeights
 * @param {'base'|'oblivion'} realm
 * @returns {{roll:number, fit:number|null, score:number|null, grade:string|null,
 *   secondaries:{type:string, roll:number|null, weight:number|null}[]}|null} null with no item level or no secondaries
 */
export function gearScore(item, weights, realm = 'base') {
  if (!item || item.itemLevel == null || !item.secondaryStats?.length) return null;
  const L = itemStatLevel(item.itemLevel, realm);
  const secondaries = item.secondaryStats.map((s) => ({
    type: s.type,
    roll: secondaryRollFraction(s.type, s.value, L),
    weight: weights ? (weights.get(s.type) ?? 0) : null,
  }));
  const rolls = secondaries.map((s) => s.roll).filter((f) => f != null);
  if (!rolls.length) return null;
  const roll = sum(rolls) / rolls.length;
  if (!weights) return { roll, fit: null, score: null, grade: null, secondaries };

  const best = sum([...weights.values()].sort((a, b) => b - a).slice(0, secondarySlots(item.rarity)));
  const fit = best > 0 ? Math.min(1, sum(secondaries.map((s) => s.weight)) / best) : 0;
  const score = best > 0 ? Math.min(1, sum(secondaries.map((s) => s.weight * (0.5 + 0.5 * (s.roll ?? 0)))) / best) : 0;
  return { roll, fit, score, grade: gradeLetter(score), secondaries };
}
