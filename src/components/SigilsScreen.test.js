import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SigilsScreen from './SigilsScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { SIGILS_BY_CLASS, forgeSigils, conduitSigils } from '../lib/sigilsData.js';

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
  // rosterStore is a module singleton, so anything character-wide has to be
  // reset explicitly or it leaks into the next test.
  rosterStore.setSigilForgeTier(1);
  rosterStore.current.transcendence.unlockedPositions = [];
  rosterStore.setCharacterClass(rosterStore.current.id, null); // resets sigilValues/preset sigilIds
});

function asWarrior() {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();
}

function cardFor(name) {
  return [...target.querySelectorAll('.sigil-card')].find((c) => c.textContent.includes(name));
}

it('shows an onboarding hint with no class chosen', () => {
  expect(target.querySelector('.empty-hint')).not.toBeNull();
});

it('lists every catalogue sigil for the class - no equip control here', () => {
  asWarrior();

  expect(target.querySelectorAll('.sigil-card').length).toBe(SIGILS_BY_CLASS.Warrior.length);
  // Text inputs (not type="number") so comma decimals parse like every other field.
  expect(target.querySelectorAll('input[type="text"][inputmode]').length).toBeGreaterThan(0);
  expect(target.querySelectorAll('input[type="number"]').length).toBe(0);
  expect(target.querySelector('select, input[type="checkbox"]')).toBeNull(); // equip lives in the Presets editor
  expect(target.textContent).toContain('Defense Stance');
});

it('groups Forge sigils into rarity sections, Common first, conduits last', () => {
  asWarrior();

  const headings = [...target.querySelectorAll('.rarity-section .subheading')].map((h) => h.textContent);
  // Warrior's Forge sigils span Common..Legendary; Ancient is the conduit section.
  expect(headings.slice(0, -1)).toEqual(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']);
  expect(headings[headings.length - 1]).toContain('Eternal Conduits');
});

it('one Forge Tier control drives every sigil, replacing the old per-sigil tier', () => {
  asWarrior();

  expect(target.querySelectorAll('[data-testid="forge-tier"]').length).toBe(1);
  expect(target.querySelector('[data-testid="forge-tier"]').textContent).toBe('1');

  const raise = [...target.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Raise forge tier');
  raise.click();
  flushSync();

  expect(rosterStore.current.sigilForgeTier).toBe(2);
  expect(target.querySelector('[data-testid="forge-tier"]').textContent).toBe('2');
});

it('the level stepper writes through and shows the derived Attack/Health', () => {
  asWarrior();

  const up = target.querySelector('button[aria-label="Defense Stance level up"]');
  up.click();
  flushSync();

  expect(rosterStore.current.sigilValues['defense-stance'].level).toBe(1);
  // Common curve at level 1, tier 1: floor(16.6 * 10) / floor(130 * 10).
  const card = cardFor('Defense Stance');
  expect(card.textContent).toContain('Attack:');
  expect(card.textContent).toContain('Health:');
  expect(card.querySelector('.base-stats').textContent.replace(/\s+/g, ' ')).toContain('166');
});

it('a level-0 sigil reads as not owned', () => {
  asWarrior();
  expect(cardFor('Defense Stance').textContent).toContain('not owned');
});

it('baked magnitudes render read-only instead of as an input', () => {
  asWarrior();
  const up = target.querySelector('button[aria-label="Defense Stance level up"]');
  up.click();
  flushSync();

  // health_pct is derived from level now - no text field for it.
  expect(target.querySelector('input[aria-label="Defense Stance passive Health %"]')).toBeNull();
  const derived = target.querySelector('span[aria-label="Defense Stance passive Health %"]');
  expect(derived).not.toBeNull();
  expect(derived.textContent).toBe('8'); // base 8% at level 1
});

it('unbaked magnitudes stay editable and write through', () => {
  asWarrior();

  // Warborn Fury's penetration was never scraped, so it remains manual.
  const input = target.querySelector('input[aria-label="Warborn Fury active Penetration"]');
  expect(input).not.toBeNull();
  input.value = '12,5'; // comma decimal, like every other field
  input.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.sigilValues['warborn-fury'].active.penetration).toBe(12.5);
});

it('damage inputs only appear for damage-dealing mechanics, and parse thousands separators', () => {
  asWarrior();

  expect(target.querySelector('input[aria-label="Blade of Judgment damage"]')).not.toBeNull();
  expect(target.querySelector('input[aria-label="Blade of Judgment tick damage"]')).toBeNull();
  expect(target.querySelector('input[aria-label="Hemorrhage tick damage"]')).not.toBeNull();
  expect(target.querySelector('input[aria-label="Warborn Fury damage"]')).toBeNull(); // buff-only active

  const dmg = target.querySelector('input[aria-label="Blade of Judgment damage"]');
  dmg.value = '2.664';
  dmg.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.sigilValues['blade-of-judgment'].damage).toBe(2664);
});

