/**
 * totals.js - the "Calculated" totals engine: sums every stat source a preset
 * draws on into one set of final display totals.
 *
 * The aggregation rules this implements (additive-only, the Attack/Health
 * flat-vs-% exception, which sources are character-wide vs per-preset) are
 * documented in docs/Reference/data-model.md §5. The raw -> curve -> effective
 * pipeline, and which callers must pass raw rather than effective totals, is
 * docs/Reference/combat-model.md §1. Do not restate either here.
 *
 * Local note: talent tree content is static code data (talentTreeData.js), so
 * computePresetTotals/resolveEffectiveTotals take it as a defaulted param -
 * the override exists for test fixtures, not for production callers.
 */
import { offensiveStats, finalAttack } from './dps.js';
import { applySoftCaps, clampToHardCaps } from './statCaps.js';
import { SLOTS, STAT_FIELDS, SOURCE_DEFS } from './constants.js';
import { TALENT_TREES } from './talentTreeData.js';
import { resolveAwakeningPerPoint } from './awakeningData.js';
import { RELICS_BY_CLASS, relicLevelValue } from './relicsData.js';
import { SIGILS_BY_CLASS, sigilStat, hasSigilCurve, sigilEffectValue, sigilUnlockedAt } from './sigilsData.js';
import { petStats } from './petsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { effectiveUnlockedSet } from './transcendence.js';

const FLAT_PAIR_KEYS = ['attack', 'health'];
const PCT_PAIR_OF = { attack: 'attack_pct', health: 'health_pct' };

/** Fixed per-buff stat contributions for the Fortress Buffs checkboxes (top/bottom mutually exclusive, core independent). */
const FORTRESS_BUFF_STATS = {
  top: { attack_pct: 5, speed: 3, crit: 3, penetration: 3, pvp_attack: 15 },
  bottom: { health_pct: 5, hp_regen: 3, dmg_reduction: 5, miss_chance: 5, block_chance: 3, blind_chance: 3, pvp_defense: 15 },
  core: { pvp_attack: 25, pvp_defense: 25 },
};

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
 * A preset's pet contribution: the chosen pet resolved to its OffensiveStats
 * via petStats() (petsData.js) - a catalogue pet's Attack/Health derived from
 * its companion curve at the pet's tier/level plus its secondary rolls, or a
 * custom pet's hand-entered stats.
 */
function petContribution(character, preset) {
  if (!preset.petId) return null;
  const pet = character.pets.find((p) => p.id === preset.petId);
  // Tier/level come from the character-wide Pet Altar, not the pet itself.
  return pet ? petStats(pet, character.petAltar) : null;
}

/**
 * A preset's Mount contribution: the ridden mount (preset.mountId, a fixed
 * MOUNT_DEFS catalogue id) contributes its rolled HP%/ATK% (bounded to the
 * mount's star range). Mirrors petContribution: stats entered once per
 * character, selection made per preset.
 */
function mountContribution(character, preset) {
  if (!preset.mountId) return null;
  const mount = (character.mounts?.entries || []).find((m) => m.id === preset.mountId);
  if (!mount || !(mount.star > 0)) return null; // star 0 = not owned
  const overrides = { health_pct: mount.hpPct, attack_pct: mount.atkPct };
  // Glyphs ride with the MOUNT, so only the mount this preset actually rides
  // contributes - and only its MINOR glyphs, since major glyphs retune a
  // sigil's mechanic (sigilEffects.js) instead of adding stats.
  const byId = new Map((character.glyphs?.entries || []).map((g) => [g.id, g]));
  for (const glyphId of mount.glyphIds || []) {
    const glyph = byId.get(glyphId);
    if (!glyph || glyph.special) continue;
    overrides[glyph.statKey] = (overrides[glyph.statKey] || 0) + (Number(glyph.value) || 0);
  }
  return offensiveStats(overrides);
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
    const level = character.relicLevels?.[defId] || 0;
    if (level <= 0) continue;
    for (const s of def.stats) {
      const value = relicLevelValue(s.min, s.max, level, def.maxLevel);
      overrides[s.statKey] = (overrides[s.statKey] || 0) + value;
    }
  }
  return offensiveStats(overrides);
}

/**
 * A preset's Sigil contribution: each equipped sigil's PASSIVE stats
 * (preset.sigilIds, up to PRESET_SIGIL_CAP) sum in directly - permanent
 * while equipped. The catalogue (sigilsData.js) only declares WHICH stats a
 * passive carries; the values come from the character's own entered numbers
 * (character.sigilValues, they scale with in-game sigil level), so a sigil
 * with no entered values contributes 0. The flat Attack/Health passives are
 * instead DERIVED from the sigil's level/tier via its rarity curve (sigilStat,
 * sigilsData.js) - the user picks level/tier, not the raw numbers. Active
 * effects deliberately do NOT contribute here: they're time-dependent
 * (duration/cooldown windows, on-activation damage) and belong to the battle
 * simulation (sigilEffects.js), not a steady-state stat sum.
 */
