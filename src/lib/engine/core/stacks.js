// Stack sigils: Bulwark of Thorns / Primal Instinct (bear), Elusive Supremacy, Sunder Mark and
// Siegebreaker Mark. Bulwark and Elusive share one stack counter; Sunder and Siegebreaker share the
// other. Pure state machines plus `createStackCombat`, the per-fight bundle the tick loops call.
// Module 3958, L1078983-1080177. Game facts: Game/combat-pve.md §11, Game/sigils.md §6.
import { applyCombatCeiling, ceilingFor } from './caps.js';
import { sigilBySpecies, isSigilSpeciesActiveForSpec } from '../../game/sigils.js';

/** SigilStackKind (spell.kind of a STACK sigil). */
export const STACK_KINDS = Object.freeze({
  BULWARK: 'BULWARK',
  ELUSIVE: 'ELUSIVE',
  SUNDER: 'SUNDER',
  SIEGEBREAKER: 'SIEGEBREAKER',
});
const KIND_SET = new Set(Object.values(STACK_KINDS));

/** Defaults the client falls back to when a def omits the field. */
export const DEFAULT_STACK_LOSS_PER_HIT = 2; // L1079144-1079172
export const DEFAULT_SUNDER_DECAY_PER_SECOND = 2; // L1079299-1079364

// L1080168-1080180 (module constants slot5-7)
export const EMPTY_BULWARK_MODIFIERS = Object.freeze({ hpPercent: 0, drPercent: 0, thornsPercent: 0 });
export const EMPTY_ELUSIVE_MODIFIERS = Object.freeze({
  attackPercent: 0, critChancePercent: 0, lifestealPercent: 0, attackSpeedPercent: 0,
});
export const EMPTY_SUNDER_MODIFIERS = Object.freeze({
  drReductionPercent: 0, blindReductionPercent: 0, blockReductionPercent: 0,
  missReductionPercent: 0, hpRegenReductionPercent: 0,
});

/**
 * A STACK sigil spell as stored in sigils.json (`spell` / `druidVariant.formSpell[form]`).
 * @typedef {Object} StackDef
 * @property {'BULWARK'|'ELUSIVE'|'SUNDER'|'SIEGEBREAKER'} kind
 * @property {number} maxStacks
 * @property {number} [hpPercentPerStack] @property {number} [drPercentPerStack]
 * @property {number} [thornsPercentPerStack] @property {number} [stackLossPerHit]
 * @property {number} [attackPercentPerStack] @property {number} [critChancePercentPerStack]
 * @property {number} [lifestealPercentPerStack] @property {number} [attackSpeedPercentPerStack]
 * @property {number} [drReductionPerStack] @property {number} [blindReductionPerStack]
 * @property {number} [blockReductionPerStack] @property {number} [missReductionPerStack]
 * @property {number} [hpRegenReductionPerStack] @property {number} [decayPerSecond]
 */

/**
 * Glyph overrides for the stack sigils (output of glyphMods.stackGlyphOverrides).
 * @typedef {Object} StackGlyphOverrides
 * @property {{thornsPercentPerStackBonus?: number, maxStacksBonus?: number}} [bulwark]
 * @property {{decayPerSecond: number}} [sunder]
 * @property {{attackSpeedPercentPerStackBonus?: number, attackPercentPerStackBonus?: number,
 *   stackLossPerHitOverride?: number}} [elusive]
 * @property {{decayPerSecond: number}} [siegebreaker]
 */

/**
 * Who is wearing the sigils (selects the spec/form variant of a sigil).
 * @typedef {Object} StackCtx
 * @property {string} [playerClass]  'WARRIOR' | 'SENTINEL' | 'MYSTIC' | 'NECROMANCER'
 * @property {string|null} [activeSpec]  e.g. 'MYSTIC_DRUID'
 * @property {'BEAR'|'WOLF'|null} [form]  Druid form
 */

const n0 = (v) => (v == null ? 0 : v);
const speciesOf = (e) => (typeof e === 'string' ? e : e.species);

/** Form-conditional spells of a species (Druid), or null (sigils.md §12). */
function formSpellsOf(entry) {
  return entry.druidVariant?.formSpell ?? null;
}

/**
 * The spell a sigil casts for this spec/form: a Druid takes the druidVariant, then the form
 * entry when a form is set. Mirrors getSigilDefinitionForSpec (module 3955), for STACK sigils only.
 */
function spellForSpec(entry, spec, form) {
  if (spec === 'MYSTIC_DRUID') {
    const forms = formSpellsOf(entry);
    if (form && forms?.[form]) return forms[form];
    return entry.druidVariant?.spell ?? entry.spell;
  }
  return entry.spell;
}

