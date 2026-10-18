// calculateTotalStats: the client's stat-sheet pipeline (rebuild-plan §2.3; semantics in
// docs/Reference/Game/stats.md §3). Pure; takes the already-aggregated source bonus objects.
import { stanceRuntimeFields } from '../sources/stance.js';
import { capConfig, applySoftCap } from '../core/caps.js';
import { SLOT_ORDER } from '../../game/gear.js';
import { disruptionEffectFor } from '../core/disruption.js';

// Accumulator names (acc.<name>) used by the field tables below. Each table row is
// [accumulator, sourceField] or [accumulator, sourceField, divisor].
const TALENT_LIKE = [
  ['attackPercent', 'attackPercent'], ['healthPercent', 'hpPercent'],
  ['attackSpeed', 'attackSpeedFlat'], ['critChance', 'critChanceFlat'],
  ['critDamage', 'critDamageFlat', 100], ['hpRegen', 'hpRegenFlat'],
  ['lifesteal', 'lifestealFlat'], ['damageReduction', 'damageReductionFlat'],
  ['blockChance', 'blockChanceFlat'], ['missChance', 'missChanceFlat'],
  ['blindChance', 'blindChanceFlat'], ['paralyzeChance', 'paralyzeChanceFlat'],
  ['penetration', 'penetrationFlat'], ['spellDamage', 'spellDamageFlat'],
  ['spellVamp', 'spellVampFlat'], ['spellCritChance', 'spellCritChanceFlat'],
  ['disruptionChance', 'disruptionChanceFlat'], ['spellResist', 'spellResistFlat'],
  ['fearChance', 'fearChanceFlat'], ['minionAttack', 'minionAttackPercent'],
  ['minionHealth', 'minionHealthPercent'], ['minionCritChance', 'minionCritChanceFlat'],
  ['minionLifesteal', 'minionLifestealFlat'], ['soulLink', 'soulLinkFlat'],
  ['minionAttackSpeed', 'minionAttackSpeedFlat'],
];
// The pet set, shared by a3 (pet) and a5 (stones). `flatAttack` / `flatHp` feed the flat Attack/HP
// accumulators but NOT gearHp (only equipped items feed gearHp).
const PET_LIKE = [
  ['attack', 'flatAttack'], ['hp', 'flatHp'], ['attackSpeed', 'attackSpeed'],
  ['doubleHit', 'doubleHit'], ['critChance', 'critChance'], ['critDamage', 'critDamage'],
  ['hpRegen', 'hpRegen'], ['lifesteal', 'lifesteal'], ['healthPercent', 'healthPercent'],
  ['attackPercent', 'attackPercent'], ['damageReduction', 'damageReduction'],
  ['blockChance', 'blockChance'], ['missChance', 'missChance'], ['blindChance', 'blindChance'],
  ['paralyzeChance', 'paralyzeChance'], ['penetration', 'penetration'],
  ['spellDamage', 'spellDamage'], ['spellResist', 'spellResist'],
  ['spellCritChance', 'spellCritChance'], ['spellVamp', 'spellVamp'],
  ['disruptionChance', 'disruptionChance'], ['fearChance', 'fearChance'],
  ['minionAttack', 'minionAttack'], ['minionHealth', 'minionHealth'],
  ['minionCritChance', 'minionCritChance'], ['minionLifesteal', 'minionLifesteal'],
  ['soulLink', 'soulLink'], ['minionAttackSpeed', 'minionAttackSpeed'],
];
const PVP = [['pvpAttack', 'pvpAttack'], ['pvpDefense', 'pvpDefense']];
const STONE_EXTRA = [...PVP, ['oblivionPower', 'oblivionPower']];
const SIGIL = [
  ['attack', 'flatAttack'], ['hp', 'flatHp'], ['attackPercent', 'attackPercent'],
  ['healthPercent', 'hpPercent'], ['attackSpeed', 'attackSpeed'], ['missChance', 'missChance'],
  ['hpRegen', 'hpRegen'], ['spellDamage', 'spellDamage'],
];
// Awakening has no minion or dominion fields; its spell fields are nullable (count as 0).
const AWAKENING = [
  ['attackPercent', 'attackPercent'], ['healthPercent', 'hpPercent'],
  ['attackSpeed', 'attackSpeedFlat'], ['critChance', 'critChanceFlat'],
  ['critDamage', 'critDamageFlat', 100], ['hpRegen', 'hpRegenFlat'],
  ['lifesteal', 'lifestealFlat'], ['damageReduction', 'damageReductionFlat'],
  ['blockChance', 'blockChanceFlat'], ['penetration', 'penetrationFlat'],
  ['missChance', 'missChanceFlat'], ['blindChance', 'blindChanceFlat'],
  ['paralyzeChance', 'paralyzeChanceFlat'], ['spellResist', 'spellResistFlat'],
  ['spellDamage', 'spellDamageFlat'], ['spellCritChance', 'spellCritChanceFlat'],
  ['spellVamp', 'spellVampFlat'],
];
// a7 is never populated by the client (stats.md §3.1); kept so a caller can still pass one.
const UNUSED_A7 = [
  ['attackPercent', 'attackPercent'], ['healthPercent', 'hpPercent'],
  ['penetration', 'penetration'], ['blockChance', 'blockChance'], ['critChance', 'critChance'],
  ['critDamage', 'critDamage'], ['damageReduction', 'damageReduction'],
  ['lifesteal', 'lifesteal'], ['attackSpeed', 'attackSpeed'], ['hpRegen', 'hpRegen'],
  ...PVP,
  ['missChance', 'missChance'], ['blindChance', 'blindChance'],
  ['paralyzeChance', 'paralyzeChance'], ['spellDamage', 'spellDamage'],
  ['spellResist', 'spellResist'], ['spellCritChance', 'spellCritChance'],
  ['spellVamp', 'spellVamp'], ['disruptionChance', 'disruptionChance'],
  ['fearChance', 'fearChance'], ['minionAttack', 'minionAttack'],
  ['minionHealth', 'minionHealth'], ['minionCritChance', 'minionCritChance'],
  ['minionLifesteal', 'minionLifesteal'], ['soulLink', 'soulLink'],
  ['minionAttackSpeed', 'minionAttackSpeed'],
];
const FORTRESS = [
  ['attackPercent', 'attackPercent'], ['healthPercent', 'hpPercent'],
  ['attackSpeed', 'attackSpeed'], ['damageReduction', 'damageReduction'],
  ['critChance', 'critChance'], ['critDamage', 'critDamage'], ['hpRegen', 'hpRegen'],
  ['lifesteal', 'lifesteal'], ['blockChance', 'blockChance'], ['missChance', 'missChance'],
  ['blindChance', 'blindChance'], ['penetration', 'penetration'], ...PVP,
];
// Mounts feed the HP% bucket from BOTH hpPercent and healthPercent, in that order.
const MOUNT = [
  ['attackPercent', 'attackPercent'], ['healthPercent', 'hpPercent'],
  ['healthPercent', 'healthPercent'], ['attackSpeed', 'attackSpeed'],
  ['doubleHit', 'doubleHit'], ['critChance', 'critChance'], ['critDamage', 'critDamage'],
  ['hpRegen', 'hpRegen'], ['lifesteal', 'lifesteal'], ['damageReduction', 'damageReduction'],
  ['blockChance', 'blockChance'], ['missChance', 'missChance'], ['blindChance', 'blindChance'],
  ['paralyzeChance', 'paralyzeChance'], ['penetration', 'penetration'],
  ['spellDamage', 'spellDamage'], ['spellResist', 'spellResist'],
  ['spellCritChance', 'spellCritChance'], ['spellVamp', 'spellVamp'],
  ['disruptionChance', 'disruptionChance'], ['fearChance', 'fearChance'],
  ['minionAttack', 'minionAttack'], ['minionHealth', 'minionHealth'],
  ['minionCritChance', 'minionCritChance'], ['minionLifesteal', 'minionLifesteal'],
  ['soulLink', 'soulLink'], ['minionAttackSpeed', 'minionAttackSpeed'],
];

