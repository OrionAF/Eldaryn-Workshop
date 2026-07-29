/**
 * pvpOptimizer.js - PVP objective for the build optimizer.
 *
 * The coordinate-ascent search in optimizer.js is objective-agnostic:
 * `optimize({ objective })` scores each candidate build with any
 * `(candidateCharacter, candidatePreset) -> number`. This module supplies the
 * PVP objective: play `iterations` Monte Carlo duels (pvpSimulation.js)
 * against a FIXED opponent profile and score the build by win chance.
 *
 * SCORE = winRate + hpMargin / 1e6. Win rate alone is coarse (steps of
 * 100/iterations) and saturates: at 0% or 100% every candidate ties and the
 * search has no gradient. The mean end-of-fight HP differential (player% -
 * opponent%, range ±100) breaks those ties; divided by 1e6 it spans ±1e-4,
 * far below one win-rate step (~0.67 at 150 iterations) and far above
 * optimize()'s EPS (1e-9), so it can NEVER outvote a real win-rate change.
 *
 * COMMON RANDOM NUMBERS: every candidate is scored with the same fixed seed,
 * so all builds face the identical RNG stream and comparisons are paired -
 * the same trick as optimizer.js's createMonteCarloObjective. That's what
 * makes ~150 iterations per eval fair enough to rank candidates.
 *
 * TWO-STAGE USE: even paired, a low-iteration score can overfit its one RNG
 * stream over thousands of comparisons - mid-search the ascent can adopt a
 * build that merely got lucky on that seed. Callers should pass TWO
 * instances to optimize(): a cheap one as `screenObjective` (low iterations,
 * seed A) to rank candidates, and a heavier one as `objective` (more
 * iterations, seed B) that only runs when a candidate beats the incumbent's
 * screen score and gates the actual adoption. Different seeds keep the
 * confirmation independent of the screen's luck.
 *
 * Candidates are scored on CALCULATED totals: materializeCandidate() emits a
 * preset without `manualTotals`, so resolveEffectiveTotals always takes the
 * computePresetTotals path during the search (a manual-totals preset only
 * differs at the baseline; the UI warns about that, mirroring the PVE
 * optimizer).
 */

import { resolveEffectiveTotals } from './totals.js';
import { buildPvpSide, runPvpSimulation, PVP_HEALTH_MULTIPLIER } from './pvpSimulation.js';
import { activeSpecialGlyphIds } from './sigilEffects.js';
import { materializeCandidate } from './optimizer.js';

/** Opponent profile ({ name, class, stats, sigilIds, sigilValues }) -> side. */
function opponentToSide(opponent) {
  return buildPvpSide({
    name: opponent.name,
    stats: opponent.stats,
    characterClass: opponent.class,
    sigilIds: opponent.sigilIds,
    sigilValues: opponent.sigilValues,
    specialGlyphIds: opponent.specialGlyphIds || [],
  });
}

function playerToSide(character, preset) {
  return buildPvpSide({
    name: character.name,
    stats: resolveEffectiveTotals(character, preset),
    characterClass: character.class,
    sigilIds: preset.sigilIds,
    sigilValues: character.sigilValues,
    specialGlyphIds: activeSpecialGlyphIds(character, preset),
  });
}

/** winRate first, mean HP differential as a tie-breaker (see header). */
export function pvpScore(result) {
  return result.winRate + (result.player.hpRemainingPct.mean - result.opponent.hpRemainingPct.mean) / 1e6;
}

/**
 * Objective factory for optimize(): duels every candidate against `opponent`
 * under common random numbers and returns the composite win score.
 */
export function createPvpWinObjective({
  opponent,
  durationSeconds = 60,
  healthMultiplier = PVP_HEALTH_MULTIPLIER,
  iterations = 150,
  seed = 1,
} = {}) {
  const opponentSide = opponentToSide(opponent); // fixed for the whole search
  return (candidateCharacter, candidatePreset) =>
    pvpScore(
      runPvpSimulation({
        player: playerToSide(candidateCharacter, candidatePreset),
        opponent: opponentSide,
        durationSeconds,
        healthMultiplier,
        iterations,
        seed,
      })
    );
}