// port of getEquippedStackDef L1078988-1079115
/**
 * The first equipped sigil whose spell is a STACK of this kind, or null. A Druid without a form skips
 * form-conditional sigils (Primal Instinct needs Bear or Wolf).
 * @param {Array<string|{species: string}>|null|undefined} equipped  species already chosen for the spec
 * @param {'BULWARK'|'ELUSIVE'|'SUNDER'|'SIEGEBREAKER'} kind
 * @param {StackCtx} [ctx]
 * @returns {StackDef|null}
 */
export function getEquippedStackDef(equipped, kind, ctx) {
  if (!equipped) return null;
  const playerClass = ctx?.playerClass;
  const spec = ctx?.activeSpec ?? null;
  const form = ctx?.form ?? null;
  for (const e of equipped) {
    const species = speciesOf(e);
    if (!isSigilSpeciesActiveForSpec(species, playerClass, spec)) continue;
    const entry = sigilBySpecies(species);
    if (!entry) continue;
    if (spec === 'MYSTIC_DRUID' && form == null && formSpellsOf(entry) != null) continue;
    const spell = spellForSpec(entry, spec, form);
    if (spell && KIND_SET.has(spell.kind) && spell.kind === kind) return spell;
  }
  return null;
}

// port of hasBulwark L1080139-1080152
export const hasBulwark = (equipped, ctx) => getEquippedStackDef(equipped, STACK_KINDS.BULWARK, ctx) !== null;
// port of hasSunder L1080153-1080167
export const hasSunder = (equipped, ctx) => getEquippedStackDef(equipped, STACK_KINDS.SUNDER, ctx) !== null;

// port of initBulwarkRuntime L1079116-1079122
export const initBulwarkRuntime = () => ({ stacks: 0 });

// port of bulwarkOnBlock L1079123-1079143. Returns true when a stack was gained.
export function bulwarkOnBlock(rt, def) {
  if (rt.stacks >= def.maxStacks) return false;
  rt.stacks += 1;
  return true;
}

// port of bulwarkOnUnblockedHit L1079144-1079173. Returns true when stacks were lost.
export function bulwarkOnUnblockedHit(rt, def) {
  if (rt.stacks <= 0) return false;
  rt.stacks = Math.max(0, rt.stacks - (def.stackLossPerHit == null ? DEFAULT_STACK_LOSS_PER_HIT : def.stackLossPerHit));
  return true;
}

// port of bulwarkModifiers L1079174-1079208
export function bulwarkModifiers(rt, def) {
  return {
    hpPercent: rt.stacks * n0(def.hpPercentPerStack),
    drPercent: rt.stacks * n0(def.drPercentPerStack),
    thornsPercent: rt.stacks * n0(def.thornsPercentPerStack),
  };
}

// port of elusiveOnEvade L1079209-1079229. Returns true when a stack was gained.
export function elusiveOnEvade(rt, def) {
  if (rt.stacks >= def.maxStacks) return false;
  rt.stacks += 1;
  return true;
}

// port of elusiveModifiers L1079230-1079272
export function elusiveModifiers(rt, def) {
  return {
    attackPercent: rt.stacks * n0(def.attackPercentPerStack),
    critChancePercent: rt.stacks * n0(def.critChancePercentPerStack),
    lifestealPercent: rt.stacks * n0(def.lifestealPercentPerStack),
    attackSpeedPercent: rt.stacks * n0(def.attackSpeedPercentPerStack),
  };
}

// port of initSunderRuntime L1079273-1079277
export const initSunderRuntime = () => ({ stacks: 0, decayAccumMs: 0 });

// port of sunderOnHit L1079278-1079298. Returns true when a stack was gained.
export function sunderOnHit(rt, def) {
  if (rt.stacks >= def.maxStacks) return false;
  rt.stacks += 1;
  return true;
}

// port of sunderDecayTick L1079299-1079364
/**
 * Lose one stack per 1000/decayPerSecond ms (default 2/s). No catch-up cap: a long dt sheds several
 * stacks. The accumulator clears when stacks hit 0. Returns true when a stack was lost.
 */
export function sunderDecayTick(rt, def, dtMs) {
  if (rt.stacks <= 0) {
    rt.decayAccumMs = 0;
    return false;
  }
  const decay = def.decayPerSecond == null ? DEFAULT_SUNDER_DECAY_PER_SECOND : def.decayPerSecond;
  if (decay <= 0) return false;
  const interval = 1000 / decay;
  rt.decayAccumMs += dtMs;
  let lost = false;
  while (rt.decayAccumMs >= interval && rt.stacks > 0) {
    rt.stacks -= 1;
    rt.decayAccumMs -= interval;
    lost = true;
  }
  if (rt.stacks <= 0) rt.decayAccumMs = 0;
  return lost;
}

