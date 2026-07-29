/**
 * linkingSimulation.js - the one-time "linking simulation" (goals/linking
 * redesign, docs/Reference/Notes/goals-linking-redesign-notes.md decisions 1, 2, 7).
 *
 * For a character's two linked presets it evaluates BOTH awakening paths
 * neutrally, then locks the path both builds will share by MINIMAX REGRET
 * (optionally tilted by a priority slider), and emits a report: the locked
 * path + why, both goals' scores under both paths, each preset's recommended
 * build, its talent lean, and a per-stat priority report.
 *
 * THE MECHANIC. Awakening is path-only (no in-path point allocation -
 * awakeningData.js): Shadow's per-point stats are pure offense, Radiant's
 * pure survival/PVP, so the two paths genuinely pull the two goals apart.
 * "Best build under path X" = run the full Build Optimizer with awakening
 * LOCKED OFF on a character seeded to path X at full points (the lock is
 * near-permanent, so evaluate at the endgame projection of
 * AWAKENING_TOTAL_POINTS, not the current level). That is 2 presets x 2
 * paths = 4 optimizer searches, each its own worker task (the worker layer
 * runs one search per task), executed sequentially with live per-stage
 * progress and cancellation.
 *
 * REGRET. For each preset, regret(path) = (bestScore - score(path)) /
 * bestScore in that goal's own units, so a preset's better path has regret
 * 0. The priority slider p in [0,100] weights the first linked preset by
 * p/100 and the second by 1 - p/100 (50 = pure minimax regret). The locked
 * path minimises the worst weighted regret; ties break toward the higher
 * summed relative score.
 *
 * THE VERIFICATION STAGE, and why it is not optional. A Monte Carlo goal (a
 * DPS preset runs 'pve-accurate') must never have its two arms compared by
 * `optimize()`'s own `best.score` - see combat-model.md §8 "Why search maxima
 * are not comparable". Each MC preset therefore gets two extra stages that
 * re-simulate the two arms' WINNING candidates at a fixed iteration count
 * under one shared seed, and the regret math runs on those numbers instead.
 * Closed-form goals (tank, pvp-goal) are deterministic, so they skip the
 * verification and use the search scores directly. This is why the stage
 * count is computed rather than fixed at 4.
 *
 * The orchestrator takes an injectable `runTask` (defaults to
 * runOptimizerTask) so it unit-tests with a synchronous fake - no Web Worker
 * needed. The verdict math (computeRegret / pickPath) is exported pure.
 */

import { runOptimizerTask } from './optimizerClient.js';
import { AWAKENING_TOTAL_POINTS } from './awakeningData.js';
import { materializeCandidate } from './optimizer.js';
import { computeStatWeights } from './statWeights.js';
import { talentLean } from './talentLean.js';
import { linkedPresets } from './linkingSetup.js';

export const LINKING_PATHS = ['shadow', 'radiant'];
export const PATH_LABELS = { shadow: 'Shadow Path', radiant: 'Radiant Path' };
/** Deeper than the optimizer's default 5-pass search - this is a one-time, go-deep pass. */
export const LINKING_MAX_PASSES = 8;
/** Stat-priority rows kept per preset in the persisted report. */
export const STAT_PRIORITY_COUNT = 12;
/**
 * Verification fidelity. 6x the search's own 500 iterations, and both arms
 * share VERIFY_SEED so the comparison is paired (common random numbers) -
 * paired is what makes a gap this small readable at all.
 */
export const LINKING_VERIFY_ITERATIONS = 3000;
export const LINKING_VERIFY_DURATION_SECONDS = 60;
export const LINKING_VERIFY_SEED = 0x5eed1;

/** True when this goal's optimizer score is a Monte Carlo estimate rather than a closed form. */
export function goalNeedsVerification(goal) {
  return objectiveSpecForGoal(goal).kind === 'pve-accurate';
}

/** The goal's score unit label, for the report's matrix headers. */
export function goalUnitLabel(goalKind) {
  return goalKind === 'tank' ? 'Tank Score' : goalKind === 'pvp' || goalKind === 'custom' ? 'PVP Score' : 'DPS';
}

/** The optimizer objective spec for a preset goal (dps deep-MC; tank/pvp closed-form). */
export function objectiveSpecForGoal(goal) {
  const kind = goal?.kind;
  if (kind === 'tank') return { kind: 'tank', ehpWeight: goal.ehpWeight ?? 0.5 };
  if (kind === 'pvp' || kind === 'custom') return { kind: 'pvp-goal', weights: { ...(goal.weights ?? {}) } };
  return { kind: 'pve-accurate', iterations: 500, durationSeconds: 60 };
}

