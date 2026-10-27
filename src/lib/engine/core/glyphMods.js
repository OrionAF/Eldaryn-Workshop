// Major mount glyphs retuning equipped sigils. `resolveSigilGlyphMods` folds a mount's major glyphs
// into one accumulator per sigil species; `applySigilGlyphMods` lays those on the active spells;
// `stackGlyphOverrides` / `ironBastionThornsPercent` feed the stack sigils and Iron Bastion.
// Game facts: Game/mounts-glyphs.md §10. Client: modules 3959 (L1080527-1081239) and the glyph
// catalogue module (resolveSigilGlyphMods L1083530-1084020).
import { MAJOR_GLYPHS, majorGlyphsForClassSpec } from '../../game/mountsGlyphs.js';
import { MIN_SIGIL_COOLDOWN_MS } from '../../game/sigils.js';

/** The 17 glyph effect kinds the client handles (mounts-glyphs.md §10; the last four, Necromancer, updates-2.8.2.md §5). */
export const GLYPH_EFFECT_KINDS = Object.freeze([
  'COOLDOWN', 'DAMAGE', 'THORNS', 'PARALYZE', 'PARALYZE_EXTEND', 'BLEED_BOOST', 'BULWARK_THORNS',
  'SUNDER_DECAY', 'ATTACK_SPEED_BUFF', 'POISON_STACK', 'ELUSIVE_BUFF', 'SHIELD_POWER', 'CC_EXTEND',
  'RESPAWN_HASTE', 'DEATH_WARD', 'MINION_FRENZY_HASTE', 'MINION_THORNS_BUFF',
]);

/** Rarity order of the 5-value perRarity arrays (L1084049-1084062). */
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const GLYPH_BY_ID = new Map(MAJOR_GLYPHS.map((g) => [g.id, g]));

/**
 * Per-sigil accumulator (the client's mods object, L1082750 factory). Times are in ms.
 * @typedef {Object} SigilGlyphMods
 * @property {number} cooldownReductionMs
 * @property {number} damageBonusPercent
 * @property {number} thornsPercent
 * @property {number} paralyzeMs
 * @property {number} ccExtendMs
 * @property {number} bleedMaxStacksBonus
 * @property {number} bleedStackDamagePercent
 * @property {number} bulwarkThornsPerStackPercent
 * @property {number} bulwarkMaxStacksBonus
 * @property {number|null} sunderDecayPerSecond
 * @property {number} attackSpeedBuffPercent
 * @property {number} poisonPermanentMaxStacks
 * @property {number} elusiveAttackSpeedPerStackPercent
 * @property {number} elusiveAttackPerStackPercent
 * @property {number|null} elusiveBurnPerHitOverride
 * @property {number} shieldPowerPercent
 * @property {number} respawnReductionMs
 * @property {number} deathWardPercent
 * @property {number} minionFrenzyAttackSpeedPercent
 * @property {number} minionThornsPercent
 */

/** A fresh all-zero accumulator. @returns {SigilGlyphMods} */
export const emptySigilGlyphMods = () => ({
  cooldownReductionMs: 0,
  damageBonusPercent: 0,
  thornsPercent: 0,
  paralyzeMs: 0,
  bleedMaxStacksBonus: 0,
  bleedStackDamagePercent: 0,
  bulwarkThornsPerStackPercent: 0,
  bulwarkMaxStacksBonus: 0,
  sunderDecayPerSecond: null,
  attackSpeedBuffPercent: 0,
  poisonPermanentMaxStacks: 0,
  elusiveAttackSpeedPerStackPercent: 0,
  elusiveAttackPerStackPercent: 0,
  elusiveBurnPerHitOverride: null,
  shieldPowerPercent: 0,
  ccExtendMs: 0,
  respawnReductionMs: 0,
  deathWardPercent: 0,
  minionFrenzyAttackSpeedPercent: 0,
  minionThornsPercent: 0,
});

