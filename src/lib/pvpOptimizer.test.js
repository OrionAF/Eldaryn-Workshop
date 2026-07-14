import { describe, it, expect } from 'vitest';
import { createPvpWinObjective, createMultiPvpWinObjective, verifyPvpWinRates, pvpScore, runPvpMatrix } from './pvpOptimizer.js';
import { runPvpSimulation, buildPvpSide } from './pvpSimulation.js';
import { candidateFromCurrent } from './optimizer.js';
import { newCharacter, newPreset, emptyStats } from './model.js';

/** Full stat record with sane duel defaults; overrides on top. */
function stats(overrides = {}) {
  return {
    ...emptyStats(),
    attack: 1000,
    health: 50000,
    speed: 200,
    crit_mult: 150,
    ...overrides,
  };
}

/**
 * Character + manual-totals preset pair: resolveEffectiveTotals returns
 * `manualStats` verbatim (capped), so the objective's inputs are exact.
 */
function manualBuild(statOverrides = {}) {
  const character = newCharacter('Tester');
  character.class = 'Warrior';
  const preset = newPreset('Manual', { manualTotals: true });
  preset.manualStats = stats(statOverrides);
  character.presets = [preset];
  return { character, preset };
}

const opponent = {
  name: 'Rival',
  class: 'Sentinel',
  stats: stats({ attack: 900, health: 45000 }),
  sigilIds: [],
  sigilValues: {},
};

describe('createPvpWinObjective', () => {
  it('is deterministic for a fixed seed', () => {
    const objective = createPvpWinObjective({ opponent, iterations: 50, seed: 7 });
    const { character, preset } = manualBuild();
    expect(objective(character, preset)).toBe(objective(character, preset));
  });

  it('never scores a strictly stronger build lower (common random numbers)', () => {
    const objective = createPvpWinObjective({ opponent, iterations: 100, seed: 3 });
    const weak = manualBuild({ attack: 800 });
    const strong = manualBuild({ attack: 1600 });
    expect(objective(strong.character, strong.preset)).toBeGreaterThanOrEqual(
      objective(weak.character, weak.preset)
    );
  });

  it('breaks 100%-win-rate ties by remaining-HP margin', () => {
    // A pushover opponent: both builds win every duel, so pure win rate ties.
    const pushover = { ...opponent, stats: stats({ attack: 100, health: 2000 }) };
    const objective = createPvpWinObjective({ opponent: pushover, iterations: 60, seed: 11 });
    const lean = manualBuild({ health: 30000 });
    const tanky = manualBuild({ health: 300000 });
    const leanScore = objective(lean.character, lean.preset);
    const tankyScore = objective(tanky.character, tanky.preset);
    // Same absolute damage taken is a smaller fraction of the bigger pool.
    expect(Math.floor(leanScore)).toBe(100); // both saturate the win rate
    expect(Math.floor(tankyScore)).toBe(100);
    expect(tankyScore).toBeGreaterThan(leanScore);
  });
});

describe('pvpScore', () => {
  it('keeps the HP-margin term below any possible win-rate step', () => {
    const base = { winRate: 50, player: { hpRemainingPct: { mean: 100 } }, opponent: { hpRemainingPct: { mean: 0 } } };
    const worstMargin = { winRate: 50, player: { hpRemainingPct: { mean: 0 } }, opponent: { hpRemainingPct: { mean: 100 } } };
    // Full ±100 margin swing is smaller than one win at 10,000 iterations (0.01%).
    expect(pvpScore(base) - pvpScore(worstMargin)).toBeLessThan(0.01);
    expect(pvpScore(base)).toBeGreaterThan(pvpScore(worstMargin));
  });
});

describe('verifyPvpWinRates', () => {
  it('duels both builds on one shared seed and matches a direct simulation', () => {
    const { character, preset } = manualBuild();
    const candidate = candidateFromCurrent(character, preset);
    const { before, after } = verifyPvpWinRates({
      character,
      preset,
      candidate,
      opponent,
      iterations: 80,
      seed: 42,
    });
    expect(before.seed).toBe(42);
    expect(after.seed).toBe(42);
    const direct = runPvpSimulation({
      player: buildPvpSide({
        name: character.name,
        stats: preset.manualStats,
        characterClass: character.class,
        sigilIds: preset.sigilIds,
        sigilValues: character.sigilValues,
      }),
      opponent: buildPvpSide({
        name: opponent.name,
        stats: opponent.stats,
        characterClass: opponent.class,
        sigilIds: opponent.sigilIds,
        sigilValues: opponent.sigilValues,
      }),
      iterations: 80,
      seed: 42,
    });
    expect(before.winRate).toBe(direct.winRate);
  });
});

