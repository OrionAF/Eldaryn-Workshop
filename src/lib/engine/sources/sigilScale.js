// Sigil scaling: flat Attack/HP by level and Altar tier, and level-scaled spell numbers.
// Pure; catalogue lookups come from the L1 accessor game/sigils.js. See docs/Reference/Game/sigils.md §4-§5.
import { sigilBySpecies, SIGIL_CONSTANTS, SIGIL_ALTAR_CONSTANTS } from '../../game/sigils.js';

const STAT_GROWTH = SIGIL_CONSTANTS.STAT_GROWTH_PER_LEVEL;
const SPELL_GROWTH = SIGIL_CONSTANTS.SPELL_GROWTH_PER_LEVEL;
const TIER_STAT_MULT = SIGIL_ALTAR_CONSTANTS.TIER_STAT_MULT;

// port of sigilTierStatMult L1066773-1066807. A falsy tier (undefined, 0, null) counts as tier 1.
export function sigilTierStatMult(tier = 1) {
  const t = tier || 1;
  return Math.pow(TIER_STAT_MULT, Math.max(0, t - 1));
}

// port of getSigilBonusAttack L1067546-1067583. Evaluation order matters: the client does
// base * (1 + (L-1)*0.1) first, then * tierMult, then floor (so 1300 at L5 gives 1819, not 1820).
export function getSigilBonusAttack(def, level, tier = 1) {
  return Math.floor(def.baseAttack * (1 + (level - 1) * STAT_GROWTH) * sigilTierStatMult(tier));
}

// port of getSigilBonusHp L1067584-1067621 (same shape as the Attack version, on baseHp)
export function getSigilBonusHp(def, level, tier = 1) {
  return Math.floor(def.baseHp * (1 + (level - 1) * STAT_GROWTH) * sigilTierStatMult(tier));
}

/**
 * Spell type of a catalogue spell object: the stored `spellType` first (every druid variant spell
 * stores the client's, sigils.md §12). A base sigil spell keeps its type on the sigil entry, so a
 * spell without one is typed from its shape, falling back to `fallback`.
 * @param {Object} spell
 * @param {string} [fallback]
 */
export function spellTypeOf(spell, fallback) {
  if (spell.spellType) return spell.spellType;
  if (spell.bonusStat !== undefined) return 'AURA';
  if (spell.initialAttackPercent !== undefined || spell.debuff !== undefined) return 'DEBUFF';
  if (spell.attackPercent !== undefined || spell.baseDamage !== undefined) return fallback === 'SUMMON' ? 'SUMMON' : 'DAMAGE';
  if (spell.healPercentPerTick !== undefined) return 'HEAL';
  if (spell.shieldHpPercent !== undefined) return 'SHIELD';
  if (spell.effects !== undefined) return fallback === 'TRANSFORM' ? 'TRANSFORM' : 'BUFF';
  return fallback;
}

// Helpers for getSigilSpellScaled L1067622-1068264.
// fix: parseFloat(x.toFixed(d)), the client's rounding. capMin: Math.min(v, max) kept verbatim, so
// a missing max gives NaN exactly where the client's unguarded branches do (see each branch).
const fix = (v, digits) => parseFloat(v.toFixed(digits));
const capMin = (v, max) => Math.min(v, max);
// guarded cap: no max field means no cap (the client's `max == null ? Infinity : max`)
const capOpt = (v, max) => Math.min(v, max == null ? Infinity : max);

/**
 * port of getSigilSpellScaled L1067622-1068264: spell numbers at `level`.
 * scale = 1 + (level-1) * SPELL_GROWTH_PER_LEVEL (0.08); no tier argument exists (sigils.md §5).
 * Returns a copy; unknown spell types return undefined as the client does.
 * @param {Object} spell  catalogue `sigil.spell`
 * @param {number} level
 * @param {string} [spellType]  defaults to spellTypeOf(spell)
 */
