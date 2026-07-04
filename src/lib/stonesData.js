/**
 * stonesData.js - static definitions for the 5 Socketed Stone types
 * (docs/socketed-stones-design.md §2). Each type fixes how many of its
 * bonus-stat rows are forced PVP Attack/Defense vs. freely rolled:
 *   fixedKeys   - stat keys auto-included on every stone of this type, value
 *                 left blank to fill in (Eldaryn/Mythic: both PVP Attack AND
 *                 PVP Defense).
 *   fixedChoice - if set, a pair of keys the player picks exactly ONE of
 *                 (Azure: PVP Attack XOR PVP Defense, never both).
 *   freeCount   - how many additional freely-chosen (non-PVP) stat rows.
 * fixedKeys.length + (fixedChoice ? 1 : 0) + freeCount is each type's total
 * bonus-stat count from the design doc (2/2/2/3/4).
 *
 * `color`/`tint` mirror app.css's --stone-<type>/--stone-<type>-tint tokens
 * (kept in sync by hand, same duplication pattern as the --nav-<domain>
 * tokens) - components read these JS values directly so tile styling doesn't
 * need a runtime hex->rgba conversion.
 */
export const STONE_TYPES = [
  { key: 'verdant', label: 'Verdant Wardstone', fixedKeys: [], fixedChoice: null, freeCount: 2, color: '#22c55e', tint: 'rgba(34, 197, 94, 0.12)' },
  { key: 'crimson', label: 'Crimson Warstone', fixedKeys: [], fixedChoice: null, freeCount: 2, color: '#ef4444', tint: 'rgba(239, 68, 68, 0.12)' },
  { key: 'azure', label: 'Azure Duelstone', fixedKeys: [], fixedChoice: ['pvp_attack', 'pvp_defense'], freeCount: 1, color: '#3b82f6', tint: 'rgba(59, 130, 246, 0.12)' },
  { key: 'eldaryn', label: 'Eldaryn Stone', fixedKeys: ['pvp_attack', 'pvp_defense'], fixedChoice: null, freeCount: 1, color: '#a855f7', tint: 'rgba(168, 85, 247, 0.12)' },
  { key: 'mythic', label: 'Mythic Soulstone', fixedKeys: ['pvp_attack', 'pvp_defense'], fixedChoice: null, freeCount: 2, color: '#ec4899', tint: 'rgba(236, 72, 153, 0.12)' },
];

export function stoneTypeDef(key) {
  return STONE_TYPES.find((t) => t.key === key) || null;
}
