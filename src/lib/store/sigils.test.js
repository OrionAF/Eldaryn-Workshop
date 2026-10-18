import { it, expect, beforeEach } from 'vitest';
import { rosterStore } from '../rosterStore.svelte.js';

beforeEach(() => {
  const c = rosterStore.current;
  if (c.class !== 'WARRIOR') rosterStore.setCharacterClass(c.id, 'WARRIOR');
  for (const sp of Object.keys(rosterStore.current.sigils.owned)) rosterStore.setSigilLevel(sp, 0);
  rosterStore.setSigilAltarTier(1);
});

const sigils = () => rosterStore.current.sigils;

it('setSigilLevel clamps to 1..30, removes at 0 and ignores species of another class', () => {
  rosterStore.setSigilLevel('CATACLYSM', 99);
  expect(sigils().owned.CATACLYSM).toEqual({ level: 30 });
  rosterStore.setSigilLevel('CATACLYSM', '12');
  expect(sigils().owned.CATACLYSM).toEqual({ level: 12 });
  rosterStore.setSigilLevel('HAWK_FOCUS', 5); // Sentinel
  rosterStore.setSigilLevel('NOT_A_SIGIL', 5);
  expect(Object.keys(sigils().owned).sort()).toEqual(['BATTLE_STANCE', 'CATACLYSM', 'GUARDIAN_STANCE']);
  rosterStore.setSigilLevel('CATACLYSM', 0);
  expect(sigils().owned).toEqual({ BATTLE_STANCE: { level: 1 }, GUARDIAN_STANCE: { level: 1 } });
});

it('setSigilLevel keeps the character-wide condition of a sigil that stays owned', () => {
  rosterStore.setSigilLevel('CATACLYSM', 5);
  expect(rosterStore.setSigilCondition('CATACLYSM', 'ENEMY_HP_BELOW_40')).not.toBe(false);
  rosterStore.setSigilLevel('CATACLYSM', 9);
  expect(sigils().owned.CATACLYSM).toEqual({ level: 9, condition: 'ENEMY_HP_BELOW_40' });
  rosterStore.setSigilLevel('CATACLYSM', 0);
  expect(sigils().owned.CATACLYSM).toBeUndefined();
});

it('Ancients are always level 1', () => {
  rosterStore.setSigilLevel('FLAMEBORN', 20);
  expect(sigils().owned.FLAMEBORN).toEqual({ level: 1 });
  rosterStore.setSigilOwned('FLAMEBORN', false);
  expect(sigils().owned).toEqual({ BATTLE_STANCE: { level: 1 }, GUARDIAN_STANCE: { level: 1 } });
});

it('evolveSigilAltar raises the tier to the cap of 3, wiping non-Ancients, then refuses', () => {
  rosterStore.setSigilLevel('CATACLYSM', 5);
  rosterStore.setSigilOwned('EARTHWARDEN', true);
  expect(rosterStore.evolveSigilAltar()).toBe(true);
  expect(rosterStore.evolveSigilAltar()).toBe(true);
  expect(sigils().altarTier).toBe(3);
  expect(Object.keys(sigils().owned).sort()).toEqual(['BATTLE_STANCE', 'EARTHWARDEN', 'GUARDIAN_STANCE']);
  expect(rosterStore.evolveSigilAltar()).toBe(false);
  expect(sigils().altarTier).toBe(3);
});

it('persists: the saved roster round-trips the sigil state', () => {
  rosterStore.setSigilAltarTier(2);
  rosterStore.setSigilLevel('CATACLYSM', 7);
  const saved = JSON.parse(localStorage.getItem('eldaryn_optimiser_state_v2'));
  const c = saved.characters.find((x) => x.id === rosterStore.current.id);
  expect(c.sigils).toEqual({ altarTier: 2, owned: { BATTLE_STANCE: { level: 1 }, GUARDIAN_STANCE: { level: 1 }, CATACLYSM: { level: 7 } } });
});
