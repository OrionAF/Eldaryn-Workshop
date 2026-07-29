/**
 * relicSuggester.js - the "Relic Suggester": answers "if I invested N relic
 * levels into ANY relic - including locked (level 0) ones - which investment
 * pays off most?" (docs/Reference/Notes/relic-suggester-design.md).
 *
 * Semantics of N: +N per relic, INDEPENDENTLY and simultaneously - every
 * locked relic is simulated at level N and every unlocked relic at
 * current+N, all clamped to the relic's maxLevel. N is not a shared budget.
 * The rest of the build stays fixed; only the relic dimension is searched.
 *
 * Two outputs, both scored in the same `objective` units as the host
 * screen's optimizer (so suggestions can't disagree with it):
 *  - best board: optimize() on the boosted character with only the relics
 *    dimension enabled (its existing exhaustive subset pass sees the full
 *    class pool, since nothing is level 0 in the boosted world), plus the
 *    unlock/upgrade/equip steps that board needs.
 *  - perRelic ranked list: each relic boosted ALONE (others at current
 *    levels), equipped in place of the weakest current relic if the preset
 *    is full - one eval per relic, so cheap runners-up stay visible.
 *
 * ⚠ WHAT `gain` MEASURES, because the word invites one reading and the number
 * is the other. For a not-equipped relic on a FULL preset it is
 * (invest + equip + unequip the weakest current relic) - so a strong
 * investment can rank low purely because what it displaces is also strong. It
 * answers "worth levelling AND slotting right now", not "worth levelling".
 * Rows where that applies say so: `gainIncludesSwap` with the displaced relic
 * named, so the panel can show it rather than leaving the caller to know.
 *
 * `sampled` marks a result whose objective is Monte Carlo. Those gains are
 * differences of estimates - paired by a fixed seed, which helps a lot, but a
 * single relic level's effect can still sit inside the residual. There is no
 * CI on the rows: the objective returns one scalar, so nothing here can
 * measure its variance. Getting one means replicate scoring under a second
 * seed, which is not built.
 *
 * Suggestions are informational only: levels aren't applied anywhere, the
 * player spends Relic Medals in-game and edits the Relics screen manually.
 */

import { PRESET_RELIC_CAP } from './constants.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { computePresetTotals } from './totals.js';
import { optimize, candidateFromCurrent, materializeCandidate, sigilAwareDpsObjective } from './optimizer.js';

/** Every optimize() dimension off except relics - the suggester holds the rest of the build fixed. */
const RELICS_ONLY_DIMENSIONS = {
  loadouts: false,
  pets: false,
  awakening: false,
  mounts: false,
  glyphs: false,
  relics: true,
  sigils: false,
  stones: false,
  talents: false,
  transcendence: false,
};

/** character.relicLevels with `defIds` each raised by `boost` levels (0 -> boost for locked), clamped to maxLevel. */
export function boostRelicLevels(character, defIds, boost) {
  const defs = RELICS_BY_CLASS[character.class] || [];
  const boosted = { ...(character.relicLevels || {}) };
  for (const def of defs) {
    if (!defIds.has(def.id)) continue;
    boosted[def.id] = Math.min((boosted[def.id] || 0) + boost, def.maxLevel);
  }
  return boosted;
}

/**
 * The unlock/upgrade/equip steps separating the player's current relic state
 * from the suggested board: investments (unlock/upgrade) only for relics the
 * board actually equips, plus pure equip/unequip board changes.
 */
export function diffRelicPlan(character, preset, suggestedRelicIds, boostedLevels) {
  const defs = RELICS_BY_CLASS[character.class] || [];
  const byId = new Map(defs.map((d) => [d.id, d]));
  const currentIds = new Set(preset.relicIds || []);
  const changes = [];
  for (const id of suggestedRelicIds) {
    const def = byId.get(id);
    if (!def) continue;
    const fromLevel = character.relicLevels?.[id] || 0;
    const toLevel = boostedLevels[id] ?? fromLevel;
    if (fromLevel === 0 && toLevel > 0) {
      changes.push({ kind: 'unlock', id, name: def.name, tier: def.tier, toLevel });
    } else if (toLevel > fromLevel) {
      changes.push({ kind: 'upgrade', id, name: def.name, tier: def.tier, fromLevel, toLevel });
    }
    if (!currentIds.has(id)) changes.push({ kind: 'equip', id, name: def.name, tier: def.tier });
  }
  for (const id of currentIds) {
    if (suggestedRelicIds.includes(id)) continue;
    const def = byId.get(id);
    if (def) changes.push({ kind: 'unequip', id, name: def.name, tier: def.tier });
  }
  return changes;
}

/**
 * Run the Relic Suggester. Same request/hook conventions as optimize():
 * plain-JSON-safe inputs, `signal` aborts with best-so-far
 * (`aborted: true`), onProgress({ phase, evals, bestScore }).
 *
 * Returns { levelBoost, baseline, best, improvementPct, changes, perRelic,
 * aborted, evals, elapsedMs }; perRelic is sorted by gain descending, gain
 * measured against the CURRENT (unboosted) build in `objective` units.
 */