export function getSigilSpellScaled(spell, level, spellType = spellTypeOf(spell)) {
  const scale = 1 + (level - 1) * SPELL_GROWTH;
  switch (spellType) {
    case 'STANCE': {
      const grow = (value, max, digits = 1) => max == null ? value : Math.min(fix(value * scale, digits), max);
      const out = { ...spell };
      if (spell.maxAttackMult != null && spell.attackMult > 1) {
        out.attackMult = fix(1 + grow(spell.attackMult - 1, spell.maxAttackMult - 1, 3), 3);
      }
      if (spell.hpPercent != null) out.hpPercent = grow(spell.hpPercent, spell.maxHpPercent);
      if (spell.spellResist != null) out.spellResist = grow(spell.spellResist, spell.maxSpellResist);
      if (spell.daze) out.daze = { ...spell.daze, chancePercent: grow(spell.daze.chancePercent, spell.daze.maxChancePercent) };
      if (spell.shieldBash) out.shieldBash = {
        ...spell.shieldBash,
        chancePercent: grow(spell.shieldBash.chancePercent, spell.shieldBash.maxChancePercent),
        stunMs: spell.shieldBash.maxStunMs == null ? spell.shieldBash.stunMs
          : Math.min(Math.round(spell.shieldBash.stunMs * scale / 100) * 100, spell.shieldBash.maxStunMs),
      };
      return out;
    }
    case 'AURA': {
      // L1068238-1068260: ATTACK_SPEED aura values keep 2 decimals, every other aura 1; no cap
      const digits = spell.bonusStat === 'ATTACK_SPEED' ? 2 : 1;
      return { ...spell, bonusValue: fix(spell.bonusValue * scale, digits) };
    }
    case 'DAMAGE': {
      // L1067629-1068237. baseDamage is floored, never capped, and NaN when the spell has none.
      const out = { ...spell };
      out.baseDamage = Math.floor(spell.baseDamage * scale);
      out.attackPercent = spell.attackPercent != null
        ? capOpt(fix(spell.attackPercent * scale, 1), spell.maxAttackPercent)
        : undefined;
      out.damagePerTick = spell.damagePerTick != null ? Math.floor(spell.damagePerTick * scale) : undefined;
      // slow / wound / critDown are only touched when present; their caps are unguarded (L1068144-1068237)
      if (spell.slow) {
        out.slow = {
          ...spell.slow,
          attackSpeedReductionPercent: capMin(fix(spell.slow.attackSpeedReductionPercent * scale, 1), spell.slow.maxAttackSpeedReductionPercent),
        };
      }
      if (spell.wound) {
        out.wound = {
          ...spell.wound,
          regenReductionPercent: capMin(fix(spell.wound.regenReductionPercent * scale, 1), spell.wound.maxRegenReductionPercent),
        };
      }
      if (spell.critDown) {
        out.critDown = {
          ...spell.critDown,
          critChanceReduction: capMin(fix(spell.critDown.critChanceReduction * scale, 1), spell.critDown.maxCritChanceReduction),
        };
      }
      return out;
    }
    case 'DEBUFF': {
      // L1067805-1067903
      const out = { ...spell };
      out.initialAttackPercent = capOpt(fix(spell.initialAttackPercent * scale, 1), spell.maxInitialAttackPercent);
      const d = spell.debuff;
      // regen / damage-per-tick only scale when the field AND its max exist; otherwise they pass
      // through at their level-1 value (L1067845-1067853, L1067874-1067882).
      const scaledOrRaw = (v, max) => (v != null && max != null ? capMin(fix(v * scale, 1), max) : v);
      out.debuff = {
        ...d,
        regenReductionPercent: scaledOrRaw(d.regenReductionPercent, d.maxRegenReductionPercent),
        damagePerTickPercent: scaledOrRaw(d.damagePerTickPercent, d.maxDamagePerTickPercent),
      };
      return out;
    }
    case 'BUFF': {
      // L1067920-1068093: effects[].value (1 decimal, cap maxValue or none), thornsPercent, minion blocks
      const out = { ...spell };
      out.effects = spell.effects.map((e) => ({ ...e, value: capOpt(fix(e.value * scale, 1), e.maxValue) }));
      out.thornsPercent = spell.thornsPercent != null
        ? capOpt(fix(spell.thornsPercent * scale, 1), spell.maxThornsPercent)
        : undefined;
      if (spell.minionEmpower) {
        const m = spell.minionEmpower;
        out.minionEmpower = {
          ...m,
          maxHpPercent: capMin(fix(m.maxHpPercent * scale, 1), m.maxMaxHpPercent),
          regenPercentPerTick: capMin(fix(m.regenPercentPerTick * scale, 1), m.maxRegenPercentPerTick),
        };
      }
      if (spell.minionFrenzy) {
        const m = spell.minionFrenzy;
        out.minionFrenzy = {
          ...m,
          attackPercent: capMin(fix(m.attackPercent * scale, 1), m.maxAttackPercent),
          attackSpeedPercent: capMin(fix(m.attackSpeedPercent * scale, 1), m.maxAttackSpeedPercent),
          lifesteal: capMin(fix(m.lifesteal * scale, 1), m.maxLifesteal),
        };
      }
      return out;
    }
    case 'HEAL': // L1067904-1067919: 1 decimal, no cap
      return { ...spell, healPercentPerTick: fix(spell.healPercentPerTick * scale, 1) };
    case 'SHIELD': // L1067742-1067761
      return { ...spell, shieldHpPercent: capMin(fix(spell.shieldHpPercent * scale, 1), spell.maxShieldHpPercent) };
    case 'TRANSFORM': // L1067762-1067804: capped only where maxValue exists (Ancients have none)
      return { ...spell, effects: spell.effects.map((e) => ({ ...e, value: capOpt(fix(e.value * scale, 1), e.maxValue) })) };
    case 'SUMMON': // L1067704-1067735: unguarded caps
      return {
        ...spell,
        attackPercent: capMin(fix(spell.attackPercent * scale, 1), spell.maxAttackPercent),
        hpPercent: capMin(fix(spell.hpPercent * scale, 1), spell.maxHpPercent),
      };
    case 'STACK': case 'FORM': case 'DEFENSE': // constant at every level (L1067692-1067703, L1067736-1067741)
      return { ...spell };
    default:
      return undefined;
  }
}

