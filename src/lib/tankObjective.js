/**
 * tankObjective.js - the "Tank" optimization goal (Warrior).
 *
 * THE PROBLEM: the game exposes nothing about incoming damage - monster
 * attack speed, hit sizes, and ability damage are all unmeasurable in-game -
 * so a literal "simulate this dungeon fight" objective is impossible.
 *
 * THE INVERSION: instead of asking "do I survive dungeon X?" (needs enemy
 * data we don't have), score each build on what it could survive, computed
 * purely from the player's OWN stats:
 *
 *  1. SUSTAINABLE INCOMING DPS - the largest raw (pre-mitigation) incoming
 *     damage-per-second at which the build's recovery still keeps up:
 *         sustainDps = selfHps / landedFraction
 *     where selfHps is computeHps (HP Regen as % of max Health per second +
 *     Lifesteal from the build's own closed-form DPS) and landedFraction is
 *     the expected share of a raw damage stream that actually lands:
 *         landedFraction = (1 - DMG Reduction) * (1 - Block Chance)
 *     A block negates the entire hit for PVE (the PVP chain lets the
 *     attacker's Penetration through, but dungeon monsters' Penetration is
 *     unknowable - assumed 0). Bigger sustainDps = holds steady against
 *     harder-hitting content, in real damage units, with no monster numbers.
 *
 *  2. EFFECTIVE HP - the burst buffer against spike damage:
 *         ehp = Health / (1 - DMG Reduction)
 *     Block is deliberately EXCLUDED here: it's chance-based and boss
 *     abilities may be unblockable, and a spike kills before regen matters.
 *     We can't know an ability's damage, but a bigger effective pool is
 *     strictly better against any spike - ranking is what the optimizer
 *     needs, not absolute survival.
 *
 * THE BLEND: score = (1 + ehp)^w * (1 + sustainDps)^(1 - w), a geometric
 * blend with w = ehpWeight in [0, 1]. Geometric (not a weighted sum) because
 * the two metrics live in different units/scales - a ratio-scale blend needs
 * no baseline normalization and is monotone in both inputs. The +1 floors
 * keep a zero-sustain build scorable (so the search can still move) while
 * heavily favoring any sustain at all when w < 1. The unknowns we cannot
 * measure (attack cadence, ability details) are absorbed into w instead of
 * pretending to know enemy stats.
 *
 * Closed-form and cheap (like sigilAwareDpsObjective) - used single-stage,
 * no Monte Carlo screening needed. Sigil ACTIVE damage is not folded into
 * the lifesteal term (only base closed-form DPS is); passives are already
 * inside the totals.
 */

import { computeHps } from './dps.js';
import { computePresetTotals } from './totals.js';

/** Named ehpWeight defaults for the UI; 'custom' (slider) covers the rest. */
export const TANK_PROFILES = [
  { id: 'max-tank', label: 'Max Tankiness', ehpWeight: 0.75 },
  { id: 'balanced', label: 'Balanced Tank', ehpWeight: 0.5 },
];

/**
 * The tank metrics for one set of (already-capped) display totals.
 * Returns { ehp, selfHps, landedFraction, sustainDps }.
 */
export function tankMetrics(totals) {
  const dr = (totals.dmg_reduction || 0) / 100; // capped at 60% by applyStatCaps
  const block = (totals.block_chance || 0) / 100; // capped at 80%
  const ehp = totals.health / (1 - dr);
  const selfHps = computeHps(totals).total_hps;
  // Caps guarantee landedFraction >= 0.4 * 0.2 = 0.08; the guard is belt-and-braces.
  const landedFraction = Math.max((1 - dr) * (1 - block), 1e-6);
  const sustainDps = selfHps / landedFraction;
  return { ehp, selfHps, landedFraction, sustainDps };
}

/**
 * Objective factory for optimize(): scores a candidate build by the
 * geometric ehp/sustain blend above. `ehpWeight` 1 = pure burst buffer,
 * 0 = pure sustain.
 */
export function createTankObjective({ ehpWeight = 0.5 } = {}) {
  const w = Math.min(1, Math.max(0, Number(ehpWeight) || 0));
  return (candidateCharacter, candidatePreset) => {
    const totals = computePresetTotals(candidateCharacter, candidatePreset);
    const { ehp, sustainDps } = tankMetrics(totals);
    return Math.pow(1 + ehp, w) * Math.pow(1 + sustainDps, 1 - w);
  };
}