export async function suggestRelics({
  character,
  preset,
  relicLevelBoost = 0,
  objective = sigilAwareDpsObjective,
  screenObjective = null,
  // Whether `objective` is a Monte Carlo estimator. The caller knows (it built
  // the objective from a spec); this module cannot tell from a function.
  sampled = false,
  signal,
  onProgress,
} = {}) {
  const startedAt = Date.now();
  const boost = Math.max(0, Math.floor(relicLevelBoost));
  const defs = RELICS_BY_CLASS[character.class] || [];
  if (boost <= 0 || defs.length === 0) {
    throw new Error('Relic Suggester needs at least 1 level to simulate and a class with relic data');
  }

  let evals = 0;
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));
  const scoreCandidate = (candidate) => {
    evals += 1;
    const { candidateCharacter, candidatePreset } = materializeCandidate(character, candidate);
    return objective(candidateCharacter, candidatePreset);
  };

  // Baseline: the player's ACTUAL current build (unboosted) - optimize()'s
  // own baseline can't serve, it would score currently-equipped relics at
  // their boosted levels and understate every gain.
  const baseCandidate = candidateFromCurrent(character, preset);
  const baselineScore = scoreCandidate(baseCandidate);
  const { candidateCharacter: baseChar, candidatePreset: basePreset } = materializeCandidate(character, baseCandidate);
  const baselineTotals = computePresetTotals(baseChar, basePreset);

  // -- Best board: everything boosted at once, exhaustive equip-subset search --
  const allIds = new Set(defs.map((d) => d.id));
  const boostedAllLevels = boostRelicLevels(character, allIds, boost);
  const boostedCharacter = { ...character, relicLevels: boostedAllLevels };
  const inner = await optimize({
    character: boostedCharacter,
    preset,
    searchDimensions: RELICS_ONLY_DIMENSIONS,
    objective,
    screenObjective,
    signal,
    onProgress: (p) => onProgress?.({ phase: 'relic-board', evals: evals + p.evals, bestScore: p.bestScore }),
  });
  evals += inner.evals;
  const best = {
    score: inner.best.score,
    totals: inner.best.totals,
    relicIds: [...inner.best.candidate.preset.relicIds],
  };
  const changes = diffRelicPlan(character, preset, best.relicIds, boostedAllLevels);

  // -- Ranked per-relic list: each relic boosted alone against the current build --
  const perRelic = [];
  let aborted = inner.aborted;
  if (!aborted) {
    try {
      // Where a not-equipped relic goes when the preset is full: the slot
      // whose current occupant loses the least score when removed.
      const equippedIds = [...(preset.relicIds || [])];
      let weakestEquippedId = null;
      if (equippedIds.length >= PRESET_RELIC_CAP) {
        // Maximising the post-removal score finds the relic whose absence
        // costs least - i.e. the weakest. (The name tracks the relic, not the
        // score it holds, which is a maximum.)
        let weakestScore = -Infinity;
        for (const removeId of equippedIds) {
          if (signal?.aborted) throw new Error('aborted');
          const cand = candidateFromCurrent(character, preset);
          cand.preset.relicIds = equippedIds.filter((id) => id !== removeId);
          const s = scoreCandidate(cand);
          if (s > weakestScore) {
            weakestScore = s;
            weakestEquippedId = removeId;
          }
        }
      }

      const byId = new Map(defs.map((d) => [d.id, d]));
      for (const def of defs) {
        if (signal?.aborted) throw new Error('aborted');
        const fromLevel = character.relicLevels?.[def.id] || 0;
        const toLevel = Math.min(fromLevel + boost, def.maxLevel);
        const atMax = fromLevel >= def.maxLevel;
        const cand = candidateFromCurrent(character, preset);
        // Only a relic that has to be SLOTTED can displace one, and only when
        // the preset is already full - that is the case where `gain` stops
        // being about this relic alone.
        let displacedId = null;
        if (!cand.preset.relicIds.includes(def.id)) {
          if (cand.preset.relicIds.length >= PRESET_RELIC_CAP) {
            displacedId = weakestEquippedId;
            cand.preset.relicIds = cand.preset.relicIds.map((id) => (id === displacedId ? def.id : id));
          } else {
            cand.preset.relicIds = [...cand.preset.relicIds, def.id];
          }
        }
        const oneBoosted = { ...character, relicLevels: boostRelicLevels(character, new Set([def.id]), boost) };
        const { candidateCharacter, candidatePreset } = materializeCandidate(oneBoosted, cand);
        evals += 1;
        const gain = objective(candidateCharacter, candidatePreset) - baselineScore;
        perRelic.push({
          id: def.id,
          name: def.name,
          tier: def.tier,
          fromLevel,
          toLevel,
          isUnlock: fromLevel === 0,
          atMax,
          gain,
          gainIncludesSwap: displacedId !== null,
          displacedId,
          displacedName: displacedId ? (byId.get(displacedId)?.name ?? null) : null,
        });
        onProgress?.({ phase: 'relic-ranking', evals, bestScore: best.score });
        await yieldNow();
      }
      perRelic.sort((a, b) => b.gain - a.gain);
    } catch {
      aborted = true; // per-relic pass aborted: keep what we have, sorted
      perRelic.sort((a, b) => b.gain - a.gain);
    }
  }

  return {
    levelBoost: boost,
    baseline: { score: baselineScore, totals: baselineTotals },
    best,
    improvementPct: baselineScore > 0 ? (best.score / baselineScore - 1) * 100 : 0,
    changes,
    perRelic,
    sampled,
    aborted,
    evals,
    elapsedMs: Date.now() - startedAt,
  };
}
