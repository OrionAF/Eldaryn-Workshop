/**
 * totals.js - the "Calculated" totals engine: sums base character stats +
 * a Preset's gear/stones + its talent set + its pet + its equipped relics +
 * every character-wide source (Mounts, Glyphs, Awakening, Transcendence)
 * into one set of final display totals, for a Preset's Manual/Calculated
 * toggle.
 *
 * Additive-only, deliberately: summing many sources at once is a different
 * operation from dps.js's two-item swap delta (which has its own additive-
 * vs-multiplicative Speed/CritMult switch) - this sum treats every field,
 * including Speed and Crit Mult, as a straight additive stack onto its base
 * (STAT_FIELDS' own `base` value, e.g. Speed 100, Crit Mult 150, Attack/
 * Health 10, everything else 0). Attack/Health are the one exception: their
 * flat contributions are summed separately from their % contributions, then
 * recombined once via the same finalAttack() used everywhere in dps.js.
 *
 * Talent tree content is static code data (talentTreeData.js), not part of
 * the persisted Roster/Character - computePresetTotals/resolveEffectiveTotals
 * default to it, with an optional override param kept for test fixtures.
 */
import { offensiveStats, finalAttack } from './dps.js';
import { SLOTS, STAT_FIELDS, SOURCE_DEFS } from './constants.js';
import { TALENT_TREES } from './talentTreeData.js';
import { resolveAwakeningPerPoint } from './awakeningData.js';
import { RELICS_BY_CLASS, relicLevelValue } from './relicsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { effectiveUnlockedSet } from './transcendence.js';

const FLAT_PAIR_KEYS = ['attack', 'health'];
const PCT_PAIR_OF = { attack: 'attack_pct', health: 'health_pct' };

function newAccumulator() {
  const totals = {};
  const flatSums = {};
  for (const f of STAT_FIELDS) {
    if (FLAT_PAIR_KEYS.includes(f.key)) {
      flatSums[f.key] = f.base;
    } else {
      totals[f.key] = f.base;
    }
  }
  return { totals, flatSums };
}

/** Add one OffensiveStats-shaped contribution into the running accumulator. */
function accumulate(acc, contribution) {
  if (!contribution) return;
  for (const f of STAT_FIELDS) {
    const key = f.key;
    const value = contribution[key] || 0;
    if (FLAT_PAIR_KEYS.includes(key)) {
      acc.flatSums[key] += value;
    } else {
      acc.totals[key] += value;
    }
  }
}

/** Pick which entries of a character-wide source's state contribute, per its `selection` mode. */
function selectedEntries(def, sourceState) {
  const entries = sourceState?.entries || [];
  if (def.selection === 'single') {
    const active = entries.find((e) => e.id === sourceState.activeId);
    return active ? [active] : [];
  }
  return entries.filter((e) => e.equipped); // 'tiered'
}

/** Mounts/Glyphs (the only sources still on the generic SOURCE_DEFS entries[]/selection sum): one entry -> an OffensiveStats-shaped contribution. */
function entryToStats(sourceKey, entry) {
  switch (sourceKey) {
    case 'mounts':
      return offensiveStats({ health_pct: entry.baseHpPct, attack_pct: entry.baseAtkPct });
    case 'glyphs':
      return offensiveStats({ [entry.statKey]: entry.value });
    default:
      return offensiveStats();
  }
}

/**
 * A preset's talent contribution: for each invested talent in its talent
 * set's allocation, the value ASSIGNED to the currently-allocated rank
 * (talent.ranks[rank-1]) - never a sum of prior ranks or a rank*base
 * formula (see model.js's TalentSet shape).
 */
function talentContribution(character, preset, talentTrees) {
  const talentSet = character.talentSets[preset.talentSet];
  const tree = talentSet?.spec ? talentTrees?.[talentSet.spec] : null;
  if (!tree) return null;
  const talentById = new Map();
  for (const tier of tree.tiers) {
    for (const t of tier.talents) talentById.set(t.id, t);
  }
  const overrides = {};
  for (const [talentId, rank] of Object.entries(talentSet.allocation || {})) {
    const talent = talentById.get(talentId);
    if (!talent || rank <= 0) continue;
    const value = talent.ranks[rank - 1] || 0;
    overrides[talent.statKey] = (overrides[talent.statKey] || 0) + value;
  }
  return offensiveStats(overrides);
}

/**
 * A character's Awakening contribution: each invested point contributes the
 * SAME flat per-point amount to every stat in the chosen path (linear, no
 * per-rank table like Talents) - Radiant's per-point stats depend on class,
 * resolved via resolveAwakeningPerPoint. Character-wide, shared by every
 * preset, so this is computed identically regardless of which preset is
 * being totalled.
 */
function awakeningContribution(character) {
  const { path, points } = character.awakening || {};
  if (!path || !points) return null;
  const perPoint = resolveAwakeningPerPoint(path, character.class);
  if (!perPoint) return null;
  const overrides = {};
  for (const [statKey, value] of Object.entries(perPoint)) {
    overrides[statKey] = value * points;
  }
  return offensiveStats(overrides);
}

