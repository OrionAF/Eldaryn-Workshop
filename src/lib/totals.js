/**
 * totals.js - the "Calculated" totals engine (Phase 1): sums base character
 * stats + gear + stones + talents + Relics (all per-loadout) + Awakening +
 * Transcendence and every character-scoped source into one set of final
 * display totals, for the Manual/Calculated toggle on Profile Stats.
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
 * the persisted Roster/Character - computeCalculatedTotals/
 * resolveEffectiveTotals default to it, with an optional override param kept
 * for test fixtures.
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

/** Pick which entries of a source's state contribute, per its `selection` mode. */
function selectedEntries(def, sourceState) {
  const entries = sourceState?.entries || [];
  if (def.selection === 'all') return entries;
  if (def.selection === 'single') {
    const active = entries.find((e) => e.id === sourceState.activeId);
    return active ? [active] : [];
  }
  return entries.filter((e) => e.equipped); // 'tiered'
}

/** Per-source: how to turn one entry into an OffensiveStats-shaped contribution. */
function entryToStats(sourceKey, entry) {
  switch (sourceKey) {
    case 'pets':
      return entry.stats;
    case 'mounts':
      return offensiveStats({ health_pct: entry.baseHpPct, attack_pct: entry.baseAtkPct });
    case 'mountGlyphs':
      return offensiveStats({ [entry.statKey]: entry.value });
    default:
      // Deferred sources (sigils) are scaffold-only (empty entries) this
      // pass, so this branch doesn't run for them yet - default shape in
      // case a future generic {label, stats} entry lands here first.
      // Talents/Awakening/Transcendence/Relics are special-cased above
      // (their own *Contribution() functions), never reach this switch.
      return entry.stats || offensiveStats();
  }
}

/**
 * A loadout's talent contribution: for each invested talent, the value
 * ASSIGNED to the currently-allocated rank (talent.ranks[rank-1]) - never a
 * sum of prior ranks or a rank*base formula (see model.js's Talent shape).
 */
function talentContribution(loadout, talentTrees) {
  const tree = loadout.spec ? talentTrees?.[loadout.spec] : null;
  if (!tree) return null;
  const talentById = new Map();
  for (const tier of tree.tiers) {
    for (const t of tier.talents) talentById.set(t.id, t);
  }
  const overrides = {};
  for (const [talentId, rank] of Object.entries(loadout.talentAllocation || {})) {
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
 * resolved via resolveAwakeningPerPoint. Shared by both loadouts (character-
 * scoped, not per-loadout), so this is computed identically regardless of
 * which loadout is being totalled.
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
 * A loadout's Relic contribution: for each equipped relic, each of its 1-2
 * fixed stats contributes the value linearly interpolated between the
 * relic's min (level 1) and max (its tier's maxLevel) at the invested
 * level - like Talents, independent per loadout (Set A/B have their own
 * equipped relics and levels), not shared across both like Awakening.
 */
function relicsContribution(loadout, characterClass) {
  const defs = RELICS_BY_CLASS[characterClass];
  if (!defs) return null;
  const defById = new Map(defs.map((d) => [d.id, d]));
  const overrides = {};
  for (const entry of loadout.relics?.entries || []) {
    if (!entry.equipped) continue;
    const def = defById.get(entry.defId);
    if (!def) continue;
    for (const s of def.stats) {
      const value = relicLevelValue(s.min, s.max, entry.level, def.maxLevel);
      overrides[s.statKey] = (overrides[s.statKey] || 0) + value;
    }
  }
  return offensiveStats(overrides);
}

/**
 * A character's Transcendence contribution: every unlocked node's stats sum
 * in directly, no per-rank/level scaling (each node's flat value applies
 * once). Nothing is unlocked by default - including the tree's start
 * position, which has no adjacency prerequisite but still has to be
 * unlocked by the player like any other node (see transcendence.js).
 * Glyph/Sigil nodes have empty `stats` and so contribute nothing. Shared by
 * both loadouts (character-scoped, like Awakening), so this is computed
 * identically regardless of which loadout is being totalled.
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
 * Sum base + gear + stones + talents + Relics (all per-loadout) + Awakening
 * + every character-scoped, `selection`-bearing source (shared across both
 * loadouts) into one set of final totals for `loadout`. `talentTrees`
 * defaults to the static tree content (talentTreeData.js); the param exists
 * mainly so tests can substitute fixtures.
 */
export function computeCalculatedTotals(character, loadoutIndex, talentTrees = TALENT_TREES) {
  const loadout = character.loadouts[loadoutIndex];
  const acc = newAccumulator();

  for (const slot of SLOTS) {
    accumulate(acc, loadout.gear[slot]);
    accumulate(acc, loadout.stones[slot]);
  }
  accumulate(acc, talentContribution(loadout, talentTrees));
  accumulate(acc, awakeningContribution(character));
  accumulate(acc, transcendenceContribution(character));
  accumulate(acc, relicsContribution(loadout, character.class));

  for (const def of SOURCE_DEFS) {
    if (def.scope !== 'character' || !def.selection) continue;
    const sourceState = character.sources[def.key];
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

/** The totals a loadout should actually use right now: manual entry, or Calculated. */
export function resolveEffectiveTotals(character, loadoutIndex, talentTrees = TALENT_TREES) {
  const loadout = character.loadouts[loadoutIndex];
  if (loadout.manualTotals) return applyStatCaps(loadout.profileTotals);
  return computeCalculatedTotals(character, loadoutIndex, talentTrees); // already capped
}
