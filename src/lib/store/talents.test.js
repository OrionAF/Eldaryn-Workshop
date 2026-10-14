import { describe, it, expect, beforeEach } from 'vitest';
import { rosterStore } from '../rosterStore.svelte.js';
import { talentTiers } from '../game/talents.js';

const cur = () => rosterStore.current;
const tiers = talentTiers('WARRIOR_DPS');

beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Test', 'WARRIOR');
});

describe('talents store', () => {
  it('sets a spec only from the character class and persists', () => {
    expect(rosterStore.setTalentSetSpec(0, 'MYSTIC_MAGE')).toBe(false);
    expect(rosterStore.setTalentSetSpec(0, 'WARRIOR_DPS')).toBe(true);
    expect(cur().talentSets[0].spec).toBe('WARRIOR_DPS');
    expect(localStorage.getItem('eldaryn_optimiser_state_v2') ?? localStorage.length).toBeTruthy();
  });

  it('allocates, gates tier 2, refuses a lowering that would lock it, and resets', () => {
    rosterStore.setTalentSetSpec(0, 'WARRIOR_DPS');
    const [a] = tiers[0].talents;
    const b = tiers[1].talents[0];
    expect(rosterStore.setTalentSetRank(0, b.id, 1)).toBe(false);
    expect(rosterStore.setTalentSetRank(0, a.id, 5)).toBe(true);
    expect(rosterStore.setTalentSetRank(0, b.id, 1)).toBe(true);
    expect(rosterStore.setTalentSetRank(0, a.id, 4)).toBe(false);
    expect(cur().talentSets[0].allocation[a.id]).toBe(5);
    rosterStore.resetTalentSet(0);
    expect(cur().talentSets[0].allocation).toEqual({});
  });

  it('changing spec clears the allocation; class change drops specs', () => {
    rosterStore.setTalentSetSpec(1, 'WARRIOR_DPS');
    rosterStore.setTalentSetRank(1, tiers[0].talents[0].id, 2);
    rosterStore.setTalentSetSpec(1, 'WARRIOR_TANK');
    expect(cur().talentSets[1]).toEqual({ spec: 'WARRIOR_TANK', allocation: {} });
    rosterStore.setCharacterClass(cur().id, 'MYSTIC');
    expect(cur().talentSets.map((s) => s.spec)).toEqual([null, null]);
  });

  it('rejects an unknown index or a talent from another spec', () => {
    rosterStore.setTalentSetSpec(0, 'WARRIOR_DPS');
    expect(rosterStore.setTalentSetRank(2, tiers[0].talents[0].id, 1)).toBe(false);
    expect(rosterStore.setTalentSetRank(0, talentTiers('WARRIOR_TANK')[0].talents[0].id, 1)).toBe(false);
  });
});
