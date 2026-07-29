/**
 * pvpGauntlet.js - duel-validate PVP optimizer finalists against the
 * archetype gauntlet (goals/linking redesign decisions 3 & 4).
 *
 * The closed-form PVP score drives the search; this is the other half of
 * the hybrid: take the finalists (best + runner-ups) and duel each against
 * a spread of generated archetype opponents (pvpArchetypes.js) built at the
 * player's own stat budget, reporting win-rate per archetype and flagging
 * when the duel ranking disagrees with the closed-form ranking.
 *
 * Runs on the main thread, yielding between cells (like pvpOptimizer's
 * runPvpMatrix) so progress paints and a `signal` cancels. `runDuel` and
 * `makeOpponentSide` are injectable so the orchestration unit-tests with a
 * synchronous fake - no tick engine needed.
 */

import { runPvpSimulation, buildPvpSide, rateCiHalfWidth, PVP_HEALTH_MULTIPLIER } from './pvpSimulation.js';
import { materializeCandidate } from './optimizer.js';
import { resolveEffectiveTotals } from './totals.js';
import { activeSpecialGlyphIds } from './sigilEffects.js';
import { generateGauntlet } from './pvpArchetypes.js';

export const DEFAULT_GAUNTLET_ITERATIONS = 200;
export const DEFAULT_VARIANTS_PER_ARCHETYPE = 2;

/** The primary budget the gauntlet anchors to: the build's Attack + Health. */
export function buildBudget(character, preset) {
  const t = resolveEffectiveTotals(character, preset);
  return (Number(t.attack) || 0) + (Number(t.health) || 0);
}

/** Player duel side from a build (mirrors pvpOptimizer.playerToSide). */
function playerSideFor(character, preset) {
  return buildPvpSide({
    name: character.name,
    stats: resolveEffectiveTotals(character, preset),
    characterClass: character.class,
    sigilIds: preset.sigilIds,
    sigilValues: character.sigilValues,
    specialGlyphIds: activeSpecialGlyphIds(character, preset),
  });
}

/**
 * Compare the closed-form finalist ranking (by `score`) against the duel
 * ranking (by `overallWinRate`), flagging a contradiction only when the
 * duel leader beats the closed-form leader beyond their combined CI (so
 * Monte-Carlo noise never raises a false flag). Pure - exported for tests.
 */
export function analyzeContradiction(finalists) {
  if (!Array.isArray(finalists) || finalists.length < 2) return { flagged: false };
  const byScore = [...finalists].sort((a, b) => b.score - a.score);
  const byDuel = [...finalists].sort((a, b) => b.overallWinRate - a.overallWinRate);
  const cfTop = byScore[0];
  const duelTop = byDuel[0];
  const closedFormRankInDuel = byDuel.findIndex((f) => f.index === cfTop.index) + 1;
  if (cfTop.index === duelTop.index) {
    return { flagged: false, closedFormTopIndex: cfTop.index, duelTopIndex: duelTop.index, closedFormRankInDuel: 1, message: 'Closed-form and duel rankings agree on the best build.' };
  }
  const gap = duelTop.overallWinRate - cfTop.overallWinRate;
  const combinedCi = (duelTop.ci || 0) + (cfTop.ci || 0);
  const flagged = gap > combinedCi;
  return {
    flagged,
    closedFormTopIndex: cfTop.index,
    duelTopIndex: duelTop.index,
    closedFormRankInDuel,
    gap,
    message: flagged
      ? `The closed-form top build ranks #${closedFormRankInDuel} by duels — build #${duelTop.index + 1} out-duels it (${duelTop.overallWinRate.toFixed(1)}% vs ${cfTop.overallWinRate.toFixed(1)}%).`
      : 'Closed-form and duel rankings broadly agree (within noise).',
  };
}