// port of sunderModifiers L1079365-1079415
export function sunderModifiers(rt, def) {
  return {
    drReductionPercent: rt.stacks * n0(def.drReductionPerStack),
    blindReductionPercent: rt.stacks * n0(def.blindReductionPerStack),
    blockReductionPercent: rt.stacks * n0(def.blockReductionPerStack),
    missReductionPercent: rt.stacks * n0(def.missReductionPerStack),
    hpRegenReductionPercent: rt.stacks * n0(def.hpRegenReductionPerStack),
  };
}

// port of withStackGlyphOverride L1079416-1079642
/**
 * Layer a mount glyph's override over a stack def. Bulwark: + thorns per stack, + max stacks.
 * Elusive: + attack speed and attack per stack; stackLossPerHit is replaced when the override has one.
 * Sunder / Siegebreaker: decayPerSecond replaced. No matching override: the def is returned as is.
 * @param {StackDef|null} def @param {string} kind @param {StackGlyphOverrides|null|undefined} override
 */
export function withStackGlyphOverride(def, kind, override) {
  if (!def || !override) return def;
  if (kind === STACK_KINDS.BULWARK && override.bulwark) {
    const b = override.bulwark;
    return {
      ...def,
      thornsPercentPerStack: n0(def.thornsPercentPerStack) + n0(b.thornsPercentPerStackBonus),
      maxStacks: def.maxStacks + n0(b.maxStacksBonus),
    };
  }
  if (kind === STACK_KINDS.ELUSIVE && override.elusive) {
    const e = override.elusive;
    return {
      ...def,
      attackSpeedPercentPerStack: n0(def.attackSpeedPercentPerStack) + n0(e.attackSpeedPercentPerStackBonus),
      attackPercentPerStack: n0(def.attackPercentPerStack) + n0(e.attackPercentPerStackBonus),
      stackLossPerHit: e.stackLossPerHitOverride == null ? def.stackLossPerHit : e.stackLossPerHitOverride,
    };
  }
  if (kind === STACK_KINDS.SUNDER && override.sunder?.decayPerSecond != null) {
    return { ...def, decayPerSecond: override.sunder.decayPerSecond };
  }
  if (kind === STACK_KINDS.SIEGEBREAKER && override.siegebreaker?.decayPerSecond != null) {
    return { ...def, decayPerSecond: override.siegebreaker.decayPerSecond };
  }
  return def;
}

// the combat ceilings are catalogue constants: read once, not per tick
const C_DR = ceilingFor('DAMAGE_REDUCTION');
const C_CRIT = ceilingFor('CRIT_CHANCE');
const C_LIFESTEAL = ceilingFor('LIFESTEAL');
const C_ATTACK_SPEED = ceilingFor('ATTACK_SPEED');

// port of applyBulwarkDr L1079643-1079666
/** Damage reduction plus Bulwark DR, clamped to the DR combat ceiling (75). */
export function applyBulwarkDr(damageReduction, mods) {
  if (!(mods.drPercent > 0)) return damageReduction;
  return applyCombatCeiling(damageReduction + mods.drPercent, C_DR);
}

// port of applyElusiveBuff L1079667-1079740
/**
 * Elusive stats on top of the entity: attack round(a*(1+p/100)); crit and lifesteal additive with
 * ceilings (95, 80); attack speed multiplicative with the 4.5 ceiling. All-zero mods return the inputs.
 * @returns {{attack: number, critChance: number, lifesteal: number, attackSpeed: number}}
 */
export function applyElusiveBuff(attack, critChance, lifesteal, attackSpeed, mods) {
  if (
    mods.attackPercent === 0 && mods.critChancePercent === 0 &&
    mods.lifestealPercent === 0 && mods.attackSpeedPercent === 0
  ) {
    return { attack, critChance, lifesteal, attackSpeed };
  }
  return {
    attack: Math.round(attack * (1 + mods.attackPercent / 100)),
    critChance: applyCombatCeiling(critChance + mods.critChancePercent, C_CRIT),
    lifesteal: applyCombatCeiling(lifesteal + mods.lifestealPercent, C_LIFESTEAL),
    attackSpeed: applyCombatCeiling(attackSpeed * (1 + mods.attackSpeedPercent / 100), C_ATTACK_SPEED),
  };
}

// port of applySunderToTarget L1079741-1079784
/** Target defences after Sunder stacks, each floored at 0. */
export function applySunderToTarget(damageReduction, blindChance, blockChance, missChance, hpRegen, mods) {
  return {
    damageReduction: Math.max(0, damageReduction - mods.drReductionPercent),
    blindChance: Math.max(0, blindChance - mods.blindReductionPercent),
    blockChance: Math.max(0, blockChance - mods.blockReductionPercent),
    missChance: Math.max(0, missChance - mods.missReductionPercent),
    hpRegen: Math.max(0, hpRegen - mods.hpRegenReductionPercent),
  };
}

