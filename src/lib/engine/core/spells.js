// Sigil spells inside the combat engine: cast order and opening delays (client module 3965), spell
// runtimes, momentum, activation conditions, buff modifiers, the per-tick spell pass and Ancient
// transforms (client module 3964, L1089591-1092724). Pure: the only randomness is the injected rng.
// Game rules: docs/Reference/Game/combat-pve.md §10, sigils.md §5-§9.
import { applyCombatCeiling, ceilingFor, capConfig, softCapGainFromSheet } from './caps.js';
import { DEBUFF_TYPES } from './debuffs.js';
import { lane } from '../rng.js';

// ---------------------------------------------------------------------------------------------
// Module 3965 (L1092725-1092929): cast order and opening delays
// ---------------------------------------------------------------------------------------------

/** Spell-type sort key within a tick (L1092869-1092913). */
export const SPELL_TYPE_CAST_ORDER = Object.freeze({
  DEFENSE: 0, BUFF: 1, HEAL: 2, DAMAGE: 3, DEBUFF: 4, AURA: 5,
  TRANSFORM: 6, STACK: 7, SHIELD: 8, FORM: 9, SUMMON: 10,
});
/** Sort key of an unknown spell type: the register holding 9 at L1092914. */
export const SPELL_TYPE_CAST_ORDER_FALLBACK = 9;
/** First-cast delay of DAMAGE and DEBUFF spells (L1092915). */
export const OFFENSIVE_OPENING_DELAY_MS = 1000;
/** Opening rank of a species with no override (L1092917). */
export const DEFAULT_OPENING_RANK = 100;
/** Per-species overrides (L1092919-1092924). */
export const OPENING_CAST_PRIORITY = Object.freeze({ NULL_PULSE: Object.freeze({ rank: 0, openingDelayMs: 500 }) });

// port of getSpellTypeCastOrder L1092791-1092804
export function getSpellTypeCastOrder(spellType) {
  return SPELL_TYPE_CAST_ORDER[spellType] ?? SPELL_TYPE_CAST_ORDER_FALLBACK;
}

// port of getOpeningCastRank L1092806-1092825
export function getOpeningCastRank(species) {
  return OPENING_CAST_PRIORITY[species]?.rank ?? DEFAULT_OPENING_RANK;
}

// port of getOpeningCastDelayMs L1092827-1092860: only DAMAGE and DEBUFF spells wait
export function getOpeningCastDelayMs(species, spellType) {
  if (spellType !== 'DAMAGE' && spellType !== 'DEBUFF') return 0;
  return OPENING_CAST_PRIORITY[species]?.openingDelayMs ?? OFFENSIVE_OPENING_DELAY_MS;
}

// ---------------------------------------------------------------------------------------------
// Module 3964 (L1089591-1092724)
// ---------------------------------------------------------------------------------------------

/**
 * Combat spell config, as built by spellConfig.getActiveCombatSpells. `spell` must carry its
 * `spellType` (the client's spell objects do; the catalogue keeps it on the entry).
 * @typedef {Object} CombatSpellConfig
 * @property {string} species
 * @property {string} [name]
 * @property {string|null} [icon]
 * @property {Object} spell  level-scaled spell with `spellType`
 * @property {string} [activationCondition]
 */

/**
 * Per-spell runtime (L1090440).
 * @typedef {Object} SpellRuntime
 * @property {CombatSpellConfig} config
 * @property {number} cooldownRemaining
 * @property {boolean} isEffectActive
 * @property {number} effectRemaining
 * @property {number} nextTickIn
 * @property {number} transformFires
 * @property {number} [momentumStacks]  momentum spells only
 * @property {Array<{stat: string, value: number}>} [transformEffects]  set by triggerTransformSpell
 */

/** The zero buff-modifier set (L1092718). `soulLink` is added only when an effect sets it. */
export const EMPTY_BUFF_MODIFIERS = Object.freeze({
  attackPercent: 0, attackSpeed: 0, lifesteal: 0, blockChance: 0, missChance: 0, blindChance: 0,
  critChance: 0, critDamage: 0, damageReduction: 0, hpRegen: 0, hpPercent: 0, penetration: 0,
  spellResist: 0,
});

const ZERO_MOMENTUM = Object.freeze({ spellDamagePercent: 0, spellCritPoints: 0, spellVampPoints: 0 });

// port of momentumConfig L1089596-1089617
export function momentumConfig(spell) {
  return spell.spellType === 'DAMAGE' ? spell.momentum ?? null : null;
}

