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
    default:
      return rows; // STACK / FORM: constant at every level (sigils.md §5)
  }
  if (spell.durationMs) add('Duration', secs(spell.durationMs));
  if (spell.cooldownMs) add('Cooldown', secs(spell.cooldownMs));
  return rows;
}

/**
 * The display blocks for one sigil at `level` on `spec`: a single block normally, one per form
 * (Bear / Wolf) for a Druid's form-conditional variant.
 * @returns {{title: string|null, form: string|null, type: string, rows: {label:string,value:string}[]}[]}
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
      return { title: dv.name, form, type, rows: spellRows(spell, type) };
    });
  }
  const spell = scaledSigilSpell(species, lvl, spec, null);
  const type = dv ? spellTypeOf(dv.spell, def.spellType) : def.spellType;
  return [{ title: dv?.name ?? null, form: null, type, rows: spellRows(spell, type) }];
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