// port of majorGlyphRarityIndex L1081245-1081261 (indexOf, unknown -> 0). Accepts a name in any
// case, or an index 0..4.
export function majorGlyphRarityIndex(rarity) {
  if (typeof rarity === 'number') return rarity >= 0 && rarity <= 4 ? rarity : 0;
  const i = RARITIES.indexOf(String(rarity ?? '').toLowerCase());
  return i < 0 ? 0 : i;
}

/** One value of a perRarity table. The JSON stores the field names lower-cased. */
function at(perRarity, field, r) {
  const arr = perRarity[field.toLowerCase()];
  return arr == null ? undefined : arr[r];
}
const num = (v) => (v == null ? 0 : v);

// port of resolveSigilGlyphMods L1083530-1084020
/**
 * Fold major glyphs into per-species accumulators.
 *  1. Sealed glyphs and non-MAJOR tiers are dropped.
 *  2. One instance per glyph type, the highest rarity (a tie keeps the first).
 *  3. Only glyphs of this class (and requiredSpec, when set) count.
 *  4. Per kind: cooldown, damage, thorns, paralyze, CC extend, bleed, the Bulwark / Elusive bonuses and
 *     the four minion kinds add; decay and the Elusive burn override take the minimum; poison stacks the maximum.
 *     The minion kinds reach the summon config (respawn, death ward) or the minion buffs below.
 * @param {Array<{glyphType: string, rarity: string|number, tier?: string, sealed?: boolean}>} glyphs
 *   `glyphType` is the major glyph id (`sg-*`). `tier` defaults to MAJOR.
 * @param {string} playerClass  'WARRIOR' | 'SENTINEL' | 'MYSTIC' | 'NECROMANCER'
 * @param {string|null} spec  e.g. 'MYSTIC_DRUID'
 * @returns {Map<string, SigilGlyphMods>}  keyed by sigil species
 */
export function resolveSigilGlyphMods(glyphs, playerClass, spec) {
  const best = new Map();
  for (const g of glyphs ?? []) {
    if (!g || (g.tier != null && g.tier !== 'MAJOR') || g.sealed) continue;
    const have = best.get(g.glyphType);
    if (!have || majorGlyphRarityIndex(g.rarity) > majorGlyphRarityIndex(have.rarity)) best.set(g.glyphType, g);
  }
  const applicable = new Set(majorGlyphsForClassSpec(playerClass, spec).map((m) => m.id));
  const out = new Map();
  const acc = (species) => {
    let m = out.get(species);
    if (!m) {
      m = emptySigilGlyphMods();
      out.set(species, m);
    }
    return m;
  };
  for (const g of best.values()) {
    const def = GLYPH_BY_ID.get(g.glyphType);
    if (!def || !applicable.has(def.id)) continue;
    const r = majorGlyphRarityIndex(g.rarity);
    const pr = def.perRarity;
    const m = acc(def.sigilSpecies);
    switch (def.effectKind) {
      case 'COOLDOWN': m.cooldownReductionMs += num(at(pr, 'cooldownSeconds', r)) * 1000; break;
      case 'DAMAGE': m.damageBonusPercent += num(at(pr, 'damagePercent', r)); break;
      case 'THORNS': m.thornsPercent += num(at(pr, 'thornsPercent', r)); break;
      case 'PARALYZE':
      case 'PARALYZE_EXTEND': m.paralyzeMs += num(at(pr, 'paralyzeSeconds', r)) * 1000; break;
      case 'BLEED_BOOST':
        m.bleedMaxStacksBonus += num(at(pr, 'maxStacksBonus', r));
        m.bleedStackDamagePercent += num(at(pr, 'stackDamagePercent', r));
        break;
      case 'BULWARK_THORNS':
        m.bulwarkThornsPerStackPercent += num(at(pr, 'thornsPerStackPercent', r));
        m.bulwarkMaxStacksBonus += num(at(pr, 'maxStacksBonus', r));
        break;
      case 'SUNDER_DECAY': {
        const v = at(pr, 'decayPerSecond', r) ?? null;
        if (v != null) m.sunderDecayPerSecond = m.sunderDecayPerSecond != null ? Math.min(m.sunderDecayPerSecond, v) : v;
        break;
      }
      case 'ATTACK_SPEED_BUFF': m.attackSpeedBuffPercent += num(at(pr, 'attackSpeedPercent', r)); break;
      case 'POISON_STACK': {
        const v = num(at(pr, 'maxStacks', r));
        if (v > m.poisonPermanentMaxStacks) m.poisonPermanentMaxStacks = v;
        break;
      }
      case 'ELUSIVE_BUFF': {
        m.elusiveAttackSpeedPerStackPercent += num(at(pr, 'attackSpeedPerStackPercent', r));
        m.elusiveAttackPerStackPercent += num(at(pr, 'attackPerStackPercent', r));
        const v = at(pr, 'burnPerHitOverride', r);
        if (v != null) {
          m.elusiveBurnPerHitOverride = m.elusiveBurnPerHitOverride != null ? Math.min(m.elusiveBurnPerHitOverride, v) : v;
        }
        break;
      }
      case 'SHIELD_POWER': m.shieldPowerPercent += num(at(pr, 'shieldPowerPercent', r)); break;
      case 'CC_EXTEND': m.ccExtendMs += num(at(pr, 'ccSeconds', r)) * 1000; break;
      case 'RESPAWN_HASTE': m.respawnReductionMs += num(at(pr, 'respawnSeconds', r)) * 1000; break;
      case 'DEATH_WARD': m.deathWardPercent += num(at(pr, 'wardPercent', r)); break;
      case 'MINION_FRENZY_HASTE': m.minionFrenzyAttackSpeedPercent += num(at(pr, 'attackSpeedPercent', r)); break;
      case 'MINION_THORNS_BUFF': m.minionThornsPercent += num(at(pr, 'thornsPercent', r)); break;
      default: break;
    }
  }
  return out;
}