// port of bankMomentum L1089619-1089648: fast gain below fastUntilStacks, slow gain above, capped
export function bankMomentum(runtime, cfg) {
  const stacks = runtime.momentumStacks ?? 0;
  const gain = stacks < cfg.fastUntilStacks ? cfg.fastStacksPerCast : cfg.slowStacksPerCast;
  runtime.momentumStacks = Math.min(cfg.maxStacks, stacks + gain);
}

// port of momentumBonuses L1089650-1089726: null when no momentum spell is equipped
export function momentumBonuses(runtimes) {
  let found = false;
  let dmg = 0;
  let crit = 0;
  let vamp = 0;
  for (const rt of runtimes) {
    const cfg = momentumConfig(rt.config.spell);
    if (!cfg) continue;
    found = true;
    const stacks = rt.momentumStacks ?? 0;
    if (stacks <= 0) continue;
    dmg += stacks * cfg.spellDamagePerStack;
    crit += stacks * cfg.spellCritPerStack;
    vamp += stacks * cfg.spellVampPerStack;
  }
  return found ? { spellDamagePercent: dmg, spellCritPoints: crit, spellVampPoints: vamp } : null;
}

// port of minionEmpowerConfig L1089728-1089749
export function minionEmpowerConfig(spell) {
  return spell.spellType === 'BUFF' ? spell.minionEmpower ?? null : null;
}

// port of minionFrenzyConfig L1089751-1089772
export function minionFrenzyConfig(spell) {
  return spell.spellType === 'BUFF' ? spell.minionFrenzy ?? null : null;
}

// port of requiresLivingMinion L1089774-1089791
export function requiresLivingMinion(spell) {
  return minionEmpowerConfig(spell) !== null || minionFrenzyConfig(spell) !== null;
}

// port of momentumStackCount L1089793-1089841: undefined when no momentum spell is equipped
export function momentumStackCount(runtimes) {
  let total;
  for (const rt of runtimes) {
    if (!momentumConfig(rt.config.spell)) continue;
    total = (total ?? 0) + (rt.momentumStacks ?? 0);
  }
  return total;
}

const ENEMY_HP_BELOW = { ENEMY_HP_BELOW_80: 80, ENEMY_HP_BELOW_60: 60, ENEMY_HP_BELOW_40: 40, ENEMY_HP_BELOW_20: 20 };
const MY_HP_BELOW = { MY_HP_BELOW_80: 80, MY_HP_BELOW_60: 60, MY_HP_BELOW_40: 40, MY_HP_BELOW_20: 20 };

// port of isConditionMet L1089843-1089963
/**
 * @param {string|undefined} condition  SigilActivationCondition
 * @param {number} myHpPct
 * @param {number} enemyHpPct
 * @param {boolean} [selfConditionsMet=false]  short-circuits every MY_HP_BELOW_* to true
 */
export function isConditionMet(condition, myHpPct, enemyHpPct, selfConditionsMet = false) {
  if (condition === undefined || condition === 'ON_COOLDOWN') return true;
  if (Object.hasOwn(ENEMY_HP_BELOW, condition)) return enemyHpPct <= ENEMY_HP_BELOW[condition];
  if (Object.hasOwn(MY_HP_BELOW, condition)) return selfConditionsMet || myHpPct <= MY_HP_BELOW[condition];
  return true;
}

const TRANSFORM_SOFT_CAPPED = { MISS_CHANCE: 'missChance', BLOCK_CHANCE: 'blockChance', PENETRATION: 'penetration' };

// port of resolveTransformEffects L1089965-1090072: Miss / Block / Penetration effects become the
// soft-capped gain on top of the sheet value; every other stat passes through
export function resolveTransformEffects(effects, sheet) {
  return effects.map((e) => {
    const key = Object.hasOwn(TRANSFORM_SOFT_CAPPED, e.stat) ? TRANSFORM_SOFT_CAPPED[e.stat] : null;
    if (!key) return { stat: e.stat, value: e.value };
    return { stat: e.stat, value: softCapGainFromSheet(sheet?.[key] ?? 0, e.value, capConfig(e.stat)) };
  });
}

// port of isBuffLikeSpell L1090074-1090091
export function isBuffLikeSpell(spellType) {
  return spellType === 'BUFF' || spellType === 'TRANSFORM';
}

const BUFF_FIELD = {
  ATTACK_PERCENT: 'attackPercent', ATTACK_SPEED: 'attackSpeed', LIFESTEAL: 'lifesteal',
  BLOCK_CHANCE: 'blockChance', MISS_CHANCE: 'missChance', BLIND_CHANCE: 'blindChance',
  CRIT_CHANCE: 'critChance', CRIT_DAMAGE: 'critDamage', DAMAGE_REDUCTION: 'damageReduction',
  HP_REGEN: 'hpRegen', HP_PERCENT: 'hpPercent', PENETRATION: 'penetration', SPELL_RESIST: 'spellResist',
};

