// Display helpers for transcendence node stats (stat keys: docs/Reference/Game/transcendence.md §3).
// Values are percent points, except the two attack-speed keys which are stored as fractions (x100 to show).
export const STAT_LABELS = {
  attackPercent: 'Attack',
  hpPercent: 'Max HP',
  attackSpeedFlat: 'Attack Speed',
  critChanceFlat: 'Crit Chance',
  critDamageFlat: 'Crit Damage',
  penetrationFlat: 'Penetration',
  lifestealFlat: 'Lifesteal',
  hpRegenFlat: 'HP Regen',
  damageReductionFlat: 'Damage Reduction',
  blockChanceFlat: 'Block Chance',
  missChanceFlat: 'Miss Chance',
  blindChanceFlat: 'Blind Chance',
  paralyzeChanceFlat: 'Paralyze Chance',
  spellDamageFlat: 'Spell Damage',
  spellVampFlat: 'Spell Vamp',
  spellCritChanceFlat: 'Spell Crit Chance',
  disruptionChanceFlat: 'Disruption Chance',
  minionAttackPercent: 'Minion Attack',
  minionHealthPercent: 'Minion Health',
  minionCritChanceFlat: 'Minion Crit Chance',
  minionLifestealFlat: 'Minion Lifesteal',
  soulLinkFlat: 'Soul Link',
  minionAttackSpeedFlat: 'Minion Atk Speed',
  dominionFlat: 'Dominion',
};

export const statLabel = (key) => STAT_LABELS[key] ?? key;

const FRACTION_KEYS = new Set(['attackSpeedFlat', 'minionAttackSpeedFlat']);

/** "+1.6%" style text; dominion is a plain level count. */
export function formatNodeStat(stat, value) {
  if (stat === 'dominionFlat') return `+${value}`;
  const shown = FRACTION_KEYS.has(stat) ? value * 100 : value;
  return `+${Number(shown.toFixed(2))}%`;
}

export const KIND_LABEL = {
  start: 'Awakened Core',
  minor: 'Common Node',
  notable: 'Uncommon Node',
  socket: 'Glyph Socket',
  sigil: 'Ancient Sigil',
};
