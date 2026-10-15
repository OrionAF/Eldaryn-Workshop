// Test-only hand transcriptions of the 2.7.0 client's stat-source sums and progression gates:
// transcendence bonuses, enchant-stone bonuses, talent / awakening points, relic slots, the conduit
// roll's rarity rule and the Disruption effect. Statement and floating-point order follow the
// decompiled bytecode; constants are the client's literals. Never imported by app code.

// transcribed from L1218014 (calculateTranscendenceBonuses closure slot2, the zero bundle)
export const TRANSCENDENCE_ZERO = {
  attackPercent: 0, hpPercent: 0, attackSpeedFlat: 0, critChanceFlat: 0, critDamageFlat: 0, hpRegenFlat: 0,
  lifestealFlat: 0, damageReductionFlat: 0, blockChanceFlat: 0, missChanceFlat: 0, blindChanceFlat: 0,
  paralyzeChanceFlat: 0, penetrationFlat: 0, spellDamageFlat: 0, spellVampFlat: 0, spellCritChanceFlat: 0,
  disruptionChanceFlat: 0, spellResistFlat: 0, fearChanceFlat: 0, minionAttackPercent: 0, minionHealthPercent: 0,
  minionCritChanceFlat: 0, minionLifestealFlat: 0, soulLinkFlat: 0, minionAttackSpeedFlat: 0, dominionFlat: 0,
};

// transcribed from L1217901-1217995. The client looks the board up itself
// (getTranscendenceNodeById(class, flavor)); here the caller passes that id -> node map.
export function calculateTranscendenceBonuses(a0, nodeById) {
  const r0 = { ...TRANSCENDENCE_ZERO };
  for (const id of a0) {
    if (id === 'core') continue; // CORE_NODE_ID
    const node = nodeById[id];
    if (!node) continue;
    for (const s of node.stats) r0[s.stat] = r0[s.stat] + s.value;
  }
  return r0;
}

// transcribed from L1206173 (calculateEnchantStoneBonuses closure slot5, the zero bundle)
export const STONE_ZERO = {
  attackSpeed: 0, doubleHit: 0, critChance: 0, critDamage: 0, hpRegen: 0, lifesteal: 0, healthPercent: 0,
  attackPercent: 0, damageReduction: 0, blockChance: 0, missChance: 0, blindChance: 0, paralyzeChance: 0,
  penetration: 0, pvpAttack: 0, pvpDefense: 0, spellDamage: 0, spellResist: 0, spellCritChance: 0, spellVamp: 0,
  disruptionChance: 0, fearChance: 0, minionAttack: 0, minionHealth: 0, minionCritChance: 0, minionLifesteal: 0,
  soulLink: 0, minionAttackSpeed: 0, oblivionPower: 0, flatAttack: 0, flatHp: 0,
};

// transcribed from L1205311-1205324 (OBLIVION_POWER value config, closure slot1)
const OBLIVION_POWER_CFG = { minValue: 8, maxValue: 30 };
// transcribed from L1206371 (AMPLIFICATION_CONSTANTS.STAT_BONUS_PER_LEVEL)
const STAT_BONUS_PER_LEVEL = 0.06;
// transcribed from L1206735-1206808 (stone grades: first level 1, last 5; base stats; POWER_GRADE_MULT)
const OBLIVION_LEVEL_FIRST = 1;
const OBLIVION_LEVEL_LAST = 5;
const OBLIVION_LEVEL_STATS = {
  1: { attack: 3250, hp: 10700 }, 2: { attack: 10650, hp: 25900 }, 3: { attack: 17500, hp: 43500 },
  4: { attack: 30800, hp: 77700 }, 5: { attack: 50800, hp: 130500 },
};
const POWER_GRADE_MULT = 1.5;

// transcribed from L1205241-1205276
export function oblivionPowerForQuality(a0) {
  let r6 = a0;
  if (r6 == null) r6 = 1;
  const r0 = Math.max(1, Math.min(100, r6));
  const r4 = OBLIVION_POWER_CFG.maxValue - OBLIVION_POWER_CFG.minValue;
  return Math.round(OBLIVION_POWER_CFG.minValue + r4 * ((r0 - 1) / 99));
}