// BUFF_FIELD as a Map: one lookup per effect per tick instead of hasOwn plus a property read
const BUFF_FIELD_OF = new Map(Object.entries(BUFF_FIELD));

// port of computeActiveBuffModifiers L1090093-1090362: sums the effects of every active BUFF /
// TRANSFORM runtime (a transform's resolved effects win over its catalogue effects). No ceilings
// here; applyBuffsToEntity applies them.
export function computeActiveBuffModifiers(runtimes) {
  // a literal in EMPTY_BUFF_MODIFIERS key order (a spread of the frozen object is slow per tick)
  const out = {
    attackPercent: 0, attackSpeed: 0, lifesteal: 0, blockChance: 0, missChance: 0, blindChance: 0,
    critChance: 0, critDamage: 0, damageReduction: 0, hpRegen: 0, hpPercent: 0, penetration: 0,
    spellResist: 0,
  };
  for (let i = 0; i < runtimes.length; i++) {
    const rt = runtimes[i];
    if (!rt.isEffectActive || !isBuffLikeSpell(rt.config.spell.spellType)) continue;
    const effects = rt.transformEffects ?? rt.config.spell.effects;
    for (let j = 0; j < effects.length; j++) {
      const e = effects[j];
      if (e.stat === 'SOUL_LINK') out.soulLink = (out.soulLink ?? 0) + e.value;
      else {
        const field = BUFF_FIELD_OF.get(e.stat);
        if (field !== undefined) out[field] += e.value;
      }
    }
  }
  return out;
}

// port of initSpellRuntimes L1090372-1090471: stable sort by (type order, opening rank, equip index)
/**
 * @param {CombatSpellConfig[]} configs
 * @returns {SpellRuntime[]}
 */
export function initSpellRuntimes(configs) {
  return configs
    .map((config, index) => ({ config, index }))
    .sort((a, b) =>
      getSpellTypeCastOrder(a.config.spell.spellType) - getSpellTypeCastOrder(b.config.spell.spellType) ||
      getOpeningCastRank(a.config.species) - getOpeningCastRank(b.config.species) ||
      a.index - b.index)
    .map(({ config }) => ({
      config,
      cooldownRemaining: getOpeningCastDelayMs(config.species, config.spell.spellType),
      isEffectActive: false,
      effectRemaining: 0,
      nextTickIn: 0,
      transformFires: 0,
      ...(momentumConfig(config.spell) ? { momentumStacks: 0 } : {}),
    }));
}

const SPELL_CRIT_CEILING = ceilingFor('SPELL_CRIT_CHANCE');
const SPELL_VAMP_CEILING = ceilingFor('SPELL_VAMP');
const SPELL_RESIST_HARD = capConfig('SPELL_RESIST').hard;

/**
 * Inputs of processSpellsTick. The client takes them as 19 positional arguments after the runtimes
 * (argument index in brackets); defaults are the client's. Fields marked `??` also default on null.
 * @typedef {Object} SpellTickInput
 * @property {number} maxHp                 [1] owner max HP (HP% conditions, BUFF HP_PERCENT base)
 * @property {number} dtMs                  [2]
 * @property {number} timestamp             [3] event timestamp
 * @property {number} [attack=0]            [4] owner attack (spell base damage)
 * @property {number} [healReductionPercent=0] [5] wound on the owner, cuts every spell heal
 * @property {number} [hp=0]                [6] owner current HP
 * @property {number} [enemyHp=0]           [7]
 * @property {number} [enemyMaxHp=0]        [8]
 * @property {boolean} [offensiveConditions=false] [9] DAMAGE/DEBUFF honour activation conditions
 *   (true in PVP); false casts them on cooldown whatever the condition
 * @property {boolean} [selfConditionsMet=false]   [10] isConditionMet's 4th argument
 * @property {number} [spellDamage=0]       [11] ?? owner Spell Damage %
 * @property {number} [targetSpellResist=0] [12] ?? the `R` of modSpellDmg, capped at SPELL_RESIST.hard
 * @property {number} [spellCritChance=0]   [13] ??
 * @property {number} [critDamage=1.5]      [14] ?? spell crit multiplier
 * @property {number} [spellVamp=0]         [15] ??
 * @property {number} [silencedMs=0]        [16] > 0 blocks every new cast (active effects still tick)
 * @property {number} [healingMult=1]       [17] ?? scales spell vamp and self-heal
 * @property {number} [healBaseMaxHp=0]     [18] > 0 replaces maxHp as the HEAL / regen base
 * @property {boolean} [minionAlive=false]  [19]
 */

