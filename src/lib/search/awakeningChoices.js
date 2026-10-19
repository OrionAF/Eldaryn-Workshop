// Actual levels include path choice; pricing remains server-controlled. Game/awakening.md §1–3.
import { AWAKENING_CONSTANTS, AWAKENING_PATHS } from '../game/awakening.js';
import { awakeningPointsForLevel } from '../model/legality.js';

export const awakeningCap = (character) => Math.min(AWAKENING_CONSTANTS.maxPoints, awakeningPointsForLevel(character.level));
export const awakeningOf = (character, cand) => cand.awakening ?? character.awakening ?? { path: null, level: 0 };
export function canonicalAwakening(character, value) {
  if (value == null) return null;
  const saved = character.awakening ?? { path: null, level: 0 };
  return value.path === saved.path && value.level === saved.level ? null : { path: value.path, level: value.level };
}

export function awakeningViolations(character, cand) {
  const value = cand.awakening;
  if (value == null) return [];
  if (typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(AWAKENING_PATHS, value.path)
    || !Number.isInteger(value.level) || value.level < 1 || value.level > awakeningCap(character)) return ['Invalid Awakening path or actual level'];
  const saved = character.awakening;
  return value.path === saved?.path && value.level < saved.level ? ['Awakening upgrades cannot reduce the current path level'] : [];
}

export function awakeningNeighbours(character, cand) {
  const out = [], saved = character.awakening;
  for (const path of Object.keys(AWAKENING_PATHS)) {
    const min = path === saved?.path ? Math.max(1, saved.level) : 1;
    for (let level = min; level <= awakeningCap(character); level++) out.push({ ...cand, awakening: { path, level } });
  }
  return out;
}

export const awakeningLabel = (value) => value?.path ? `${AWAKENING_PATHS[value.path]?.name ?? value.path} · Level ${value.level}` : 'No path';
export function awakeningCostNote(character, value) {
  return character.awakening?.path && value.path !== character.awakening.path
    ? 'Path reset: gem price unknown; check in-game. Levels use earned Awakening points.'
    : 'Uses earned Awakening points; confirm any live charges in-game.';
}
