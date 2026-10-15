// engine/pve/fortressBoss.js: the clan-war Fortress boss as a PVE target (clan-fortress.md §1.4, §2.5, §3.1).
// The boss is a plain attacking mob with a 60 s window; the clan's credit multipliers (shield, contribution
// bonus, star vulnerability) are constant within a run, so they are display-only and never enter a score.
import {
  FORTRESS_BOSSES, FORTRESS_CONSTANTS, BOSS_SHIELD_CONTROL_POINTS, FORTRESS_STARS, CONTRIBUTION_BONUS,
} from '../../game/fortress.js';

export const FORTRESS_BOSS_GROUPS = Object.freeze(Object.keys(FORTRESS_BOSSES));
export const MAX_SHIELD_PERCENT = 60;

/** The boss fight as the engine plays it: one mob, the 60 s window (`fightDurationMs`). */
export function fortressBossMob(group) {
  const b = FORTRESS_BOSSES[group];
  if (!b) return null;
  return {
    id: `fortress_boss_${group}`, name: b.name, mode: 'fortressBoss', hp: b.baseHp, attack: b.attack,
    attackSpeed: b.attackSpeed, fightDurationMs: FORTRESS_CONSTANTS.bossFightDurationMs,
  };
}

/**
 * Boss shield percent (module 4305 `calculateBossShield`, clan-fortress.md §3.1): the control points
 * interpolated piecewise-linearly over alive defenders / the server's max clan size (`clanCapForServer`; confirmed by
 * two server snapshots), 0 when the cap is not positive. The client's `startingDefenders` guard is taken as met.
 */
export function calculateBossShield(aliveDefenders, clanCap) {
  if (!(clanCap > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, aliveDefenders) / clanCap);
  const pts = [...BOSS_SHIELD_CONTROL_POINTS].sort((a, b) => a.ratio - b.ratio);
  for (let i = 1; i < pts.length; i++) {
    const lo = pts[i - 1];
    const hi = pts[i];
    if (ratio <= hi.ratio) {
      const t = hi.ratio === lo.ratio ? 1 : (ratio - lo.ratio) / (hi.ratio - lo.ratio);
      return Math.min(MAX_SHIELD_PERCENT, lo.shield + (hi.shield - lo.shield) * t);
    }
  }
  return Math.min(MAX_SHIELD_PERCENT, pts.at(-1).shield);
}

/** `shieldToMultiplier`: the share of damage that gets through a shield percent. */
export const shieldToMultiplier = (shieldPercent) => Math.max(0, 1 - shieldPercent / 100);

/** `calculateContributionBonus`: 1 + 0.05 per kill, at most 2. */
export const calculateContributionBonus = (kills) => Math.min(CONTRIBUTION_BONUS.max, CONTRIBUTION_BONUS.base + CONTRIBUTION_BONUS.perKill * kills);

/** `calculateStarVulnerabilityMultiplier` (§2.5): 4 stars is 6.0x. */
export function calculateStarVulnerability(stars) {
  const amp = FORTRESS_STARS.dmgAmpPercentByStars;
  const pct = stars < amp.length ? amp[Math.max(0, Math.floor(stars))] : amp.at(-1) + (stars - (amp.length - 1)) * FORTRESS_STARS.dmgAmpPerExtraStar;
  return 1 + pct / 100;
}

/**
 * The credit multipliers of a resolved fortress-boss spec (CORE has no stars: 1x). `shieldPercent`, when given
 * (read off the siege screen), is used directly instead of the alive-defenders / `clanCap` interpolation.
 */
export function fortressBossMultipliers({ group, stars, aliveDefenders, clanCap, shieldPercent: given = null, kills }) {
  const shieldPercent = given == null ? calculateBossShield(aliveDefenders, clanCap) : Math.min(MAX_SHIELD_PERCENT, Math.max(0, given));
  const shieldMultiplier = shieldToMultiplier(shieldPercent);
  const contributionBonus = calculateContributionBonus(kills);
  const starVulnerability = group === 'CORE' ? 1 : calculateStarVulnerability(stars);
  return {
    shieldPercent, shieldMultiplier, contributionBonus, starVulnerability,
    total: shieldMultiplier * contributionBonus * starVulnerability,
  };
}

/** Raw damage and the damage the clan is credited: round(raw * shield * contribution * star). */
export function fortressBossCredit(multipliers, rawDamage) {
  return { raw: Math.round(rawDamage), effective: Math.round(rawDamage * multipliers.total) };
}
