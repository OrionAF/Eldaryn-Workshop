/**
 * optimizer.js - automatic build search: finds the max-DPS configuration of
 * every searchable source and returns it as a virtual "Simulated Preset"
 * recommendation (never applied to the store - the user makes the changes
 * themselves).
 *
 * SEARCH MODEL
 * ------------
 * A Candidate fully describes one build: a preset-shaped choice block
 * (loadout / pet / relics; fortress buffs are carried AS SET on the preset,
 * never searched - if the player checked a buff it's accounted for, if not
 * it isn't) plus the character-wide
 * overrides (talent spec+allocation, active mount, glyph equips, awakening
 * path, transcendence unlocks). Saved Talent Sets are NOT part of the
 * search: the optimizer keeps the preset's set slot as-is and searches spec
 * + point allocation from scratch - the recommendation is "make your
 * talents look like this", not "switch to Set B". Only the point BUDGET
 * comes from the player's sets (the most points spent in either one, since
 * that's how many points they demonstrably own; 29 if both are empty).
 * materializeCandidate() turns it into a shallow candidate character +
 * candidate preset that computePresetTotals() accepts unmodified - no store
 * mutation, no totals.js changes.
 *
 * The objective is pluggable: sigilAwareDpsObjective (default) scores a
 * build with the closed-form computeDps PLUS the closed-form expectation of
 * the equipped sigils' active effects (expectedSigilActiveDps) - exact for
 * crit/double-hit and all flat sigil damage, uptime-approximate for timed
 * sigil buffs, and ~10,000x cheaper than sampling. It reduces exactly to
 * expectedDpsObjective when no sigil numbers are entered.
 * createMonteCarloObjective ("slower / sim-accurate" in the UI) instead runs
 * the battle sim per candidate, rebuilding each candidate's sigil effects,
 * so buff-window overlap is captured exactly at Monte Carlo cost.
 *
 * Strategy: coordinate ascent over dimension groups, seeded with the CURRENT
 * build (so the result can never score worse than what the player already
 * runs). Small dimensions are enumerated exhaustively; relic and sigil
 * subsets are enumerated exactly (choose <= cap from the class pool,
 * restricted to entries with any entered value); glyphs are greedy
 * per tier; talents are greedy marginal-gain plus a 1-point swap pass;
 * transcendence is rebuilt from an EMPTY board every time (resetting is
 * free in-game), greedily re-spending the Ichor already invested in the
 * current nodes plus any extra the player entered, so it can re-route
 * defensive detours into DPS nodes even with no new Ichor.
 * Passes repeat until a full loop yields no strict improvement.
 *
 * KNOWN HEURISTIC GAPS (accepted for v1, see plan):
 *  - Greedy talents can miss builds that park points in zero-gain talents
 *    purely to unlock a deeper tier; the swap pass only partially mitigates.
 *  - Greedy transcendence looks ahead one stepping stone (a zero-gain node
 *    paired with each neighbor it exposes - necessary because the tree's
 *    start node is defensive), but won't see through longer zero-gain
 *    corridors.
 */

import { computeDps } from './dps.js';
import { computePresetTotals } from './totals.js';
import { runSimulation, DEFAULT_EFFECTS } from './simulation.js';
import { buildSigilEffects, expectedSigilActiveDps } from './sigilEffects.js';
import { SIGILS_BY_CLASS } from './sigilsData.js';
import { SOURCE_DEFS, SPECS_BY_CLASS, PRESET_RELIC_CAP, PRESET_SIGIL_CAP, TALENT_TOTAL_POINTS, fieldsForTab, SLOTS } from './constants.js';
import { summarizeStats } from './format.js';
import { TALENT_TREES } from './talentTreeData.js';
import { AWAKENING_PATHS } from './awakeningData.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { canUnlock, costForCount, totalIchorSpent } from './transcendence.js';
import { stoneTypeDef } from './stonesData.js';

const EPS = 1e-9;
const YIELD_EVERY = 500; // objective evals between setTimeout yields (keeps the UI painting)
const GLYPH_TIER_CAPS = SOURCE_DEFS.find((d) => d.key === 'glyphs').tierCaps;

// --- Objectives -----------------------------------------------------------

/** Exact expected DPS of the v1 sim effects (crit/double-hit) - ignores sigil actives. */
export function expectedDpsObjective(candidateCharacter, candidatePreset) {
  return computeDps(computePresetTotals(candidateCharacter, candidatePreset));
}