/**
 * Duel every finalist against every gauntlet opponent under common random
 * numbers, aggregating per archetype (mean win-rate + CI) and overall.
 *
 * @param {{ character, preset, finalists, budget?, seed?, iterations?,
 *   variantsPerArchetype?, runDuel?, makeOpponentSide?, onProgress?, signal? }} opts
 *   `finalists` = [{ score, candidate }] (result.best + result.topCandidates).
 *   `budget` defaults to the build's Attack+Health. `runDuel` defaults to
 *   runPvpSimulation; inject a fake in tests.
 * @returns the report, or `{ aborted: true }` if cancelled.
 */
export async function runGauntlet({
  character,
  preset,
  finalists,
  budget,
  seed,
  iterations = DEFAULT_GAUNTLET_ITERATIONS,
  variantsPerArchetype = DEFAULT_VARIANTS_PER_ARCHETYPE,
  runDuel = runPvpSimulation,
  makeOpponentSide = buildPvpSide,
  onProgress,
  signal,
} = {}) {
  const B = Number(budget) > 0 ? Number(budget) : buildBudget(character, preset);
  const baseSeed = (seed ?? Math.floor(Math.random() * 4294967296)) >>> 0;
  const opponents = generateGauntlet({ budget: B, seed: baseSeed, variantsPerArchetype });
  const opponentSides = opponents.map((o) => ({
    meta: o,
    side: makeOpponentSide({ name: o.name, stats: o.stats, characterClass: o.class, sigilIds: o.sigilIds, sigilValues: o.sigilValues, specialGlyphIds: o.specialGlyphIds }),
  }));

  const finalistSides = finalists.map((f) => {
    const { candidateCharacter, candidatePreset } = materializeCandidate(character, f.candidate);
    return playerSideFor(candidateCharacter, candidatePreset);
  });

  const agg = finalists.map((f, index) => ({ index, score: f.score, winRateSum: 0, cellCount: 0, byArchetype: {} }));
  const total = finalists.length * opponentSides.length;
  let done = 0;

  for (let fi = 0; fi < finalistSides.length; fi++) {
    for (let oi = 0; oi < opponentSides.length; oi++) {
      if (signal?.aborted) return { aborted: true };
      const { meta, side } = opponentSides[oi];
      const res = runDuel({
        player: finalistSides[fi],
        opponent: side,
        iterations,
        seed: baseSeed,
        durationSeconds: 60,
        healthMultiplier: PVP_HEALTH_MULTIPLIER,
        // Inert context for runPvpSimulation (it ignores unknown fields);
        // lets an injected fake key its win-rate by finalist/archetype.
        context: { finalistIndex: fi, archetypeId: meta.archetypeId, opponentName: meta.name },
      });
      const wr = res.winRate;
      const a = agg[fi];
      const bucket = (a.byArchetype[meta.archetypeId] ??= { archetypeId: meta.archetypeId, name: meta.archetypeName, class: meta.class, winRates: [] });
      bucket.winRates.push(wr);
      a.winRateSum += wr;
      a.cellCount += 1;
      done += 1;
      onProgress?.({ done, total });
      await new Promise((r) => setTimeout(r, 0)); // yield so progress paints / abort lands
    }
  }

  const finalistsOut = agg.map((a) => {
    const perArchetype = Object.values(a.byArchetype).map((bucket) => {
      const winRate = bucket.winRates.reduce((x, y) => x + y, 0) / bucket.winRates.length;
      return { archetypeId: bucket.archetypeId, name: bucket.name, class: bucket.class, winRate, ci: rateCiHalfWidth(winRate, iterations * bucket.winRates.length) };
    });
    const sampleN = iterations * a.cellCount;
    const overallWinRate = a.cellCount > 0 ? a.winRateSum / a.cellCount : 0;
    return { index: a.index, score: a.score, overallWinRate, sampleN, ci: rateCiHalfWidth(overallWinRate, sampleN), perArchetype };
  });

  return {
    budget: B,
    iterations,
    seed: baseSeed,
    variantsPerArchetype,
    finalists: finalistsOut,
    contradiction: analyzeContradiction(finalistsOut),
  };
}
