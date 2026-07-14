/**
 * Tests optimizerClient.js - the main-thread facade. jsdom has no Worker,
 * so these exercise the inline fallback path, which shares the exact
 * objectivesFromSpec + optimize() pipeline the worker runs.
 */
import { it, expect } from 'vitest';
import { runOptimizerTask } from './optimizerClient.js';
import { newCharacter, newPetEntry } from './model.js';

function makeFixture() {
  const character = newCharacter('Client Test');
  character.class = 'Warrior';
  character.loadouts[0].gear.Weapon.attack = 100;
  const atkPet = newPetEntry({ name: 'Attack Pet', stats: { attack_pct: 10 } });
  character.pets = [atkPet];
  return { character, preset: character.presets[0], atkPet };
}

it('runs a pve-fast search inline and resolves with the optimize() result', async () => {
  const { character, preset, atkPet } = makeFixture();
  const progress = [];
  const { promise } = runOptimizerTask(
    { character, preset, objectiveSpec: { kind: 'pve-fast' } },
    { onProgress: (p) => progress.push(p) }
  );
  const result = await promise;
  expect(result.best.candidate.preset.petId).toBe(atkPet.id);
  expect(result.aborted).toBe(false);
  expect(progress.length).toBeGreaterThan(0);
});

it('cancel() before the baseline eval rejects with an abort error', async () => {
  const { character, preset } = makeFixture();
  const { promise, cancel } = runOptimizerTask({ character, preset });
  cancel();
  await expect(promise).rejects.toThrow(/aborted/i);
});
