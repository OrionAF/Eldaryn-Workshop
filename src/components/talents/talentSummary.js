// talentSummary.js - the totals one talent set grants, for the inspector's set-effect summary (ia.md §5.10).
// The sums are the engine's own (calculateTalentBonuses, talents.md §6); this only labels and formats them.
import { calculateTalentBonuses } from '../../lib/engine/sources/talents.js';
import { statLabel, formatNodeStat } from '../transcendence/statLabels.js';

/** @returns {{ stat: string, label: string, text: string }[]} every non-zero total, largest tree order first. */
export function setEffects(specKey, allocation) {
  if (!specKey) return [];
  return Object.entries(calculateTalentBonuses(specKey, allocation))
    .filter(([, value]) => value > 0)
    .map(([stat, value]) => ({ stat, label: statLabel(stat), text: formatNodeStat(stat, value) }));
}
