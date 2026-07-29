import { it, expect, beforeEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DropCheckScreen from './DropCheckScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { SLOTS } from '../lib/constants.js';

const DEFAULT_SLOT = SLOTS[0]; // 'Head'

let target, app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  // rosterStore is a shared singleton across tests in this file - force a
  // deterministic starting drop/totals-mode rather than relying on whatever
  // a previous test happened to leave behind.
  rosterStore.startDrop(DEFAULT_SLOT);
  rosterStore.setPresetTotalsMode(rosterStore.current.presets[0].id, 'calculated'); // base stats present, not an all-zero manual baseline
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(DropCheckScreen, { target, props: {} });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

function setDropField(key, value) {
  rosterStore.setDropField(key, value);
  flushSync();
}

it('starts a drop automatically (first slot by default) with an empty piece', () => {
  expect(rosterStore.current.drop).not.toBeNull();
  expect(rosterStore.current.drop.slot).toBe(DEFAULT_SLOT);
  expect(target.querySelector('.altar')).not.toBeNull();
  cleanup();
});

it('clicking a slot chip in the altar switches the drop slot', () => {
  const chips = [...target.querySelectorAll('.slot-chips .chip')];
  chips.find((c) => c.textContent.trim() === 'Ring').click();
  flushSync();
  expect(rosterStore.current.drop.slot).toBe('Ring');
  cleanup();
});

it('clicking a slot row in a loadout column also switches the drop slot', () => {
  const rows = [...target.querySelectorAll('.slot-row')];
  rows.find((r) => r.textContent.includes('Trinket')).click();
  flushSync();
  expect(rosterStore.current.drop.slot).toBe('Trinket');
  cleanup();
});

it('the seeded preset shows a clean-upgrade verdict for a strictly-better drop', () => {
  setDropField('attack', 100000); // huge, unambiguous upgrade over an empty slot
  const cards = [...target.querySelectorAll('.verdict-card')];
  const loadout0Card = cards[0]; // seeded preset uses Loadout 0
  expect(loadout0Card.classList.contains('upgrade')).toBe(true);
  expect(loadout0Card.querySelector('.rows li').classList.contains('up')).toBe(true);
  expect(loadout0Card.querySelector('.equip-btn').textContent).toContain('Equip →');
  cleanup();
});

it('a loadout with no presets shows the empty-loadout note', () => {
  // The seeded preset uses Loadout 0 only - Loadout 1 has no presets pointing at it.
  const cards = [...target.querySelectorAll('.verdict-card')];
  expect(cards[1].textContent).toContain('No presets use this loadout');
  cleanup();
});

it('equipping a clean upgrade writes to the loadout gear and restarts the drop for the same slot', () => {
  setDropField('attack', 100000);
  const cards = [...target.querySelectorAll('.verdict-card')];
  cards[0].querySelector('.equip-btn').click();
  flushSync();

  expect(rosterStore.current.loadouts[0].gear[DEFAULT_SLOT].attack).toBe(100000);
  expect(rosterStore.current.drop).not.toBeNull(); // a fresh drop was restarted
  expect(rosterStore.current.drop.slot).toBe(DEFAULT_SLOT);
  expect(rosterStore.current.drop.piece.attack).toBe(0); // fresh, not the old value
  cleanup();
});

it('a mixed verdict requires a two-step confirm before equipping', () => {
  // Two presets share Loadout 0 - Drop Check always compares against gear-
  // derived totals (Manual/Calculated mode doesn't matter to it), so the two
  // presets are differentiated via pets instead. The shared slot currently
  // holds a big flat-Attack piece; the drop trades that flat chunk for an
  // Attack% instead. Whether that trade is a net win depends on how much
  // OTHER flat attack a preset already has: a small pre-existing baseline
  // loses more than the %-of-small-base gain (downgrade); a huge
  // pre-existing baseline gains far more from the % multiplying a huge base
  // than it loses from the flat chunk (upgrade) - same literal gear swap,
  // opposite verdicts.
  // Both seeded presets share Loadout 0 by default (two-preset minimum).
  const presetAId = rosterStore.current.presets[0].id;
  const presetBId = rosterStore.current.presets[1].id;
  flushSync();

  rosterStore.setGearField(DEFAULT_SLOT, 0, 'attack', 5000); // the old piece both presets currently have equipped
  setDropField('attack_pct', 50); // the drop: flat Attack traded for Attack%

  // Preset A gets no pet - small baseline (10 base + this slot's 5000).
  // Preset B gets a pet with a huge flat Attack stat - huge baseline.
  const hugePetId = rosterStore.addPet('Huge Pet', 'gold');
  rosterStore.updatePetStat(hugePetId, 'attack', 500000);
  rosterStore.setPresetPet(presetBId, hugePetId);
  flushSync();

  const cards = [...target.querySelectorAll('.verdict-card')];
  const sharedCard = cards[0];
  expect(sharedCard.querySelectorAll('.rows li.down').length).toBe(1); // preset A
  expect(sharedCard.querySelectorAll('.rows li.up').length).toBe(1); // preset B
  expect(sharedCard.classList.contains('mixed')).toBe(true);
  expect(sharedCard.textContent).toContain('Mixed verdict');

  const equipBtn = sharedCard.querySelector('button');
  equipBtn.click(); // first click -> confirm state, does NOT equip yet
  flushSync();
  expect(rosterStore.current.loadouts[0].gear[DEFAULT_SLOT].attack).toBe(5000);

  const confirmBtn = sharedCard.querySelector('.confirm-yes');
  expect(confirmBtn).not.toBeNull();
  confirmBtn.click();
  flushSync();
  expect(rosterStore.current.loadouts[0].gear[DEFAULT_SLOT].attack).toBe(0); // replaced by the drop piece
  expect(rosterStore.current.loadouts[0].gear[DEFAULT_SLOT].attack_pct).toBe(50);

  rosterStore.setGearField(DEFAULT_SLOT, 0, 'attack', 0); // cleanup
  rosterStore.setGearField(DEFAULT_SLOT, 0, 'attack_pct', 0);
  rosterStore.setPresetPet(presetBId, null);
  rosterStore.removePet(hugePetId);
  cleanup();
});

// --- Verdict goal ---

function goalButtons() {
  return [...target.querySelectorAll('.goal-controls .mode-toggle button')];
}

function clickGoal(label) {
  goalButtons()
    .find((b) => b.textContent.trim() === label)
    .click();
  flushSync();
}

it('the goal toggle renders with DPS selected by default, Tank hidden for a non-Warrior', () => {
  const labels = goalButtons().map((b) => b.textContent.trim());
  expect(labels).toEqual(['DPS', 'DPS (sim)']); // Sentinel - no Tank; HPS removed (goals redesign)
  expect(goalButtons()[0].classList.contains('selected')).toBe(true);
  expect(rosterStore.current.dropGoal.kind).toBe('dps-fast');
  cleanup();
});

it('the Tank goal appears for a Warrior, persists via setDropGoal, and shows the profile/balance controls', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();
  expect(goalButtons().map((b) => b.textContent.trim())).toContain('Tank');

  clickGoal('Tank');
  expect(rosterStore.current.dropGoal.kind).toBe('tank');
  expect(target.querySelector('[data-testid="drop-tank-profile-select"]')).not.toBeNull();

  const slider = target.querySelector('.goal-controls input[type="range"]');
  slider.value = '75';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.dropGoal.ehpWeight).toBeCloseTo(0.75);
  expect(target.querySelector('[data-testid="drop-tank-profile-select"]').value).toBe('max-tank'); // 0.75 matches a named profile

  rosterStore.setDropGoal({ kind: 'dps-fast', ehpWeight: 0.5 }); // cleanup
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  cleanup();
});

