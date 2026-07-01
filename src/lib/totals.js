/**
 * totals.js - the "Calculated" totals engine (Phase 1): sums base character
 * stats + gear + stones + talents (all per-loadout) + every character-scoped
 * source into one set of final display totals, for the Manual/Calculated
 * toggle on Profile Stats.
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
 * Talent trees are roster-level (shared across characters/loadouts), not
 * character-level, so computeCalculatedTotals/resolveEffectiveTotals take an
 * explicit `talentTrees` param (callers pass rosterStore.roster.talentTrees)
 * rather than reading it off `character`.
 */
import { offensiveStats, finalAttack } from './dps.js';
import { SLOTS, STAT_FIELDS, SOURCE_DEFS } from './constants.js';

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
      // Deferred sources (talents/awakening/transcendence/sigils/relics) are
      // scaffold-only (empty entries) this pass, so this branch doesn't run
      // yet - default shape in case a future generic {label, stats} entry lands here first.
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
 * Sum base + gear + stones + talents (all per-loadout) + every character-
 * scoped source (shared across both loadouts) into one set of final totals
 * for `loadout`. `talentTrees` is roster-level shared data (rosterStore.roster.talentTrees).
 */
export function computeCalculatedTotals(character, loadoutIndex, talentTrees) {
  const loadout = character.loadouts[loadoutIndex];
  const acc = newAccumulator();

  for (const slot of SLOTS) {
    accumulate(acc, loadout.gear[slot]);
    accumulate(acc, loadout.stones[slot]);
  }
  accumulate(acc, talentContribution(loadout, talentTrees));

  for (const def of SOURCE_DEFS) {
    if (def.scope !== 'character') continue;
    const sourceState = character.sources[def.key];
    for (const entry of selectedEntries(def, sourceState)) {
      accumulate(acc, entryToStats(def.key, entry));
    }
  }

  const result = { ...acc.totals };
  for (const key of FLAT_PAIR_KEYS) {
    result[key] = finalAttack(acc.flatSums[key], acc.totals[PCT_PAIR_OF[key]]);
  }
  return offensiveStats(result);
}

/** The totals a loadout should actually use right now: manual entry, or Calculated. */
export function resolveEffectiveTotals(character, loadoutIndex, talentTrees) {
  const loadout = character.loadouts[loadoutIndex];
  return loadout.manualTotals ? loadout.profileTotals : computeCalculatedTotals(character, loadoutIndex, talentTrees);
}
