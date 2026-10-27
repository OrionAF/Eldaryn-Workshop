// Pure display helpers for the Mounts screen (labels only; the numbers come from model/glyphs.js and the catalogue).
import { glyphTypeInfo, glyphStatLabel, glyphSecondaryValue, glyphSecondaryDef, majorEffectAtRarity } from '../../lib/model/glyphs.js';

export const TIER_LABELS = { minor: 'Minor', major: 'Major', mythic: 'Mythic' };
export const SOCKET_LAYOUT = [
  { tier: 'minor', count: 3 },
  { tier: 'major', count: 2 },
  { tier: 'mythic', count: 1 },
];

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
/** app.css rarity theming class for a rarity name. */
export const rarityClass = (rarity) => (RARITIES.includes(rarity) ? `rarity-${rarity.toLowerCase()}` : 'rarity-unknown');

/** Camel-case stat key to words: 'critChance' -> 'Crit Chance'. */
export const statLabel = glyphStatLabel;

/** Display conversion only; stored glyph quality and engine units stay unchanged (Game/mounts-glyphs.md §9). */
export function secondaryDisplayValue(stat, value) {
  return stat === 'critDamage' ? Number((value * 100).toFixed(2)) : value;
}

export function secondaryInputValue(stat, value) {
  return stat === 'critDamage' ? value / 100 : value;
}

export function secondaryUnit(stat) {
  return stat !== 'critDamage' && glyphSecondaryDef(stat)?.decimals === 2 ? '' : '%';
}

/** '+4.2% Crit Chance' for a rolled secondary, or null. */
export function secondaryText(secondary) {
  if (!secondary) return null;
  return `+${secondaryDisplayValue(secondary.stat, glyphSecondaryValue(secondary))}${secondaryUnit(secondary.stat)} ${statLabel(secondary.stat)}`;
}

const EFFECT_PARTS = {
  cooldownseconds: (v) => `-${v}s cooldown`,
  damagepercent: (v) => `+${v}% damage`,
  thornspercent: (v) => `${v}% thorns`,
  paralyzeseconds: (v) => `+${v}s paralyze`,
  maxstacksbonus: (v) => `+${v} max stacks`,
  stackdamagepercent: (v) => `+${v}% tick damage`,
  thornsperstackpercent: (v) => `${v}% thorns per stack`,
  decaypersecond: (v) => `stack decay ${v}/s`,
  attackspeedpercent: (v) => `+${v}% attack speed`,
  maxstacks: (v) => `${v} max stacks`,
  attackspeedperstackpercent: (v) => `+${v}% attack speed per stack`,
  attackperstackpercent: (v) => `+${v}% attack per stack`,
  burnperhitoverride: (v) => `${v} stack lost per hit`,
  shieldpowerpercent: (v) => `+${v}% shield power`,
  ccseconds: (v) => `+${v}s crowd control`,
  respawnseconds: (v) => `-${v}s minion respawn`,
  wardpercent: (v) => `death ward ${v}% of the minion's max HP`,
};

/** 'Warborn Fury: -3s cooldown' style effect line for a major glyph at its rarity. */
export function majorText(glyphType, rarity) {
  const info = glyphTypeInfo(glyphType);
  const eff = majorEffectAtRarity(glyphType, rarity);
  if (!info || !eff) return '';
  const parts = Object.entries(eff.values).map(([f, v]) => (EFFECT_PARTS[f] ? EFFECT_PARTS[f](v) : `${f} ${v}`));
  return `${info.def.sigilName}: ${parts.join(', ')}`;
}

/** One-line description of any glyph instance. */
export function glyphText(glyph) {
  const info = glyphTypeInfo(glyph.glyphType);
  if (!info) return glyph.glyphType;
  if (glyph.sealed) return `${info.name} (sealed)`;
  if (info.tier === 'minor') return `${info.name}: ${secondaryText(glyph.secondary) ?? 'no stat entered'}`;
  if (info.tier === 'major') return `${info.name}: ${majorText(glyph.glyphType, glyph.rarity)}`;
  return `${info.name}: ${info.def.effectText}`;
}
