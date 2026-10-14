// Talent source (a3). Talent tree comes from the L1 catalogue; no model or store imports.
// See docs/Reference/Game/talents.md §6 (calculateTalentBonuses).
import { talentTiers } from '../../game/talents.js';

/** The 26-key zero template (L1096863; same field set as the transcendence template). */
export const ZERO_BONUS_KEYS = [
  'attackPercent', 'hpPercent', 'attackSpeedFlat', 'critChanceFlat', 'critDamageFlat',
  'hpRegenFlat', 'lifestealFlat', 'damageReductionFlat', 'blockChanceFlat', 'missChanceFlat',
  'blindChanceFlat', 'paralyzeChanceFlat', 'penetrationFlat', 'spellDamageFlat', 'spellVampFlat',
  'spellCritChanceFlat', 'disruptionChanceFlat', 'spellResistFlat', 'fearChanceFlat',
  'minionAttackPercent', 'minionHealthPercent', 'minionCritChanceFlat', 'minionLifestealFlat',
  'soulLinkFlat', 'minionAttackSpeedFlat', 'dominionFlat',
];

/** @returns {import('../types.js').TalentBonuses} a fresh all-zero bundle */
export function zeroBonuses() {
  const o = {};
  for (const k of ZERO_BONUS_KEYS) o[k] = 0;
  return o;
}

// port of calculateTalentBonuses L1096663-1096759
/**
 * @param {string|null} specKey  e.g. 'WARRIOR_TANK'; falsy gives the zero bundle
 * @param {Record<string, number>} allocation  talent id -> ranks (missing/0 skipped)
 * @returns {import('../types.js').TalentBonuses}
 */
export function calculateTalentBonuses(specKey, allocation) {
  const out = zeroBonuses();
  if (!specKey) return out;
  const alloc = allocation ?? {};
  for (const tier of talentTiers(specKey)) {
    for (const t of tier.talents) {
      const ranks = alloc[t.id] ?? 0;
      if (!(ranks > 0)) continue;
      const p = t.bonusPerRank;
      out[p.stat] = (out[p.stat] ?? 0) + p.valuePerRank * ranks;
      const s = t.secondaryBonusPerRank;
      if (s) out[s.stat] = (out[s.stat] ?? 0) + s.valuePerRank * ranks;
    }
  }
  return out;
}