/**
 * Result of processSpellsTick (L1092209-1092342). Optional keys are present only when non-zero.
 * @typedef {Object} SpellTickResult
 * @property {number} ownerHpDelta
 * @property {number} ownerVampHeal
 * @property {number} [ownerShieldRefill]
 * @property {number} [ownerMinionHeal]
 * @property {{heals: Array<Object>, start?: Object, end?: Object, frenzyStart?: Object, frenzyEnd?: Object}} [ownerMinionEmpower]
 * @property {number} targetHpDelta  negative damage to the target
 * @property {Array<Object>} events
 * @property {Object} buffModifiers  computeActiveBuffModifiers after this tick
 * @property {Array<import('./debuffs.js').DebuffSpec>|undefined} newDebuffs  undefined when empty
 * @property {number} [targetParalyzeMs]
 * @property {number} [targetSilenceMs]
 * @property {number} [targetFearMs]
 * @property {true} [targetBlinded]
 * @property {number} [ownerMomentumStacks]  only when a momentum spell is equipped
 */

// The cast switch of processSpellsTick acts only on these types; any other idle runtime is a no-op.
const castsSomething = (t) => t === 'DAMAGE' || t === 'BUFF' || t === 'HEAL' || t === 'DEBUFF';

// The common tick where nothing fires: every idle castable spell is still cooling down after this tick's
// countdown, and every running effect is a plain timed effect that neither ticks nor ends this tick.
// processSpellsTick would then only count the timers down and return its empty result. This does the
// same (same mutations, same result shape and key order) without building the full pass; null when any
// runtime has work to do (nothing is mutated then).
function quietSpellsTick(runtimes, dtMs, minionAlive) {
  let hasMomentum = false;
  for (let i = 0; i < runtimes.length; i++) {
    const rt = runtimes[i];
    const spell = rt.config.spell;
    if (rt.isEffectActive) {
      // the active-effect block of processSpellsTick, reduced to "does anything happen"
      const empower = spell.minionEmpower != null;
      if ((empower || spell.minionFrenzy != null) && !minionAlive) return null;
      if (!(rt.effectRemaining - dtMs > 0)) return null;
      const due = rt.nextTickIn - dtMs <= 0;
      if (due && ((spell.spellType === 'DAMAGE' && spell.isDoT) || spell.spellType === 'HEAL' || empower)) return null;
    } else if (castsSomething(spell.spellType)
      && (!(rt.cooldownRemaining > 0) || !(Math.max(0, rt.cooldownRemaining - dtMs) > 0))) {
      return null;
    }
    if (!hasMomentum && momentumConfig(spell) !== null) hasMomentum = true;
  }
  for (let i = 0; i < runtimes.length; i++) {
    const rt = runtimes[i];
    if (rt.cooldownRemaining > 0) rt.cooldownRemaining = Math.max(0, rt.cooldownRemaining - dtMs);
    if (rt.isEffectActive) {
      rt.nextTickIn -= dtMs;
      rt.effectRemaining -= dtMs;
    }
  }
  const out = {
    ownerHpDelta: 0, ownerVampHeal: 0, targetHpDelta: 0, events: [],
    buffModifiers: computeActiveBuffModifiers(runtimes), newDebuffs: undefined,
  };
  if (hasMomentum) out.ownerMomentumStacks = momentumStackCount(runtimes) ?? 0;
  return out;
}

// port of processSpellsTick L1090474-1092344
/**
 * One tick of the spell pass. Mutates `runtimes`. rng draws: one per spell crit roll, and only
 * when the current spell crit chance is above 0 (rollSpellCrit L1090962-1090982).
 * @param {SpellRuntime[]} runtimes
 * @param {SpellTickInput} input
 * @param {() => number} rng
 * @returns {SpellTickResult}
 */
