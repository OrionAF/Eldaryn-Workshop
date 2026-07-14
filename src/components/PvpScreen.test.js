import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PvpScreen from './PvpScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { SIGILS_BY_CLASS } from '../lib/sigilsData.js';
import { PRESET_SIGIL_CAP } from '../lib/constants.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(PvpScreen, { target, props: {} });
  flushSync();
});

afterEach(() => {
  unmount(app);
  target.remove();
  for (const o of [...(rosterStore.current.pvpOpponents || [])]) rosterStore.deleteOpponent(o.id);
  for (const r of [...(rosterStore.current.savedResults || [])]) rosterStore.deleteSavedResult(r.id);
  rosterStore.setCharacterClass(rosterStore.current.id, null);
});

function setClass(cls = 'Warrior') {
  rosterStore.setCharacterClass(rosterStore.current.id, cls);
  flushSync();
}

it('shows an onboarding hint with no class chosen', () => {
  expect(target.querySelector('.empty-hint')).not.toBeNull();
});

it('adding an opponent renders the class picker; stats/sigils appear once a class is set', () => {
  setClass();
  target.querySelector('.opp-header button').click();
  flushSync();

  expect(rosterStore.current.pvpOpponents.length).toBe(1);
  expect(target.querySelector('.stat-grid')).toBeNull(); // no class yet

  const classSelect = target.querySelector('.class-control select');
  classSelect.value = 'Sentinel';
  classSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  expect(rosterStore.current.pvpOpponents[0].class).toBe('Sentinel');
  expect(target.querySelector('.stat-grid')).not.toBeNull();
  // Passive-only sigils are hidden - their stats live in the entered totals.
  expect(target.querySelectorAll('.sigil-row').length).toBe(
    SIGILS_BY_CLASS.Sentinel.filter((d) => d.active).length
  );
});

it('entering an opponent stat writes through the flat/pct parsing convention', () => {
  setClass();
  target.querySelector('.opp-header button').click();
  flushSync();
  const classSelect = target.querySelector('.class-control select');
  classSelect.value = 'Warrior';
  classSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  const inputs = [...target.querySelectorAll('.stat-grid input')];
  const labels = [...target.querySelectorAll('.stat-grid .micro-label')].map((l) => l.textContent);
  const attackInput = inputs[labels.indexOf('Attack')];
  attackInput.value = '48.124'; // game-style thousands separator
  attackInput.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.pvpOpponents[0].stats.attack).toBe(48124);
});

it('equipping opponent sigils enforces the cap and stores entered values', () => {
  setClass();
  target.querySelector('.opp-header button').click();
  flushSync();
  const classSelect = target.querySelector('.class-control select');
  classSelect.value = 'Warrior';
  classSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  // The list only contains active-effect sigils; equipping a 4th is rejected.
  const boxes = [...target.querySelectorAll('.sigil-row input[type="checkbox"]')].slice(0, PRESET_SIGIL_CAP + 1);
  for (const box of boxes) {
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
  }
  expect(rosterStore.current.pvpOpponents[0].sigilIds.length).toBe(PRESET_SIGIL_CAP);
});