// SecondaryStatType -> accumulator (port of the equipment switch L1215912-1216210).
// PVP_ATTACK / PVP_DEFENSE are absent on purpose: the client switch has no case for them.
const SECONDARY_ACC = {
  ATTACK_SPEED: 'attackSpeed', DOUBLE_HIT: 'doubleHit', CRIT_CHANCE: 'critChance',
  CRIT_DAMAGE: 'critDamage', HP_REGEN: 'hpRegen', LIFESTEAL: 'lifesteal',
  HEALTH_PERCENT: 'healthPercent', ATTACK_PERCENT: 'attackPercent',
  DAMAGE_REDUCTION: 'damageReduction', BLOCK_CHANCE: 'blockChance', MISS_CHANCE: 'missChance',
  BLIND_CHANCE: 'blindChance', PARALYZE_CHANCE: 'paralyzeChance', PENETRATION: 'penetration',
  SPELL_DAMAGE: 'spellDamage', SPELL_RESIST: 'spellResist', SPELL_CRIT_CHANCE: 'spellCritChance',
  SPELL_VAMP: 'spellVamp', DISRUPTION_CHANCE: 'disruptionChance', FEAR_CHANCE: 'fearChance',
  MINION_ATTACK: 'minionAttack', MINION_HEALTH: 'minionHealth',
  MINION_CRIT_CHANCE: 'minionCritChance', MINION_LIFESTEAL: 'minionLifesteal',
  SOUL_LINK: 'soulLink', MINION_ATTACK_SPEED: 'minionAttackSpeed',
  OBLIVION_POWER: 'oblivionPower',
};
const CONDUIT_ACC = { FLAME: 'flame', EARTHEN: 'earthen', DARK: 'dark' };

