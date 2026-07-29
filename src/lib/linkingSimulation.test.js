import { it, expect } from 'vitest';
import {
  objectiveSpecForGoal,
  goalUnitLabel,
  computeRegret,
  pickPath,
  runLinkingSimulation,
  LINKING_MAX_PASSES,
  LINKING_VERIFY_ITERATIONS,
} from './linkingSimulation.js';
import { newCharacter } from './model.js';
import { candidateFromCurrent } from './optimizer.js';

// --- objective spec + unit labels ---

it('objectiveSpecForGoal maps each goal to its optimizer spec', () => {
  expect(objectiveSpecForGoal({ kind: 'dps' })).toEqual({ kind: 'pve-accurate', iterations: 500, durationSeconds: 60 });
  expect(objectiveSpecForGoal({ kind: 'tank', ehpWeight: 0.75 })).toEqual({ kind: 'tank', ehpWeight: 0.75 });
  expect(objectiveSpecForGoal({ kind: 'pvp', weights: { damage: 50, mitigation: 25, survivability: 25 } })).toEqual({
    kind: 'pvp-goal',
    weights: { damage: 50, mitigation: 25, survivability: 25 },
  });
  expect(objectiveSpecForGoal({ kind: 'custom', weights: { damage: 10, mitigation: 80, survivability: 10 } }).kind).toBe('pvp-goal');
  expect(objectiveSpecForGoal(null).kind).toBe('pve-accurate'); // unassigned falls back to DPS
});

it('goalUnitLabel names each goal score unit', () => {
  expect(goalUnitLabel('dps')).toBe('DPS');
  expect(goalUnitLabel('tank')).toBe('Tank Score');
  expect(goalUnitLabel('pvp')).toBe('PVP Score');
  expect(goalUnitLabel('custom')).toBe('PVP Score');
});

// --- regret + verdict math ---

it('computeRegret: a preset best path has regret 0; the other is the relative shortfall', () => {
  const [r] = computeRegret([{ shadow: 1000, radiant: 700 }]);
  expect(r.best).toBe(1000);
  expect(r.shadow).toBeCloseTo(0);
  expect(r.radiant).toBeCloseTo(0.3);
});

it('computeRegret guards a non-positive best (all-zero scores)', () => {
  expect(computeRegret([{ shadow: 0, radiant: 0 }])[0]).toEqual({ shadow: 0, radiant: 0, best: 0 });
});

it('pickPath: balanced priority picks the lower worst-regret path; the slider can flip it', () => {
  // Preset A (DPS) prefers shadow; Preset B (PVP) prefers radiant.
  const scores = [
    { shadow: 1000, radiant: 700 }, // A regret: shadow 0, radiant 0.30
    { shadow: 500, radiant: 900 }, // B regret: shadow 0.444, radiant 0
  ];
  // 50/50: weightedMax shadow = 0.5*0.444 = 0.222, radiant = 0.5*0.30 = 0.15 -> radiant.
  expect(pickPath({ scores, priority: 50 }).lockedPath).toBe('radiant');
  // Favour A entirely (priority 100): only A's regret counts -> A's best path, shadow.
  expect(pickPath({ scores, priority: 100 }).lockedPath).toBe('shadow');
  // Favour B entirely (priority 0): B's best path, radiant.
  expect(pickPath({ scores, priority: 0 }).lockedPath).toBe('radiant');
});

it('pickPath: a perfectly symmetric conflict at 50/50 resolves deterministically to shadow', () => {
  const scores = [
    { shadow: 100, radiant: 80 }, // prefers shadow, regret gap 0.2
    { shadow: 80, radiant: 100 }, // prefers radiant, regret gap 0.2
  ];
  const v = pickPath({ scores, priority: 50 });
  expect(v.weightedMax.shadow).toBeCloseTo(v.weightedMax.radiant); // exact tie
  expect(v.lockedPath).toBe('shadow'); // first path wins the tie
});

// --- orchestrator (injected fake runTask) ---

function linkedCharacter() {
  const c = newCharacter('Linker');
  c.class = 'Sentinel';
  c.loadouts[0].gear.Weapon.attack = 1000;
  c.awakening = { path: 'shadow', points: 5 };
  c.presets[0].goal = { ...c.presets[0].goal, kind: 'dps', linked: true };
  c.presets[1].goal = { ...c.presets[1].goal, kind: 'pvp', linked: true, weights: { damage: 40, mitigation: 30, survivability: 30 } };
  return c;
}