/**
 * Default objective: expectedDpsObjective plus the closed-form expectation of
 * the equipped sigils' ACTIVE effects (their passives are already inside the
 * totals). Flat sigil damage (nukes, DoT ticks) is exact; each timed buff is
 * mixed in as uptime * (buffed swing DPS - base swing DPS), applying the
 * buff's stats the same way the sim's modifySwing/speedBonus hooks do. Buffs
 * are mixed independently per sigil, so overlap synergy between two buff
 * sigils is approximated additively - the Monte Carlo objective captures it
 * exactly when that precision is worth the cost.
 */
export function sigilAwareDpsObjective(candidateCharacter, candidatePreset) {
  const totals = computePresetTotals(candidateCharacter, candidatePreset);
  const base = computeDps(totals);
  const { flatDps, buffs } = expectedSigilActiveDps(candidateCharacter, candidatePreset);
  let dps = base + flatDps;
  for (const { statAdds, uptime } of buffs) {
    const buffed = {
      ...totals,
      attack: (totals.attack + (statAdds.attack || 0)) * (1 + (statAdds.attack_pct || 0) / 100),
      crit: totals.crit + (statAdds.crit || 0),
      crit_mult: totals.crit_mult + (statAdds.crit_mult || 0),
      double_hit: totals.double_hit + (statAdds.double_hit || 0),
      speed: totals.speed + (statAdds.speed || 0),
    };
    dps += uptime * (computeDps(buffed) - base);
  }
  return dps;
}

/**
 * Sim-based "slower / accurate" objective: plays the fight out per candidate.
 * `buildEffects(candidateCharacter, candidatePreset)` is re-run for every
 * candidate so the effect list tracks the candidate's own sigilIds; by
 * default it's the same DEFAULT_EFFECTS + buildSigilEffects stack the Battle
 * Simulation panel uses. A fixed seed gives every candidate the same RNG
 * stream (common random numbers), so comparisons are paired and the modest
 * iteration count stays fair.
 */
export function createMonteCarloObjective({ iterations = 100, durationSeconds = 60, seed = 1, buildEffects } = {}) {
  const build =
    buildEffects ?? ((character, preset) => [...DEFAULT_EFFECTS, ...buildSigilEffects(character, preset)]);
  return (candidateCharacter, candidatePreset) =>
    runSimulation({
      stats: computePresetTotals(candidateCharacter, candidatePreset),
      iterations,
      durationSeconds,
      seed,
      effects: build(candidateCharacter, candidatePreset),
    }).meanDps;
}

// --- Candidate representation ----------------------------------------------

/** Snapshot the player's ACTUAL current build as the starting candidate. */
export function candidateFromCurrent(character, preset) {
  const talentSet = character.talentSets[preset.talentSet];
  return {
    preset: {
      loadout: preset.loadout,
      talentSet: preset.talentSet,
      petId: preset.petId,
      relicIds: [...(preset.relicIds || [])],
      sigilIds: [...(preset.sigilIds || [])],
      fortressBuffs: { ...preset.fortressBuffs },
    },
    socketedStones: { ...(character.loadouts[preset.loadout]?.socketedStones || {}) },
    talentSpec: talentSet?.spec ?? null,
    talentAllocation: { ...(talentSet?.allocation || {}) },
    mountActiveId: character.mounts?.activeId ?? null,
    glyphEquippedIds: (character.glyphs?.entries || []).filter((e) => e.equipped).map((e) => e.id),
    awakeningPath: character.awakening?.path ?? null,
    transcendenceUnlocked: [...(character.transcendence?.unlockedPositions || [])],
  };
}

/**
 * Turn a Candidate into the { candidateCharacter, candidatePreset } pair
 * computePresetTotals() evaluates - a shallow clone substituting only the
 * overridden branches, never mutating the real character/preset.
 */
export function materializeCandidate(character, candidate) {
  const glyphSet = new Set(candidate.glyphEquippedIds);
  const candidateCharacter = {
    ...character,
    loadouts: character.loadouts.map((lo, i) =>
      i === candidate.preset.loadout ? { ...lo, socketedStones: { ...candidate.socketedStones } } : lo
    ),
    talentSets: character.talentSets.map((ts, i) =>
      i === candidate.preset.talentSet ? { spec: candidate.talentSpec, allocation: candidate.talentAllocation } : ts
    ),
    mounts: { ...character.mounts, activeId: candidate.mountActiveId },
    glyphs: { entries: (character.glyphs?.entries || []).map((e) => ({ ...e, equipped: glyphSet.has(e.id) })) },
    awakening: { path: candidate.awakeningPath, points: character.awakening?.points || 0 },
    transcendence: { unlockedPositions: [...candidate.transcendenceUnlocked] },
  };
  const candidatePreset = {
    id: 'simulated',
    name: 'Simulated Preset',
    loadout: candidate.preset.loadout,
    talentSet: candidate.preset.talentSet,
    petId: candidate.preset.petId,
    relicIds: [...candidate.preset.relicIds],
    sigilIds: [...candidate.preset.sigilIds],
    fortressBuffs: { ...candidate.preset.fortressBuffs },
  };
  return { candidateCharacter, candidatePreset };
}

