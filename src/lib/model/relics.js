// model/relics.js - persisted field `relics: Record<relicId, level>` (rebuild-plan §3).
// Levels are character-wide and class-gated: only relics of the character's class are kept, level
// 1..maxLevel (relics.md §3; absent = not owned). Which relics a preset equips is `preset.relicIds`
// (<=4), owned by presets.js; reconcileRelics only repairs those references.
//
// Domain contract (§3 "Normalisation layout"): partial-character functions, see model/index.js.
import { relicById, relicsForClass, relicIdFromV1, RELICS } from '../game/relics.js';
import { relicSlotCap, RELIC_MAX_EXTRA_SLOTS } from './legality.js';

export function defaultRelics() {
  return { relics: {}, extraRelicSlots: RELIC_MAX_EXTRA_SLOTS };
}

/** Purchased relic slots (0-2). Absent -> 2, so saves from before the field keep their 4 slots. */
export function normaliseExtraRelicSlots(raw) {
  if (raw == null || raw === '' || typeof raw === 'boolean') return RELIC_MAX_EXTRA_SLOTS;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.max(0, Math.min(RELIC_MAX_EXTRA_SLOTS, n)) : RELIC_MAX_EXTRA_SLOTS;
}

const clampLevel = (v, max) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};

function levelsFrom(raw, cls) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const legal = new Set(relicsForClass(cls).map((r) => r.id));
  for (const [id, lv] of Object.entries(raw)) {
    if (!legal.has(id)) continue;
    const n = clampLevel(lv, relicById(id).maxLevel);
    if (n > 0) out[id] = n;
  }
  return out;
}

export function normaliseRelics(rawCharacter, ctx) {
  return { relics: levelsFrom(rawCharacter?.relics, ctx?.class), extraRelicSlots: normaliseExtraRelicSlots(rawCharacter?.extraRelicSlots) };
}

const isSentinel = (v1) => typeof v1?.class === 'string' && v1.class.toUpperCase() === 'SENTINEL';

/**
 * v1 `relicLevels` (Record<defId, level>) -> `relics`. v1 Sentinel saves used the Warrior ids, which
 * relics.json `sentinelMigration` renames (relics.md §8). idMap covers every id a v1 preset could
 * hold (identity for unchanged ids), so a preset's `relicIds` survives the migration.
 */
export function migrateRelicsFromV1(v1Character) {
  const rename = isSentinel(v1Character) ? relicIdFromV1 : (id) => id;
  const idMap = {};
  for (const r of RELICS) idMap[r.id] = rename(r.id);
  const raw = {};
  const levels = v1Character?.relicLevels;
  if (levels && typeof levels === 'object') {
    for (const [id, lv] of Object.entries(levels)) raw[rename(id)] = lv;
  }
  return { value: { relics: levelsFrom(raw, String(v1Character?.class ?? '').toUpperCase()) }, idMap };
}

/**
 * Drop preset relic references that are not owned relics of the character's class (a relic at level
 * 0 is not owned), then clamp each preset to the slots the level and purchases allow, keeping the
 * first ones (relics.md, L1142530-1142573).
 */
export function reconcileRelics(character) {
  if (!character.class) return; // class not chosen yet: nothing to gate against
  const legal = new Set(relicsForClass(character.class).map((r) => r.id));
  const cap = relicSlotCap(character.level ?? 100, character.extraRelicSlots);
  for (const p of character.presets ?? []) {
    if (Array.isArray(p.relicIds)) p.relicIds = p.relicIds.filter((id) => legal.has(id) && character.relics?.[id] > 0).slice(0, cap);
  }
}

/** Stat value at `level` (relics.md §2: linear, level <= 1 gives base). `bonus` = {base, max}. */
export function relicStatAt(bonus, level, maxLevel) {
  if (maxLevel <= 1 || level <= 1) return bonus.base;
  return bonus.base + ((bonus.max - bonus.base) * (level - 1)) / (maxLevel - 1);
}

const STAT_LABELS = {
  HP_PERCENT: 'HP', ATTACK_PERCENT: 'Attack', PENETRATION: 'Penetration', BLOCK_CHANCE: 'Block Chance',
  CRIT_CHANCE: 'Crit Chance', CRIT_DAMAGE: 'Crit Damage', DAMAGE_REDUCTION: 'Damage Reduction', LIFESTEAL: 'Lifesteal',
  ATTACK_SPEED: 'Attack Speed', HP_REGEN: 'HP Regen', PVP_ATTACK: 'PVP Attack', PVP_DEFENSE: 'PVP Defense',
  MISS_CHANCE: 'Evasion', BLIND_CHANCE: 'Blind Chance', PARALYZE_CHANCE: 'Paralyze Chance', SPELL_DAMAGE: 'Spell Damage',
  SPELL_RESIST: 'Spell Resist', SPELL_CRIT_CHANCE: 'Spell Crit', SPELL_VAMP: 'Spell Vamp', DISRUPTION_CHANCE: 'Disruption Chance',
  FEAR_CHANCE: 'Fear Chance', MINION_ATTACK: 'Minion Attack', MINION_HEALTH: 'Minion Health', MINION_CRIT_CHANCE: 'Minion Crit',
  MINION_LIFESTEAL: 'Minion Lifesteal', SOUL_LINK: 'Soul Link', MINION_ATTACK_SPEED: 'Minion Attack Speed',
};
export const relicStatLabel = (stat) => STAT_LABELS[stat] ?? stat;

/** Display string per relics.md §7 (formatStatValue). */
export function formatRelicStat(stat, v) {
  switch (stat) {
    case 'ATTACK_SPEED':
    case 'MINION_ATTACK_SPEED':
      return `+${v.toFixed(2)}`;
    case 'CRIT_DAMAGE':
      return `+${Math.round(v * 100)}%`;
    case 'PVP_ATTACK':
    case 'PVP_DEFENSE':
      return `+${Math.round(v)}`;
    case 'HP_REGEN':
      return `+${v.toFixed(1)}`;
    default:
      return `+${v.toFixed(1)}%`;
  }
}
