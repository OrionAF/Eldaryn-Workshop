/**
 * Tests relicSuggester.js - the Relic Suggester engine.
 *
 * Core guarantees: boosted levels clamp at maxLevel, locked relics surface
 * as unlocks at level N, the best board never exceeds the equip cap, the
 * perRelic ranking covers every class relic sorted by gain, and the inputs
 * are never mutated.
 */
import { it, expect } from 'vitest';
import { suggestRelics, boostRelicLevels, diffRelicPlan } from './relicSuggester.js';
import { newCharacter, newPetEntry } from './model.js';
import { PRESET_RELIC_CAP } from './constants.js';
import { RELICS_BY_CLASS } from './relicsData.js';

/** A Warrior with a mixed relic state: two leveled (one equipped), one maxed, the rest locked. */
function makeWarrior() {
  const character = newCharacter('Relic Warrior');
  character.class = 'Warrior';
  character.loadouts[0].gear.Weapon.attack = 100;
  character.loadouts[0].gear.Weapon.crit = 20;
  const pet = newPetEntry({ name: 'Pet', stats: { attack_pct: 10 } });
  character.pets = [pet];
  character.relicLevels = { 'war-charm': 5, 'iron-heart': 3, 'titans-oath': 20 };
  const preset = character.presets[0];
  preset.petId = pet.id;
  preset.relicIds = ['war-charm'];
  return { character, preset };
}

it('boostRelicLevels raises locked relics from 0 and clamps at maxLevel', () => {
  const { character } = makeWarrior();
  const defs = RELICS_BY_CLASS.Warrior;
  const all = new Set(defs.map((d) => d.id));
  const boosted = boostRelicLevels(character, all, 2);
  expect(boosted['war-charm']).toBe(7); // 5 + 2
  expect(boosted['fatebreaker']).toBe(2); // locked: 0 -> 2
  expect(boosted['titans-oath']).toBe(20); // already max (gold cap 20), clamped
  const bronzeMax = defs.find((d) => d.id === 'war-charm').maxLevel;
  expect(boostRelicLevels(character, all, 99)['war-charm']).toBe(bronzeMax);
});

it('boostRelicLevels only touches the requested ids and never mutates the character', () => {
  const { character } = makeWarrior();
  const boosted = boostRelicLevels(character, new Set(['fatebreaker']), 3);
  expect(boosted['fatebreaker']).toBe(3);
  expect(boosted['war-charm']).toBe(5); // untouched
  expect(character.relicLevels['fatebreaker']).toBeUndefined(); // input intact
});

it('diffRelicPlan reports unlock/upgrade only for equipped relics, plus equip/unequip board moves', () => {
  const { character, preset } = makeWarrior();
  const boosted = boostRelicLevels(character, new Set(RELICS_BY_CLASS.Warrior.map((d) => d.id)), 2);
  // Suggested board: keep war-charm (upgrade), add locked fatebreaker
  // (unlock+equip), add maxed titans-oath (equip only), drop nothing.
  const changes = diffRelicPlan(character, preset, ['war-charm', 'fatebreaker', 'titans-oath'], boosted);
  expect(changes).toContainEqual({ kind: 'upgrade', id: 'war-charm', name: 'War Charm', tier: 'bronze', fromLevel: 5, toLevel: 7 });
  expect(changes).toContainEqual({ kind: 'unlock', id: 'fatebreaker', name: 'Fatebreaker', tier: 'gold', toLevel: 2 });
  expect(changes).toContainEqual({ kind: 'equip', id: 'fatebreaker', name: 'Fatebreaker', tier: 'gold' });
  expect(changes).toContainEqual({ kind: 'equip', id: 'titans-oath', name: "Titan's Oath", tier: 'gold' });
  // Maxed relic never shows a fake upgrade; iron-heart (leveled, not suggested, not equipped) shows nothing.
  expect(changes.filter((ch) => ch.id === 'titans-oath')).toHaveLength(1);
  expect(changes.some((ch) => ch.id === 'iron-heart')).toBe(false);
});

it('diffRelicPlan reports unequip for a current relic the suggested board drops', () => {
  const { character, preset } = makeWarrior();
  const changes = diffRelicPlan(character, preset, ['iron-heart'], { 'iron-heart': 5 });
  expect(changes).toContainEqual({ kind: 'unequip', id: 'war-charm', name: 'War Charm', tier: 'bronze' });
});

it('suggestRelics finds locked-relic value: best board within cap, unlock steps, full sorted ranking', async () => {
  const { character, preset } = makeWarrior();
  const result = await suggestRelics({ character, preset, relicLevelBoost: 2 });

  expect(result.levelBoost).toBe(2);
  expect(result.best.score).toBeGreaterThanOrEqual(result.baseline.score);
  expect(result.best.relicIds.length).toBeLessThanOrEqual(PRESET_RELIC_CAP);
  // Every equipped-but-locked relic in the best board has an unlock step.
  for (const id of result.best.relicIds) {
    if ((character.relicLevels[id] || 0) === 0) {
      expect(result.changes.some((ch) => ch.kind === 'unlock' && ch.id === id)).toBe(true);
    }
  }
  // The ranking covers the whole class pool, sorted by gain descending.
  expect(result.perRelic).toHaveLength(RELICS_BY_CLASS.Warrior.length);
  for (let i = 1; i < result.perRelic.length; i++) {
    expect(result.perRelic[i - 1].gain).toBeGreaterThanOrEqual(result.perRelic[i].gain);
  }
  const fatebreaker = result.perRelic.find((r) => r.id === 'fatebreaker');
  expect(fatebreaker.isUnlock).toBe(true);
  expect(fatebreaker.fromLevel).toBe(0);
  expect(fatebreaker.toLevel).toBe(2);
  const maxed = result.perRelic.find((r) => r.id === 'titans-oath');
  expect(maxed.atMax).toBe(true);
  expect(maxed.toLevel).toBe(20);
  expect(result.aborted).toBe(false);
});

