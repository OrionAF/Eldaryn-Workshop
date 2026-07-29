/**
 * sigilsData.js - static Sigil catalogue per class (game content, not
 * persisted user state - same principle as relicsData.js/talentTreeData.js).
 *
 * Each class has its own fixed set of 12 sigils; a character equips up to
 * PRESET_SIGIL_CAP (3) of them at a time. Every sigil can have a passive
 * effect, an active effect, or both:
 *
 * SigilDef = {
 *   id: string,          // stable slug, referenced by Preset.sigilIds
 *   name: string,
 *   rarity: string,      // one of RARITIES (constants.js)
 *   passive: { stats: [{ statKey, value }] } | null,
 *     // permanent while equipped
 *   active: { stats: [{ statKey, value }], durationSec, cooldownSec, damage } | null,
 *     // stats apply for durationSec after activation. `damage` is flat pure
 *     // damage on activation (0 = buff only). The activation model these
 *     // fields feed is combat-model.md §7.
 *   notes: string,       // exact in-game tooltip text, kept as ground truth
 * }
 *
 * statKey values reference STAT_FIELDS keys (constants.js); `value` follows
 * each field's kind ('flat' raw number / 'pct' percentage points).
 *
 * Passive stats feed totals.js (sigilsContribution); active effects feed
 * the battle simulation via sigilEffects.js, which also holds the extra
 * per-sigil mechanic parameters (stack counts, tick damage) this tooltip-
 * shaped schema can't express, plus the closed-form expectation of those
 * actives (expectedSigilActiveDps) that the optimizer's fast objective uses.
 */

/** Forge sigils per class. Ancient conduit sigils (below) are extra. */
export const SIGIL_COUNT_PER_CLASS = 12;