describe('runPvpMatrix', () => {
  const twoPresetCharacter = () => {
    const { character } = manualBuild();
    const second = newPreset('Second', { manualTotals: true });
    second.manualStats = stats({ attack: 2000 });
    character.presets = [...character.presets, second];
    return character;
  };

  it('fights every preset x opponent cell; classless opponents get null cells', async () => {
    const character = twoPresetCharacter();
    const opponents = [opponent, { ...opponent, name: 'No class', class: null }];
    const progress = [];
    const result = await runPvpMatrix({
      character,
      presets: character.presets,
      opponents,
      iterations: 30,
      seed: 5,
      onProgress: (p) => progress.push(p),
    });
    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.cells).toHaveLength(2);
      expect(row.cells[0].winRate).toBeGreaterThanOrEqual(0);
      expect(row.cells[1]).toBeNull();
    }
    expect(result.aborted).toBe(false);
    expect(progress.at(-1).total).toBe(4);
    // Shared seed: matrix cell matches a standalone objective-style duel batch.
    expect(result.seed).toBe(5);
  });

  it('a pre-aborted signal stops immediately with aborted: true', async () => {
    const character = twoPresetCharacter();
    const controller = new AbortController();
    controller.abort();
    const result = await runPvpMatrix({
      character,
      presets: character.presets,
      opponents: [opponent],
      iterations: 30,
      seed: 5,
      signal: controller.signal,
    });
    expect(result.aborted).toBe(true);
    expect(result.rows[0].cells).toHaveLength(0);
  });
});

describe('createMultiPvpWinObjective', () => {
  const easy = { ...opponent, name: 'Easy', stats: stats({ attack: 300, health: 20000 }) };
  const hard = { ...opponent, name: 'Hard', stats: stats({ attack: 1500, health: 90000 }) };

  it('one opponent reduces exactly to the single-opponent objective', () => {
    const single = createPvpWinObjective({ opponent, iterations: 50, seed: 7 });
    const multi = createMultiPvpWinObjective({ opponents: [opponent], iterations: 50, seed: 7 });
    const { character, preset } = manualBuild();
    expect(multi(character, preset)).toBe(single(character, preset));
  });

  it('mean is the average of the per-opponent scores; min is the worst one', () => {
    const { character, preset } = manualBuild();
    const sEasy = createPvpWinObjective({ opponent: easy, iterations: 50, seed: 7 })(character, preset);
    const sHard = createPvpWinObjective({ opponent: hard, iterations: 50, seed: 7 })(character, preset);
    const mean = createMultiPvpWinObjective({ opponents: [easy, hard], iterations: 50, seed: 7 });
    const min = createMultiPvpWinObjective({ opponents: [easy, hard], aggregate: 'min', iterations: 50, seed: 7 });
    expect(mean(character, preset)).toBeCloseTo((sEasy + sHard) / 2, 9);
    expect(min(character, preset)).toBe(Math.min(sEasy, sHard));
  });
});

describe('opponent special glyphs', () => {
  it("an opponent's ember-curse glyph strengthens their bleed and lowers the player's score", () => {
    // A long grind where bleed stacks matter: the glyph adds a stack and 10%
    // per-tick damage, so the glyphed opponent must score the player lower.
    const bleeder = (specialGlyphIds) => ({
      name: 'Bleeder',
      class: 'Sentinel',
      stats: stats({ attack: 700, health: 60000 }),
      sigilIds: ['ember-curse'],
      sigilValues: { 'ember-curse': { active: {}, damage: 400, tickDamage: 400 } },
      specialGlyphIds,
    });
    const { character, preset } = manualBuild({ attack: 900, health: 60000 });
    const noGlyph = createPvpWinObjective({ opponent: bleeder([]), iterations: 60, seed: 9 })(character, preset);
    const withGlyph = createPvpWinObjective({ opponent: bleeder(['ember-curse-glyph']), iterations: 60, seed: 9 })(character, preset);
    expect(withGlyph).toBeLessThan(noGlyph);
  });
});