// port of createStackCombat L1079785-1080125
/**
 * The per-fight stack bundle. Bulwark and Elusive share `rtSelf` (one counter), Sunder and Siegebreaker
 * share `rtTarget`. The hit-loss def is Bulwark's, else Elusive's; the target def is Sunder's, else
 * Siegebreaker's. `active = false` disables Bulwark and Elusive only (Sunder is not gated).
 * Only `resetTarget` clears anything on a new mob, and only the Sunder counter (Bulwark stacks stay).
 * @param {Array<string|{species: string}>|null} equipped
 * @param {boolean} [active=true]
 * @param {StackGlyphOverrides|null} [overrides]
 * @param {StackCtx} [ctx]
 */
export function createStackCombat(equipped, active = true, overrides, ctx) {
  const bulwarkDef = withStackGlyphOverride(
    active ? getEquippedStackDef(equipped, STACK_KINDS.BULWARK, ctx) : null,
    STACK_KINDS.BULWARK,
    overrides,
  );
  const elusiveDef = withStackGlyphOverride(
    active ? getEquippedStackDef(equipped, STACK_KINDS.ELUSIVE, ctx) : null,
    STACK_KINDS.ELUSIVE,
    overrides,
  );
  const sunderDef = withStackGlyphOverride(
    getEquippedStackDef(equipped, STACK_KINDS.SUNDER, ctx), STACK_KINDS.SUNDER, overrides,
  );
  const siegeDef = withStackGlyphOverride(
    getEquippedStackDef(equipped, STACK_KINDS.SIEGEBREAKER, ctx), STACK_KINDS.SIEGEBREAKER, overrides,
  );
  const lossDef = bulwarkDef ?? elusiveDef;
  const targetDef = sunderDef ?? siegeDef;
  const rtSelf = initBulwarkRuntime();
  const rtTarget = initSunderRuntime();

  // port of thornsFor L1080008-1080042: round(damage * thornsPercent / 100), Bulwark only, damage > 0
  const thornsFor = (damage) => {
    if (!bulwarkDef || damage <= 0) return 0;
    const pct = bulwarkModifiers(rtSelf, bulwarkDef).thornsPercent;
    return pct > 0 ? Math.round((damage * pct) / 100) : 0;
  };

  return {
    active: lossDef != null || targetDef != null,
    // the empty sets are fresh literals in the EMPTY_* key order (a frozen-object spread is slow per tick)
    selfModifiers: () => (bulwarkDef ? bulwarkModifiers(rtSelf, bulwarkDef)
      : { hpPercent: 0, drPercent: 0, thornsPercent: 0 }),
    elusiveSelfModifiers: () => (elusiveDef ? elusiveModifiers(rtSelf, elusiveDef)
      : { attackPercent: 0, critChancePercent: 0, lifestealPercent: 0, attackSpeedPercent: 0 }),
    targetModifiers: () => (targetDef ? sunderModifiers(rtTarget, targetDef) : {
      drReductionPercent: 0, blindReductionPercent: 0, blockReductionPercent: 0, missReductionPercent: 0,
      hpRegenReductionPercent: 0,
    }),
    /** The player dodged (attacker_miss) or the enemy swing was blinded (defender_blind): Elusive +1. */
    onEvaded: () => { if (elusiveDef) elusiveOnEvade(rtSelf, elusiveDef); },
    /** An unblocked hit landed on the player: the shared counter loses stackLossPerHit. */
    onHitTaken: () => { if (lossDef) bulwarkOnUnblockedHit(rtSelf, lossDef); },
    /** The player's hit landed: Sunder +1. */
    onHitLanded: () => { if (targetDef) sunderOnHit(rtTarget, targetDef); },
    thornsFor,
    // port of blockReflect L1080043-1080062: thorns first, then the +1 stack
    blockReflect: (damage) => {
      const t = thornsFor(damage);
      if (bulwarkDef) bulwarkOnBlock(rtSelf, bulwarkDef);
      return t;
    },
    // port of hitTakenReflect L1080063-1080082: thorns first, then the stack loss
    hitTakenReflect: (damage) => {
      const t = thornsFor(damage);
      if (lossDef) bulwarkOnUnblockedHit(rtSelf, lossDef);
      return t;
    },
    tick: (dtMs) => { if (targetDef) sunderDecayTick(rtTarget, targetDef, dtMs); },
    resetTarget: () => { rtTarget.stacks = 0; rtTarget.decayAccumMs = 0; },
    snapshot: () => ({ bulwarkStacks: rtSelf.stacks, sunderStacks: rtTarget.stacks }),
  };
}