/**
 * Per-preset regret table from a per-preset score pair.
 * `scores` = [{ shadow, radiant }, ...]. Returns [{ shadow, radiant, best }]
 * where each path's value is the relative regret (0 = this preset's best path).
 */
export function computeRegret(scores) {
  return scores.map(({ shadow, radiant }) => {
    const best = Math.max(shadow, radiant);
    if (!(best > 0)) return { shadow: 0, radiant: 0, best };
    return { shadow: (best - shadow) / best, radiant: (best - radiant) / best, best };
  });
}

/**
 * Pick the shared awakening path by weighted minimax regret.
 * `scores` = [{ shadow, radiant }, { shadow, radiant }] (the two linked
 * presets); `priority` in [0,100] weights the FIRST preset (50 = balanced).
 * Returns { lockedPath, weightedMax: {shadow,radiant}, regrets, relScore }.
 */
export function pickPath({ scores, priority = 50 }) {
  const regrets = computeRegret(scores);
  const wA = Math.min(1, Math.max(0, (Number(priority) || 0) / 100));
  const weights = scores.map((_, i) => (i === 0 ? wA : i === 1 ? 1 - wA : 0.5));
  const weightedMax = {};
  const relScore = {};
  for (const path of LINKING_PATHS) {
    weightedMax[path] = Math.max(...regrets.map((r, i) => weights[i] * r[path]));
    relScore[path] = regrets.reduce((acc, r, i) => acc + (r.best > 0 ? scores[i][path] / r.best : 0), 0);
  }
  let lockedPath = LINKING_PATHS[0];
  for (const path of LINKING_PATHS.slice(1)) {
    const better = weightedMax[path] < weightedMax[lockedPath] - 1e-12;
    const tie = Math.abs(weightedMax[path] - weightedMax[lockedPath]) <= 1e-12;
    if (better || (tie && relScore[path] > relScore[lockedPath])) lockedPath = path;
  }
  return { lockedPath, weightedMax, regrets, relScore };
}

/**
 * A character clone seeded to `path` at the endgame point projection (awakening
 * otherwise locked off). Always the full AWAKENING_TOTAL_POINTS - the lock is
 * near-permanent, so the comparison has to be made at the level it will be
 * lived with, not the player's current one.
 */
function seedCharacter(character, path) {
  const clone = JSON.parse(JSON.stringify(character));
  clone.awakening = { path, points: AWAKENING_TOTAL_POINTS };
  return clone;
}

/** Plain-language explanation of the verdict for the report header. */
function buildReasoning(pair, verdict, priority) {
  const locked = verdict.lockedPath;
  const other = LINKING_PATHS.find((p) => p !== locked);
  const pct = (r) => `${(r * 100).toFixed(1)}%`;
  const priorityPhrase =
    priority === 50
      ? 'Priority is balanced (50/50)'
      : `Priority favours ${pair[priority > 50 ? 0 : 1].name} (${priority}/${100 - priority})`;
  const parts = pair.map((preset, i) => {
    const r = verdict.regrets[i][locked];
    return r <= 1e-9 ? `${preset.name} is on its best path` : `costs ${preset.name} ${pct(r)}`;
  });
  return (
    `${PATH_LABELS[locked]} is the shared lock: it ${parts.join(' and ')}, ` +
    `a worst weighted regret of ${pct(verdict.weightedMax[locked])} versus ${pct(verdict.weightedMax[other])} ` +
    `for ${PATH_LABELS[other]}. ${priorityPhrase}.`
  );
}

/**
 * Run the four searches and assemble the persisted outcome.
 *
 * @param {{ character, linked?, priority?, runTask?, onStage?, signal? }} opts
 *   `linked` defaults to the character's linked presets (first two used).
 *   `runTask(request, { onProgress })` defaults to runOptimizerTask; inject a
 *   fake in tests. `onStage({ stage, total, presetName, path, progress })`
 *   streams live progress. `signal` (AbortSignal) cancels the in-flight run.
 * @returns the outcome object, or `{ aborted: true }` if cancelled.
 */