it('HPS is gone from the verdict entirely: no goal chip, no HPS context line (goals redesign)', () => {
  // A swap that trades Attack for Lifesteal used to flip under the HPS goal;
  // now it is simply a DPS downgrade and no HPS readout exists anywhere.
  rosterStore.setGearField(DEFAULT_SLOT, 0, 'attack', 5000);
  setDropField('lifesteal', 5);

  const card = () => target.querySelectorAll('.verdict-card')[0];
  expect(card().querySelector('.rows li').classList.contains('down')).toBe(true); // DPS goal
  expect(card().textContent).not.toContain('HPS');
  expect(goalButtons().some((b) => b.textContent.trim() === 'HPS')).toBe(false);

  rosterStore.setGearField(DEFAULT_SLOT, 0, 'attack', 0); // cleanup
  cleanup();
});

it('the DPS (sim) goal shows a pending row, then the debounced Monte Carlo pass resolves it', async () => {
  vi.useFakeTimers();
  try {
    setDropField('attack', 100000); // unambiguous upgrade
    clickGoal('DPS (sim)');

    const row = () => target.querySelectorAll('.verdict-card')[0].querySelector('.rows li');
    expect(row().querySelector('.glyph').textContent).toBe('~'); // interim estimate, sim pending
    expect(row().textContent).toContain('sim…');
    expect(row().classList.contains('up')).toBe(true); // fast interim already calls it an upgrade

    await vi.advanceTimersByTimeAsync(500); // past the 400ms debounce
    flushSync();
    expect(row().querySelector('.glyph').textContent).toBe('▲');
    expect(row().textContent).not.toContain('sim…');
    expect(row().classList.contains('up')).toBe(true);

    clickGoal('DPS'); // cleanup
  } finally {
    vi.useRealTimers();
  }
  cleanup();
});

