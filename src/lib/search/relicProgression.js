// Hypothetical relic progression; cost provenance: Game/relics.md §3–4.
import { RELIC_CONSTANTS, relicById, relicsForClass } from '../game/relics.js';

export const MEDAL_TIERS = Object.freeze(Object.keys(RELIC_CONSTANTS.upgradeBaseCost));
export const normaliseRelicBudget = (raw) => Object.fromEntries(MEDAL_TIERS.map((tier) => [tier,
  Number.isSafeInteger(raw?.[tier]) && raw[tier] >= 0 ? raw[tier] : 0]));
export const relicLevel = (character, cand, id) => cand.relicLevels?.[id] ?? character.relics?.[id] ?? 0;

/** Estimated total cost from the saved level, including a level-one purchase when unowned. */
export function relicCost(character, id, level) {
  const def = relicById(id);
  if (!def) return null;
  const saved = character.relics?.[id] ?? 0;
  let amount = saved > 0 ? 0 : def.cost;
  for (let n = Math.max(1, saved); n < level; n++) {
    amount += RELIC_CONSTANTS.upgradeBaseCost[def.tier] + n * RELIC_CONSTANTS.upgradeCostPerLevel[def.tier];
  }
  return { tier: def.tier, amount, estimated: true };
}

export function relicSpend(character, cand) {
  const total = normaliseRelicBudget(null);
  for (const [id, level] of Object.entries(cand.relicLevels ?? {})) {
    const cost = relicCost(character, id, level);
    if (cost) total[cost.tier] += cost.amount;
  }
  return total;
}

/** Preserve invalid values for the legality oracle; omit only unchanged levels. */
export function canonicalRelicLevels(character, levels) {
  const entries = Object.entries(levels ?? {}).filter(([id, level]) => level !== (character.relics?.[id] ?? 0))
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? Object.fromEntries(entries) : null;
}

export function relicLevelViolations(character, cand) {
  if (cand.relicLevels == null) return [];
  if (typeof cand.relicLevels !== 'object' || Array.isArray(cand.relicLevels)) return ['Relic levels must be an object'];
  const pool = new Set(relicsForClass(character.class).map((r) => r.id));
  return Object.entries(cand.relicLevels).flatMap(([id, level]) => {
    const def = relicById(id);
    return pool.has(id) && Number.isInteger(level) && level >= Math.max(1, character.relics?.[id] ?? 0) && level <= def.maxLevel
      ? [] : [`Invalid relic progression: ${id}`];
  });
}

export function relicProgressionAllowed(character, cand, toggles, budget) {
  if (relicLevelViolations(character, cand).length) return false;
  for (const [id, level] of Object.entries(cand.relicLevels ?? {})) {
    const saved = character.relics?.[id] ?? 0;
    if (!saved && !toggles.relicPurchases) return false;
    if (level > Math.max(1, saved) && !toggles.relicUpgrades) return false;
  }
  const spend = relicSpend(character, cand);
  return MEDAL_TIERS.every((tier) => spend[tier] <= budget[tier]);
}

/** Local moves include every affordable target level, so tiny intermediate gains need not win. */
export function relicProgressionNeighbours(character, cand, { purchase = false, cap, upgrades, budget, legalise }) {
  if (!cap) return [];
  const out = [];
  const pool = relicsForClass(character.class);
  const add = (id, level, relicIds) => {
    const next = legalise({ ...cand, relicIds, relicLevels: { ...cand.relicLevels, [id]: level } });
    const spend = relicSpend(character, next);
    if (MEDAL_TIERS.every((tier) => spend[tier] <= budget[tier])) out.push(next);
  };
  for (const def of pool) {
    const saved = character.relics?.[def.id] ?? 0;
    if (purchase ? saved > 0 || cand.relicIds.includes(def.id) : !cand.relicIds.includes(def.id)) continue;
    const rows = purchase
      ? cand.relicIds.length < cap ? [[...cand.relicIds, def.id]] : cand.relicIds.map((_, i) => cand.relicIds.map((id, j) => i === j ? def.id : id))
      : [cand.relicIds];
    for (const row of rows) {
      const max = upgrades ? def.maxLevel : Math.max(1, saved);
      for (let level = Math.max(1, saved); level <= max; level++) add(def.id, level, row);
    }
  }
  return out;
}

export const medalCostText = (cost) => cost ? `Estimated cost: ${cost.amount} ${cost.tier} medals` : '';
