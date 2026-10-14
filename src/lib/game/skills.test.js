import { describe, it, expect } from 'vitest';
import raw from '../../data/game/skills.json';
import {
  SKILLS,
  skillById,
  skillEffect,
  skillLevelCap,
  skillUpgradeCost,
} from './skills.js';

describe('skill catalogue (skills.md §3)', () => {
  it('has every skill from the JSON, in order', () => {
    expect(SKILLS.map((s) => s.id)).toEqual(raw.skills.map((s) => s.id));
    expect(SKILLS).toHaveLength(14);
  });

  it('keeps effects.length = maxLevel and costs.length = maxLevel - 1', () => {
    for (const s of SKILLS) {
      expect(s.effects).toHaveLength(s.maxLevel);
      expect(s.costs).toHaveLength(s.maxLevel - 1);
    }
  });

  it('marks exactly the seven Oblivion-point skills', () => {
    const withOblivion = SKILLS.filter((s) => s.oblivionPoint).map((s) => s.id);
    expect(withOblivion.sort()).toEqual(
      raw.skills.filter((s) => s.oblivionPoint).map((s) => s.id).sort(),
    );
    expect(withOblivion).toHaveLength(7);
  });
});

describe('skill effects and caps', () => {
  it('returns the effect at a level from the JSON, with fallback for missing levels', () => {
    const luck = skillById('luck');
    expect(skillEffect(luck, 1)).toBe(luck.effects[0]);
    expect(skillEffect(luck, 99, 7)).toBe(7);
  });

  it('gives the Oblivion effect only at maxLevel + 1 when unlocked', () => {
    const hunting = skillById('hunting');
    expect(skillEffect(hunting, hunting.maxLevel + 1)).toBe(hunting.oblivionPoint.effect);
    expect(skillLevelCap(hunting, false)).toBe(hunting.maxLevel);
    expect(skillLevelCap(hunting, true)).toBe(hunting.maxLevel + 1);
    const ascension = skillById('ascension');
    expect(skillLevelCap(ascension, true)).toBe(ascension.maxLevel);
  });

  it('prices each step, and the Oblivion step at its own cost', () => {
    const mastery = skillById('mastery');
    expect(skillUpgradeCost(mastery, 1)).toBe(mastery.costs[0]);
    expect(skillUpgradeCost(mastery, mastery.maxLevel - 1)).toBe(mastery.costs.at(-1));
    expect(skillUpgradeCost(mastery, mastery.maxLevel)).toBe(mastery.oblivionPoint.cost);
    expect(skillUpgradeCost(skillById('luck'), 5)).toBeNull();
    expect(skillUpgradeCost(mastery, 0)).toBeNull();
  });
});
