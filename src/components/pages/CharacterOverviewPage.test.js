import { it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import CharacterOverviewPage from './CharacterOverviewPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { setup, click } from '../ui/testkit.js';
import { migrateCharacterFromV1, normaliseCharacter } from '../../lib/model/index.js';
import { normaliseSkills } from '../../lib/model/skills.js';
import { normaliseFortress, migrateFortressFromV1 } from '../../lib/model/fortress.js';
import { defaultBaseResidual } from '../../lib/model/character.js';

let view;
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  rosterStore.addCharacter('Test', 'WARRIOR');
});
afterEach(() => {
  view?.done();
  view = null;
});

const mountPage = () => (view = setup(CharacterOverviewPage));
const commit = (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
};
const equipSigil = () => {
  rosterStore.setCharacterLevel(60);
  rosterStore.setSigilLevel('DEFENSE_STANCE', 3);
  rosterStore.setPresetSigils(rosterStore.current.presets[0].id, { species: ['DEFENSE_STANCE'] });
};

it('class is editable here and re-normalises the character', () => {
  mountPage();
  const select = view.q('select');
  expect(select.value).toBe('WARRIOR');
  commit(select, 'MYSTIC');
  expect(rosterStore.current.class).toBe('MYSTIC');
});

it('a level change that drops nothing applies at once and shows the Saved tick', () => {
  mountPage();
  commit(view.q('input[aria-label="Level"]'), '58');
  expect(rosterStore.current.level).toBe(58);
  expect(view.q('[role="status"]').textContent).toContain('Saved');
  expect(view.q('dialog[open]')).toBeNull();
});

it('lowering the level previews what it drops and writes nothing until confirmed', () => {
  equipSigil();
  mountPage();
  commit(view.q('input[aria-label="Level"]'), '10');
  const dialog = view.q('dialog[open]');
  expect(dialog).not.toBeNull();
  expect(dialog.textContent).toContain('Defense Aura unequipped from');
  expect(rosterStore.current.level).toBe(60); // preview only
  expect(rosterStore.current.presets[0].sigilSpecies).toEqual(['DEFENSE_STANCE']);
  click([...dialog.querySelectorAll('button')].find((b) => b.textContent.includes('Lower level')));
  expect(rosterStore.current.level).toBe(10);
  expect(rosterStore.current.presets[0].sigilSpecies).toEqual([]);
});

it('lowering the level below an unlock gate: Transcendence stops counting, Set B and mounts are flagged', () => {
  rosterStore.setCharacterLevel(60);
  mountPage();
  commit(view.q('input[aria-label="Level"]'), '30');
  const text = view.q('dialog[open]').textContent;
  expect(text).toContain('Transcendence stops counting');
  expect(text).toContain('Transcendence presets stops counting');
  expect(text).toContain('Set B is kept, but presets that use it are flagged');
  expect(text).toContain('Mounts is kept, but presets that use it are flagged');
  expect(text).not.toContain('Set B stops counting');
  expect(text).not.toContain('Set 2 ');
  expect(rosterStore.current.level).toBe(60); // preview only
});

it('cancelling the drop preview keeps the level and the stepper shows it again', () => {
  equipSigil();
  mountPage();
  commit(view.q('input[aria-label="Level"]'), '10');
  click([...view.q('dialog[open]').querySelectorAll('button')].find((b) => b.textContent.includes('Keep level')));
  expect(rosterStore.current.level).toBe(60);
  expect(view.q('input[aria-label="Level"]').value).toBe('60');
});

it('oblivion unlock reconciles skill caps', () => {
  mountPage();
  rosterStore.setSkillLevel('hunting', 11);
  expect(rosterStore.current.skills.hunting).toBe(10);
  const tick = view.q('input[type="checkbox"]');
  click(tick);
  rosterStore.setSkillLevel('hunting', 11);
  expect(rosterStore.current.skills.hunting).toBe(11);
  click(tick);
  expect(rosterStore.current.skills.hunting).toBe(10);
});

it('base stats edit the residual and reset to the game defaults', () => {
  mountPage();
  const label = view.qa('label').find((l) => l.textContent === 'Attack');
  const atk = document.getElementById(label.htmlFor);
  atk.value = '42';
  atk.dispatchEvent(new Event('input', { bubbles: true }));
  atk.dispatchEvent(new Event('blur'));
  flushSync();
  expect(rosterStore.current.baseResidual.attack).toBe(42);
  click(view.qa('button').find((b) => b.textContent === 'Reset to game defaults'));
  expect(rosterStore.current.baseResidual).toEqual(defaultBaseResidual());
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