async function waitFor(predicate, timeoutMs = 10000) {
  const start = Date.now();
  for (;;) {
    flushSync();
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

function optimizeButton() {
  return [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Optimize for This Matchup'));
}

function selectOptimizerPreset() {
  const optSelect = target.querySelector('[data-testid="opt-preset-select"]');
  optSelect.value = rosterStore.current.presets[0].id;
  optSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

it('renders the Build Optimizer panel; its button is disabled until a preset is picked and the opponent has a class', () => {
  setClass();
  expect(optimizeButton()).not.toBeUndefined();
  expect(optimizeButton().disabled).toBe(true);
  // Per-dimension search locks render; Awakening starts LOCKED (resets cost
  // real resources in-game), everything else starts searchable.
  const dimBoxes = [...target.querySelectorAll('.dims .dim-toggle')];
  expect(dimBoxes.length).toBe(10);
  for (const dim of dimBoxes) {
    const box = dim.querySelector('input[type="checkbox"]');
    expect(box.checked).toBe(!dim.textContent.includes('Awakening'));
  }

  target.querySelector('.opp-header button').click();
  flushSync();
  const classSelect = target.querySelector('.class-control select');
  classSelect.value = 'Warrior';
  classSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  // Still disabled - the optimizer needs an explicit preset choice too.
  expect(optimizeButton().disabled).toBe(true);
  selectOptimizerPreset();
  expect(optimizeButton().disabled).toBe(false);
});

it('running the optimizer shows verified win chances and a Simulated Preset card', async () => {
  setClass();
  target.querySelector('.opp-header button').click();
  flushSync();
  const classSelect = target.querySelector('.class-control select');
  classSelect.value = 'Warrior';
  classSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  // A lethal opponent vs an empty character (1 HP) keeps every simulated
  // duel one swing long, so the full search stays fast in this test.
  const inputs = [...target.querySelectorAll('.stat-grid input')];
  const labels = [...target.querySelectorAll('.stat-grid .micro-label')].map((l) => l.textContent);
  const attackInput = inputs[labels.indexOf('Attack')];
  attackInput.value = '500';
  attackInput.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  selectOptimizerPreset();
  optimizeButton().click();
  await waitFor(() => target.querySelector('[data-testid="pvp-opt-results"]'));

  const results = target.querySelector('[data-testid="pvp-opt-results"]');
  expect(results.textContent).toContain('Win Chance Now');
  expect(results.textContent).toContain('Win Chance Optimized');
  expect(results.querySelector('[data-testid="simulated-preset-card"]')).not.toBeNull();
  expect(results.textContent).toContain('% win');

  // Save Result snapshots the verified before/after and the recommended config.
  target.querySelector('[data-testid="save-pvp-opt-result"]').click();
  flushSync();
  expect(rosterStore.current.savedResults).toHaveLength(1);
  const entry = rosterStore.current.savedResults[0];
  expect(entry.kind).toBe('pvp-opt');
  expect(typeof entry.summary.beforeWinRate).toBe('number');
  expect(typeof entry.summary.afterWinRate).toBe('number');
  expect(entry.summary.config.length).toBeGreaterThan(0);
  const rail = target.querySelector('[data-testid="saved-results"]');
  expect(rail.textContent).toContain('PVP Opt');
});

it('a duel can be saved to the rail and re-run from the snapshot with the same seed and numbers', async () => {
  setClass();
  target.querySelector('.opp-header button').click();
  flushSync();
  const classSelect = target.querySelector('.class-control select');
  classSelect.value = 'Warrior';
  classSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  // Give the opponent some attack so duels resolve quickly.
  const inputs = [...target.querySelectorAll('.stat-grid input')];
  const labels = [...target.querySelectorAll('.stat-grid .micro-label')].map((l) => l.textContent);
  const attackInput = inputs[labels.indexOf('Attack')];
  attackInput.value = '500';
  attackInput.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  target.querySelector('.run-btn').click();
  await waitFor(() => target.querySelector('[data-testid="pvp-results"]'));

  target.querySelector('[data-testid="save-pvp-sim-result"]').click();
  flushSync();
  expect(rosterStore.current.savedResults).toHaveLength(1);
  const entry = rosterStore.current.savedResults[0];
  expect(entry.kind).toBe('pvp-sim');
  expect(typeof entry.summary.seed).toBe('number');
  expect(typeof entry.summary.winRate).toBe('number');
  expect(entry.summary.config.length).toBeGreaterThan(0);
  const savedWinRate = entry.summary.winRate;

  // Saving auto-expands the entry in the rail, showing the seed.
  const rail = target.querySelector('[data-testid="saved-results"]');
  expect(rail.textContent).toContain('Seed (replayable)');

  // Re-run restores the matchup + seed and reproduces the exact numbers.
  rail.querySelector('[data-testid="saved-rerun"]').click();
  await waitFor(() => target.querySelector('[data-testid="pvp-results"]'));
  const text = target.querySelector('[data-testid="pvp-results"]').textContent;
  expect(text).toContain(`seed ${entry.summary.seed}`);
  expect(text).toContain(savedWinRate.toFixed(1));
});

it('Run Matrix fights every preset against every classed opponent and renders the grid', async () => {
  setClass();
  target.querySelector('.opp-header button').click();
  flushSync();
  const classSelect = target.querySelector('.class-control select');
  classSelect.value = 'Warrior';
  classSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  const inputs = [...target.querySelectorAll('.stat-grid input')];
  const labels = [...target.querySelectorAll('.stat-grid .micro-label')].map((l) => l.textContent);
  const attackInput = inputs[labels.indexOf('Attack')];
  attackInput.value = '500';
  attackInput.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  target.querySelector('[data-testid="run-matrix"]').click();
  await waitFor(() => target.querySelector('[data-testid="matrix-results"]'));

  const table = target.querySelector('[data-testid="matrix-results"] table');
  const bodyRows = [...table.querySelectorAll('tbody tr')];
  expect(bodyRows).toHaveLength(rosterStore.current.presets.length);
  // Every cell shows a win percentage.
  for (const row of bodyRows) {
    for (const cell of row.querySelectorAll('td')) expect(cell.textContent).toMatch(/%|—/);
  }
});

it('the Run button is disabled until the opponent has a class', () => {
  setClass();
  target.querySelector('.opp-header button').click();
  flushSync();
  expect(target.querySelector('.run-btn').disabled).toBe(true);

  const classSelect = target.querySelector('.class-control select');
  classSelect.value = 'Warrior';
  classSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(target.querySelector('.run-btn').disabled).toBe(false);
});