// formConfig.passiveEffects stat -> accumulator (L1216990-1217110). DR/block are gated separately.
const PASSIVE_ACC = {
  ATTACK_SPEED: 'attackSpeed', CRIT_CHANCE: 'critChance', HP_REGEN: 'hpRegen',
  LIFESTEAL: 'lifesteal', MISS_CHANCE: 'missChance', BLIND_CHANCE: 'blindChance',
  PENETRATION: 'penetration', DAMAGE_REDUCTION: 'damageReduction', BLOCK_CHANCE: 'blockChance',
};

const NECROMANCER_BASE_DOMINION = 1; // L1080519-1080520 (see stats.md §3.5)

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
// parseFloat(x.toFixed(d)): the client's rounding for every capped / percent total.
const fix = (x, d) => parseFloat(x.toFixed(d));

function addTable(acc, src, table) {
  if (!src) return;
  for (const [a, f, div] of table) {
    const v = num(src[f]);
    acc[a] += div ? v / div : v;
  }
}

// [total key, accumulator, raw key, decimals], in the client's output order. The client rounds
// Attack Speed / Crit Damage to 2 dp (multipliers) and every other capped stat to 1 dp.
const CAPPED_HEAD = [
  ['totalAttackSpeed', 'attackSpeed', 'rawAttackSpeed', 2],
  ['totalDoubleHit', 'doubleHit', 'rawDoubleHit', 1],
  ['totalCritChance', 'critChance', 'rawCritChance', 1],
  ['totalCritDamage', 'critDamage', 'rawCritDamage', 2],
  ['totalHpRegen', 'hpRegen', 'rawHpRegen', 1],
  ['totalLifesteal', 'lifesteal', 'rawLifesteal', 1],
];
const CAPPED_B = [
  ['totalDamageReduction', 'damageReduction', 'rawDamageReduction', 1],
  ['totalBlockChance', 'blockChance', 'rawBlockChance', 1],
  ['totalMissChance', 'missChance', 'rawMissChance', 1],
  ['totalBlindChance', 'blindChance', 'rawBlindChance', 1],
  ['totalParalyzeChance', 'paralyzeChance', 'rawParalyzeChance', 1],
  ['totalPenetration', 'penetration', 'rawPenetration', 1],
];
const CAPPED_C = [
  ['totalSpellResist', 'spellResist', 'rawSpellResist', 1],
  ['totalSpellCritChance', 'spellCritChance', 'rawSpellCritChance', 1],
  ['totalSpellVamp', 'spellVamp', 'rawSpellVamp', 1],
  ['totalDisruptionChance', 'disruptionChance', 'rawDisruptionChance', 1],
];
const CAPPED_D = [
  ['totalMinionCritChance', 'minionCritChance', 'rawMinionCritChance', 1],
  ['totalMinionLifesteal', 'minionLifesteal', 'rawMinionLifesteal', 1],
  ['totalSoulLink', 'soulLink', 'rawSoulLink', 1],
];