function cloneCandidate(candidate) {
  return {
    preset: {
      ...candidate.preset,
      relicIds: [...candidate.preset.relicIds],
      sigilIds: [...candidate.preset.sigilIds],
      fortressBuffs: { ...candidate.preset.fortressBuffs },
    },
    socketedStones: { ...candidate.socketedStones },
    talentSpec: candidate.talentSpec,
    talentAllocation: { ...candidate.talentAllocation },
    mountActiveId: candidate.mountActiveId,
    glyphEquippedIds: [...candidate.glyphEquippedIds],
    awakeningPath: candidate.awakeningPath,
    transcendenceUnlocked: [...candidate.transcendenceUnlocked],
  };
}

// --- Talent legality (mirrors rosterStore's private tier rules) -------------

function pointsSpentInTier(tier, allocation) {
  return tier.talents.reduce((sum, t) => sum + (allocation[t.id] || 0), 0);
}

function totalPointsSpent(allocation) {
  return Object.values(allocation || {}).reduce((sum, r) => sum + r, 0);
}

/** Tier 0 is always accessible; tier N needs `threshold` points across all previous tiers. */
function isTierUnlocked(tree, tierIndex, allocation) {
  if (tierIndex === 0) return true;
  let spent = 0;
  for (let i = 0; i < tierIndex; i++) spent += pointsSpentInTier(tree.tiers[i], allocation);
  return spent >= tree.tiers[tierIndex].threshold;
}

/** Every talent with points sits in a tier that is unlocked by the tiers below it. */
export function isAllocationLegal(tree, allocation, budget = TALENT_TOTAL_POINTS) {
  if (totalPointsSpent(allocation) > budget) return false;
  for (let i = 0; i < tree.tiers.length; i++) {
    if (pointsSpentInTier(tree.tiers[i], allocation) > 0 && !isTierUnlocked(tree, i, allocation)) return false;
  }
  for (const tier of tree.tiers) {
    for (const t of tier.talents) {
      const rank = allocation[t.id] || 0;
      if (rank < 0 || rank > t.ranks.length) return false;
    }
  }
  return true;
}

/** Talents that can legally take one more point right now. */
function legalTalentIncrements(tree, allocation) {
  const moves = [];
  for (let i = 0; i < tree.tiers.length; i++) {
    if (!isTierUnlocked(tree, i, allocation)) continue;
    for (const t of tree.tiers[i].talents) {
      if ((allocation[t.id] || 0) < t.ranks.length) moves.push(t.id);
    }
  }
  return moves;
}

/**
 * Whether a sigil could move the score at all: any nonzero entered number
 * (passive stat, active stat, activation damage, tick damage). Mirrors the
 * relic pass's "level 0 contributes nothing" pool filter - an all-zero sigil
 * only bloats the subset space.
 */
function sigilHasAnyValue(character, def) {
  const entered = character.sigilValues?.[def.id];
  if (!entered) return false;
  if (Number(entered.damage) > 0 || Number(entered.tickDamage) > 0) return true;
  for (const s of def.passive?.stats || []) {
    if (Number(entered.passive?.[s.statKey])) return true;
  }
  for (const s of def.active?.stats || []) {
    if (Number(entered.active?.[s.statKey])) return true;
  }
  return false;
}

// --- Optimizer ---------------------------------------------------------------

/**
 * Search for the max-objective build reachable from `preset`.
 * Async: yields to the event loop every YIELD_EVERY evals and reports
 * progress via onProgress({ phase, evals, bestScore }).
 *
 * `ichorBudget` gates the transcendence pass: 0 (default) = no new unlocks.
 */
