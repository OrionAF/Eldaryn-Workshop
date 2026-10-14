import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CharacterScreen from './CharacterScreen.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { migrateCharacterFromV1, normaliseCharacter } from '../../lib/model/index.js';
import { normaliseSkills } from '../../lib/model/skills.js';
import { normaliseFortress, migrateFortressFromV1 } from '../../lib/model/fortress.js';

let id;
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  id = rosterStore.addCharacter('Test', 'WARRIOR');
});

function render() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(CharacterScreen, { target, props: {} });
  flushSync();
  return { target, app };
}

it('renders and edits level, skills, fortress, residual', () => {
  const { target, app } = render();
  const level = target.querySelector('input[aria-label="Level"]');
  level.value = '55';
  level.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.level).toBe(55);

  target.querySelector('button[aria-label="Raise Hunting"]').click();
  flushSync();
  expect(rosterStore.current.skills.hunting).toBe(1);
  expect(target.querySelector('[data-testid="level-hunting"]').textContent).toContain('1 / 10');

  target.querySelector('input[aria-label="Fortress TOP"]').click();
  flushSync();
  expect(rosterStore.current.fortress.owned).toEqual(['TOP']);
  target.querySelector('input[aria-label="Fortress BOTTOM"]').click();
  flushSync();
  expect(rosterStore.current.fortress.owned).toEqual(['BOTTOM']);

  const atk = target.querySelector('input[aria-label="Attack"]');
  atk.value = '42';
  atk.dispatchEvent(new Event('change', { bubbles: true }));
  expect(rosterStore.current.baseResidual.attack).toBe(42);
  unmount(app);
});

it('oblivion level needs the unlock; locking clamps skills', () => {
  const { target, app } = render();
  rosterStore.setSkillLevel('hunting', 11);
  expect(rosterStore.current.skills.hunting).toBe(10);
  const tick = target.querySelector('input[aria-label="Oblivion unlocked"]');
  tick.click();
  flushSync();
  rosterStore.setSkillLevel('hunting', 11);
  expect(rosterStore.current.skills.hunting).toBe(11);
  tick.click();
  flushSync();
  expect(rosterStore.current.skills.hunting).toBe(10);
  unmount(app);
});

it('attunement bans are capped per class', () => {
  rosterStore.toggleAttunementBan('CRIT_CHANCE');
  expect(rosterStore.current.attunementBans).toEqual([]); // warrior: 0 slots at level 0
  rosterStore.setSkillLevel('attunement', 2);
  rosterStore.toggleAttunementBan('CRIT_CHANCE');
  expect(rosterStore.current.attunementBans).toEqual(['CRIT_CHANCE']);
  rosterStore.setSkillLevel('attunement', 1);
  expect(rosterStore.current.attunementBans).toEqual([]);
  rosterStore.setCharacterClass(id, 'MYSTIC');
  rosterStore.toggleAttunementBan('CRIT_CHANCE'); // casters have one slot at level 1
  expect(rosterStore.current.attunementBans.length).toBe(1);
});

it('normalisers are idempotent and defensive', () => {
  const raw = { class: 'WARRIOR', skills: { hunting: 99, bogus: 3, luck: -2 }, attunementBans: ['X', 'X'], fortress: { owned: ['BOTTOM', 'TOP', 'CORE', 'CORE', 'Z'] } };
  const s = normaliseSkills(raw, { class: 'WARRIOR' });
  expect(s).toEqual({ skills: { hunting: 10 }, attunementBans: [] });
  expect(normaliseSkills(s, { class: 'WARRIOR' })).toEqual(s);
  const f = normaliseFortress(raw);
  expect(f.fortress.owned).toEqual(['TOP', 'CORE']);
  expect(normaliseFortress(f)).toEqual(f);
});

it('v1 fortress migrates from the active preset only', () => {
  const v1 = {
    id: 'o',
    name: 'A',
    class: 'Warrior',
    loadouts: [{ gear: {} }, { gear: {} }],
    presets: [
      { id: 'a', loadout: 0, talentSet: 0, fortressBuffs: { top: true, bottom: false, core: false } },
      { id: 'b', loadout: 1, talentSet: 0, fortressBuffs: { top: false, bottom: true, core: true } },
    ],
    activePresetId: 'b',
  };
  expect(migrateFortressFromV1(v1).value.fortress.owned).toEqual(['BOTTOM', 'CORE']);
  expect(normaliseCharacter(migrateCharacterFromV1(v1)).fortress.owned).toEqual(['BOTTOM', 'CORE']);
});
