/**
 * pvpArchetypes.js - the generated PVP "archetype gauntlet" opponent
 * catalogue (goals/linking redesign decision 4).
 *
 * Each archetype is a class-scoped stat SHAPE, not a fixed opponent: an
 * attack/health split of a primary budget plus a fixed kit of secondary
 * stats (already-effective values, hard-cap-clamped, class-appropriate).
 * Scaling to a budget B gives a concrete opponent whose magnitude matches
 * that budget - the gauntlet anchors B to the player's own build
 * (Attack + Health), so every duel is an equal-resources fairness test
 * until the gear power formula (parallel data track) lands.
 *
 * Hardcoded like awakeningData.js / talentTreeData.js - the same for every
 * player, tunable starter numbers. v1 archetypes carry no sigils and no
 * PVP Attack/Defense ratings (documented future refinement).
 *
 * ⚠ THE NUMBERS BELOW ARE [INVENTED] starter values. When tuning one, keep it
 * far enough below its hard cap that the ±12% jitter stays legal - clamping
 * happens silently and collapses a whole archetype's variants onto one value.
 * The Blocklord's 80 Block is deliberately AT the cap and so jitters downward
 * only; that is a legal opponent, just a less varied one.
 *
 * The budget anchor (player Attack + Health) is crude - it treats a point of
 * each as interchangeable and ignores every secondary, which is what the
 * build-power metric is meant to replace (combat-audit §C5).
 */

import { emptyStats } from './model.js';
import { clampToHardCaps } from './statCaps.js';
import { mulberry32 } from './simulation.js';

export const ARCHETYPES_BY_CLASS = {
  Warrior: [
    { id: 'w-berserker', name: 'Berserker', description: 'All-in burst — huge Attack, crit, speed; paper-thin.', attackShare: 0.85, healthShare: 0.15, secondaries: { crit: 50, crit_mult: 250, speed: 190, double_hit: 40, penetration: 40 } },
    { id: 'w-juggernaut', name: 'Juggernaut', description: 'Immovable — max mitigation, block, regen; low damage.', attackShare: 0.2, healthShare: 0.8, secondaries: { dmg_reduction: 55, block_chance: 70, hp_regen: 35, spell_resist: 45 } },
    { id: 'w-bruiser', name: 'Bruiser', description: 'Balanced fighter with sustain.', attackShare: 0.5, healthShare: 0.5, secondaries: { crit: 30, crit_mult: 200, speed: 150, lifesteal: 25, dmg_reduction: 25 } },
    { id: 'w-vampire', name: 'Vampire', description: 'Lifesteal-sustained aggressor.', attackShare: 0.6, healthShare: 0.4, secondaries: { lifesteal: 60, crit: 35, speed: 160, hp_regen: 20 } },
    // Penetration sits below the 70 hard cap by more than the ±12% jitter, so
    // every variant is a legal opponent AND they actually differ - a secondary
    // parked at or above its cap collapses to one clamped value.
    { id: 'w-penetrator', name: 'Penetrator', description: 'Ignores armour and blocks.', attackShare: 0.7, healthShare: 0.3, secondaries: { penetration: 62, crit: 45, crit_mult: 230, speed: 160 } },
    { id: 'w-blocklord', name: 'Blocklord', description: 'Block-wall attrition.', attackShare: 0.35, healthShare: 0.65, secondaries: { block_chance: 80, dmg_reduction: 40, hp_regen: 30, lifesteal: 20 } },
  ],
  Sentinel: [
    { id: 's-marksman', name: 'Marksman', description: 'Precision glass cannon.', attackShare: 0.85, healthShare: 0.15, secondaries: { crit: 50, crit_mult: 250, speed: 200, double_hit: 45, penetration: 40 } },
    { id: 's-disruptor', name: 'Disruptor', description: 'Locks you out with misses, blinds, paralysis.', attackShare: 0.5, healthShare: 0.5, secondaries: { miss_chance: 55, blind_chance: 35, paralyze_chance: 15, speed: 180 } },
    { id: 's-evasion', name: 'Evasion Tank', description: 'Never gets hit; grinds you down.', attackShare: 0.3, healthShare: 0.7, secondaries: { miss_chance: 60, hp_regen: 35, spell_resist: 45, blind_chance: 25 } },
    { id: 's-lifebruiser', name: 'Lifesteal Bruiser', description: 'Sustained aggressive Sentinel.', attackShare: 0.6, healthShare: 0.4, secondaries: { lifesteal: 60, crit: 35, speed: 170, miss_chance: 25 } },
    { id: 's-critfisher', name: 'Crit Fisher', description: 'Massive crit-multiplier gambles.', attackShare: 0.75, healthShare: 0.25, secondaries: { crit: 50, crit_mult: 320, speed: 150, penetration: 35 } },
    { id: 's-balanced', name: 'Balanced', description: 'Even offense/defense with control.', attackShare: 0.5, healthShare: 0.5, secondaries: { crit: 30, crit_mult: 200, speed: 150, miss_chance: 30, hp_regen: 20 } },
  ],
};