export async function optimize({
  character,
  preset,
  ichorBudget = 0,
  objective = sigilAwareDpsObjective,
  onProgress,
  maxPasses = 5,
} = {}) {
  const startedAt = Date.now();
  let evals = 0;

  const score = async (candidate) => {
    evals += 1;
    if (evals % YIELD_EVERY === 0) await new Promise((r) => setTimeout(r, 0));
    const { candidateCharacter, candidatePreset } = materializeCandidate(character, candidate);
    return objective(candidateCharacter, candidatePreset);
  };

  let best = cloneCandidate(candidateFromCurrent(character, preset));
  let bestScore = await score(best);
  const baselineScore = bestScore;
  const { candidateCharacter: baseChar, candidatePreset: basePreset } = materializeCandidate(character, best);
  const baselineTotals = computePresetTotals(baseChar, basePreset);

  const report = (phase) => onProgress?.({ phase, evals, bestScore });

  /** Score `next`; adopt it if strictly better. Returns true on adoption. */
  const consider = async (next) => {
    const s = await score(next);
    if (s > bestScore + EPS) {
      best = next;
      bestScore = s;
      return true;
    }
    return false;
  };

  let transcendencePlan = []; // replaced whenever the transcendence pass adopts a rebuild

  let passes = 0;
  let improvedInLoop = true;
  while (improvedInLoop && passes < maxPasses) {
    passes += 1;
    improvedInLoop = false;

    // -- Loadout (the talent-set slot is never switched: talents are searched
    //    from scratch below, independent of what either saved set contains) --
    report('loadouts');
    for (let lo = 0; lo < character.loadouts.length; lo++) {
      if (lo === best.preset.loadout) continue;
      const next = cloneCandidate(best);
      next.preset.loadout = lo;
      next.socketedStones = { ...(character.loadouts[lo]?.socketedStones || {}) };
      if (await consider(next)) improvedInLoop = true;
    }

    // -- Pet --
    report('pets');
    for (const petId of [null, ...character.pets.map((p) => p.id)]) {
      if (petId === best.preset.petId) continue;
      const next = cloneCandidate(best);
      next.preset.petId = petId;
      if (await consider(next)) improvedInLoop = true;
    }

    // -- Awakening path (respec-able in-game; points are level-derived, never searched) --
    report('awakening');
    if (character.awakening?.points > 0) {
      for (const path of Object.keys(AWAKENING_PATHS)) {
        if (path === best.awakeningPath) continue;
        const next = cloneCandidate(best);
        next.awakeningPath = path;
        if (await consider(next)) improvedInLoop = true;
      }
    }

    // -- Mount (single active) --
    report('mounts');
    for (const mountId of [null, ...(character.mounts?.entries || []).map((m) => m.id)]) {
      if (mountId === best.mountActiveId) continue;
      const next = cloneCandidate(best);
      next.mountActiveId = mountId;
      if (await consider(next)) improvedInLoop = true;
    }

    // -- Glyphs: greedy fill per tier within its cap --
    report('glyphs');
    const glyphEntries = character.glyphs?.entries || [];
    for (const [tier, cap] of Object.entries(GLYPH_TIER_CAPS)) {
      const tierIds = glyphEntries.filter((e) => e.tier === tier).map((e) => e.id);
      if (tierIds.length === 0) continue;
      const otherTierIds = best.glyphEquippedIds.filter((id) => !tierIds.includes(id));
      let selected = [];
      let candidateBase = cloneCandidate(best);
      candidateBase.glyphEquippedIds = [...otherTierIds];
      // Greedily re-fill this tier from empty; only adopt if the refill beats the incumbent.
      for (let slot = 0; slot < cap; slot++) {
        let bestAdd = null;
        let bestAddScore = -Infinity;
        for (const id of tierIds) {
          if (selected.includes(id)) continue;
          const next = cloneCandidate(candidateBase);
          next.glyphEquippedIds = [...otherTierIds, ...selected, id];
          const s = await score(next);
          if (s > bestAddScore) {
            bestAddScore = s;
            bestAdd = next;
          }
        }
        if (!bestAdd) break;
        selected = bestAdd.glyphEquippedIds.filter((id) => tierIds.includes(id));
        candidateBase = bestAdd;
        if (bestAddScore > bestScore + EPS) {
          best = cloneCandidate(bestAdd);
          bestScore = bestAddScore;
          improvedInLoop = true;
        }
      }
    }

    // -- Relics: exact enumeration of all subsets <= PRESET_RELIC_CAP --
    report('relics');
    const relicDefs = RELICS_BY_CLASS[character.class] || [];
    // Level-0 relics contribute nothing (totals.js skips them) - excluding
    // them shrinks the subset space without losing any real option.
    const pool = relicDefs.filter((d) => (character.relicLevels?.[d.id] || 0) > 0).map((d) => d.id);
    if (pool.length > 0) {
      const subsets = [[]];
      for (const id of pool) {
        const grown = [];
        for (const subset of subsets) {
          if (subset.length < PRESET_RELIC_CAP) grown.push([...subset, id]);
        }
        subsets.push(...grown);
      }
      for (const subset of subsets) {
        const next = cloneCandidate(best);
        next.preset.relicIds = subset;
        if (await consider(next)) improvedInLoop = true;
      }
    }

    // -- Sigils: exact enumeration of all subsets <= PRESET_SIGIL_CAP, from
    //    the pool of sigils with any entered value (passives score via
    //    totals, actives via the objective's sigil term) --
    report('sigils');
    const sigilDefs = SIGILS_BY_CLASS[character.class] || [];
    const sigilPool = sigilDefs.filter((d) => sigilHasAnyValue(character, d)).map((d) => d.id);
    if (sigilPool.length > 0) {
      const subsets = [[]];
      for (const id of sigilPool) {
        const grown = [];
        for (const subset of subsets) {
          if (subset.length < PRESET_SIGIL_CAP) grown.push([...subset, id]);
        }
        subsets.push(...grown);
      }
      for (const subset of subsets) {
        const next = cloneCandidate(best);
        next.preset.sigilIds = subset;
        if (await consider(next)) improvedInLoop = true;
      }
    }

    // -- Socketed stones: greedy per-slot fill from an empty socket map, modeled
    //    on the glyph pass. Any stone fits any slot; each stone used at most once
    //    per loadout (mirrors normaliseLoadout/socketStone rules). Stones are
    //    slot-agnostic and purely additive, so greedy top-up is effectively exact.
    report('stones');
    const stoneIds = (character.stoneInventory || []).map((s) => s.id);
    if (stoneIds.length > 0) {
      let candidateBase = cloneCandidate(best);
      candidateBase.socketedStones = {}; // start empty ("leave empty" is the default)
      let baseScore = await score(candidateBase);
      const used = new Set();
      for (const slot of SLOTS) {
        let bestAdd = null;
        let bestAddScore = -Infinity;
        for (const id of stoneIds) {
          if (used.has(id)) continue;
          const next = cloneCandidate(candidateBase);
          next.socketedStones = { ...candidateBase.socketedStones, [slot]: id };
          const s = await score(next);
          if (s > bestAddScore) {
            bestAddScore = s;
            bestAdd = { next, id };
          }
        }
        // Adopt the marginal winner into the working base only if it beats
        // leaving the slot empty (score of candidateBase itself).
        if (!bestAdd) break;
        if (bestAddScore > baseScore + EPS) {
          candidateBase = bestAdd.next;
          used.add(bestAdd.id);
          baseScore = bestAddScore;
          if (bestAddScore > bestScore + EPS) {
            best = cloneCandidate(candidateBase);
            bestScore = bestAddScore;
            improvedInLoop = true;
          }
        }
      }
    }

    // -- Talents: per spec, greedy marginal-gain from empty, then a 1-point swap pass.
    //    Saved sets only inform the point budget (most points spent in either
    //    set = points the player owns), never the allocation itself. --
    report('talents');
    const specs = SPECS_BY_CLASS[character.class] || [];
    const ownedPoints = Math.max(...character.talentSets.map((ts) => totalPointsSpent(ts?.allocation)), 0);
    const budget = Math.min(TALENT_TOTAL_POINTS, ownedPoints > 0 ? ownedPoints : TALENT_TOTAL_POINTS);
    for (const spec of specs) {
      const tree = TALENT_TREES[spec.key];
      if (!tree) continue;

      // Greedy build-up.
      let allocation = {};
      let working = cloneCandidate(best);
      working.talentSpec = spec.key;
      working.talentAllocation = allocation;
      let workingScore = await score(working);
      while (totalPointsSpent(allocation) < budget) {
        let bestMove = null;
        let bestMoveScore = workingScore;
        for (const talentId of legalTalentIncrements(tree, allocation)) {
          const next = cloneCandidate(working);
          next.talentAllocation = { ...allocation, [talentId]: (allocation[talentId] || 0) + 1 };
          const s = await score(next);
          if (s > bestMoveScore + EPS) {
            bestMoveScore = s;
            bestMove = next;
          }
        }
        if (!bestMove) break; // nothing strictly improves - stop (documented heuristic gap)
        working = bestMove;
        allocation = working.talentAllocation;
        workingScore = bestMoveScore;
      }

      // Swap pass: move single points between talents while it strictly helps.
      let swapped = true;
      let guard = 0;
      while (swapped && guard < 50) {
        swapped = false;
        guard += 1;
        for (const fromId of Object.keys(allocation)) {
          for (const toId of legalTalentIncrements(tree, allocation)) {
            if (toId === fromId) continue;
            const moved = { ...allocation, [fromId]: allocation[fromId] - 1, [toId]: (allocation[toId] || 0) + 1 };
            if (moved[fromId] === 0) delete moved[fromId];
            if (!isAllocationLegal(tree, moved, budget)) continue;
            const next = cloneCandidate(working);
            next.talentAllocation = moved;
            const s = await score(next);
            if (s > workingScore + EPS) {
              working = next;
              allocation = moved;
              workingScore = s;
              swapped = true;
              break;
            }
          }
          if (swapped) break;
        }
      }

      if (workingScore > bestScore + EPS) {
        best = working;
        bestScore = workingScore;
        improvedInLoop = true;
      }
    }

    // -- Transcendence: resetting is FREE in-game, so rebuild the board from
    //    an EMPTY state every time. Budget = the Ichor refunded by resetting
    //    the current nodes + any extra the player entered - so even with 0
    //    extra, defensive detours get re-routed into the highest-DPS nodes. --
    report('transcendence');
    const tree = TRANSCENDENCE_TREES[character.class];
    const refundedIchor = tree ? totalIchorSpent(character.transcendence?.unlockedPositions || [], tree) : 0;
    const totalIchor = refundedIchor + ichorBudget;
    if (tree && totalIchor > 0) {
      const unlocked = [];
      let count = 0;
      let remaining = totalIchor;
      const plan = [];
      let working = cloneCandidate(best);
      working.transcendenceUnlocked = [];
      let workingScore = await score(working);

      const isBuyable = (node) => node && (node.type === 'common' || node.type === 'uncommon');
      const tryUnlockSequence = async (nodes) => {
        // Total cost of unlocking `nodes` in order at the current tier count.
        let cost = 0;
        for (let i = 0; i < nodes.length; i++) {
          cost += costForCount(count + 1 + i, nodes[i].type === 'uncommon');
        }
        if (cost > remaining) return null;
        const next = cloneCandidate(working);
        next.transcendenceUnlocked = [...unlocked, ...nodes.map((n) => n.position)];
        const s = await score(next);
        return { next, score: s, nodes, cost, gain: s - workingScore };
      };

      let bought = true;
      while (bought) {
        bought = false;
        let bestBuy = null;
        const track = (buy) => {
          if (buy && buy.gain > EPS && (!bestBuy || buy.gain / buy.cost > bestBuy.gain / bestBuy.cost)) bestBuy = buy;
        };
        // Rank frontier nodes by DPS gain per Ichor (sigil/glyph nodes have
        // no stats, so they never rank and are skipped outright).
        for (const node of tree.nodes) {
          if (!isBuyable(node) || !canUnlock(node.position, unlocked, tree)) continue;
          const single = await tryUnlockSequence([node]);
          if (single && single.gain > EPS) {
            track(single);
          } else if (single) {
            // Zero-gain frontier node (e.g. the defensive start node): look
            // one step ahead - buy it as a stepping stone if some node it
            // exposes makes the PAIR worth its combined Ichor.
            for (const neighbor of tree.nodes) {
              if (!isBuyable(neighbor) || neighbor.position === node.position) continue;
              if (unlocked.includes(neighbor.position)) continue;
              if (!canUnlock(neighbor.position, [...unlocked, node.position], tree)) continue;
              if (canUnlock(neighbor.position, unlocked, tree)) continue; // already reachable on its own
              track(await tryUnlockSequence([node, neighbor]));
            }
          }
        }
        if (bestBuy) {
          working = bestBuy.next;
          workingScore = bestBuy.score;
          for (const node of bestBuy.nodes) {
            const cost = costForCount(count + 1, node.type === 'uncommon');
            unlocked.push(node.position);
            count += 1;
            remaining -= cost;
            plan.push({
              position: node.position,
              statLine: node.stats.map((s) => `${s.statKey} +${s.value}`).join(', ') || 'no stats',
              cost,
              deltaScore: bestBuy.gain / bestBuy.nodes.length,
            });
          }
          bought = true;
        }
      }

      // Adopt the rebuild only if it strictly beats the incumbent (which
      // still carries the player's current unlocks) - an equal-score rebuild
      // means the current board is already optimal, so recommend nothing.
      if (workingScore > bestScore + EPS) {
        best = working;
        bestScore = workingScore;
        transcendencePlan = plan;
        improvedInLoop = true;
      }
    }
  }

  const { candidateCharacter, candidatePreset } = materializeCandidate(character, best);
  const bestTotals = computePresetTotals(candidateCharacter, candidatePreset);

  return {
    baseline: { score: baselineScore, totals: baselineTotals },
    best: { score: bestScore, totals: bestTotals, candidate: best },
    improvementPct: baselineScore > 0 ? (bestScore / baselineScore - 1) * 100 : 0,
    changes: diffCandidate(character, preset, best),
    transcendencePlan,
    ichorSpent: transcendencePlan.reduce((sum, u) => sum + u.cost, 0),
    evals,
    passes,
    elapsedMs: Date.now() - startedAt,
  };
}

