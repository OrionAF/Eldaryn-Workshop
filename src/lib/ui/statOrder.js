// Display-only class ordering; see docs/Reference/ui/stat-display-order.md.
import { STATS } from '../game/stats.js';

const START = ['ATTACK', 'ATTACK_PERCENT', 'HEALTH', 'HEALTH_PERCENT', 'ATTACK_SPEED', 'CRIT_CHANCE'];
const END = ['PENETRATION', 'SPELL_RESIST', 'PVP_ATTACK', 'PVP_DEFENSE', 'FLAME_CONDUIT', 'EARTHEN_CONDUIT', 'DARK_CONDUIT'];
const ORDERS = {
  MYSTIC: [...START, 'SPELL_CRIT_CHANCE', 'CRIT_DAMAGE', 'SPELL_DAMAGE', 'LIFESTEAL', 'SPELL_VAMP', 'HP_REGEN',
    'DAMAGE_REDUCTION', 'BLOCK_CHANCE', 'DISRUPTION_CHANCE', ...END],
  SENTINEL: [...START, 'CRIT_DAMAGE', 'DOUBLE_HIT', 'SPELL_DAMAGE', 'LIFESTEAL', 'HP_REGEN',
    'MISS_CHANCE', 'BLIND_CHANCE', 'PARALYZE_CHANCE', ...END],
  WARRIOR: [...START, 'CRIT_DAMAGE', 'DOUBLE_HIT', 'SPELL_DAMAGE', 'LIFESTEAL', 'HP_REGEN',
    'DAMAGE_REDUCTION', 'BLOCK_CHANCE', ...END],
  NECROMANCER: [...START.slice(0, 5), 'SPELL_CRIT_CHANCE', 'CRIT_DAMAGE', 'SPELL_DAMAGE', 'SPELL_VAMP', 'HP_REGEN',
    'FEAR_CHANCE', 'SPELL_RESIST', 'DOMINION', 'MINION_ATTACK', 'MINION_HEALTH', 'MINION_ATTACK_SPEED',
    'MINION_CRIT_CHANCE', 'MINION_LIFESTEAL', 'SOUL_LINK', ...END.slice(2)],
};
const ALIASES = new Map([
  ['totalAttack', 'ATTACK'], ['totalHp', 'HEALTH'], ['hp', 'HEALTH'], ['health', 'HEALTH'],
  ['attack', 'ATTACK'], ['hpPercent', 'HEALTH_PERCENT'], ['totalDominion', 'DOMINION'],
  ['dominion', 'DOMINION'], ['minionAttackPercent', 'MINION_ATTACK'], ['minionHealthPercent', 'MINION_HEALTH'],
  ...['Flame', 'Earthen', 'Dark'].map((name) => [`total${name}Conduit`, `${name.toUpperCase()}_CONDUIT`]),
]);
for (const stat of STATS) {
  for (const key of [stat.enumName, stat.computedKey, stat.rawKey,
    stat.enumName.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())]) {
    if (key) ALIASES.set(key, stat.enumName);
  }
}
const canonical = (key, cls) => {
  const value = String(key ?? '').replace(/^secondary:/, '').replace(/Flat$/, '');
  const name = ALIASES.get(value) ?? value;
  return cls === 'NECROMANCER' && name === 'DISRUPTION_CHANCE' ? 'FEAR_CHANCE' : name;
};

/** Sort a copy without hiding unknown stats or changing saved slot order. */
export function orderStats(items, playerClass, keyOf = (value) => value) {
  const cls = String(playerClass ?? '').toUpperCase();
  const order = ORDERS[cls];
  if (!order) return [...items];
  const ranks = new Map(order.map((key, index) => [key, index]));
  return items.map((value, index) => ({ value, index, rank: ranks.get(canonical(keyOf(value), cls)) ?? Infinity }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index).map(({ value }) => value);
}

/** UI labels only: engine metadata and saved keys remain unchanged. */
export function orderedStatLabel(key, fallback, playerClass) {
  const cls = String(playerClass ?? '').toUpperCase();
  if (!ORDERS[cls]) return fallback;
  return { ATTACK_PERCENT: 'Attack %', HEALTH_PERCENT: 'Health %', DAMAGE_REDUCTION: 'DMG Reduction',
    FEAR_CHANCE: 'Fear Chance', MINION_ATTACK_SPEED: 'Minion Attack Speed' }[canonical(key, cls)] ?? fallback;
}