export const SIGILS_BY_CLASS = {
    Warrior: [
    {
      id: 'defense-stance',
      name: 'Defense Stance',
      rarity: 'Common',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }, { statKey: 'health_pct', value: 0 }] },
      active: null,
      notes: 'Increase Health by XX.X%',
    },
    {
      id: 'blade-of-judgment',
      name: 'Blade of Judgment',
      rarity: 'Common',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 0, cooldownSec: 8, damage: 0 },
      notes: 'Deals XX damage to the enemy.',
    },
    {
      // The id carries an old typo but is a PERSISTED key (character.sigilValues,
      // preset.sigilIds), so it stays; only the display name is corrected.
      // assets.js aliases the matching icon filename.
      id: 'berserkt-stance',
      name: 'Berserk Stance',
      rarity: 'Common',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }, { statKey: 'attack_pct', value: 0 }] },
      active: null,
      notes: 'Increase Attack by XX.X%',
    },
    {
      id: 'rejuvenation',
      name: 'Rejuvenation',
      rarity: 'Uncommon',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [{ statKey: 'hp_regen', value: 0 }], durationSec: 6, cooldownSec: 12, damage: 0 },
      notes: 'Restores XX.X% HP per second for 6s.',
    },
    {
      id: 'arrowstorm',
      name: 'Arrowstorm',
      rarity: 'Uncommon',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 6, cooldownSec: 10, damage: 0 },
      notes: 'Deals XX damage every 2s for 6s.',
    },
    {
      id: 'warborn-fury',
      name: 'Warborn Fury',
      rarity: 'Uncommon',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [{ statKey: 'attack_pct', value: 0 }, { statKey: 'penetration', value: 0 }, { statKey: 'dmg_reduction', value: 0 }], durationSec: 5, cooldownSec: 15, damage: 0 },
      notes: 'Increases Attack by XX.X%, Penetration by XX% and DMG Reduction by XX.X% for 5s.',
    },
    {
      id: 'iron-bastion',
      name: 'Iron Bastion',
      rarity: 'Rare',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [{ statKey: 'health_pct', value: 0 }, { statKey: 'dmg_reduction', value: 0 }, { statKey: 'block_chance', value: 0 }], durationSec: 6, cooldownSec: 28, damage: 0 },
      notes: 'Increases Health by XX.X%, DMG Reduction by XX.X% and Block Chance by XX.X% for 6s.',
    },
    {
      id: 'cataclysm',
      name: 'Cataclysm',
      rarity: 'Rare',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 0, cooldownSec: 10, damage: 0 },
      notes: 'Deals XX damage to the enemy.',
    },
    {
      id: 'withering-touch',
      name: 'Withering Touch',
      rarity: 'Epic',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 8, cooldownSec: 15, damage: 0 },
      notes: 'Deals XX damage.  Reduces enemy HP Regen by XX% for 8s.',
    },
    {
      id: 'hemorrhage',
      name: 'Hemorrhage',
      rarity: 'Epic',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 0, cooldownSec: 10, damage: 0 },
      notes: 'Deals XX initial damage.  Bleeds for XX damage every 2s per stack.  Stacks up to 8x.',
    },
    {
      id: 'sunder-mark',
      name: 'Sunder Mark',
      rarity: 'Legendary',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 0, cooldownSec: 0, damage: 0 },
      notes: 'Every landed hit marks the enemy (max 8 stacks) - each stack strips 4% DMG Reduction, 4% Block Chance, 4% Miss Chance and 4% Blind Chance.  The enemy sheds 1.75 stacks every second.',
    },
    {
      id: 'bulwark-of-thorns',
      name: 'Bulwark of Thorns',
      rarity: 'Legendary',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 0, cooldownSec: 0, damage: 0 },
      notes: 'Each blocked hit grants a stack (max 8) - every stack givse +4% Health%, +2% DMG Reduction and +4% Thorns (reflect damage).  Taking an unblocked hit burns 2 stacks.',
    },
    {
      id: 'earthwarden',
      name: 'Earthwarden',
      rarity: 'Ancient',
      transcendenceNode: '1:1',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [{ statKey: 'attack_pct', value: 0 }, { statKey: 'health_pct', value: 0 }], durationSec: 60, cooldownSec: 0, damage: 0 },
      notes: 'Charge 7000 Chrono Flux in battle (from your Eternal conduits) to awaken: transform for 60s, increasing Attack by 30%, Health by 100%. Once per fight - no cooldown.',
    },
    {
      id: 'flameborn',
      name: 'Flameborn',
      rarity: 'Ancient',
      transcendenceNode: '27:1',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [{ statKey: 'attack_pct', value: 0 }, { statKey: 'health_pct', value: 0 }], durationSec: 60, cooldownSec: 0, damage: 0 },
      notes: 'Charge 7000 Chrono Flux in battle (from your Eternal conduits) to awaken: transform for 60s, increasing Attack by 80%, Health by 50%. Once per fight - no cooldown.',
    },
  ],
    Sentinel: [
    {
      id: 'wild-renewal',
      name: 'Wild Renewal',
      rarity: 'Common',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }, { statKey: 'hp_regen', value: 0 }] },
      active: null,
      notes: 'Increases HP Regeneration by XX.X%/s',
    },
    {
      id: 'mist-veil',
      name: 'Mist Veil',
      rarity: 'Common',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }, { statKey: 'miss_chance', value: 0 }] },
      active: null,
      notes: 'Increases Miss Chance by XX.X%',
    },
    {
      id: 'hawk-focus',
      name: 'Hawk Focus',
      rarity: 'Common',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }, { statKey: 'speed', value: 0 }] },
      active: null,
      notes: 'Increases Attack Speed by XX%',
    },
    {
      id: 'sanguine-rush',
      name: 'Sanguine Rush',
      rarity: 'Uncommon',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [{ statKey: 'speed', value: 0 }, { statKey: 'lifesteal', value: 0 }], durationSec: 6, cooldownSec: 14, damage: 0 },
      notes: 'Increases Attack Speed by XX%, Lifesteal by XX% for 6s.',
    },
    {
      id: 'crimson-arrow',
      name: 'Crimson Arrow',
      rarity: 'Uncommon',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 0, cooldownSec: 9, damage: 0 },
      notes: 'Deals XX damage to the enemy.',
    },
    {
      id: 'phantom-veil',
      name: 'Phantom Veil',
      rarity: 'Uncommon',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [{ statKey: 'miss_chance', value: 0 }], durationSec: 8, cooldownSec: 16, damage: 0 },
      notes: 'Increases Miss Chance by XX.X% for 8s.',
    },
    {
      id: 'venom-wound',
      name: 'Venom Wound',
      rarity: 'Rare',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 10, cooldownSec: 13, damage: 0 },
      notes: 'Deals XX damage, then poisons for XX damage per second over 10s.',
    },
    {
      id: 'blinding-mark',
      name: 'Blinding Mark',
      rarity: 'Rare',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [{ statKey: 'blind_chance', value: 0 }], durationSec: 5, cooldownSec: 12, damage: 0 },
      notes: 'Increases Blind Chance by XX% for 5s.',
    },
    {
      id: 'ember-curse',
      name: 'Ember Curse',
      rarity: 'Epic',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 0, cooldownSec: 10, damage: 0 },
      notes: 'Deals XX initial damage. Bleeds for XX damage every 2s per stack.  Stacks up to 8x.',
    },
    {
      id: 'thunderbind',
      name: 'Thunderbind',
      rarity: 'Epic',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 0, cooldownSec: 12, damage: 0 },
      notes: 'Deals XX damage to the enemy.  Paralyzes the enemy for 2s.',
    },
    {
      id: 'elusive-supremacy',
      name: 'Elusive Supremacy',
      rarity: 'Legendary',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 0, cooldownSec: 0, damage: 0 },
      notes: 'Each dodged or Blind-fizzled hit grants a stack (max 8) - every stack gives +3% Attack%, +3% Crit Chance, +3% Lifesteal and +3% Attack Speed.  Taking an unblocked hit burns 2 stacks.',
    },
    {
      id: 'siegebreaker-mark',
      name: 'Siegebreaker Mark',
      rarity: 'Legendary',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [], durationSec: 0, cooldownSec: 0, damage: 0 },
      notes: 'Every landed hit marks the enemy (max 8) - each stack strips 3% HP Regen, 4% Block Chance, 4% Miss Chance and 4% Blind Chance.  The enemy sheds 1.75 stacks every second.',
    },
    {
      id: 'stormcaller',
      name: 'Stormcaller',
      rarity: 'Ancient',
      transcendenceNode: '1:1',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [{ statKey: 'attack_pct', value: 0 }, { statKey: 'health_pct', value: 0 }], durationSec: 60, cooldownSec: 0, damage: 0 },
      // Never scraped - the transform percentages stay manual until observed.
      notes: 'Charge Chrono Flux in battle (from your Eternal conduits) to awaken: transform, increasing Attack and Health. Once per fight - no cooldown.',
    },
    {
      id: 'flameborn',
      name: 'Flameborn',
      rarity: 'Ancient',
      transcendenceNode: '27:1',
      passive: { stats: [{ statKey: 'attack', value: 0 }, { statKey: 'health', value: 0 }] },
      active: { stats: [{ statKey: 'attack_pct', value: 0 }, { statKey: 'health_pct', value: 0 }], durationSec: 60, cooldownSec: 0, damage: 0 },
      notes: 'Charge 7000 Chrono Flux in battle (from your Eternal conduits) to awaken: transform for 60s, increasing Attack by 80%, Health by 50%. Once per fight - no cooldown.',
    },
  ],
};