/**
 * Multi-opponent objective: duels the candidate against EVERY profile in
 * `opponents` (each under its own common-random-numbers stream) and
 * aggregates the composite scores - 'mean' optimizes the ladder average,
 * 'min' the worst matchup. With one opponent this reduces exactly to
 * createPvpWinObjective.
 */
export function createMultiPvpWinObjective({
  opponents,
  aggregate = 'mean',
  durationSeconds = 60,
  healthMultiplier = PVP_HEALTH_MULTIPLIER,
  iterations = 150,
  seed = 1,
} = {}) {
  const objectives = opponents.map((opponent) =>
    createPvpWinObjective({ opponent, durationSeconds, healthMultiplier, iterations, seed })
  );
  return (candidateCharacter, candidatePreset) => {
    const scores = objectives.map((o) => o(candidateCharacter, candidatePreset));
    return aggregate === 'min'
      ? Math.min(...scores)
      : scores.reduce((a, b) => a + b, 0) / scores.length;
  };
}

/**
 * High-iteration verification pass for the UI: re-duels the CURRENT build
 * (via resolveEffectiveTotals, so a manual-totals preset is verified on the
 * numbers the Run Duel button uses) and the RECOMMENDED candidate with a
 * fresh shared seed, at full simulation fidelity. Returns both
 * runPvpSimulation results so the panel can show "win chance X% -> Y%".
 */
export function verifyPvpWinRates({
  character,
  preset,
  candidate,
  opponent,
  durationSeconds = 60,
  healthMultiplier = PVP_HEALTH_MULTIPLIER,
  iterations = 1000,
  seed,
} = {}) {
  const sharedSeed = (seed ?? Math.floor(Math.random() * 4294967296)) >>> 0;
  const opponentSide = opponentToSide(opponent);
  const duel = (char, pre) =>
    runPvpSimulation({
      player: playerToSide(char, pre),
      opponent: opponentSide,
      durationSeconds,
      healthMultiplier,
      iterations,
      seed: sharedSeed,
    });
  const { candidateCharacter, candidatePreset } = materializeCandidate(character, candidate);
  return { before: duel(character, preset), after: duel(candidateCharacter, candidatePreset) };
}

/**
 * Every preset × every opponent, one duel batch per cell — the matchup
 * matrix. Uses the same effective-totals path as the Run Duel button (manual
 * totals included), and one shared seed so cells are comparable. Runs on the
 * main thread but yields between cells, so progress paints and `signal` can
 * cancel; a cancelled matrix returns the finished cells with `aborted: true`.
 * Opponents with no class get `null` cells.
 */
export async function runPvpMatrix({
  character,
  presets,
  opponents,
  durationSeconds = 60,
  healthMultiplier = PVP_HEALTH_MULTIPLIER,
  iterations = 1000,
  seed,
  onProgress,
  signal,
} = {}) {
  const baseSeed = (seed ?? Math.floor(Math.random() * 4294967296)) >>> 0;
  const rows = [];
  const total = presets.length * opponents.length;
  let done = 0;
  let aborted = false;

  outer: for (const preset of presets) {
    const playerSide = playerToSide(character, preset);
    const row = { presetId: preset.id, presetName: preset.name, cells: [] };
    rows.push(row);
    for (const opponent of opponents) {
      if (signal?.aborted) {
        aborted = true;
        break outer;
      }
      if (!opponent.class) {
        row.cells.push(null);
        done += 1;
        continue;
      }
      const result = runPvpSimulation({
        player: playerSide,
        opponent: opponentToSide(opponent),
        durationSeconds,
        healthMultiplier,
        iterations,
        seed: baseSeed,
      });
      row.cells.push({
        opponentId: opponent.id,
        winRate: result.winRate,
        lossRate: result.lossRate,
        drawRate: result.drawRate,
      });
      done += 1;
      onProgress?.({ done, total });
      // Yield so the UI paints and an abort can arrive mid-matrix.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return { seed: baseSeed, iterations, durationSeconds, healthMultiplier, rows, aborted };
}