export async function runLinkingSimulation({
  character,
  linked,
  priority = 50,
  runTask = runOptimizerTask,
  onStage,
  signal,
} = {}) {
  const pair = (linked ?? linkedPresets(character)).slice(0, 2);
  if (pair.length < 2) throw new Error('Linking simulation needs two linked presets');

  // Search stages first, then one verification stage per (MC preset, path).
  const stages = [];
  pair.forEach((preset, presetIndex) => {
    for (const path of LINKING_PATHS) stages.push({ kind: 'search', preset, presetIndex, path });
  });
  pair.forEach((preset, presetIndex) => {
    if (!goalNeedsVerification(preset.goal)) return;
    for (const path of LINKING_PATHS) stages.push({ kind: 'verify', preset, presetIndex, path });
  });

  const results = pair.map(() => ({}));
  const verified = pair.map(() => ({}));
  for (let s = 0; s < stages.length; s++) {
    if (signal?.aborted) return { aborted: true };
    const { kind, preset, presetIndex, path } = stages[s];
    const seededCharacter = seedCharacter(character, path);
    const request =
      kind === 'verify'
        ? {
            mode: 'verify-candidate',
            character: seededCharacter,
            preset,
            candidate: results[presetIndex][path].best.candidate,
            iterations: LINKING_VERIFY_ITERATIONS,
            durationSeconds: LINKING_VERIFY_DURATION_SECONDS,
            seed: LINKING_VERIFY_SEED,
          }
        : {
            mode: 'optimize',
            character: seededCharacter,
            preset,
            searchDimensions: { awakening: false },
            objectiveSpec: objectiveSpecForGoal(preset.goal),
            maxPasses: LINKING_MAX_PASSES,
          };
    const task = runTask(request, {
      onProgress: (progress) =>
        onStage?.({ stage: s, total: stages.length, kind, presetName: preset.name, path, progress }),
    });
    const onAbort = () => task.cancel?.();
    signal?.addEventListener?.('abort', onAbort);
    let result;
    try {
      result = await task.promise;
    } finally {
      signal?.removeEventListener?.('abort', onAbort);
    }
    if (result?.aborted) return { aborted: true };
    if (kind === 'verify') {
      verified[presetIndex][path] = result;
      continue;
    }
    // Fail here, with a name, rather than three lines later on a TypeError -
    // by this point four searches have run and the work is expensive to lose.
    if (!(Number.isFinite(result?.best?.score) && result.best.candidate)) {
      throw new Error(`Linking simulation: ${preset.name} / ${path} returned no usable result`);
    }
    results[presetIndex][path] = result;
  }

  // Verified means where we have them, raw search scores for the deterministic
  // goals that do not need them.
  const scores = pair.map((preset, i) =>
    Object.fromEntries(
      LINKING_PATHS.map((path) => [
        path,
        verified[i][path] ? verified[i][path].totalDamage.mean : results[i][path].best.score,
      ])
    )
  );
  const verdict = pickPath({ scores, priority });
  const lockedPath = verdict.lockedPath;

  const presetsOut = pair.map((preset, i) => {
    const res = results[i][lockedPath];
    const candidate = res.best.candidate;
    const goalKind = preset.goal?.kind ?? null;
    const { candidateCharacter, candidatePreset } = materializeCandidate(seedCharacter(character, lockedPath), candidate);
    const statPriorities = computeStatWeights(candidateCharacter, candidatePreset, {
      goalKind,
      ehpWeight: preset.goal?.ehpWeight,
      weights: preset.goal?.weights,
    })
      .slice(0, STAT_PRIORITY_COUNT)
      .map((w) => ({ key: w.key, label: w.label, unit: w.unit, delta: w.delta, deltaPct: w.deltaPct }));
    return {
      presetId: preset.id,
      presetName: preset.name,
      goalKind,
      goalUnit: goalUnitLabel(goalKind),
      scores: scores[i],
      // How `scores` was produced, so the report can say so rather than
      // implying two numbers are comparable when it hasn't been established.
      scoreBasis: verified[i][lockedPath] ? 'verified' : 'closed-form',
      recommended: {
        candidate,
        changes: res.changes,
        improvementPct: res.improvementPct,
        talentLean: talentLean({ spec: candidate.talentSpec, allocation: candidate.talentAllocation }),
        statPriorities,
      },
    };
  });

  return {
    completedAt: new Date().toISOString(),
    priority,
    lockedPath,
    reasoning: buildReasoning(pair, verdict, priority),
    regret: verdict.weightedMax,
    presets: presetsOut,
  };
}