export function processSpellsTick(runtimes, input, rng) {
  const quiet = quietSpellsTick(runtimes, input.dtMs, input.minionAlive);
  if (quiet) return quiet;
  const {
    maxHp, dtMs, timestamp, attack = 0, healReductionPercent = 0, hp = 0, enemyHp = 0, enemyMaxHp = 0,
    offensiveConditions = false, selfConditionsMet = false, silencedMs = 0, healBaseMaxHp = 0,
    minionAlive = false,
  } = input;
  const spellDamage = input.spellDamage ?? 0;
  const targetSpellResist = input.targetSpellResist ?? 0;
  const spellCritChance = input.spellCritChance; // null handled inside currentSpellCrit
  const critMult = input.critDamage ?? 1.5;
  const spellVamp = input.spellVamp ?? 0;
  const healingMult = input.healingMult ?? 1;
  const healBase = healBaseMaxHp > 0 ? healBaseMaxHp : maxHp;

  // activeSpellStatBuff L1090767-1090834: SPELL_DAMAGE / SPELL_CRIT / SPELL_VAMP from active buffs
  const activeSpellStatBuff = (stat) => {
    let sum = 0;
    for (const rt of runtimes) {
      if (!rt.isEffectActive || !isBuffLikeSpell(rt.config.spell.spellType)) continue;
      for (const e of rt.config.spell.effects) if (e.stat === stat) sum += e.value;
    }
    return sum;
  };
  let hasMomentum = false;
  for (let i = 0; i < runtimes.length && !hasMomentum; i++) {
    hasMomentum = momentumConfig(runtimes[i].config.spell) !== null;
  }
  const mom = () => (hasMomentum ? momentumBonuses(runtimes) ?? ZERO_MOMENTUM : ZERO_MOMENTUM);
  const resistMult = 1 - Math.min(targetSpellResist, SPELL_RESIST_HARD) / 100;

  // modSpellDmg L1090892-1090927; resist cap follows Game/updates-2.7.5.md §1.
  const modSpellDmg = (base) => {
    if (base <= 0) return 0;
    const pct = spellDamage + activeSpellStatBuff('SPELL_DAMAGE') + mom().spellDamagePercent;
    return Math.max(1, Math.floor(base * (1 + pct / 100) * resistMult));
  };
  // currentSpellCrit L1090933-1090959
  const currentSpellCrit = () => applyCombatCeiling(
    (spellCritChance ?? 0) + activeSpellStatBuff('SPELL_CRIT') + mom().spellCritPoints, SPELL_CRIT_CEILING);
  // rollSpellCrit L1090962-1090982
  // one lane per spell species (engine/rng.js laneRng); a plain rng is its own lanes
  const rollSpellCrit = (rt) => {
    const chance = currentSpellCrit();
    return chance > 0 && lane(rng, `spell:${rt.config.species}`)() * 100 < chance;
  };
  // wound on a spell heal (L1091276-1091289 and its copies)
  const wounded = (heal) => (healReductionPercent > 0
    ? Math.max(1, Math.round(heal * (1 - healReductionPercent / 100))) : heal);
  // vampHeal L1090989-1091046
  const vampHeal = (damage) => {
    const vamp = applyCombatCeiling(
      spellVamp + activeSpellStatBuff('SPELL_VAMP') + mom().spellVampPoints, SPELL_VAMP_CEILING);
    if (vamp <= 0 || damage <= 0) return 0;
    const heal = Math.floor((damage * healingMult * vamp) / 100);
    return heal > 0 && healReductionPercent > 0 ? wounded(heal) : heal;
  };

  let ownerHpDelta = 0;
  let ownerVampHeal = 0;
  let shieldRefill = 0;
  let minionHeal = 0;
  let targetHpDelta = 0;
  let paralyzeMs = 0;
  let silenceMs = 0;
  let fearMs = 0;
  let blinded = false;
  const events = [];
  const newDebuffs = [];
  const empower = { tick: null };
  // empowerTick L1091061-1091077
  const empowerTick = () => {
    if (empower.tick == null) empower.tick = { heals: [] };
    return empower.tick;
  };
  const push = (type, value, spellRef, extra) => events.push({ timestamp, type, value, spell: spellRef, ...extra });
  const critExtra = (crit) => (crit ? { isCrit: true } : {});
  // spell damage + vamp, shared by the DoT tick, DEBUFF initial hit and DAMAGE hit
  const dealSpellDamage = (base, crit, type, spellRef) => {
    const dmg = modSpellDmg(crit ? base * critMult : base);
    targetHpDelta -= dmg;
    push(type, dmg, spellRef, critExtra(crit));
    const v = vampHeal(dmg);
    if (v > 0) {
      ownerHpDelta += v;
      ownerVampHeal += v;
      push('spell_heal_tick', v, spellRef);
    }
    return dmg;
  };
  const timedDebuff = (type, spell, field, value, spellRef) => newDebuffs.push({
    type,
    config: { durationMs: spell.durationMs ?? 0, maxStacks: 1, [field]: value },
    damagePerTickFlat: 0,
    source: spellRef,
  });

  for (let i = 0; i < runtimes.length; i++) {
    const rt = runtimes[i];
    if (rt.cooldownRemaining > 0) rt.cooldownRemaining = Math.max(0, rt.cooldownRemaining - dtMs);
    // idle and cooling down (or a type that casts nothing): no effect ticks, and every cast path below
    // needs cooldownRemaining <= 0 and a castable type
    if (!rt.isEffectActive && (rt.cooldownRemaining > 0 || !castsSomething(rt.config.spell.spellType))) continue;
    const spellRef = { name: rt.config.name, icon: rt.config.icon, species: rt.config.species };
    const spell = rt.config.spell;

    // --- active effect (L1091117-1091454) ---
    if (rt.isEffectActive) {
      rt.nextTickIn -= dtMs;
      rt.effectRemaining -= dtMs;
      if (spell.spellType === 'DAMAGE' && spell.isDoT && rt.nextTickIn <= 0 && rt.effectRemaining > 0) {
        const crit = rollSpellCrit(rt);
        const base = spell.attackPercent ? Math.floor((attack * spell.attackPercent) / 100) : spell.damagePerTick ?? 0;
        dealSpellDamage(base, crit, 'spell_dot_tick', spellRef);
        if (spell.blindOnTick) blinded = true;
        // The first DoT tick is immediate on the next engine tick. Later applications
        // retain the original end time, including at the stack cap (updates-2.7.5.md §3).
        if (spell.attackDown && Math.floor(((spell.durationMs ?? 0) - rt.effectRemaining) / (spell.tickIntervalMs ?? 1000)) + 1 <= spell.attackDown.maxStacks) {
          newDebuffs.push({
            type: DEBUFF_TYPES.ATTACK_DOWN,
            config: { durationMs: rt.effectRemaining, maxStacks: spell.attackDown.maxStacks, attackReductionPerStack: spell.attackDown.reductionPerStack },
            damagePerTickFlat: 0,
            source: spellRef,
          });
        }
        rt.nextTickIn += spell.tickIntervalMs ?? 1000;
      }
      if (spell.spellType === 'HEAL' && rt.nextTickIn <= 0) {
        const heal = wounded(Math.max(1, Math.floor((healBase * spell.healPercentPerTick) / 100)));
        ownerHpDelta += heal;
        if (spell.refillsShield) shieldRefill += heal;
        if (spell.healsMinion) {
          minionHeal += heal;
          push('spell_heal_tick', heal, spellRef, { minionHeal: true });
        } else {
          push('spell_heal_tick', heal, spellRef);
        }
        rt.nextTickIn += spell.tickIntervalMs;
      }
      const emp = minionEmpowerConfig(spell);
      if (emp) {
        if (!minionAlive) {
          rt.effectRemaining = 0;
        } else if (rt.nextTickIn <= 0) {
          const regen = wounded(Math.max(1, Math.floor((healBase * emp.regenPercentPerTick) / 100)));
          empowerTick().heals.push({ timestamp, value: regen, spell: spellRef });
          rt.nextTickIn += emp.tickIntervalMs;
        }
        if (rt.effectRemaining <= 0) empowerTick().end = { timestamp, spell: spellRef };
      }
      if (minionFrenzyConfig(spell)) {
        if (!minionAlive) rt.effectRemaining = 0;
        if (rt.effectRemaining <= 0) empowerTick().frenzyEnd = { timestamp, spell: spellRef };
      }
      if (!(rt.effectRemaining <= 0)) continue;
      rt.isEffectActive = false;
      push('spell_end', 0, spellRef);
    }

    // --- cast check (L1091455-1091542) ---
    if (spell.spellType === 'TRANSFORM') continue;
    if (silencedMs > 0) continue;
    const isOffensive = spell.spellType === 'DAMAGE' || spell.spellType === 'DEBUFF';
    const bypassCondition = !offensiveConditions && isOffensive;
    const myHpPct = maxHp > 0 ? (hp / maxHp) * 100 : 100;
    const enemyHpPct = enemyMaxHp > 0 ? (enemyHp / enemyMaxHp) * 100 : 100;
    const blockedByMinion = !minionAlive && requiresLivingMinion(spell);
    if (!(rt.cooldownRemaining <= 0) || blockedByMinion) continue;
    if (!bypassCondition && !isConditionMet(rt.config.activationCondition, myHpPct, enemyHpPct, selfConditionsMet)) continue;

    switch (spell.spellType) {
      case 'DAMAGE': { // L1091897-1092198
        push('spell_cast', 0, spellRef);
        if (spell.isDoT) {
          rt.isEffectActive = true;
          rt.effectRemaining = spell.durationMs ?? 0;
          rt.nextTickIn = 0;
          if (spell.slow) timedDebuff(DEBUFF_TYPES.SLOW, spell, 'attackSpeedReductionPercent', spell.slow.attackSpeedReductionPercent, spellRef);
          if (spell.wound) timedDebuff(DEBUFF_TYPES.WOUND, spell, 'regenReductionPercent', spell.wound.regenReductionPercent, spellRef);
          if (spell.critDown) timedDebuff(DEBUFF_TYPES.CRIT_DOWN, spell, 'critChanceReduction', spell.critDown.critChanceReduction, spellRef);
        } else {
          const crit = rollSpellCrit(rt);
          const base = spell.attackPercent ? Math.floor((attack * spell.attackPercent) / 100) : spell.baseDamage;
          const dmg = dealSpellDamage(base, crit, 'spell_damage', spellRef);
          if (spell.selfHealPercent && dmg > 0) {
            let sh = Math.floor((dmg * healingMult * spell.selfHealPercent) / 100);
            if (sh > 0) sh = wounded(sh);
            if (sh > 0) {
              ownerHpDelta += sh;
              push('spell_heal_tick', sh, spellRef);
            }
          }
          if (spell.paralyzeMs && spell.paralyzeMs > paralyzeMs) paralyzeMs = spell.paralyzeMs;
          if (spell.silenceMs && spell.silenceMs > silenceMs) silenceMs = spell.silenceMs;
          if (spell.fearMs && spell.fearMs > fearMs) fearMs = spell.fearMs;
        }
        const m = spell.momentum;
        if (m) bankMomentum(rt, m);
        rt.cooldownRemaining = spell.cooldownMs;
        break;
      }
      case 'BUFF': { // L1091794-1091896
        push('spell_cast', 0, spellRef);
        push('spell_buff_start', 0, spellRef);
        for (const e of spell.effects) {
          if (e.stat !== 'HP_PERCENT') continue;
          // the max-HP buff also heals its share of current HP (max HP when HP is 0)
          ownerHpDelta += Math.floor(((hp > 0 ? hp : maxHp) * e.value) / 100);
        }
        rt.isEffectActive = true;
        rt.effectRemaining = spell.durationMs;
        rt.cooldownRemaining = spell.cooldownMs;
        if (spell.minionEmpower) {
          rt.nextTickIn = spell.minionEmpower.tickIntervalMs;
          empowerTick().start = { timestamp, maxHpPercent: spell.minionEmpower.maxHpPercent, spell: spellRef };
        }
        if (spell.minionFrenzy) {
          const f = spell.minionFrenzy;
          empowerTick().frenzyStart = {
            timestamp, attackPercent: f.attackPercent, attackSpeedPercent: f.attackSpeedPercent,
            lifesteal: f.lifesteal, spell: spellRef,
          };
        }
        break;
      }
      case 'HEAL': { // L1091708-1091793
        push('spell_cast', 0, spellRef);
        if (!spell.instant) {
          rt.isEffectActive = true;
          rt.effectRemaining = spell.durationMs;
          rt.nextTickIn = spell.tickIntervalMs;
        } else {
          const heal = wounded(Math.max(1, Math.floor((healBase * spell.healPercentPerTick) / 100)));
          ownerHpDelta += heal;
          if (spell.refillsShield) shieldRefill += heal;
          push('spell_heal_tick', heal, spellRef);
          rt.isEffectActive = true;
          rt.effectRemaining = spell.durationMs;
          rt.nextTickIn = spell.durationMs + dtMs;
        }
        rt.cooldownRemaining = spell.cooldownMs;
        break;
      }
      case 'DEBUFF': { // L1091570-1091707
        push('spell_cast', 0, spellRef);
        if (spell.initialAttackPercent > 0 && attack > 0) {
          const crit = rollSpellCrit(rt);
          dealSpellDamage(Math.floor((attack * spell.initialAttackPercent) / 100), crit, 'spell_damage', spellRef);
        }
        if (spell.paralyzeMs && spell.paralyzeMs > paralyzeMs) paralyzeMs = spell.paralyzeMs;
        const pct = spell.debuff.damagePerTickPercent;
        const flat = pct ? modSpellDmg(Math.floor((attack * pct) / 100)) : 0;
        newDebuffs.push({
          type: spell.debuffType,
          config: spell.debuff,
          damagePerTickFlat: flat,
          critChance: currentSpellCrit(),
          critMult,
          source: spellRef,
        });
        rt.cooldownRemaining = spell.cooldownMs;
        break;
      }
      default: // DEFENSE and the passive types: nothing to cast (L1091565-1091569)
        break;
    }
  }

  // result assembly L1092209-1092342 (key order kept)
  const out = { ownerHpDelta, ownerVampHeal };
  if (shieldRefill > 0) out.ownerShieldRefill = shieldRefill;
  if (minionHeal > 0) out.ownerMinionHeal = minionHeal;
  if (empower.tick) out.ownerMinionEmpower = empower.tick;
  out.targetHpDelta = targetHpDelta;
  out.events = events;
  out.buffModifiers = computeActiveBuffModifiers(runtimes);
  out.newDebuffs = newDebuffs.length > 0 ? newDebuffs : undefined;
  if (paralyzeMs > 0) out.targetParalyzeMs = paralyzeMs;
  if (silenceMs > 0) out.targetSilenceMs = silenceMs;
  if (fearMs > 0) out.targetFearMs = fearMs;
  if (blinded) out.targetBlinded = true;
  if (hasMomentum) out.ownerMomentumStacks = momentumStackCount(runtimes) ?? 0;
  return out;
}