it("Withering Touch's regen debuff is baked, so it no longer asks for a number", () => {
  asWarrior();
  expect(target.querySelector('input[aria-label="Withering Touch regen debuff %"]')).toBeNull();
});

it('renders active timing and the tooltip notes', () => {
  asWarrior();

  const rejuvenation = cardFor('Rejuvenation');
  expect(rejuvenation.textContent).toContain('ACTIVE');
  expect(rejuvenation.textContent).toContain('6s duration');
  expect(rejuvenation.textContent).toContain('12s cooldown');
  expect(rejuvenation.textContent).toContain('50% uptime');
  expect(rejuvenation.textContent).toContain('Restores XX.X% HP per second');
});

it('marks boss-defense/incoming-hit sigils as not simulated', () => {
  asWarrior();

  expect(cardFor('Sunder Mark').querySelector('.sim-badge').textContent).toContain('not simulated');
  expect(cardFor('Warborn Fury').querySelector('.sim-badge').textContent).toContain('sim:');
});

it('shows which presets equip a sigil', () => {
  asWarrior();
  expect(target.querySelector('.used-by').textContent).toContain('unequipped');

  const presetId = rosterStore.current.presets[0].id;
  rosterStore.toggleSigilOnPreset(presetId, forgeSigils('Warrior')[0].id, true);
  flushSync();
  expect([...target.querySelectorAll('.used-by')].some((n) => n.textContent.includes('in '))).toBe(true);
});

it('Legendary sigils are locked below Forge Tier 2, and unlock at it', () => {
  asWarrior();

  const sunder = cardFor('Sunder Mark');
  expect(sunder.classList.contains('locked')).toBe(true);
  expect(sunder.textContent).toContain('Requires Forge Tier 2');
  // Locked cards expose no level control at all.
  expect(sunder.querySelector('button[aria-label="Sunder Mark level up"]')).toBeNull();

  rosterStore.setSigilForgeTier(2);
  flushSync();

  const unlocked = cardFor('Sunder Mark');
  expect(unlocked.classList.contains('locked')).toBe(false);
  expect(unlocked.querySelector('button[aria-label="Sunder Mark level up"]')).not.toBeNull();
});

it('Ancient conduit sigils sit in their own section and need their Transcendence node', () => {
  asWarrior();

  const conduitIds = conduitSigils('Warrior').map((d) => d.id);
  expect(conduitIds).toEqual(['earthwarden', 'flameborn']);

  // Forge Tier 2 alone is not enough - the node gate still applies.
  rosterStore.setSigilForgeTier(2);
  flushSync();
  expect(cardFor('Earthwarden').textContent).toContain('Transcendence node');

  rosterStore.current.transcendence.unlockedPositions = ['1:1'];
  flushSync();
  expect(cardFor('Earthwarden').classList.contains('locked')).toBe(false);
  // Its transform percentages are baked flat from the scrape.
  expect(cardFor('Earthwarden').textContent).toContain('30');
});