// --- Diff -------------------------------------------------------------------

// A pet's flat Attack/Health are its CORE stats; its identity comes from
// the BONUS stats it boosts (several pets can share a name), so labels read
// "Name (+4% ATK · +1.5% crit)" - core flats deliberately excluded.
const PET_BONUS_FIELDS = fieldsForTab('gear').filter((f) => f.key !== 'attack' && f.key !== 'health');

/** "Fenrir (+4% ATK · +1.5% crit)" - pet name + bonus-stat summary. */
export function petLabel(character, petId) {
  if (!petId) return 'No pet';
  const pet = character.pets.find((p) => p.id === petId);
  if (!pet) return 'Unknown pet';
  const bonuses = summarizeStats(pet.stats, PET_BONUS_FIELDS);
  return bonuses === 'no stats yet' ? pet.name : `${pet.name} (${bonuses})`;
}

const STONE_FIELDS = fieldsForTab('gear');

/** "Mythic Soulstone Q3 (+5% crit)" - type label + quality + stat summary. */
export function stoneLabel(character, stoneId) {
  if (!stoneId) return 'Empty';
  const stone = (character.stoneInventory || []).find((s) => s.id === stoneId);
  if (!stone) return 'Unknown stone';
  const name = `${stoneTypeDef(stone.type)?.label || stone.type} Q${stone.quality}`;
  const bits = summarizeStats(stone.stats, STONE_FIELDS);
  return bits === 'no stats yet' ? name : `${name} (${bits})`;
}