// port of triggerTransformSpell L1092346-1092521
/**
 * Fires the first idle TRANSFORM runtime (the caller checks Chrono Flux is full). Its effects are
 * resolved against `sheet` (soft-capped Miss/Block/Penetration) and HP_PERCENT heals its share of
 * current HP (max HP when HP is 0). Mutates the runtime.
 * @param {SpellRuntime[]} runtimes
 * @param {number} timestamp
 * @param {number} [hp=0]
 * @param {number} [maxHp=0]
 * @param {Object} [sheet]  the owner entity (penetration / blockChance / missChance)
 * @returns {{triggered: boolean, species: string|null, ownerHpDelta: number, events: Array<Object>}}
 */
export function triggerTransformSpell(runtimes, timestamp, hp = 0, maxHp = 0, sheet = undefined) {
  for (const rt of runtimes) {
    const spell = rt.config.spell;
    if (spell.spellType !== 'TRANSFORM' || rt.isEffectActive) continue;
    rt.transformEffects = resolveTransformEffects(spell.effects, sheet);
    const spellRef = { name: rt.config.name, icon: rt.config.icon, species: rt.config.species };
    rt.isEffectActive = true;
    rt.effectRemaining = spell.durationMs;
    rt.transformFires += 1;
    let heal = 0;
    for (const e of spell.effects) {
      if (e.stat === 'HP_PERCENT') heal += Math.floor(((hp > 0 ? hp : maxHp) * e.value) / 100);
    }
    return {
      triggered: true,
      species: rt.config.species,
      ownerHpDelta: heal,
      events: [
        { timestamp, type: 'spell_cast', value: 0, spell: spellRef },
        { timestamp, type: 'spell_buff_start', value: 0, spell: spellRef },
      ],
    };
  }
  return { triggered: false, species: null, ownerHpDelta: 0, events: [] };
}

