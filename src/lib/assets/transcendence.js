// Client emblem categories and mixed-stat priority: see ui/assets.md §Transcendence.
import { assetUrl } from './base.js';

const CATEGORY = {
  attackPercent: 'attack', attackSpeedFlat: 'attack', critChanceFlat: 'attack',
  critDamageFlat: 'attack', penetrationFlat: 'attack', lifestealFlat: 'attack',
  hpPercent: 'defense', hpRegenFlat: 'defense', damageReductionFlat: 'defense',
  blockChanceFlat: 'defense', spellResistFlat: 'defense',
  missChanceFlat: 'control', blindChanceFlat: 'control', paralyzeChanceFlat: 'control',
  disruptionChanceFlat: 'control', fearChanceFlat: 'control',
  spellDamageFlat: 'spell', spellCritChanceFlat: 'spell', spellVampFlat: 'spell',
  minionAttackPercent: 'minion', minionHealthPercent: 'minion', minionCritChanceFlat: 'minion',
  minionLifestealFlat: 'minion', minionAttackSpeedFlat: 'minion', soulLinkFlat: 'minion',
  dominionFlat: 'dominion',
};

export function transcendenceImage(node) {
  if (node?.kind !== 'minor' && node?.kind !== 'notable') return null;
  const categories = (node.stats ?? []).map(({ stat }) => CATEGORY[stat]).filter(Boolean);
  const category = node.special === 'DOMINION' ? 'dominion'
    : ['dominion', 'minion', 'spell', 'control'].find((key) => categories.includes(key)) ?? categories[0];
  if (!category) return null;
  return assetUrl(`transcendence_${category}_${node.kind === 'notable' ? 'uncommon' : 'common'}`);
}