// port of applySigilGlyphMods L1080871-1081182 (2.8.2 adds the minion buffs, L1089990-1090060)
/**
 * Apply accumulated mods to the active sigil spells. Each item is `{species, spell}`; the spell
 * type is `spell.spellType` (E5b's builder adds it from the catalogue entry). Items whose species has
 * no mods, or an empty map, come back untouched; otherwise a new item with a new spell object.
 *  - cooldownMs: max(1000, cooldownMs - reduction), when the spell has a numeric cooldownMs
 *  - DAMAGE spells: attackPercent, maxAttackPercent, baseDamage (> 0), damagePerTick (> 0) x(1+p/100), rounded
 *  - DEBUFF / DAMAGE: paralyzeMs += paralyze; CC extend adds to an existing paralyzeMs > 0 and fearMs > 0
 *  - BUFF: Ravenous Frenzy's minionFrenzy.attackSpeedPercent and Infernal Bastion's minionBastion.thornsPercent
 *    add the minion glyphs; appends {stat: 'ATTACK_SPEED', value: p/100}
 *  - DEBUFF with a debuff: bleed bonus raises maxStacks ((maxStacks ?? 1) + bonus) and scales the tick
 *    percents; poison ceiling sets maxStacks and makes it permanent (durationMs 0)
 * @param {Array<{species: string, spell: Object}>} spells
 * @param {Map<string, SigilGlyphMods>|null|undefined} modsMap
 */