// transcribed from L1206352-1206360
export function getAmplifyStatMultiplier(a0) {
  return 1 + a0 * STAT_BONUS_PER_LEVEL;
}

// transcribed from L1206414-1206440
export function normalizeOblivionStoneLevel(a0) {
  const r8 = a0;
  if (r8 != null && Number.isFinite(r8)) return Math.min(OBLIVION_LEVEL_LAST, Math.max(OBLIVION_LEVEL_FIRST, Math.floor(r8)));
  return OBLIVION_LEVEL_FIRST;
}

// transcribed from L1206549-1206563
export function getOblivionStoneLevelStats(a0) {
  const r1 = OBLIVION_LEVEL_STATS[normalizeOblivionStoneLevel(a0)];
  return { attack: r1.attack, hp: r1.hp };
}

// transcribed from L1206564-1206580
export function getOblivionPowerGradeMult(a0) {
  return Math.pow(POWER_GRADE_MULT, normalizeOblivionStoneLevel(a0) - OBLIVION_LEVEL_FIRST);
}

// transcribed from L1205639-1205675
export function getEnchantStoneStatMultiplier(a0, a1, a2) {
  if (a0.type === 'OBLIVION' && a1 === 'OBLIVION_POWER') return getOblivionPowerGradeMult(a0.oblivionLevel);
  return getAmplifyStatMultiplier(a2 == null ? 0 : a2);
}

// transcribed from L1205676-1205712
export function getEnchantStoneStatValue(a0, a1, a2) {
  if (a0.type === 'OBLIVION' && a1.type === 'OBLIVION_POWER') {
    return oblivionPowerForQuality(a0.quality) * getOblivionPowerGradeMult(a0.oblivionLevel);
  }
  return a1.value * getEnchantStoneStatMultiplier(a0, a1.type, a2);
}

// transcribed from L1205726-1206148: SecondaryStatType -> bonus key, in the client's switch order
const STONE_STAT_KEY = {
  ATTACK_SPEED: 'attackSpeed', DOUBLE_HIT: 'doubleHit', CRIT_CHANCE: 'critChance', CRIT_DAMAGE: 'critDamage',
  HP_REGEN: 'hpRegen', LIFESTEAL: 'lifesteal', HEALTH_PERCENT: 'healthPercent', ATTACK_PERCENT: 'attackPercent',
  DAMAGE_REDUCTION: 'damageReduction', BLOCK_CHANCE: 'blockChance', MISS_CHANCE: 'missChance',
  BLIND_CHANCE: 'blindChance', PARALYZE_CHANCE: 'paralyzeChance', PENETRATION: 'penetration',
  PVP_ATTACK: 'pvpAttack', PVP_DEFENSE: 'pvpDefense', SPELL_DAMAGE: 'spellDamage', SPELL_RESIST: 'spellResist',
  SPELL_CRIT_CHANCE: 'spellCritChance', SPELL_VAMP: 'spellVamp', DISRUPTION_CHANCE: 'disruptionChance',
  FEAR_CHANCE: 'fearChance', MINION_ATTACK: 'minionAttack', MINION_HEALTH: 'minionHealth',
  MINION_CRIT_CHANCE: 'minionCritChance', MINION_LIFESTEAL: 'minionLifesteal', SOUL_LINK: 'soulLink',
  MINION_ATTACK_SPEED: 'minionAttackSpeed', OBLIVION_POWER: 'oblivionPower',
};
export const STONE_STAT_TYPES = Object.keys(STONE_STAT_KEY);

