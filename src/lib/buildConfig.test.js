/**
 * Tests buildConfig.js - the saved-results configuration snapshot. The
 * contract under test: every dimension gets a line, names are resolved to
 * display text at call time, and empty dimensions read 'None'/'No spec'
 * rather than being omitted (comparing two saved builds needs the same
 * line-up on both sides).
 */
import { it, expect } from 'vitest';
import { describeBuildConfig } from './buildConfig.js';
import { candidateFromCurrent } from './optimizer.js';
import { newCharacter } from './model.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { SIGILS_BY_CLASS } from './sigilsData.js';

const line = (lines, label) => lines.find((l) => l.label === label)?.value;

function makeWarrior() {
  const c = newCharacter('Config Test');
  c.class = 'Warrior';
  c.loadouts[0].name = 'Raid Gear';
  c.pets = [{ id: 'pet1', name: 'Ember Fox', rarity: 'rare', stats: {} }];
  // Glyphs are mount-bound: the snapshot reads them off the mount being ridden.
  c.glyphs.entries.push({ id: 'g1', tier: 'minor', rarity: 'Common', statKey: 'attack_pct', value: 5, special: null });
  c.mounts.entries[0].star = 1;
  c.mounts.entries[0].glyphIds = ['g1'];
  c.awakening = { path: 'shadow', points: 3 };
  c.transcendence.unlockedPositions = ['14:25', '14:24'];
  c.talentSets[0] = { spec: 'arms', allocation: { arms_t1_quick_strikes: 2 } };
  const preset = c.presets[0];
  preset.petId = 'pet1';
  preset.mountId = c.mounts.entries[0].id;
  preset.relicIds = [RELICS_BY_CLASS.Warrior[0].id];
  preset.sigilIds = [SIGILS_BY_CLASS.Warrior[0].id];
  preset.fortressBuffs = { top: true, bottom: false, core: true };
  return c;
}

it('describes every dimension of a fully-populated build with resolved display names', () => {
  const c = makeWarrior();
  const lines = describeBuildConfig(c, candidateFromCurrent(c, c.presets[0]));

  expect(line(lines, 'Gear Loadout')).toBe('Raid Gear');
  expect(line(lines, 'Pet')).toContain('Ember Fox');
  expect(line(lines, 'Mount')).toBe(c.mounts.entries[0].name);
  expect(line(lines, 'Relics')).toContain(RELICS_BY_CLASS.Warrior[0].name);
  expect(line(lines, 'Sigils')).toContain(SIGILS_BY_CLASS.Warrior[0].name);
  expect(line(lines, 'Mount Glyphs')).toContain('minor attack_pct +5');
  expect(line(lines, 'Talents')).toContain('2/');
  expect(line(lines, 'Awakening')).toContain('3 pts');
  expect(line(lines, 'Transcendence')).toContain('2 nodes');
  expect(line(lines, 'Transcendence')).toContain('14:24');
  expect(line(lines, 'Fortress Buffs')).toBe('top + core');
  // Plain-text contract: values must already be strings, never objects.
  expect(lines.every((l) => typeof l.label === 'string' && typeof l.value === 'string')).toBe(true);
});

it('an empty build still lists every dimension, as None/No spec placeholders', () => {
  const c = newCharacter('Empty');
  c.class = 'Warrior';
  const lines = describeBuildConfig(c, candidateFromCurrent(c, c.presets[0]));

  expect(line(lines, 'Socketed Stones')).toBe('None');
  expect(line(lines, 'Talents')).toBe('No spec');
  expect(line(lines, 'Pet')).toBe('None');
  expect(line(lines, 'Relics')).toBe('None');
  expect(line(lines, 'Sigils')).toBe('None');
  expect(line(lines, 'Mount')).toBe('None');
  expect(line(lines, 'Mount Glyphs')).toBe('None');
  expect(line(lines, 'Awakening')).toBe('No path');
  expect(line(lines, 'Transcendence')).toBe('None');
  expect(line(lines, 'Fortress Buffs')).toBe('None');
});

it('resolves names at call time: a dangling petId degrades to a placeholder, not a crash', () => {
  const c = makeWarrior();
  c.presets[0].petId = 'deleted-pet';
  const lines = describeBuildConfig(c, candidateFromCurrent(c, c.presets[0]));
  expect(line(lines, 'Pet')).toBe('Unknown pet');
});