export function applySigilGlyphMods(spells, modsMap) {
  if (!modsMap || modsMap.size === 0) return spells;
  return spells.map((item) => {
    const mods = modsMap.get(item.species);
    if (!mods) return item;
    const spell = { ...item.spell };
    const type = spell.spellType;
    if (mods.cooldownReductionMs > 0 && 'cooldownMs' in spell && typeof spell.cooldownMs === 'number') {
      spell.cooldownMs = Math.max(MIN_SIGIL_COOLDOWN_MS, spell.cooldownMs - mods.cooldownReductionMs);
    }
    if (mods.damageBonusPercent > 0 && type === 'DAMAGE') {
      const k = 1 + mods.damageBonusPercent / 100;
      if (typeof spell.attackPercent === 'number') spell.attackPercent = Math.round(spell.attackPercent * k);
      if (typeof spell.maxAttackPercent === 'number') spell.maxAttackPercent = Math.round(spell.maxAttackPercent * k);
      if (typeof spell.baseDamage === 'number' && spell.baseDamage > 0) spell.baseDamage = Math.round(spell.baseDamage * k);
      if (typeof spell.damagePerTick === 'number' && spell.damagePerTick > 0) {
        spell.damagePerTick = Math.round(spell.damagePerTick * k);
      }
    }
    if (mods.paralyzeMs > 0 && (type === 'DEBUFF' || type === 'DAMAGE')) {
      spell.paralyzeMs = (spell.paralyzeMs == null ? 0 : spell.paralyzeMs) + mods.paralyzeMs;
    }
    if (mods.ccExtendMs > 0 && (type === 'DEBUFF' || type === 'DAMAGE')) {
      if (typeof spell.paralyzeMs === 'number' && spell.paralyzeMs > 0) spell.paralyzeMs += mods.ccExtendMs;
      if ('fearMs' in spell && typeof spell.fearMs === 'number' && spell.fearMs > 0) spell.fearMs += mods.ccExtendMs;
    }
    if (mods.minionFrenzyAttackSpeedPercent > 0 && type === 'BUFF' && spell.minionFrenzy) {
      spell.minionFrenzy = {
        ...spell.minionFrenzy,
        attackSpeedPercent: spell.minionFrenzy.attackSpeedPercent + mods.minionFrenzyAttackSpeedPercent,
      };
    }
    if (mods.minionThornsPercent > 0 && type === 'BUFF' && spell.minionBastion) {
      spell.minionBastion = {
        ...spell.minionBastion,
        thornsPercent: (spell.minionBastion.thornsPercent ?? 0) + mods.minionThornsPercent,
      };
    }
    if (mods.attackSpeedBuffPercent > 0 && type === 'BUFF') {
      spell.effects = [...(spell.effects ?? []), { stat: 'ATTACK_SPEED', value: mods.attackSpeedBuffPercent / 100 }];
    }
    if (type === 'DEBUFF' && spell.debuff) {
      if (mods.bleedMaxStacksBonus > 0 || mods.bleedStackDamagePercent > 0) {
        const debuff = { ...spell.debuff };
        if (mods.bleedMaxStacksBonus > 0) {
          debuff.maxStacks = (debuff.maxStacks == null ? 1 : debuff.maxStacks) + mods.bleedMaxStacksBonus;
        }
        if (mods.bleedStackDamagePercent > 0) {
          const k = 1 + mods.bleedStackDamagePercent / 100;
          if (typeof debuff.damagePerTickPercent === 'number') debuff.damagePerTickPercent = Math.round(debuff.damagePerTickPercent * k);
          if (typeof debuff.maxDamagePerTickPercent === 'number') {
            debuff.maxDamagePerTickPercent = Math.round(debuff.maxDamagePerTickPercent * k);
          }
        }
        spell.debuff = debuff;
      }
      if (mods.poisonPermanentMaxStacks > 0) {
        spell.debuff = { ...spell.debuff, maxStacks: mods.poisonPermanentMaxStacks, durationMs: 0 };
      }
    }
    return { ...item, spell };
  });
}

// port of stackGlyphOverrides L1080532-1080663
/**
 * Stack-sigil overrides for `stacks.createStackCombat`, or null when no glyph touches one.
 * @param {Map<string, SigilGlyphMods>|null|undefined} modsMap
 * @returns {import('./stacks.js').StackGlyphOverrides|null}
 */