/**
 * Ancient ("conduit") sigils are unlocked from the Transcendence tree rather
 * than the Forge, so they carry a `transcendenceNode` position instead of just
 * appearing at a Forge tier. Both trees put one at each top corner
 * (transcendenceData.js: '1:1' is top-left, '27:1' top-right):
 *   Warrior  1:1 Earthwarden   27:1 Flameborn
 *   Sentinel 1:1 Stormcaller   27:1 Flameborn
 * They still need Forge Tier 2 as well (SIGIL_MIN_FORGE_TIER.Ancient).
 */
export function isConduitSigil(def) {
  return !!def?.transcendenceNode;
}

/** The class's normal Forge sigils (everything not unlocked via Transcendence). */
export function forgeSigils(characterClass) {
  return (SIGILS_BY_CLASS[characterClass] || []).filter((d) => !isConduitSigil(d));
}

/** The class's Transcendence-unlocked Ancient sigils. */
export function conduitSigils(characterClass) {
  return (SIGILS_BY_CLASS[characterClass] || []).filter(isConduitSigil);
}

/**
 * True when a conduit sigil's Transcendence node is unlocked on this character.
 * Non-conduit sigils are always "unlocked" by this test - use sigilUnlockedAt
 * for the Forge-tier gate, which applies to both.
 */
