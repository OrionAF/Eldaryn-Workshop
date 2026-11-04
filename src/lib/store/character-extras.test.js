import { describe, it, expect, beforeEach } from 'vitest';
import { rosterStore } from '../rosterStore.svelte.js';
import { SKILLS, skillById, skillLevelCap } from '../game/skills.js';
import { attunementMaxBans, bannableStats } from '../model/skills.js';

const cur = () => rosterStore.current;

beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Test', 'WARRIOR');
});

describe('setAllSkills', () => {
  it('max sets every unlocked skill to its cap and leaves locked ones alone', () => {
    rosterStore.setCharacterLevel(30);
    rosterStore.setSkillLevel('ascension', 2); // unlock level 78: locked, holds a prior value
    rosterStore.setAllSkills('max');
    for (const s of SKILLS) {
      if (s.unlockLevel <= 30) expect(cur().skills[s.id]).toBe(s.maxLevel);
    }
    expect(cur().skills.hunting).toBe(10);
    expect(cur().skills.ascension).toBe(2); // locked, untouched
    expect(cur().skills.keySave).toBeUndefined(); // locked, never held a value
  });

  it('keeps levels above the character level through a max', () => {
    rosterStore.setCharacterLevel(100);
    rosterStore.setAllSkills('max');
    rosterStore.setCharacterLevel(1);
    rosterStore.setAllSkills('max');
    expect(cur().skills.hunting).toBe(10);
  });

  it('adds the Oblivion point only once Oblivion is unlocked', () => {
    rosterStore.setCharacterLevel(100);
    rosterStore.setAllSkills('max');
    expect(cur().skills.hunting).toBe(skillLevelCap(skillById('hunting'), false));
    rosterStore.setOblivionUnlocked(true);
    rosterStore.setAllSkills('max');
    for (const s of SKILLS) expect(cur().skills[s.id]).toBe(skillLevelCap(s, true));
    expect(cur().skills.hunting).toBe(11);
    expect(cur().skills.luck).toBe(5); // no oblivion point
  });

  it('clear removes every skill, including locked ones', () => {
    rosterStore.setCharacterLevel(100);
    rosterStore.setAllSkills('max');
    rosterStore.setCharacterLevel(1);
    rosterStore.setAllSkills('clear');
    expect(cur().skills).toEqual({});
  });

  it('keeps bans that still fit the Attunement slots after max, trims them after clear', () => {
    rosterStore.setCharacterLevel(100);
    rosterStore.setAllSkills('max');
    const slots = attunementMaxBans(cur().skills, cur().class);
    const stats = bannableStats(cur().class);
    expect(slots).toBeGreaterThan(1);
    for (const s of stats.slice(0, slots)) rosterStore.toggleAttunementBan(s.type);
    expect(cur().attunementBans.length).toBe(slots);
    rosterStore.setAllSkills('max');
    expect(cur().attunementBans.length).toBe(slots);
    rosterStore.setAllSkills('clear');
    expect(cur().attunementBans.length).toBe(attunementMaxBans({}, cur().class));
    expect(cur().attunementBans.length).toBeLessThan(slots);
  });

  it('ignores an unknown mode', () => {
    rosterStore.setCharacterLevel(100);
    rosterStore.setAllSkills('max');
    const before = { ...cur().skills };
    rosterStore.setAllSkills('bogus');
    expect(cur().skills).toEqual(before);
  });
});