/** Golden-ratio seed mix (mirrors simulation.js's private iterationSeed) for deterministic per-variant RNG. */
function mixSeed(base, i) {
  return (base + Math.imul(i, 0x9e3779b9)) >>> 0;
}

/**
 * A concrete opponent profile from an archetype shape at a primary budget.
 * Attack/Health scale with the budget; secondaries are budget-independent
 * effective values, clamped to the hard caps (like a hand-entered opponent).
 */
export function scaleArchetype(archetype, characterClass, budget) {
  const B = Math.max(0, Number(budget) || 0);
  const stats = emptyStats({
    attack: Math.round(B * archetype.attackShare),
    health: Math.round(B * archetype.healthShare),
    ...archetype.secondaries,
  });
  return {
    archetypeId: archetype.id,
    archetypeName: archetype.name,
    name: archetype.name,
    class: characterClass,
    stats: clampToHardCaps(stats),
    sigilIds: [],
    sigilValues: {},
    specialGlyphIds: [],
  };
}

/**
 * `count` opponent profiles for one archetype: the base shape first, then
 * deterministically jittered variants (±~12% on the split and every
 * secondary, seeded by `seed`) so the gauntlet spans a spread, not a point.
 */
export function archetypeVariants(archetype, characterClass, budget, seed, count = 2) {
  const out = [scaleArchetype(archetype, characterClass, budget)];
  for (let v = 1; v < count; v++) {
    const rng = mulberry32(mixSeed(seed, v));
    const jf = () => 1 + (rng() - 0.5) * 0.24; // ±12%
    let aShare = archetype.attackShare * jf();
    let hShare = archetype.healthShare * jf();
    const sum = aShare + hShare || 1;
    aShare /= sum;
    hShare /= sum;
    const secondaries = {};
    for (const [k, val] of Object.entries(archetype.secondaries)) secondaries[k] = val * jf();
    const variant = scaleArchetype({ ...archetype, attackShare: aShare, healthShare: hShare, secondaries }, characterClass, budget);
    variant.name = `${archetype.name} v${v + 1}`;
    out.push(variant);
  }
  return out;
}

/**
 * The full gauntlet opponent list: every archetype of BOTH classes (you
 * face both on the ladder), base + jittered variants, tagged by archetype.
 */
export function generateGauntlet({ budget, seed = 1, variantsPerArchetype = 2 } = {}) {
  const opponents = [];
  let ai = 0;
  for (const characterClass of Object.keys(ARCHETYPES_BY_CLASS)) {
    for (const archetype of ARCHETYPES_BY_CLASS[characterClass]) {
      const aSeed = mixSeed(seed, ++ai);
      for (const opp of archetypeVariants(archetype, characterClass, budget, aSeed, variantsPerArchetype)) {
        opponents.push(opp);
      }
    }
  }
  return opponents;
}