export function conduitNodeUnlocked(def, character) {
  if (!isConduitSigil(def)) return true;
  const unlocked = character?.transcendence?.unlockedPositions;
  return Array.isArray(unlocked) && unlocked.includes(def.transcendenceNode);
}

/**
 * Sigil stat derivation - THE EVIDENCE LIVES IN
 * docs/Reference/Notes/big-rework-v1-notes.md ("Sigil stats"), which records
 * the formula, the 331 rows it was verified against, why Math.floor rather
 * than Math.round, why the Legendary/Ancient x3 ladder starts at Forge Tier 2,
 * the 14 unexplained level-5 Health rows, and the curve-fitting wrong turn
 * that nearly produced a Legendary slope below Epic's. Do not re-derive any of
 * it from the raw scrape; do not restate it here.
 *
 * Local invariants the code below depends on:
 *  - Levels run 1..SIGIL_MAX_LEVEL. Level 0 = not owned, contributes nothing
 *    (mirrors a relic at level 0).
 *  - Levels 14..30 are the scraped formulas EXTENDED - the scrape stopped at
 *    13. Each stat's cap still binds, which is what keeps the extension sane.
 */
export const SIGIL_MAX_LEVEL = 30;
export const SIGIL_MAX_TIER = 3;

const SIGIL_LEVEL_OFFSET = 9;

/** Per-rarity Attack/Health slope (value at level 1 = slope * 10, at min tier). */
export const SIGIL_RARITY_CURVES = {
  Common: { attack: 16.6, health: 130.0 },
  Uncommon: { attack: 42.6, health: 291.2 },
  Rare: { attack: 114.0, health: 840.0 },
  Epic: { attack: 360.0, health: 2320.0 },
  Legendary: { attack: 2700.0, health: 17400.0 },
  Ancient: { attack: 1800.0, health: 12000.0 },
};

/**
 * The lowest Sigil Forge Tier at which a rarity can be equipped at all.
 * Legendary/Ancient sigils only exist from Forge Tier 2 up, which is also
 * where their x3 ladder starts. Everything else starts at 1.
 */
export const SIGIL_MIN_FORGE_TIER = {
  Legendary: 2,
  Ancient: 2,
};

/** Lowest forge tier this sigil can be equipped at (1 for most rarities). */
export function sigilMinForgeTier(def) {
  return SIGIL_MIN_FORGE_TIER[def?.rarity] ?? 1;
}

/** False when the Forge Tier is too low for this sigil to exist yet. */
export function sigilUnlockedAt(def, forgeTier) {
  const t = Math.max(1, Math.min(Math.round(forgeTier) || 1, SIGIL_MAX_TIER));
  return t >= sigilMinForgeTier(def);
}

/** True if a sigil's flat Attack/Health can be derived from its rarity curve. */
export function hasSigilCurve(def) {
  return !!(def && SIGIL_RARITY_CURVES[def.rarity]);
}

/**
 * A sigil's derived passive flat stat ('attack' or 'health') at the given
 * level and global Forge Tier. Returns 0 for a sigil with no baked curve, at
 * level < 1 (level 0 = not owned), or below the sigil's minimum forge tier.
 */
export function sigilStat(def, statKey, level, forgeTier) {
  const curve = def && SIGIL_RARITY_CURVES[def.rarity];
  if (!curve || (statKey !== 'attack' && statKey !== 'health')) return 0;
  const l = Math.min(Math.round(Number(level)) || 0, SIGIL_MAX_LEVEL);
  if (l < 1) return 0;
  const t = Math.max(1, Math.min(Math.round(forgeTier) || 1, SIGIL_MAX_TIER));
  const exponent = t - sigilMinForgeTier(def);
  if (exponent < 0) return 0;
  return Math.floor(curve[statKey] * (l + SIGIL_LEVEL_OFFSET) * Math.pow(3, exponent));
}

