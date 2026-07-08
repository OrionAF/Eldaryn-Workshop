import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SigilsScreen from './SigilsScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { SIGILS_BY_CLASS } from '../lib/sigilsData.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(SigilsScreen, { target, props: {} });
  flushSync();
});

afterEach(() => {
  unmount(app);
  target.remove();
  rosterStore.setCharacterClass(rosterStore.current.id, null); // resets sigilValues/preset sigilIds for the next test
});

it('shows an onboarding hint with no class chosen', () => {
  expect(target.querySelector('.empty-hint')).not.toBeNull();
});

it('lists every catalogue sigil for the class - value inputs, but no equip control here', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  expect(target.querySelectorAll('.sigil-card').length).toBe(SIGILS_BY_CLASS.Warrior.length);
  expect(target.querySelectorAll('input[type="number"]').length).toBeGreaterThan(0);
  expect(target.querySelector('button, select, input[type="checkbox"]')).toBeNull(); // equip lives in the Presets editor
  expect(target.textContent).toContain('Defense Stance');
});

it('entering a passive value writes through to character.sigilValues', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  const input = target.querySelector('input[aria-label="Defense Stance passive Health %"]');
  input.value = '12.5';
  input.dispatchEvent(new Event('change', { bubbles: true })); // Svelte 5 delegates 'change' at the root
  flushSync();
  expect(rosterStore.current.sigilValues['defense-stance'].passive.health_pct).toBe(12.5);
});

it('damage inputs only appear for damage-dealing mechanics (plus tick damage for DoTs)', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  expect(target.querySelector('input[aria-label="Blade of Judgment damage"]')).not.toBeNull();
  expect(target.querySelector('input[aria-label="Blade of Judgment tick damage"]')).toBeNull();
  expect(target.querySelector('input[aria-label="Hemorrhage tick damage"]')).not.toBeNull();
  expect(target.querySelector('input[aria-label="Warborn Fury damage"]')).toBeNull(); // buff-only active
});

it('renders passive and active effect lines with the tooltip notes', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  const cards = [...target.querySelectorAll('.sigil-card')];
  const rejuvenation = cards.find((c) => c.textContent.includes('Rejuvenation'));
  expect(rejuvenation.textContent).toContain('PASSIVE');
  expect(rejuvenation.textContent).toContain('ACTIVE');
  expect(rejuvenation.textContent).toContain('6s duration');
  expect(rejuvenation.textContent).toContain('12s cooldown');
  expect(rejuvenation.textContent).toContain('50% uptime');
  expect(rejuvenation.textContent).toContain('Restores XX.X% HP per second');
});

it('marks boss-defense/incoming-hit sigils as not simulated', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  const cards = [...target.querySelectorAll('.sigil-card')];
  const sunder = cards.find((c) => c.textContent.includes('Sunder Mark'));
  expect(sunder.querySelector('.sim-badge').textContent).toContain('not simulated');
  const fury = cards.find((c) => c.textContent.includes('Warborn Fury'));
  expect(fury.querySelector('.sim-badge').textContent).toContain('sim:');
});

it('shows which presets equip a sigil', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();
  expect(target.querySelector('.used-by').textContent).toContain('not equipped');

  const presetId = rosterStore.current.presets[0].id;
  rosterStore.toggleSigilOnPreset(presetId, SIGILS_BY_CLASS.Warrior[0].id, true);
  flushSync();
  expect(target.querySelector('.used-by').textContent).toContain('equipped in');
});