export function calculateEnchantStoneBonuses(a0) {
  const r0 = { ...STONE_ZERO };
  for (const stone of a0) {
    if (!stone.activated) continue;
    if (stone.type === 'OBLIVION') {
      const g = getOblivionStoneLevelStats(stone.oblivionLevel);
      r0.flatAttack = r0.flatAttack + g.attack;
      r0.flatHp = r0.flatHp + g.hp;
    }
    for (const stat of stone.stats) {
      const v = getEnchantStoneStatValue(stone, stat, stone.amplifyLevel);
      const key = Object.prototype.hasOwnProperty.call(STONE_STAT_KEY, stat.type) ? STONE_STAT_KEY[stat.type] : null;
      if (key) r0[key] = r0[key] + v;
    }
  }
  return r0;
}

// transcribed from L1097092 (TALENT_CONSTANTS) and L1096580-1096620
const FIRST_TALENT_LEVEL = 15;
const LAST_TALENT_LEVEL = 43;
export function getAvailableTalentPoints(a0, a1) {
  const r5 = a0;
  if (r5 < FIRST_TALENT_LEVEL) return 0;
  let r1 = Math.min(r5, LAST_TALENT_LEVEL) - (FIRST_TALENT_LEVEL - 1);
  r1 = r1 - a1;
  return Math.max(0, r1);
}

// transcribed from L1142660 (RELIC_CONSTANTS) and L1142530-1142541
const RELIC_BASE_SLOTS = 2;
const RELIC_MAX_EXTRA_SLOTS = 2;
export function getMaxRelicSlots(a0) {
  return RELIC_BASE_SLOTS + Math.min(a0, RELIC_MAX_EXTRA_SLOTS);
}

// transcribed from L1222241 (AWAKENING_CONSTANTS) and L1222198-1222230
const FIRST_POINT_LEVEL = 45;
const MAX_POINT_LEVEL = 59;
export function getAvailableAwakeningPoints(a0, a1) {
  const r5 = a0;
  if (r5 < FIRST_POINT_LEVEL) return 0;
  let r1 = Math.min(r5, MAX_POINT_LEVEL) - (FIRST_POINT_LEVEL - 1);
  r1 = r1 - a1;
  return Math.max(0, r1);
}

// transcribed from L669241-669270 (rarity order, closure slot1) and L669167-669190
export const RARITY_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'ANCIENT', 'DIVINE', 'ETERNAL', 'OBLIVION'];
export function isRarityAtLeast(a0, a1) {
  const r1 = RARITY_ORDER.indexOf(a0);
  const r0 = RARITY_ORDER.indexOf(a1);
  if (r1 < 0 || r0 < 0) return false;
  return r1 >= r0;
}

// transcribed from L677390-677410 (rollConduitType) and L677476-677488 (rollConduit); the value roll
// is left out, only the type matters to the rarity rule
function rollConduitType(rng) {
  return rng() < 0.5 ? 'EARTHEN' : 'FLAME';
}
// transcribed from L669126-669127 (OBLIVION_PRESTIGE.DARK_CONDUIT_MIN_RARITY = Rarity.DIVINE)
const DARK_CONDUIT_MIN_RARITY = 'DIVINE';

// transcribed from L677825-677900, returning the conduit type only
export function rollConduitTypeForRarity(a0, rng, ...rest) {
  const r0 = rest.length > 0 && rest[0] !== undefined ? rest[0] : false;
  if (r0 && isRarityAtLeast(a0, DARK_CONDUIT_MIN_RARITY)) return 'DARK';
  if (a0 === 'ETERNAL') return rollConduitType(rng);
  if (a0 === 'OBLIVION') return 'DARK';
  return undefined;
}

// transcribed from L1216894-1216988 (calculateTotalStats: the Disruption effect; `transform` is the
// active transform state, null when none)
export function disruptionEffect(playerClass, transform) {
  let r35 = 'SILENCE';
  if (playerClass === 'MYSTIC' && transform) {
    if (transform.form === 'BEAR') r35 = 'STAGGER';
    else if (transform.form === 'WOLF') r35 = 'FEAR';
  }
  if (playerClass === 'NECROMANCER') r35 = 'FEAR';
  return r35;
}