/**
 * A fake runTask covering both modes: 'optimize' scores by (objective kind,
 * seeded path); 'verify-candidate' returns a runSimulation-shaped mean by path.
 * `verifyMap` deliberately defaults to DISAGREEING with the search maxima, so a
 * test that reads the search scores instead of the verified ones fails loudly.
 */
function fakeRunner(scoreMap, calls, verifyMap = VERIFY_MAP) {
  return (request, { onProgress } = {}) => {
    calls?.push(request);
    onProgress?.({ phase: 'fake', evals: 1, bestScore: 1 });
    const path = request.character.awakening.path;
    if (request.mode === 'verify-candidate') {
      return {
        promise: Promise.resolve({ totalDamage: { mean: verifyMap[path] }, iterations: request.iterations, seed: request.seed }),
        cancel: () => {},
      };
    }
    const score = scoreMap[request.objectiveSpec.kind][path];
    const candidate = candidateFromCurrent(request.character, request.preset);
    return {
      promise: Promise.resolve({
        best: { score, candidate, totals: {} },
        baseline: { score: 0, totals: {} },
        changes: [{ dimension: 'loadout', from: 'Loadout 1', to: 'Loadout 2' }],
        improvementPct: 12,
        aborted: false,
      }),
      cancel: () => {},
    };
  };
}

const SCORE_MAP = {
  'pve-accurate': { shadow: 1000, radiant: 700 }, // DPS preset's SEARCH MAXIMA prefer shadow
  'pvp-goal': { shadow: 500, radiant: 900 }, // PVP preset prefers radiant (closed form, exact)
};
/** Verified head-to-head means: shadow's search max was inflated; radiant actually wins. */
const VERIFY_MAP = { shadow: 700, radiant: 1000 };

it('runs 4 searches (2 presets x 2 paths) with awakening locked off at full points and per-goal specs', async () => {
  const character = linkedCharacter();
  const calls = [];
  await runLinkingSimulation({ character, priority: 50, runTask: fakeRunner(SCORE_MAP, calls) });

  const searches = calls.filter((r) => r.mode === 'optimize');
  expect(searches.length).toBe(4);
  for (const req of searches) {
    expect(req.searchDimensions.awakening).toBe(false);
    expect(req.character.awakening.points).toBe(15); // AWAKENING_TOTAL_POINTS, not the player's 5
    expect(req.maxPasses).toBe(LINKING_MAX_PASSES);
  }
  const combos = searches.map((r) => `${r.objectiveSpec.kind}:${r.character.awakening.path}`).sort();
  expect(combos).toEqual(['pve-accurate:radiant', 'pve-accurate:shadow', 'pvp-goal:radiant', 'pvp-goal:shadow']);
});

// --- Monte Carlo arms are compared on verified scores, never search maxima ---

it('verifies both arms of a Monte Carlo goal at fixed iterations under ONE shared seed', async () => {
  const character = linkedCharacter();
  const calls = [];
  await runLinkingSimulation({ character, priority: 50, runTask: fakeRunner(SCORE_MAP, calls) });

  const verifies = calls.filter((r) => r.mode === 'verify-candidate');
  // Only the DPS preset needs it - the PVP goal's closed form is deterministic.
  expect(verifies.length).toBe(2);
  expect(verifies.map((r) => r.character.awakening.path).sort()).toEqual(['radiant', 'shadow']);
  expect(new Set(verifies.map((r) => r.seed)).size).toBe(1); // common random numbers
  expect(new Set(verifies.map((r) => r.iterations)).size).toBe(1);
  expect(verifies[0].iterations).toBe(LINKING_VERIFY_ITERATIONS);
  expect(verifies[0].iterations).toBeGreaterThan(objectiveSpecForGoal({ kind: 'dps' }).iterations);
  for (const r of verifies) expect(r.candidate).toBeTruthy();
  // Verification runs AFTER every search, so a winner exists to re-score.
  expect(calls.findIndex((r) => r.mode === 'verify-candidate')).toBe(4);
});

it('the verdict follows the verified scores, not the biased search maxima', async () => {
  const character = linkedCharacter();
  // Search maxima say the DPS preset prefers shadow; verification says radiant.
  const outcome = await runLinkingSimulation({ character, priority: 100, runTask: fakeRunner(SCORE_MAP) });
  const dps = outcome.presets[0];
  expect(dps.scores).toEqual(VERIFY_MAP);
  expect(dps.scoreBasis).toBe('verified');
  // Priority 100 counts only the DPS preset, so the lock follows its verified winner.
  expect(outcome.lockedPath).toBe('radiant');
});