it('discarding the drop resets the piece but keeps the selected slot', () => {
  setDropField('attack', 500);
  target.querySelector('.slot-chips .chip:nth-child(6)').click(); // an arbitrary non-default slot chip
  flushSync();
  const slot = rosterStore.current.drop.slot;

  target.querySelector('.discard-btn').click();
  flushSync();
  expect(rosterStore.current.drop.piece.attack).toBe(0);
  expect(rosterStore.current.drop.slot).toBe(slot);
  cleanup();
});

it('the bonus panel reflects the selected slot per loadout column', () => {
  rosterStore.setGearField(DEFAULT_SLOT, 0, 'lifesteal', 5); // Loadout 0's default-selected slot
  flushSync();
  const bonusPanels = [...target.querySelectorAll('.bonus-panel')];
  expect(bonusPanels[0].textContent).toContain('Lifesteal');
  expect(bonusPanels[1].textContent).toContain('No bonus stats');
  cleanup();
});

it('the core-stat slot summary never shows a leading "0" for a %-only piece', () => {
  rosterStore.setGearField(DEFAULT_SLOT, 0, 'attack_pct', 6.2); // no flat attack at all
  flushSync();
  const summary = target.querySelector('.slot-row.selected .slot-summary').textContent;
  expect(summary).toBe('+6.2% ATK');
  expect(summary).not.toContain('0');

  rosterStore.setGearField(DEFAULT_SLOT, 0, 'attack_pct', 0); // cleanup
  cleanup();
});

it('the core-stat slot summary shows both parts when flat and % are both set', () => {
  rosterStore.setGearField(DEFAULT_SLOT, 0, 'attack', 12664);
  rosterStore.setGearField(DEFAULT_SLOT, 0, 'attack_pct', 6.2);
  flushSync();
  const summary = target.querySelector('.slot-row.selected .slot-summary').textContent;
  expect(summary).toBe('12.664 +6.2% ATK');

  rosterStore.setGearField(DEFAULT_SLOT, 0, 'attack', 0); // cleanup
  rosterStore.setGearField(DEFAULT_SLOT, 0, 'attack_pct', 0);
  cleanup();
});