// port of getFormConditionalSpells L1066683-1066708: the druid variant's BEAR/WOLF spells, or null
export function getFormConditionalSpells(species) {
  return sigilBySpecies(species)?.druidVariant?.formSpell ?? null;
}

/**
 * port of getSigilDefinitionForSpec L1066606-1066681: the spell a sigil casts for a spec. A Druid
 * uses the druid variant (its BEAR/WOLF spell for `formKind`, default BEAR); everyone else the base.
 * @param {string} species
 * @param {string|null} spec  e.g. 'MYSTIC_DRUID'
 * @param {'BEAR'|'WOLF'|null} [formKind]
 * @returns {{name: string, spell: Object, spellType: string}|null}
 */
export function getSigilDefinitionForSpec(species, spec, formKind) {
  const def = sigilBySpecies(species);
  if (!def) return null;
  const dv = spec === 'MYSTIC_DRUID' ? def.druidVariant : null;
  if (!dv) return { name: def.name, spell: def.spell, spellType: def.spellType };
  const spell = dv.formSpell ? dv.formSpell[formKind ?? 'BEAR'] : dv.spell;
  return { name: dv.name, spell, spellType: spellTypeOf(spell, def.spellType) };
}

/**
 * Convenience for display (B5): the level-scaled spell a species casts for a spec and form.
 * @returns {Object|null} scaled spell, or null for an unknown species
 */
export function scaledSigilSpell(species, level, spec = null, formKind = null) {
  const d = getSigilDefinitionForSpec(species, spec, formKind);
  return d ? getSigilSpellScaled(d.spell, level, d.spellType) : null;
}