function specLabel(character, specKey) {
  if (!specKey) return 'No spec';
  return (SPECS_BY_CLASS[character.class] || []).find((s) => s.key === specKey)?.label || specKey;
}

/**
 * Human-readable "what to change" list: one ChangeItem per dimension that
 * differs between the player's current build and the recommended candidate.
 * ChangeItem = { dimension, from, to, detail?: string[] }.
 */
export function diffCandidate(character, preset, candidate) {
  const changes = [];
  const current = candidateFromCurrent(character, preset);

  if (candidate.preset.loadout !== current.preset.loadout) {
    changes.push({
      dimension: 'loadout',
      from: character.loadouts[current.preset.loadout]?.name || `Loadout ${current.preset.loadout + 1}`,
      to: character.loadouts[candidate.preset.loadout]?.name || `Loadout ${candidate.preset.loadout + 1}`,
    });
  }

  // Talent build: compare against the preset's current set (the set slot
  // itself is never part of the search - only spec + allocation are). When
  // anything differs, the detail is the FULL recommended build in tree
  // order - "put this many points in each talent" - not a from→to diff,
  // since the natural way to apply it in-game is reset + reallocate.
  const savedSet = character.talentSets[candidate.preset.talentSet] || { spec: null, allocation: {} };
  const specChanged = candidate.talentSpec !== savedSet.spec;
  const talentIds = new Set([...Object.keys(savedSet.allocation || {}), ...Object.keys(candidate.talentAllocation || {})]);
  const allocationChanged = [...talentIds].some(
    (id) => (specChanged ? 0 : savedSet.allocation?.[id] || 0) !== (candidate.talentAllocation?.[id] || 0)
  );
  if (specChanged || allocationChanged) {
    const tree = TALENT_TREES[candidate.talentSpec];
    const detail = [];
    for (const tier of tree?.tiers || []) {
      for (const t of tier.talents) {
        detail.push(`${t.name}: ${candidate.talentAllocation?.[t.id] || 0}`);
      }
    }
    changes.push({
      dimension: 'talents',
      from: specLabel(character, savedSet.spec),
      to: specLabel(character, candidate.talentSpec),
      detail,
    });
  }

  if (candidate.preset.petId !== current.preset.petId) {
    let from = petLabel(character, current.preset.petId);
    let to = petLabel(character, candidate.preset.petId);
    if (from === to) {
      // Same name + same bonus stats but different core Attack/Health: re-label
      // with the FULL stat summary so the change arrow always renders.
      const full = (id) => {
        const pet = character.pets.find((p) => p.id === id);
        if (!pet) return id ? 'Unknown pet' : 'No pet';
        return `${pet.name} (${summarizeStats(pet.stats, fieldsForTab('gear'))})`;
      };
      from = full(current.preset.petId);
      to = full(candidate.preset.petId);
      if (from === to) {
        from += ' (current)';
        to += ' (recommended)';
      }
    }
    changes.push({ dimension: 'pet', from, to });
  }

  const relicName = (id) => (RELICS_BY_CLASS[character.class] || []).find((d) => d.id === id)?.name || id;
  const removedRelics = current.preset.relicIds.filter((id) => !candidate.preset.relicIds.includes(id));
  const addedRelics = candidate.preset.relicIds.filter((id) => !current.preset.relicIds.includes(id));
  if (removedRelics.length > 0 || addedRelics.length > 0) {
    changes.push({
      dimension: 'relics',
      from: current.preset.relicIds.map(relicName).join(', ') || 'None',
      to: candidate.preset.relicIds.map(relicName).join(', ') || 'None',
      detail: [
        ...addedRelics.map((id) => `Equip ${relicName(id)}`),
        ...removedRelics.map((id) => `Unequip ${relicName(id)}`),
      ],
    });
  }

  const sigilName = (id) => (SIGILS_BY_CLASS[character.class] || []).find((d) => d.id === id)?.name || id;
  const removedSigils = current.preset.sigilIds.filter((id) => !candidate.preset.sigilIds.includes(id));
  const addedSigils = candidate.preset.sigilIds.filter((id) => !current.preset.sigilIds.includes(id));
  if (removedSigils.length > 0 || addedSigils.length > 0) {
    changes.push({
      dimension: 'sigils',
      from: current.preset.sigilIds.map(sigilName).join(', ') || 'None',
      to: candidate.preset.sigilIds.map(sigilName).join(', ') || 'None',
      detail: [
        ...addedSigils.map((id) => `Equip ${sigilName(id)}`),
        ...removedSigils.map((id) => `Unequip ${sigilName(id)}`),
      ],
    });
  }

  const recLoadoutStones = character.loadouts[candidate.preset.loadout]?.socketedStones || {};
  const stoneDetail = [];
  for (const slot of SLOTS) {
    const fromId = recLoadoutStones[slot] || null;
    const toId = candidate.socketedStones?.[slot] || null;
    if (fromId === toId) continue;
    if (toId) {
      stoneDetail.push(
        `${slot}: socket ${stoneLabel(character, toId)}` + (fromId ? ` — was ${stoneLabel(character, fromId)}` : '')
      );
    } else {
      stoneDetail.push(`${slot}: unsocket ${stoneLabel(character, fromId)}`);
    }
  }
  if (stoneDetail.length > 0) {
    const countOf = (m) => SLOTS.filter((s) => m?.[s]).length;
    changes.push({
      dimension: 'stones',
      from: `${countOf(recLoadoutStones)} socketed`,
      to: `${countOf(candidate.socketedStones)} socketed`,
      detail: stoneDetail,
    });
  }

  if (candidate.mountActiveId !== current.mountActiveId) {
    const mountName = (id) => (id ? (character.mounts?.entries || []).find((m) => m.id === id)?.name || 'Unknown mount' : 'No mount');
    let from = mountName(current.mountActiveId);
    let to = mountName(candidate.mountActiveId);
    if (from === to) {
      from += ' (current)';
      to += ' (recommended)';
    }
    changes.push({ dimension: 'mount', from, to });
  }

  const glyphLabel = (id) => {
    const g = (character.glyphs?.entries || []).find((e) => e.id === id);
    return g ? `${g.tier} ${g.statKey} +${g.value}` : id;
  };
  const removedGlyphs = current.glyphEquippedIds.filter((id) => !candidate.glyphEquippedIds.includes(id));
  const addedGlyphs = candidate.glyphEquippedIds.filter((id) => !current.glyphEquippedIds.includes(id));
  if (removedGlyphs.length > 0 || addedGlyphs.length > 0) {
    changes.push({
      dimension: 'glyphs',
      from: current.glyphEquippedIds.map(glyphLabel).join(', ') || 'None',
      to: candidate.glyphEquippedIds.map(glyphLabel).join(', ') || 'None',
      detail: [
        ...addedGlyphs.map((id) => `Equip ${glyphLabel(id)}`),
        ...removedGlyphs.map((id) => `Unequip ${glyphLabel(id)}`),
      ],
    });
  }

  if (candidate.awakeningPath !== current.awakeningPath) {
    const pathLabel = (p) => (p ? AWAKENING_PATHS[p]?.label || p : 'No path');
    changes.push({ dimension: 'awakening', from: pathLabel(current.awakeningPath), to: pathLabel(candidate.awakeningPath) });
  }

  // Transcendence is a free reset + full rebuild, so compare as SETS (a
  // rebuild that lands on the same nodes is no change). No detail lines -
  // the card renders the rebuilt board on a read-only TranscendenceGrid
  // instead of a coordinate list.
  const currentNodes = new Set(current.transcendenceUnlocked);
  const candidateNodes = new Set(candidate.transcendenceUnlocked);
  const sameBoard = currentNodes.size === candidateNodes.size && [...candidateNodes].every((p) => currentNodes.has(p));
  if (!sameBoard) {
    changes.push({
      dimension: 'transcendence',
      from: `${currentNodes.size} nodes`,
      to: `${candidateNodes.size} nodes (free reset + rebuild)`,
    });
  }

  return changes;
}