/**
 * port of calculateTotalStats L1215735-1217872 (verbatim semantics; see stats.md §3).
 * Deviations: a missing/non-numeric source field counts as 0 (the client would yield NaN), and
 * `formConfig.effects` is accepted as an alias of the client's `formConfig.passiveEffects`.
 *
 * Arguments (all but `base` may be null/undefined and are then skipped):
 * @param {import('../types.js').BaseStats} base  a0 `player.baseStats`
 * @param {Object<string, import('../types.js').Item|null>} equipment  a1 slot -> item
 * @param {import('../types.js').TalentBonuses} talents  a2
 * @param {import('../types.js').PetBonuses} pet  a3
 * @param {import('../types.js').SigilBonuses} sigils  a4
 * @param {import('../types.js').StoneBonuses} stones  a5
 * @param {import('../types.js').AwakeningBonuses} awakening  a6
 * @param {*} a7  never populated by the client; pass undefined
 * @param {import('../types.js').FortressBonuses} fortress  a8
 * @param {import('../types.js').TranscendenceBonuses} transcendence  a9
 * @param {import('../types.js').MountBonuses} mounts  a10
 * @param {{playerClass?: string, formConfig?: Object|null, activeSpec?: string|null}} [ctx]  a11
 * @returns {import('../types.js').ComputedStats}
 */
export function calculateTotalStats(...args) {
  return calculateTotalStatsExact(...args).stats;
}

/**
 * calculateTotalStats plus the unrounded values it rounded away, for sheet anchoring
 * (anchoredDelta.js): `attackFlat`/`hpFlat` before the percent, the exact `attackPercent`/
 * `healthPercent`, and `raw[totalKey]`, every capped stat's raw sum before the curve.
 * @returns {{stats: import('../types.js').ComputedStats, exact: {attackFlat: number, attackPercent: number,
 *   attackMult: number, hpFlat: number, healthPercent: number, raw: Object<string, number>}}}
 */
