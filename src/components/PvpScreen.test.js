import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PvpScreen from './PvpScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { SIGILS_BY_CLASS } from '../lib/sigilsData.js';
import { PRESET_SIGIL_CAP } from '../lib/constants.js';
import { runGauntlet } from '../lib/pvpGauntlet.js';

// The gauntlet engine is unit-tested in pvpGauntlet.test.js; here it's mocked
// so the PvpScreen test asserts wiring (button/progress/cancel/auto-save) only.
vi.mock('../lib/pvpGauntlet.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, runGauntlet: vi.fn() };
});

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
  for (const r of [...(rosterStore.current.runHistory || [])]) rosterStore.deleteRunEntry(r.id);
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

  // The finished search auto-saved a pvp-opt entry with the verified
  // before/after and the recommended config - no Save button exists.
  expect([...target.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Save Result')).toBe(false);
  const entry = rosterStore.current.runHistory.find((r) => r.kind === 'pvp-opt');
  expect(entry).toBeDefined();
  expect(typeof entry.headline.baselineWinRate).toBe('number');
  expect(typeof entry.headline.bestWinRate).toBe('number');
  expect(typeof entry.detail.beforeWinRate).toBe('number');
  expect(entry.detail.config.length).toBeGreaterThan(0);
});

it('validates the optimizer finalists against the archetype gauntlet: cancel discards, completion renders + auto-saves', async () => {
  runGauntlet.mockReset();
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

  selectOptimizerPreset();
  optimizeButton().click();
  await waitFor(() => target.querySelector('[data-testid="pvp-opt-results"]'));

  // The gauntlet controls appear with the optimizer result.
  expect(target.querySelector('[data-testid="validate-gauntlet"]')).not.toBeNull();
  expect(target.querySelector('[data-testid="gauntlet-budget"]')).not.toBeNull();

  // Cancel flow: the run aborts via the injected signal and discards.
  runGauntlet.mockImplementation(({ signal }) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ aborted: true }))));
  target.querySelector('[data-testid="validate-gauntlet"]').click();
  await waitFor(() => target.querySelector('[data-testid="cancel-gauntlet"]'));
  target.querySelector('[data-testid="cancel-gauntlet"]').click();
  await waitFor(() => target.querySelector('[data-testid="validate-gauntlet"]')); // back to the launch state
  expect(target.querySelector('[data-testid="gauntlet-result"]')).toBeNull();
  expect(rosterStore.current.runHistory.some((r) => r.kind === 'pvp-gauntlet')).toBe(false);

  // Completion flow: a finalist that receives finalists renders the panel + auto-saves.
  let capturedFinalists = null;
  runGauntlet.mockImplementation(({ finalists }) => {
    capturedFinalists = finalists;
    return Promise.resolve({
      budget: 60000,
      iterations: 200,
      finalists: [{ index: 0, score: 100, overallWinRate: 55, ci: 2, perArchetype: [{ archetypeId: 'w-berserker', name: 'Berserker', class: 'Warrior', winRate: 55, ci: 4 }] }],
      contradiction: { flagged: false, message: 'agree' },
    });
  });
  target.querySelector('[data-testid="validate-gauntlet"]').click();
  await waitFor(() => target.querySelector('[data-testid="gauntlet-result"]'));

  expect(capturedFinalists.length).toBeGreaterThan(0); // best + runner-ups passed in
  expect(capturedFinalists[0].candidate).toBeTruthy();
  const gEntry = rosterStore.current.runHistory.find((r) => r.kind === 'pvp-gauntlet');
  expect(gEntry).toBeDefined();
  expect(gEntry.headline.bestWinRate).toBeCloseTo(55);
  expect(gEntry.detail.finalists[0].label).toBe('Recommended');
});

it('a finished duel batch auto-saves a pvp-sim entry; the sample fight adds a traced entry with a capped timeline', async () => {
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

  // The batch auto-saved itself - no Save button.
  expect(rosterStore.current.runHistory).toHaveLength(1);
  const entry = rosterStore.current.runHistory[0];
  expect(entry.kind).toBe('pvp-sim');
  expect(typeof entry.detail.seed).toBe('number');
  expect(typeof entry.headline.winRate).toBe('number');
  expect(entry.detail.config.length).toBeGreaterThan(0);

  // The traced sample fight records its own entry carrying the timeline.
  target.querySelector('[data-testid="show-sample-fight"]').click();
  flushSync();
  expect(rosterStore.current.runHistory).toHaveLength(2);
  const sample = rosterStore.current.runHistory[0];
  expect(sample.kind).toBe('pvp-sim');
  expect(sample.headline.sample).toBe(true);
  expect(sample.detail.traced).toBe(true);
  expect(Array.isArray(sample.detail.timeline)).toBe(true);
  expect(sample.detail.timeline.length).toBeGreaterThan(0);
  expect(sample.detail.timeline.length).toBeLessThanOrEqual(400);
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