it('a deterministic goal keeps its exact closed-form scores and is not re-simulated', async () => {
  const character = linkedCharacter();
  const outcome = await runLinkingSimulation({ character, priority: 0, runTask: fakeRunner(SCORE_MAP) });
  const pvp = outcome.presets[1];
  expect(pvp.scores).toEqual(SCORE_MAP['pvp-goal']);
  expect(pvp.scoreBasis).toBe('closed-form');
});

it('fails by name if a search returns no usable result, rather than on a TypeError later', async () => {
  const character = linkedCharacter();
  const runTask = (request) => ({
    promise: Promise.resolve(
      request.character.awakening.path === 'radiant'
        ? { changes: [], improvementPct: 0, aborted: false } // no `best`
        : {
            best: { score: 1, candidate: candidateFromCurrent(request.character, request.preset), totals: {} },
            baseline: { score: 0, totals: {} },
            changes: [],
            improvementPct: 0,
            aborted: false,
          }
    ),
    cancel: () => {},
  });
  await expect(runLinkingSimulation({ character, runTask })).rejects.toThrow(/radiant.*no usable result/i);
});

it('assembles the report: verdict, 2x2 scores, per-preset recommended build under the locked path', async () => {
  const character = linkedCharacter();
  const outcome = await runLinkingSimulation({ character, priority: 50, runTask: fakeRunner(SCORE_MAP) });

  expect(outcome.lockedPath).toBe('radiant'); // both presets' verified/exact scores agree
  expect(typeof outcome.completedAt).toBe('string');
  expect(typeof outcome.reasoning).toBe('string');
  expect(outcome.regret).toHaveProperty('shadow');
  expect(outcome.regret).toHaveProperty('radiant');

  expect(outcome.presets).toHaveLength(2);
  const [a, b] = outcome.presets;
  expect(a.goalUnit).toBe('DPS');
  expect(a.scores).toEqual(VERIFY_MAP); // MC goal: the verified pair, not the search maxima
  expect(b.goalUnit).toBe('PVP Score');
  expect(b.scores).toEqual({ shadow: 500, radiant: 900 });
  // Recommended data comes from the LOCKED-path run and is JSON-plain.
  expect(a.recommended.candidate).toBeTruthy();
  expect(Array.isArray(a.recommended.changes)).toBe(true);
  expect(a.recommended.talentLean).toHaveProperty('label');
  expect(a.recommended.statPriorities.length).toBeGreaterThan(0);
  expect(a.recommended.statPriorities.length).toBeLessThanOrEqual(12);
  // The PVP preset's priority report reaches into defensive stats.
  expect(b.recommended.statPriorities.length).toBeLessThanOrEqual(12);
});

it('the priority slider flips the locked path and the recommended builds follow it', async () => {
  const character = linkedCharacter();
  // Verification agreeing with the search maxima isolates the slider's effect:
  // the DPS preset prefers shadow, the PVP preset radiant.
  const agreeing = { shadow: 1000, radiant: 700 };
  const balanced = await runLinkingSimulation({ character, priority: 50, runTask: fakeRunner(SCORE_MAP, null, agreeing) });
  expect(balanced.lockedPath).toBe('radiant');
  const favourDps = await runLinkingSimulation({ character, priority: 100, runTask: fakeRunner(SCORE_MAP, null, agreeing) });
  expect(favourDps.lockedPath).toBe('shadow'); // priority 100 favours the DPS preset
});

it('a cancelled run returns { aborted: true } and no outcome', async () => {
  const character = linkedCharacter();
  let n = 0;
  const runTask = (request) => {
    n += 1;
    // The third of four stages reports itself aborted (as a real cancel does).
    const aborted = n === 3;
    return {
      promise: Promise.resolve(
        aborted
          ? { aborted: true }
          : {
              best: { score: 1, candidate: candidateFromCurrent(request.character, request.preset), totals: {} },
              baseline: { score: 0, totals: {} },
              changes: [],
              improvementPct: 0,
              aborted: false,
            }
      ),
      cancel: () => {},
    };
  };
  const outcome = await runLinkingSimulation({ character, runTask });
  expect(outcome).toEqual({ aborted: true });
  expect(n).toBe(3); // stopped at the aborted stage, did not run the 4th
});

it('throws when there are not two linked presets', async () => {
  const character = linkedCharacter();
  character.presets[1].goal.linked = false;
  await expect(runLinkingSimulation({ character, runTask: fakeRunner(SCORE_MAP) })).rejects.toThrow(/two linked presets/i);
});