export function calculateTotalStatsExact(
  base, equipment, talents, pet, sigils, stones, awakening, a7, fortress, transcendence, mounts, ctx,
) {
  const acc = {
    attack: num(base?.attack), hp: num(base?.hp), gearHp: 0,
    attackSpeed: num(base?.attackSpeed), doubleHit: 0,
    critChance: num(base?.critChance), critDamage: num(base?.critDamage),
    hpRegen: 0, lifesteal: 0, healthPercent: 0, attackPercent: 0, damageReduction: 0,
    blockChance: 0, missChance: 0, blindChance: 0, paralyzeChance: 0, penetration: 0,
    spellDamage: 0, spellResist: 0, spellCritChance: 0, spellVamp: 0, disruptionChance: 0,
    fearChance: 0, minionAttack: 0, minionHealth: 0, minionCritChance: 0, minionLifesteal: 0,
    soulLink: 0, minionAttackSpeed: 0, oblivionPower: 0,
    flame: 0, earthen: 0, dark: 0, pvpAttack: 0, pvpDefense: 0,
  };

  // 2. equipment, in EquipmentSlotType order (L1215825-1216210)
  if (equipment) {
    for (const slot of SLOT_ORDER) {
      const item = equipment[slot];
      if (!item) continue;
      acc.attack += num(item.primaryStats?.attack);
      acc.hp += num(item.primaryStats?.hp);
      acc.gearHp += num(item.primaryStats?.hp);
      if (item.conduit) {
        const c = CONDUIT_ACC[item.conduit.type];
        if (c) acc[c] += num(item.conduit.value);
      }
      for (const s of item.secondaryStats ?? []) {
        const a = SECONDARY_ACC[s.type];
        if (a) acc[a] += num(s.value);
      }
    }
  }

  // 3. the other sources, in the client's order (L1216223-1216883)
  addTable(acc, talents, TALENT_LIKE);
  addTable(acc, transcendence, TALENT_LIKE);
  const dominionSum = num(talents?.dominionFlat) + num(transcendence?.dominionFlat);
  addTable(acc, pet, PET_LIKE);
  addTable(acc, sigils, SIGIL);
  addTable(acc, awakening, AWAKENING);
  addTable(acc, stones, PET_LIKE);
  addTable(acc, stones, STONE_EXTRA);
  addTable(acc, a7, UNUSED_A7);
  addTable(acc, fortress, FORTRESS);
  addTable(acc, mounts, MOUNT);

  // 4. class / form rules (L1216903-1217133)
  const playerClass = ctx?.playerClass;
  const formConfig = ctx?.formConfig ?? null;
  const unlocksBlockAndDr = !!formConfig?.unlocksBlockAndDr;
  if (playerClass === 'MYSTIC' && !unlocksBlockAndDr) {
    acc.damageReduction = 0;
    acc.blockChance = 0;
  }
  if (playerClass === 'MYSTIC' && ctx?.activeSpec !== 'MYSTIC_MAGE') acc.spellCritChance = 0;
  if (formConfig) acc.attackSpeed *= formConfig.attackSpeedMult ?? 1;

  const disruptionEffect = disruptionEffectFor(playerClass, formConfig?.form);
  acc.disruptionChance += acc.fearChance;

  const passive = formConfig?.passiveEffects ?? formConfig?.effects;
  if (passive) {
    const allowBlockDr = playerClass !== 'MYSTIC' || unlocksBlockAndDr;
    for (const e of passive) {
      const a = PASSIVE_ACC[e.stat];
      if (!a) continue;
      if ((a === 'blockChance' || a === 'damageReduction') && !allowBlockDr) continue;
      acc[a] += num(e.value);
    }
  }

  let dominion = 0;
  if (playerClass === 'NECROMANCER') {
    acc.critChance = 0;
    acc.lifesteal = 0;
    acc.penetration = 0;
    dominion = dominionSum + NECROMANCER_BASE_DOMINION;
  }

  // 5. Attack / HP (L1217135-1217177)
  const stanceConfig = ctx?.stanceConfig;
  acc.healthPercent += num(stanceConfig?.hpPercent);
  acc.spellResist += num(stanceConfig?.spellResist);
  const attackMult = (formConfig?.attackMult ?? 1) * (stanceConfig?.attackMult ?? 1);
  const gearHpMult = formConfig?.gearHpMult ?? 1;
  const out = stanceRuntimeFields(stanceConfig);
  out.totalAttack = Math.floor(acc.attack * (1 + acc.attackPercent / 100) * attackMult);
  out.totalHp = Math.floor(
    (acc.hp + acc.gearHp * (gearHpMult - 1)) * (1 + acc.healthPercent / 100),
  );

  // 6. soft cap each capped stat, then round (L1217178-1217490). Key order mirrors the client.
  const capped = ([key, a, , digits]) => {
    out[key] = fix(applySoftCap(acc[a], capConfig(key)), digits);
  };
  CAPPED_HEAD.forEach(capped);
  out.totalHealthPercent = fix(acc.healthPercent, 1);
  out.totalAttackPercent = fix(acc.attackPercent, 1);
  CAPPED_B.forEach(capped);
  out.totalPvpAttack = Math.round(acc.pvpAttack);
  out.totalPvpDefense = Math.round(acc.pvpDefense);
  out.totalSpellDamage = fix(acc.spellDamage, 1);
  CAPPED_C.forEach(capped);
  if (disruptionEffect !== 'SILENCE') out.disruptionEffect = disruptionEffect;
  out.totalMinionAttack = fix(acc.minionAttack, 1);
  out.totalMinionHealth = fix(acc.minionHealth, 1);
  CAPPED_D.forEach(capped);
  // Minion Attack Speed: toFixed(2) only. The client applies no soft cap and emits no raw key.
  out.totalMinionAttackSpeed = fix(acc.minionAttackSpeed, 2);
  out.totalDominion = Math.round(dominion);
  out.totalOblivionPower = Math.round(acc.oblivionPower);
  out.totalFlameConduit = Math.round(acc.flame);
  out.totalEarthenConduit = Math.round(acc.earthen);
  out.totalDarkConduit = Math.round(acc.dark);

  // 7. raw* only when raw exceeds the soft cap (L1217495-1217870), rounded like the totals
  // (stats.md §3.2 step 7).
  for (const [key, a, rawKey, digits] of [...CAPPED_HEAD, ...CAPPED_B, ...CAPPED_C, ...CAPPED_D]) {
    if (acc[a] > capConfig(key).soft) out[rawKey] = fix(acc[a], digits);
  }
  const raw = {};
  for (const [key, a] of [...CAPPED_HEAD, ...CAPPED_B, ...CAPPED_C, ...CAPPED_D]) raw[key] = acc[a];
  const exact = {
    attackFlat: acc.attack, attackPercent: acc.attackPercent, attackMult,
    hpFlat: acc.hp + acc.gearHp * (gearHpMult - 1), healthPercent: acc.healthPercent, raw,
  };
  return { stats: out, exact };
}
