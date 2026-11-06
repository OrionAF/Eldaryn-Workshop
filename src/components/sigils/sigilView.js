// Display helpers for the Sigils screen: turn a level-scaled spell (engine/sources/sigilScale) into
// label/value rows. Pure; numbers come from scaledSigilSpell, nothing is recomputed here.
// Field meanings: Game/sigils.md §5-§6.
import { scaledSigilSpell, spellTypeOf } from '../../lib/engine/sources/sigilScale.js';
import { sigilBySpecies } from '../../lib/game/sigils.js';
import { conditionLabel, ancientSigils, utilitySigils, genericSigils, maxSigilSlots, slotUnlockLevel } from '../../lib/model/sigils.js';

const STAT_LABELS = {
  ATTACK_PERCENT: 'Attack',
  HP_PERCENT: 'Health',
  ATTACK_SPEED: 'Attack Speed',
  MISS_CHANCE: 'Miss Chance',
  HP_REGEN: 'HP Regen',
  SPELL_DAMAGE: 'Spell Damage',
  DAMAGE_REDUCTION: 'Damage Reduction',
  BLOCK_CHANCE: 'Block',
  PENETRATION: 'Penetration',
  LIFESTEAL: 'Lifesteal',
  BLIND_CHANCE: 'Blind',
  SPELL_RESIST: 'Spell Resist',
  CRIT_CHANCE: 'Crit Chance',
};

