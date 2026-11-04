/**
 * petView.js - display order and filter for the Pet Core collection. View only: nothing here writes to the store.
 */
import { CORE_RARITY_NAMES } from '../../lib/model/pets.js';

export const SORT_OPTIONS = [
  { value: 'added', label: 'Added' },
  { value: 'rarity', label: 'Rarity, high to low' },
  { value: 'attack', label: 'Base Attack, high to low' },
  { value: 'hp', label: 'Base HP, high to low' },
  { value: 'score', label: 'Score, high to low' },
];
export const SHOW_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'used', label: 'In use' },
  { value: 'unused', label: 'Unused' },
];

const rank = (c) => CORE_RARITY_NAMES.indexOf(c.rarity);
const KEYS = { rarity: rank, attack: (c) => c.baseAttack, hp: (c) => c.baseHp, score: (c, scores) => scores?.get(c.id) ?? -1 };

/**
 * Filter by use, then sort (stable: ties keep the order they were added in). Unknown modes behave as 'all' / 'added'.
 * @param {object[]} cores
 * @param {'added'|'rarity'|'attack'|'hp'|'score'} sort
 * @param {'all'|'used'|'unused'} show
 * @param {Set<string>} usedIds ids of cores some preset uses
 * @param {Map<string, number>} [scores] core id -> score (features/coreScore.js); unscored cores sort last
 */
export function viewCores(cores, sort, show, usedIds, scores) {
  let out = cores.filter((c) => (show === 'used' ? usedIds.has(c.id) : show === 'unused' ? !usedIds.has(c.id) : true));
  const key = KEYS[sort];
  if (key) out = out.map((c, i) => [c, i]).sort((a, b) => key(b[0], scores) - key(a[0], scores) || a[1] - b[1]).map(([c]) => c);
  return out;
}
