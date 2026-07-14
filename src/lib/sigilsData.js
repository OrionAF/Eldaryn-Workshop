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
 *     // stats apply for durationSec after activation; the cooldown starts
 *     // AT activation (so steady-state uptime = durationSec / cooldownSec).
 *     // `damage` is flat pure damage dealt on activation (0 = buff only).
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
      id: 'berserkt-stance',
      name: 'Berserkt Stance',
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
  ],
};
