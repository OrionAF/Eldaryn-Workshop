import { it, expect } from 'vitest';
import { runGauntlet, analyzeContradiction, buildBudget, DEFAULT_GAUNTLET_ITERATIONS } from './pvpGauntlet.js';
import { ARCHETYPES_BY_CLASS } from './pvpArchetypes.js';
import { newCharacter } from './model.js';
import { candidateFromCurrent } from './optimizer.js';
import { resolveEffectiveTotals } from './totals.js';

const TOTAL_ARCHETYPES = ARCHETYPES_BY_CLASS.Warrior.length + ARCHETYPES_BY_CLASS.Sentinel.length;

function pvpCharacter() {
  const c = newCharacter('Gauntlet Tester');
  c.class = 'Sentinel';
  c.loadouts[0].gear.Weapon.attack = 5000;
  c.loadouts[0].gear.Chest.health = 40000;
  c.presets[0].goal = { ...c.presets[0].goal, kind: 'pvp', weights: { damage: 40, mitigation: 30, survivability: 30 } };
  return c;
}

function twoFinalists(character) {
  const candidate = candidateFromCurrent(character, character.presets[0]);
  // finalist 0 scores higher (closed-form winner); finalist 1 is the runner-up.
  return [
    { score: 100, candidate },
    { score: 90, candidate },
  ];
}

// --- buildBudget ---

it('buildBudget is the effective Attack + Health of the build', () => {
  const c = pvpCharacter();
  const t = resolveEffectiveTotals(c, c.presets[0]);
  expect(buildBudget(c, c.presets[0])).toBeCloseTo(t.attack + t.health);
  expect(buildBudget(c, c.presets[0])).toBeGreaterThan(0);
});

// --- analyzeContradiction (pure) ---

it('analyzeContradiction: no flag with <2 finalists or when the closed-form top also duels best', () => {
  expect(analyzeContradiction([{ index: 0, score: 1, overallWinRate: 50, ci: 1 }]).flagged).toBe(false);
  const agree = analyzeContradiction([
    { index: 0, score: 100, overallWinRate: 70, ci: 2 },
    { index: 1, score: 90, overallWinRate: 55, ci: 2 },
  ]);
  expect(agree.flagged).toBe(false);
  expect(agree.closedFormRankInDuel).toBe(1);
});

it('analyzeContradiction flags only when the duel leader beats the closed-form leader beyond combined CI', () => {
  const clear = analyzeContradiction([
    { index: 0, score: 100, overallWinRate: 45, ci: 2 }, // closed-form #1
    { index: 1, score: 90, overallWinRate: 72, ci: 2 }, // duels far better
  ]);
  expect(clear.flagged).toBe(true);
  expect(clear.closedFormTopIndex).toBe(0);
  expect(clear.duelTopIndex).toBe(1);
  expect(clear.closedFormRankInDuel).toBe(2);
  expect(clear.message).toMatch(/out-duels/);

  const noisy = analyzeContradiction([
    { index: 0, score: 100, overallWinRate: 50, ci: 6 }, // gap 3 < combined CI 12
    { index: 1, score: 90, overallWinRate: 53, ci: 6 },
  ]);
  expect(noisy.flagged).toBe(false); // within noise
});

// --- runGauntlet (injected fake runDuel) ---

it('duels every finalist against every archetype variant, aggregates per archetype + overall', async () => {
  const character = pvpCharacter();
  const finalists = twoFinalists(character);
  let progressCalls = 0;
  const runDuel = ({ context }) => {
    // constant win-rate per finalist: finalist 1 out-duels finalist 0 (contradiction).
    expect(context).toBeDefined();
    return { winRate: context.finalistIndex === 0 ? 40 : 70, player: { hpRemainingPct: { mean: 0 } }, opponent: { hpRemainingPct: { mean: 0 } } };
  };
  const report = await runGauntlet({
    character,
    preset: character.presets[0],
    finalists,
    budget: 60000,
    seed: 5,
    iterations: 100,
    variantsPerArchetype: 1,
    runDuel,
    onProgress: () => (progressCalls += 1),
  });

  expect(report.budget).toBe(60000);
  expect(report.finalists.length).toBe(2);
  expect(progressCalls).toBe(2 * TOTAL_ARCHETYPES); // one cell per finalist × archetype (1 variant)

  const [f0, f1] = report.finalists;
  expect(f0.perArchetype.length).toBe(TOTAL_ARCHETYPES);
  expect(f0.overallWinRate).toBeCloseTo(40);
  expect(f1.overallWinRate).toBeCloseTo(70);
  expect(f0.perArchetype.every((a) => Math.abs(a.winRate - 40) < 1e-9)).toBe(true);
  expect(f0.sampleN).toBe(100 * TOTAL_ARCHETYPES);

  // finalist 1 (runner-up by score) out-duels finalist 0 (closed-form top).
  expect(report.contradiction.flagged).toBe(true);
  expect(report.contradiction.duelTopIndex).toBe(1);
});

it('averages jittered variants into one per-archetype win-rate', async () => {
  const character = pvpCharacter();
  const finalists = [twoFinalists(character)[0]];
  let call = 0;
  // Alternate 30/50 across the two variants of each archetype -> mean 40.
  const runDuel = () => ({ winRate: call++ % 2 === 0 ? 30 : 50, player: { hpRemainingPct: { mean: 0 } }, opponent: { hpRemainingPct: { mean: 0 } } });
  const report = await runGauntlet({
    character,
    preset: character.presets[0],
    finalists,
    budget: 60000,
    iterations: 100,
    variantsPerArchetype: 2,
    runDuel,
  });
  expect(report.finalists[0].perArchetype.every((a) => Math.abs(a.winRate - 40) < 1e-9)).toBe(true);
});

it('a cancelled signal returns { aborted: true } without finishing', async () => {
  const character = pvpCharacter();
  const controller = new AbortController();
  controller.abort();
  const report = await runGauntlet({
    character,
    preset: character.presets[0],
    finalists: twoFinalists(character),
    budget: 60000,
    runDuel: () => ({ winRate: 50 }),
    signal: controller.signal,
  });
  expect(report).toEqual({ aborted: true });
});

it('exposes sensible defaults', () => {
  expect(DEFAULT_GAUNTLET_ITERATIONS).toBeGreaterThan(0);
});
