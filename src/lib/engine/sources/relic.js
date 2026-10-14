// Relic source: equipped relics' per-level stats as an additive bundle. Pure.
// Facts: docs/Reference/Game/relics.md §2, §7. How the bundle enters the totals is an assumption
// (rebuild-plan §4): added as additive points, like the pet and stone bundles.
import { relicById } from '../../game/relics.js';
import { emptyPetBonuses, secondaryKey } from './pet.js';

/** @returns {import('../types.js').StoneBonuses} (pet set + pvpAttack/pvpDefense; oblivionPower stays 0) */
export const emptyRelicBonuses = () => ({
  ...emptyPetBonuses(),
  pvpAttack: 0,
  pvpDefense: 0,
  oblivionPower: 0,
});

// port of getRelicStatAtLevel L1142576-1142598: linear base -> max, no clamping
export function relicStatAt(base, max, level, maxLevel) {
  if (maxLevel <= 1 || level <= 1) return base;
  return base + ((max - base) * (level - 1)) / (maxLevel - 1);
}

/** RelicStatType -> bonus key. HP_PERCENT feeds healthPercent; the rest camel-case 1:1. */
const relicKey = (stat) => (stat === 'HP_PERCENT' ? 'healthPercent' : secondaryKey(stat));

/**
 * @param {{id?: string, level: number, def?: object}[]} equipped  `def` overrides the catalogue lookup.
 *   Unknown ids are skipped. Values are stored units (relics.md §7): attackSpeed is a multiplier
 *   delta, critDamage a fraction (0.4 = +40%), the rest percent points.
 * @returns {import('../types.js').StoneBonuses}
 */
export function calculateRelicBonuses(equipped) {
  const out = emptyRelicBonuses();
  for (const e of equipped ?? []) {
    const def = e.def ?? relicById(e.id);
    if (!def) continue;
    for (const b of def.bonuses) {
      const key = relicKey(b.stat);
      if (!(key in out)) continue;
      out[key] += relicStatAt(b.base, b.max, e.level, def.maxLevel);
    }
  }
  return out;
}