/** 'DAMAGE_REDUCTION' -> 'Damage Reduction' (known stats use the game's wording). */
export function statName(key) {
  if (STAT_LABELS[key]) return STAT_LABELS[key];
  return String(key)
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const num = (v) => (Number.isFinite(v) ? String(parseFloat(v.toFixed(2))) : '-');
const pct = (v) => `${num(v)}%`;
const secs = (ms) => `${num(ms / 1000)}s`;
// ATTACK_SPEED effects are fractions (0.1 = +0.1 Attack Speed); every other stat is a percent.
const effectValue = (e) => (e.stat === 'ATTACK_SPEED' ? `+${num(e.value)}` : `+${num(e.value)}%`);

/** What a stack sigil gains a stack on, by its kind (sigils.md §6 table). */
const STACK_TRIGGER = {
  BULWARK: 'each blocked hit',
  SUNDER: 'each landed hit (marks the enemy)',
  SIEGEBREAKER: 'each landed hit (marks the enemy)',
  ELUSIVE: 'each dodged or Blind-fizzled hit',
};
/** Per-stack fields of a stack sigil: [field, label, sign]. Reductions apply to the marked enemy. */
const STACK_FIELDS = [
  ['hpPercentPerStack', 'Health per stack', '+'],
  ['drPercentPerStack', 'Damage Reduction per stack', '+'],
  ['thornsPercentPerStack', 'Thorns per stack', '+'],
  ['attackPercentPerStack', 'Attack per stack', '+'],
  ['critChancePercentPerStack', 'Crit Chance per stack', '+'],
  ['lifestealPercentPerStack', 'Lifesteal per stack', '+'],
  ['attackSpeedPercentPerStack', 'Attack Speed per stack', '+'],
  ['drReductionPerStack', 'Enemy Damage Reduction per stack', '-'],
  ['hpRegenReductionPerStack', 'Enemy HP Regen per stack', '-'],
  ['blockReductionPerStack', 'Enemy Block per stack', '-'],
  ['missReductionPerStack', 'Enemy Miss per stack', '-'],
  ['blindReductionPerStack', 'Enemy Blind per stack', '-'],
];
/** Spell types whose numbers do not move with the sigil's level (sigils.md §5-§6). */
const CONSTANT_TYPES = new Set(['STACK', 'FORM']);

/**
 * Rows for one scaled spell.
 * @param {Object} spell  scaled spell (scaledSigilSpell result)
 * @param {string} type   spell type of that spell (AURA, DAMAGE, ...)
 * @returns {{label: string, value: string}[]}
 */
export function spellRows(spell, type) {
  if (!spell) return [];
  const rows = [];
  const add = (label, value) => rows.push({ label, value });
  switch (type) {
    case 'STANCE':
      add('Attack', `${spell.attackMult >= 1 ? '+' : ''}${num((spell.attackMult - 1) * 100)}%`);
      if (spell.hpPercent) add('Health', `+${pct(spell.hpPercent)}`);
      if (spell.spellResist) add('Spell Resist (before cap)', `+${pct(spell.spellResist)}`);
      if (spell.daze) {
        add('Daze per swing', `${pct(spell.daze.chancePercent)} for ${secs(spell.daze.durationMs)}`);
        add('Dazed enemy Miss reduction', `${num(spell.daze.penFactor * 100)}% of your Penetration`);
      }
      if (spell.shieldBash) add('Shield Bash per block', `${pct(spell.shieldBash.chancePercent)} for ${secs(spell.shieldBash.stunMs)}`);
      return rows;
    case 'AURA':
      add(statName(spell.bonusStat), spell.bonusStat === 'ATTACK_SPEED' ? `+${num(spell.bonusValue)}` : `+${num(spell.bonusValue)}%`);
      return rows;
    case 'DAMAGE':
      if (spell.attackPercent != null && Number.isFinite(spell.attackPercent)) add('Damage', `${num(spell.attackPercent)}% of Attack`);
      else if (Number.isFinite(spell.baseDamage) && spell.baseDamage > 0) add('Damage', num(spell.baseDamage));
      if (spell.isDoT && spell.damagePerTick) add('Per tick', num(spell.damagePerTick));
      if (spell.slow) add('Slow', pct(spell.slow.attackSpeedReductionPercent));
      if (spell.wound) add('Wound (regen)', `-${pct(spell.wound.regenReductionPercent)}`);
      if (spell.critDown) add('Crit Chance down', pct(spell.critDown.critChanceReduction));
      if (spell.attackDown) add('Attack down', `${pct(spell.attackDown.reductionPerStack)} per stack, up to ${pct(spell.attackDown.reductionPerStack * spell.attackDown.maxStacks)}`);
      if (spell.paralyzeMs) add('Paralyze', secs(spell.paralyzeMs));
      if (spell.fearMs) add('Fear', secs(spell.fearMs));
      if (spell.silenceMs) add('Silence', secs(spell.silenceMs));
      if (spell.selfHealPercent) add('Self heal', pct(spell.selfHealPercent));
      break;
    case 'DEBUFF': {
      add('Initial hit', `${num(spell.initialAttackPercent)}% of Attack`);
      const d = spell.debuff;
      if (spell.debuffType) add('Status', spell.debuffType.charAt(0) + spell.debuffType.slice(1).toLowerCase());
      if (d?.damagePerTickPercent != null) add('Per tick', `${pct(d.damagePerTickPercent)}${d.maxStacks > 1 ? ' per stack' : ''}`);
      if (d?.regenReductionPercent != null) add('Enemy regen', `-${pct(d.regenReductionPercent)}`);
      if (d?.maxStacks > 1) add('Max stacks', num(d.maxStacks));
      if (d?.durationMs) add('Duration', secs(d.durationMs));
      if (spell.cooldownMs) add('Cooldown', secs(spell.cooldownMs));
      return rows;
    }
    case 'BUFF':
    case 'TRANSFORM':
      for (const e of spell.effects ?? []) add(statName(e.stat), effectValue(e));
      if (spell.thornsPercent != null && Number.isFinite(spell.thornsPercent)) add('Thorns', pct(spell.thornsPercent));
      break;
    case 'HEAL':
      if (spell.healPercentPerTick != null) add('Heal', `${pct(spell.healPercentPerTick)} max HP${spell.tickIntervalMs ? ` per ${secs(spell.tickIntervalMs)}` : ''}`);
      for (const e of spell.effects ?? []) add(statName(e.stat), effectValue(e));
      break;
    case 'SHIELD':
      add('Shield', `${pct(spell.shieldHpPercent)} of max HP`);
      return rows;
    case 'SUMMON':
      add('Minion Attack', pct(spell.attackPercent));
      add('Minion Health', pct(spell.hpPercent));
      return rows;
    case 'STACK': {
      // Constant at every level (sigils.md §6): what a stack is gained on, what each stack gives, the cap, the loss.
      if (STACK_TRIGGER[spell.kind]) add('Gains a stack on', STACK_TRIGGER[spell.kind]);
      for (const [key, label, sign] of STACK_FIELDS) if (spell[key]) add(label, `${sign}${pct(spell[key])}`);
      if (spell.maxStacks) add('Max stacks', num(spell.maxStacks));
      if (spell.stackLossPerHit) add('Lost per unblocked hit', `${num(spell.stackLossPerHit)} ${spell.stackLossPerHit === 1 ? 'stack' : 'stacks'}`);
      if (spell.decayPerSecond) add('Enemy stacks decay', `${num(spell.decayPerSecond)}/s`);
      return rows;
    }
    case 'FORM': {
      // The form's multipliers, then its bonus stats, which count like gear (sigils.md §5).
      if (spell.gearHpMult != null && spell.gearHpMult !== 1) add('Health from gear', `×${num(spell.gearHpMult)}`);
      if (spell.attackMult != null && spell.attackMult !== 1) add('Attack', `×${num(spell.attackMult)}`);
      if (spell.attackSpeedMult != null && spell.attackSpeedMult !== 1) add('Attack Speed', `×${num(spell.attackSpeedMult)}`);
      // Without the bear, Block and Damage Reduction "count for nothing" (the game's Tank goal text, sigils.md §5).
      if (spell.unlocksBlockAndDr != null) add('Block and Damage Reduction', spell.unlocksBlockAndDr ? 'Unlocked' : 'Ignored');
      for (const e of spell.effects ?? []) add(statName(e.stat), effectValue(e));
      return rows;
    }
    default:
      return rows;
  }
  if (spell.durationMs) add('Duration', secs(spell.durationMs));
  if (spell.cooldownMs) add('Cooldown', secs(spell.cooldownMs));
  return rows;
}

/**
 * The display blocks for one sigil at `level` on `spec`: a single block normally, one per form
 * (Bear / Wolf) for a Druid's form-conditional variant.
 * `constant` marks a spell type whose numbers do not change with the level (Stack, Form).
 * @returns {{title: string|null, form: string|null, type: string, rows: {label:string,value:string}[], constant: boolean}[]}
 */
export function sigilSpellBlocks(species, level, spec = null) {
  const def = sigilBySpecies(species);
  if (!def) return [];
  const lvl = Math.max(1, level || 1);
  const dv = spec === 'MYSTIC_DRUID' ? def.druidVariant : null;
  if (dv?.formSpell) {
    return Object.keys(dv.formSpell).map((form) => {
      const spell = scaledSigilSpell(species, lvl, spec, form);
      const type = spellTypeOf(dv.formSpell[form], def.spellType);
      return { title: dv.name, form, type, rows: spellRows(spell, type), constant: CONSTANT_TYPES.has(type) };
    });
  }
  const spell = scaledSigilSpell(species, lvl, spec, null);
  const type = dv ? spellTypeOf(dv.spell, def.spellType) : def.spellType;
  return [{ title: dv?.name ?? null, form: null, type, rows: spellRows(spell, type), constant: CONSTANT_TYPES.has(type) }];
}

/** Display text for an activation condition id (model/sigils.js, shared with the optimiser). */
export { conditionLabel };

/**
 * Which slot of `preset` a sigil would take: 'ancient', 'utility' or 'generic', or null when the preset's
 * spec cannot use it (a Druid-only sigil on a Mage preset, a Shield sigil on a Warrior).
 */
export function equipKind(character, preset, species) {
  const cls = character.class;
  const spec = character.talentSets?.[preset.talentSet]?.spec ?? null;
  const has = (list) => list.some((s) => s.species === species);
  if (has(ancientSigils(cls))) return 'ancient';
  if (has(utilitySigils(cls, spec))) return 'utility';
  if (has(genericSigils(cls, spec))) return 'generic';
  return null;
}

/**
 * One "Equip in" menu row per preset for a sigil: checked when equipped, disabled with a reason when it
 * cannot be (unowned, wrong spec, no free or unlocked slot). Rows are Menu items (`id` is the preset id).
 */
export function equipItems(character, species) {
  const owned = !!character.sigils.owned[species];
  const slots = maxSigilSlots(character.level, character.class);
  return character.presets.map((preset) => {
    const kind = equipKind(character, preset, species);
    const equipped = [...preset.sigilSpecies, preset.utilitySigilSpecies, preset.ancientSigilSpecies].includes(species);
    let reason = '';
    if (!equipped) {
      if (!owned) reason = 'not owned';
      else if (!kind) reason = 'not usable on this spec';
      else if (slots === 0) reason = `unlocks at level ${slotUnlockLevel(1, character.class)}`;
      else if (kind === 'generic' && preset.sigilSpecies.length >= slots) reason = 'no free slot';
    }
    return { id: preset.id, label: preset.name, checked: equipped, disabled: !!reason, meta: reason || undefined };
  });
}

/** The `setPresetSigils` argument that toggles `species` in `preset` (null when it has no slot kind). */
export function equipPatch(character, preset, species) {
  const kind = equipKind(character, preset, species);
  if (kind === 'ancient') return { ancient: preset.ancientSigilSpecies === species ? null : species };
  if (kind === 'utility') return { utility: preset.utilitySigilSpecies === species ? null : species };
  if (kind === 'generic') {
    return { species: preset.sigilSpecies.includes(species) ? preset.sigilSpecies.filter((s) => s !== species) : [...preset.sigilSpecies, species] };
  }
  return null;
}

export const COLLECTION_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'owned', label: 'Owned' },
  { id: 'unowned', label: 'Not owned' },
  { id: 'unequipped', label: 'Unequipped' },
];

/**
 * Whether a sigil passes a collection filter. `level` is its owned level (0 = not owned);
 * `usedBy` lists the presets that equip it. Unequipped = owned but in no preset.
 */
export function matchesCollectionFilter(filter, level, usedBy) {
  if (filter === 'owned') return level > 0;
  if (filter === 'unowned') return !(level > 0);
  if (filter === 'unequipped') return level > 0 && usedBy.length === 0;
  return true;
}