// port of hasPendingTransform L1092524-1092548: an idle TRANSFORM runtime exists
export function hasPendingTransform(runtimes) {
  for (let i = 0; i < runtimes.length; i++) {
    const rt = runtimes[i];
    if (rt.config.spell.spellType === 'TRANSFORM' && !rt.isEffectActive) return true;
  }
  return false;
}

// port of isTransformActive L1092550-1092573
export function isTransformActive(runtimes) {
  for (let i = 0; i < runtimes.length; i++) {
    const rt = runtimes[i];
    if (rt.config.spell.spellType === 'TRANSFORM' && rt.isEffectActive) return true;
  }
  return false;
}

// port of transformFireCount L1092575-1092611
export function transformFireCount(runtimes) {
  let n = 0;
  for (let i = 0; i < runtimes.length; i++) {
    const rt = runtimes[i];
    if (rt.config.spell.spellType === 'TRANSFORM') n += rt.transformFires;
  }
  return n;
}

// port of hasActiveEffects L1092614-1092624
export function hasActiveEffects(runtimes) {
  for (let i = 0; i < runtimes.length; i++) if (runtimes[i].isEffectActive) return true;
  return false;
}

// port of isSpellBuffActive L1092626-1092648
export function isSpellBuffActive(runtimes, species) {
  for (let i = 0; i < runtimes.length; i++) {
    const rt = runtimes[i];
    if (rt.isEffectActive && rt.config.species === species) return true;
  }
  return false;
}

// port of activeBuffThornsPercent L1092650-1092699: Iron Bastion style thorns from active buffs
export function activeBuffThornsPercent(runtimes) {
  let sum = 0;
  for (let i = 0; i < runtimes.length; i++) {
    const rt = runtimes[i];
    if (!rt.isEffectActive || !isBuffLikeSpell(rt.config.spell.spellType)) continue;
    if (rt.config.spell.thornsPercent) sum += rt.config.spell.thornsPercent;
  }
  return sum;
}