function sigilsContribution(character, preset) {
  const defs = SIGILS_BY_CLASS[character.class];
  if (!defs) return null;
  const defById = new Map(defs.map((d) => [d.id, d]));
  const forgeTier = character.sigilForgeTier || 1;
  const overrides = {};
  for (const sigilId of preset.sigilIds || []) {
    const def = defById.get(sigilId);
    if (!def?.passive) continue;
    // Legendary/Ancient sigils don't exist below Forge Tier 2 - an equipped
    // one contributes nothing until the forge catches up.
    if (!sigilUnlockedAt(def, forgeTier)) continue;
    const values = character.sigilValues?.[sigilId] || {};
    const entered = values.passive || {};
    const derived = hasSigilCurve(def);
    for (const s of def.passive.stats) {
      let value;
      if (derived && (s.statKey === 'attack' || s.statKey === 'health')) {
        value = sigilStat(def, s.statKey, values.level, forgeTier);
      } else {
        // Percentage passives are baked per level where we scraped them;
        // anything unbaked falls back to the user's own entry.
        const baked = sigilEffectValue(def, s.statKey, values.level);
        value = baked === null ? Number(entered[s.statKey]) || 0 : baked;
      }
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
 * A preset's Fortress Buffs contribution: top/bottom/core each add their own
 * fixed stat block (FORTRESS_BUFF_STATS) when checked - top/bottom are
 * mutually exclusive by construction (see model.js's normalisePreset /
 * rosterStore.setPresetFortressBuff) but summed independently here, so
 * top+core or bottom+core both work.
 */
function fortressBuffsContribution(preset) {
  const buffs = preset.fortressBuffs;
  if (!buffs) return null;
  const overrides = {};
  for (const key of ['top', 'bottom', 'core']) {
    if (!buffs[key]) continue;
    for (const [statKey, value] of Object.entries(FORTRESS_BUFF_STATS[key])) {
      overrides[statKey] = (overrides[statKey] || 0) + value;
    }
  }
  return offensiveStats(overrides);
}

/**
 * Converts a RAW (pre-curve) stat record into effective totals via the
 * game's soft-cap diminishing-returns curve (statCaps.js): below a stat's
 * soft cap raw = effective; above it the overflow curves toward the hard
 * cap without reaching it. Input MUST be a raw additive sum (Calculated
 * totals, applySwap output) - the curve is not idempotent, so never pass
 * already-curved/effective values (those only need clampToHardCaps, see
 * resolveEffectiveTotals's Manual branch). Never mutates its input.
 */
export function applyStatCaps(stats) {
  return applySoftCaps(stats);
}

/**
 * A loadout slot's socketed stone contribution, resolved by id through the
 * character's shared stoneInventory (see model.js's Loadout.socketedStones -
 * a slot only ever stores an id, never a stat block).
 */
function socketedStoneStats(character, loadout, slot) {
  const stoneId = loadout.socketedStones[slot];
  if (!stoneId) return null;
  const stone = character.stoneInventory.find((s) => s.id === stoneId);
  return stone ? stone.stats : null;
}

/**
 * Sum base + a preset's loadout gear/socketed stones + its talent set + its
 * pet + its equipped relics + its equipped sigils' passives + every character-wide source (Awakening,
 * Transcendence, Glyphs) plus the preset's ridden mount into the preset's
 * RAW totals - the pre-curve sum the game shows on the "SOFT ·" line once a
 * stat passes its soft cap. Callers that feed combat math or display the
 * headline value want computePresetTotals (curved) instead; this raw form
 * exists for the SOFT indicator and for swap pipelines that must add item
 * stats BEFORE the curve is applied (Drop Check).
 * `talentTrees` defaults to the static tree content (talentTreeData.js); the
 * param exists mainly so tests can substitute fixtures.
 */
export function computePresetRawTotals(character, preset, talentTrees = TALENT_TREES) {
  const loadout = character.loadouts[preset.loadout];
  const acc = newAccumulator();

  for (const slot of SLOTS) {
    accumulate(acc, loadout.gear[slot]);
    accumulate(acc, socketedStoneStats(character, loadout, slot));
  }
  accumulate(acc, talentContribution(character, preset, talentTrees));
  accumulate(acc, awakeningContribution(character));
  accumulate(acc, transcendenceContribution(character));
  accumulate(acc, relicsContribution(character, preset));
  accumulate(acc, sigilsContribution(character, preset));
  accumulate(acc, petContribution(character, preset));
  accumulate(acc, mountContribution(character, preset));
  accumulate(acc, fortressBuffsContribution(preset));
  // Glyphs used to be summed here through the generic SOURCE_DEFS loop, back
  // when they were character-wide and carried their own `equipped` flag. They
  // now ride with the mount, so mountContribution owns them and SOURCE_DEFS
  // has no member left that contributes additively.

  const result = { ...acc.totals };
  for (const key of FLAT_PAIR_KEYS) {
    result[key] = finalAttack(acc.flatSums[key], acc.totals[PCT_PAIR_OF[key]]);
  }
  return offensiveStats(result);
}

/** A preset's EFFECTIVE Calculated totals: the raw sum with the soft-cap curve applied. */
export function computePresetTotals(character, preset, talentTrees = TALENT_TREES) {
  return applyStatCaps(computePresetRawTotals(character, preset, talentTrees));
}

/**
 * The totals a preset should actually use right now: manual entry, or
 * Calculated. Manual values are what the user copied off the in-game stat
 * sheet's headline numbers - ALREADY post-curve effective - so they are only
 * clamped to the hard caps, never re-curved.
 */
export function resolveEffectiveTotals(character, preset, talentTrees = TALENT_TREES) {
  if (preset.manualTotals) return clampToHardCaps(preset.manualStats);
  return computePresetTotals(character, preset, talentTrees); // already curved
}