it('suggestRelics never mutates the input character or preset', async () => {
  const { character, preset } = makeWarrior();
  const charBefore = JSON.stringify(character);
  const presetBefore = JSON.stringify(preset);
  await suggestRelics({ character, preset, relicLevelBoost: 3 });
  expect(JSON.stringify(character)).toBe(charBefore);
  expect(JSON.stringify(preset)).toBe(presetBefore);
});

it('suggestRelics with a full preset ranks a not-equipped relic by swapping the weakest slot', async () => {
  const { character, preset } = makeWarrior();
  character.relicLevels = { 'war-charm': 10, 'iron-heart': 10, 'mending-stone': 10, 'stone-ward': 10 };
  preset.relicIds = ['war-charm', 'iron-heart', 'mending-stone', 'stone-ward'];
  const result = await suggestRelics({ character, preset, relicLevelBoost: 2 });
  // Rankable at all despite the full board, and equipped relics rank too.
  expect(result.perRelic).toHaveLength(RELICS_BY_CLASS.Warrior.length);
  expect(result.best.relicIds.length).toBeLessThanOrEqual(PRESET_RELIC_CAP);
});

it('suggestRelics rejects a zero/negative level boost', async () => {
  const { character, preset } = makeWarrior();
  await expect(suggestRelics({ character, preset, relicLevelBoost: 0 })).rejects.toThrow();
});

it('suggestRelics reports zero improvement when every relic is maxed and the board is already best', async () => {
  const { character, preset } = makeWarrior();
  // Max out everything and pre-equip the best 4 the suggester itself picks.
  character.relicLevels = Object.fromEntries(RELICS_BY_CLASS.Warrior.map((d) => [d.id, d.maxLevel]));
  const first = await suggestRelics({ character, preset, relicLevelBoost: 1 });
  preset.relicIds = [...first.best.relicIds];
  const second = await suggestRelics({ character, preset, relicLevelBoost: 1 });
  expect(second.improvementPct).toBeCloseTo(0, 6);
  // No unlock/upgrade steps exist - every relic is already at max.
  expect(second.changes.every((ch) => ch.kind === 'equip' || ch.kind === 'unequip')).toBe(true);
  for (const r of second.perRelic) expect(r.atMax).toBe(true);
});

// --- What `gain` actually measures ---

it('a not-equipped relic on a FULL preset is scored with the displacement it forces, and says so', async () => {
  const { character, preset } = makeWarrior();
  const pool = RELICS_BY_CLASS.Warrior.map((d) => d.id);
  // Fill the preset to the cap so every other relic has to push one out.
  preset.relicIds = pool.slice(0, PRESET_RELIC_CAP);
  character.relicLevels = Object.fromEntries(preset.relicIds.map((id) => [id, 5]));
  const result = await suggestRelics({ character, preset, relicLevelBoost: 2 });

  const equipped = new Set(preset.relicIds);
  for (const row of result.perRelic) {
    if (equipped.has(row.id)) {
      // Already slotted: nothing is displaced, so the number is the investment alone.
      expect(row.gainIncludesSwap, row.id).toBe(false);
      expect(row.displacedId, row.id).toBeNull();
    } else {
      expect(row.gainIncludesSwap, row.id).toBe(true);
      expect(equipped.has(row.displacedId), row.id).toBe(true);
      expect(typeof row.displacedName).toBe('string');
    }
  }
  // Every row displaces the SAME relic - the one that costs least to remove.
  const displaced = new Set(result.perRelic.filter((r) => r.gainIncludesSwap).map((r) => r.displacedId));
  expect(displaced.size).toBe(1);
});

it('a preset with a free slot displaces nothing', async () => {
  const { character, preset } = makeWarrior();
  preset.relicIds = ['war-charm']; // cap is 4
  const result = await suggestRelics({ character, preset, relicLevelBoost: 2 });
  expect(result.perRelic.every((r) => r.gainIncludesSwap === false)).toBe(true);
  expect(result.perRelic.every((r) => r.displacedId === null)).toBe(true);
});

it('`sampled` is carried through so the panel can caveat a Monte Carlo ranking', async () => {
  const { character, preset } = makeWarrior();
  expect((await suggestRelics({ character, preset, relicLevelBoost: 1 })).sampled).toBe(false);
  expect((await suggestRelics({ character, preset, relicLevelBoost: 1, sampled: true })).sampled).toBe(true);
});