/**
 * A preset's pet contribution: the chosen pet's stats contribute directly,
 * no level-based scaling (Character.petLevel is informational/display only,
 * matching pre-redesign behavior where a pet's own `level` field never fed
 * into this math either).
 */
function petContribution(character, preset) {
  if (!preset.petId) return null;
  const pet = character.pets.find((p) => p.id === preset.petId);
  return pet ? pet.stats : null;
}

/**
 * A preset's Relic contribution: for each equipped relic (preset.relicIds,
 * up to PRESET_RELIC_CAP), each of its 1-2 fixed stats contributes the value
 * linearly interpolated between the relic's min (level 1) and max (its
 * tier's maxLevel) at its CHARACTER-WIDE level (character.relicLevels) -
 * unlike Talents/gear, a relic's level is no longer per-preset, only which
 * relics are equipped is.
 */
function relicsContribution(character, preset) {
  const defs = RELICS_BY_CLASS[character.class];
  if (!defs) return null;
  const defById = new Map(defs.map((d) => [d.id, d]));
  const overrides = {};
  for (const defId of preset.relicIds || []) {
    const def = defById.get(defId);
    if (!def) continue;
    const level = character.relicLevels?.[defId] || 1;
    for (const s of def.stats) {
      const value = relicLevelValue(s.min, s.max, level, def.maxLevel);
      overrides[s.statKey] = (overrides[s.statKey] || 0) + value;
    }
  }
  return offensiveStats(overrides);
}

/**
 * A character's Transcendence contribution: every unlocked node's stats sum
 * in directly, no per-rank/level scaling (each node's flat value applies
 * once). Glyph/Sigil tree nodes have empty `stats` and so contribute
 * nothing. Character-wide, shared by every preset, like Awakening.
 */
function transcendenceContribution(character) {
  const tree = TRANSCENDENCE_TREES[character.class];
  if (!tree) return null;
  const byPosition = new Map(tree.nodes.map((n) => [n.position, n]));
  const unlocked = effectiveUnlockedSet(character.transcendence?.unlockedPositions || []);
  const overrides = {};
  for (const position of unlocked) {
    const node = byPosition.get(position);
    if (!node) continue;
    for (const s of node.stats) {
      overrides[s.statKey] = (overrides[s.statKey] || 0) + s.value;
    }
  }
  return offensiveStats(overrides);
}

/**
 * Clamps every STAT_FIELDS entry with a `cap` (the game's own hard ceiling -
 * e.g. Crit 80%, Paralyze Chance 15%) down to that cap. Stacking many
 * sources (gear, talents, Awakening) can otherwise sum past what the game
 * allows; applied to both Calculated totals and Manual entry (see
 * resolveEffectiveTotals) so neither can display or feed DPS/HPS math with
 * an impossible value. Never mutates its input - returns a new object.
 */
function applyStatCaps(stats) {
  const capped = { ...stats };
  for (const f of STAT_FIELDS) {
    if (f.cap != null && capped[f.key] > f.cap) capped[f.key] = f.cap;
  }
  return capped;
}

/**
 * Sum base + a preset's loadout gear/stones + its talent set + its pet +
 * its equipped relics + every character-wide source (Awakening,
 * Transcendence, Mounts, Glyphs) into one set of final totals for `preset`.
 * `talentTrees` defaults to the static tree content (talentTreeData.js); the
 * param exists mainly so tests can substitute fixtures.
 */
export function computePresetTotals(character, preset, talentTrees = TALENT_TREES) {
  const loadout = character.loadouts[preset.loadout];
  const acc = newAccumulator();

  for (const slot of SLOTS) {
    accumulate(acc, loadout.gear[slot]);
    accumulate(acc, loadout.stones[slot]);
  }
  accumulate(acc, talentContribution(character, preset, talentTrees));
  accumulate(acc, awakeningContribution(character));
  accumulate(acc, transcendenceContribution(character));
  accumulate(acc, relicsContribution(character, preset));
  accumulate(acc, petContribution(character, preset));

  for (const def of SOURCE_DEFS) {
    const sourceState = character[def.key];
    for (const entry of selectedEntries(def, sourceState)) {
      accumulate(acc, entryToStats(def.key, entry));
    }
  }

  const result = { ...acc.totals };
  for (const key of FLAT_PAIR_KEYS) {
    result[key] = finalAttack(acc.flatSums[key], acc.totals[PCT_PAIR_OF[key]]);
  }
  return applyStatCaps(offensiveStats(result));
}

/** The totals a preset should actually use right now: manual entry, or Calculated. */
export function resolveEffectiveTotals(character, preset, talentTrees = TALENT_TREES) {
  if (preset.manualTotals) return applyStatCaps(preset.manualStats);
  return computePresetTotals(character, preset, talentTrees); // already capped
}