export function stackGlyphOverrides(modsMap) {
  if (!modsMap || modsMap.size === 0) return null;
  const bu = modsMap.get('BULWARK_OF_THORNS');
  const su = modsMap.get('SUNDER_MARK');
  const el = modsMap.get('ELUSIVE_SUPREMACY');
  const sb = modsMap.get('SIEGEBREAKER_MARK');
  const out = {};
  if (bu && (bu.bulwarkThornsPerStackPercent > 0 || bu.bulwarkMaxStacksBonus > 0)) {
    out.bulwark = {
      thornsPercentPerStackBonus: bu.bulwarkThornsPerStackPercent || undefined,
      maxStacksBonus: bu.bulwarkMaxStacksBonus || undefined,
    };
  }
  if (su && su.sunderDecayPerSecond != null) out.sunder = { decayPerSecond: su.sunderDecayPerSecond };
  if (el && (el.elusiveAttackSpeedPerStackPercent > 0 || el.elusiveAttackPerStackPercent > 0 || el.elusiveBurnPerHitOverride != null)) {
    out.elusive = {
      attackSpeedPercentPerStackBonus: el.elusiveAttackSpeedPerStackPercent || undefined,
      attackPercentPerStackBonus: el.elusiveAttackPerStackPercent || undefined,
      stackLossPerHitOverride: el.elusiveBurnPerHitOverride ?? undefined,
    };
  }
  if (sb && sb.sunderDecayPerSecond != null) out.siegebreaker = { decayPerSecond: sb.sunderDecayPerSecond };
  return out.bulwark || out.sunder || out.elusive || out.siegebreaker ? out : null;
}

// port of ironBastionThornsPercent L1080664-1080691
export function ironBastionThornsPercent(modsMap) {
  return modsMap?.get('IRON_BASTION')?.thornsPercent ?? 0;
}

/** Combat-facing summary used when no glyph is equipped (L1081234, EMPTY_SIGIL_GLYPH_COMBAT_MODS). */
export const EMPTY_SIGIL_GLYPH_COMBAT_MODS = Object.freeze({ stack: null, ironBastionThornsPercent: 0 });

// port of toSigilGlyphCombatMods L1080692-1080716
/** @returns {{stack: import('./stacks.js').StackGlyphOverrides|null, ironBastionThornsPercent: number}} */
export function toSigilGlyphCombatMods(modsMap) {
  if (!modsMap || modsMap.size === 0) return EMPTY_SIGIL_GLYPH_COMBAT_MODS;
  return { stack: stackGlyphOverrides(modsMap), ironBastionThornsPercent: ironBastionThornsPercent(modsMap) };
}

// port of activeSigilGlyphCombatMods L1081200-1081212 (resolve, then summarise)
/**
 * One call from a fighter: its major glyphs (Fighter.glyphMods) to combat mods.
 * @returns {{mods: Map<string, SigilGlyphMods>, combat: ReturnType<typeof toSigilGlyphCombatMods>}}
 */
export function glyphCombatMods(glyphs, playerClass, spec) {
  const mods = resolveSigilGlyphMods(glyphs, playerClass, spec);
  return { mods, combat: toSigilGlyphCombatMods(mods) };
}

/**
 * Coverage report for tests: major glyph ids whose effect kind this module does not handle, or whose
 * kind resolves to no change in the accumulator at Legendary.
 * @returns {string[]}
 */
export function uncoveredMajorGlyphIds() {
  const bad = [];
  const blank = emptySigilGlyphMods();
  for (const def of MAJOR_GLYPHS) {
    if (!GLYPH_EFFECT_KINDS.includes(def.effectKind)) {
      bad.push(def.id);
      continue;
    }
    const spec = def.requiredSpec;
    const m = resolveSigilGlyphMods([{ glyphType: def.id, rarity: 'Legendary' }], def.playerClass, spec).get(def.sigilSpecies);
    if (!m || JSON.stringify(m) === JSON.stringify(blank)) bad.push(def.id);
  }
  return bad;
}
