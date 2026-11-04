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

const raw = (set) => (set?.spec ? calculateTalentBonuses(set.spec, set.allocation) : {});

/**
 * What `mine` grants over `other`, per stat. A stat only `mine` grants shows its full value; one only `other`
 * grants shows as a loss. Differences that round away are dropped.
 * @param {{spec: ?string, allocation: object}} mine
 * @param {{spec: ?string, allocation: object}} other
 * @returns {{ stat: string, label: string, text: string, sign: 1 | -1 }[]}
 */
export function diffEffects(mine, other) {
  const a = raw(mine);
  const b = raw(other);
  const rows = [];
  for (const stat of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const delta = (a[stat] ?? 0) - (b[stat] ?? 0);
    const sign = delta > 0 ? 1 : -1;
    const text = formatNodeStat(stat, Math.abs(delta));
    if (Math.abs(delta) < 1e-9 || /^\+0(\.0+)?%?$/.test(text)) continue;
    rows.push({ stat, label: statLabel(stat), text: sign > 0 ? text : `-${text.slice(1)}`, sign });
  }
  return rows;
}
