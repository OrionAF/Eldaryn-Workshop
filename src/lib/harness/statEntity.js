// harness/statEntity.js (H1, shared with H3): which entity fields each computed stat feeds, read off
// createPlayerEntity itself so the table cannot drift. Test support only.
import { createPlayerEntity } from '../engine/core/entity.js';

const NAMES = [
  'totalHp', 'totalAttack', 'totalAttackSpeed', 'totalDoubleHit', 'totalCritChance', 'totalCritDamage', 'totalLifesteal',
  'totalHpRegen', 'totalDamageReduction', 'totalBlockChance', 'totalMissChance', 'totalBlindChance', 'totalParalyzeChance',
  'totalPenetration', 'totalDisruptionChance', 'totalPvpAttack', 'totalPvpDefense', 'totalSpellDamage', 'totalSpellResist',
  'totalSpellCritChance', 'totalSpellVamp',
];

/** @type {Record<string, string[]>} stat key -> the entity fields it feeds */
export const statToEntity = (() => {
  const probe = {};
  NAMES.forEach((n, i) => { probe[n] = i + 1; });
  const entity = createPlayerEntity(probe);
  const map = {};
  NAMES.forEach((n, i) => { map[n] = Object.keys(entity).filter((k) => entity[k] === i + 1); });
  return map;
})();