/**
 * Per-level effect magnitudes (the numbers inside a sigil's tooltip).
 *
 * The growth law, its verification (309 of 310 scraped magnitudes, the one
 * miss being an OCR glitch), and why magnitudes depend on level only and never
 * on Forge Tier are in docs/Reference/Notes/big-rework-v1-notes.md
 * ("Sigil effect magnitudes"). Not restated here.
 *
 * Schema notes for the table below:
 *  - `cap` is per sigil AND per stat, never global - Iron Bastion's DMG
 *    Reduction caps at 35% where Warborn Fury's caps at 30%.
 *  - `stepsFrom` overrides the growth law for the one stat that genuinely
 *    defies it. It maps a starting level to a value, so it extends to any max
 *    level rather than enumerating rows.
 *  - A statKey ABSENT from a sigil's `effects` stays a manual input on the
 *    Sigils screen. That is the deliberate fallback for anything the scrape
 *    could not read.
 */
export const SIGIL_EFFECT_GROWTH = 0.08;

const SIGIL_EFFECTS = {
  'defense-stance': { health_pct: { base: 8, decimals: 1 } },
  'berserkt-stance': { attack_pct: { base: 4, decimals: 1 } },
  rejuvenation: { hp_regen: { base: 8, decimals: 1 } },
  'warborn-fury': {
    attack_pct: { base: 12, decimals: 1, cap: 20 },
    dmg_reduction: { base: 20, decimals: 1, cap: 30 },
    // penetration deliberately omitted - unscraped at most levels, stays manual.
  },
  'iron-bastion': {
    health_pct: { base: 30, decimals: 1, cap: 50 },
    dmg_reduction: { base: 20, decimals: 1, cap: 35 },
    block_chance: { base: 10, decimals: 1 },
  },
  'withering-touch': { regenDebuffPct: { base: 60, decimals: 1 } },
  'wild-renewal': { hp_regen: { base: 5, decimals: 1 } },
  'mist-veil': { miss_chance: { base: 8, decimals: 1 } },
  'hawk-focus': { speed: { base: 10, decimals: 0 } },
  'sanguine-rush': {
    // A step, not a curve: 20% through level 4, then a flat 30% from level 5 -
    // observed identically at Tier 1 and Tier 2. `stepsFrom` is the level at
    // which the second value takes over, so it extends to any max level.
    speed: { decimals: 0, stepsFrom: { 1: 20, 5: 30 } },
    lifesteal: { base: 15, decimals: 1 },
  },
  'phantom-veil': { miss_chance: { base: 15, decimals: 1 } },
  'blinding-mark': { blind_chance: { base: 30, decimals: 1 } },
  // Conduit sigils: only ever observed at level 1 (at both Forge tiers 2 and
  // 3, with identical text), so their transform percentages are recorded flat
  // until level scaling is actually seen. Stormcaller has no scrape at all and
  // is deliberately absent, so its numbers stay manual.
  earthwarden: { attack_pct: { flat: 30 }, health_pct: { flat: 100 } },
  flameborn: { attack_pct: { flat: 80 }, health_pct: { flat: 50 } },
};

/**
 * The resolved magnitude of one of a sigil's effect stats at a level, or null
 * when this sigil/stat isn't baked (caller falls back to the user's own entry).
 */
export function sigilEffectValue(def, statKey, level) {
  const spec = def && SIGIL_EFFECTS[def.id]?.[statKey];
  if (!spec) return null;
  const l = Math.min(Math.round(Number(level)) || 0, SIGIL_MAX_LEVEL);
  if (l < 1) return 0;
  if (spec.flat != null) return spec.flat;
  if (spec.stepsFrom) {
    // Highest breakpoint at or below this level wins.
    let out = null;
    for (const [from, v] of Object.entries(spec.stepsFrom)) {
      if (l >= Number(from)) out = v;
    }
    return out;
  }
  let v = spec.base * (1 + SIGIL_EFFECT_GROWTH * (l - 1));
  if (spec.cap != null) v = Math.min(v, spec.cap);
  const p = 10 ** (spec.decimals ?? 1);
  return Math.round(v * p) / p;
}

/** True when any of this sigil's effect magnitudes are derived from level. */
export function hasSigilEffectValues(def) {
  return !!(def && SIGIL_EFFECTS[def.id]);
}

/** Every baked statKey for a sigil (empty when it has no derived magnitudes). */
export function sigilEffectKeys(def) {
  return Object.keys((def && SIGIL_EFFECTS[def.id]) || {});
}
