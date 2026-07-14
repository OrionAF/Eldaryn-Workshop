/**
 * Tests SimulationScreen.svelte - guard rails, the sim run flow, and the
 * optimizer flow rendering a SimulatedPresetCard. Engine/optimizer math is
 * covered in simulation.test.js / optimizer.test.js; this is the wiring.
 */
import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SimulationScreen from './SimulationScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;

function mountScreen() {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(SimulationScreen, { target, props: {} });
  flushSync();
}

function cleanup() {
  unmount(app);
  target.remove();
}

/** Wait until `predicate()` is true (the screen defers work to macrotasks). */
async function waitFor(predicate, timeoutMs = 10000) {
  const start = Date.now();
  for (;;) {
    flushSync();
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

beforeEach(() => {
  localStorage.clear();
});

it('shows the class guard when the character has no class', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, null);
  mountScreen();
  expect(target.textContent).toContain('Choose a class');
  cleanup();
});

it('renders sim and optimizer controls once a class is set', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  mountScreen();
  expect(target.textContent).toContain('Battle Simulation');
  expect(target.textContent).toContain('Build Optimizer');
  expect([...target.querySelectorAll('button')].some((b) => b.textContent.includes('Run Simulation'))).toBe(true);
  cleanup();
});

it('running the simulation renders the results panel with the distribution', async () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  mountScreen();

  [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Run Simulation')).click();
  await waitFor(() => target.querySelector('[data-testid="sim-results"]'));

  const text = target.querySelector('[data-testid="sim-results"]').textContent;
  expect(text).toContain('Mean DPS');
  expect(text).toContain('Expected DPS');
  expect(text).toContain('median');
  expect(text).toContain('best run');
  cleanup();
});

it('Sentinel has no Goal picker (the Tank goal is Warrior-only)', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  mountScreen();
  expect([...target.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Tank')).toBe(false);
  cleanup();
});

it('Warrior gets a Goal picker; a Tank-goal run shows the tank breakdown and scores in Tank Score', async () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  // Something tanky for the optimizer to find: an unused pure-survivability pet.
  rosterStore.addPet('Bulwark Pet', 'Common', { health_pct: 50 });
  mountScreen();

  const tankBtn = [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tank');
  expect(tankBtn).toBeTruthy();
  tankBtn.click();
  flushSync();
  // The Tank goal swaps the DPS scoring toggle for profile + balance controls.
  expect(target.querySelector('[data-testid="tank-profile-select"]')).not.toBeNull();
  expect(target.textContent).not.toContain('sim-verified');

  const optSelect = target.querySelector('[data-testid="opt-preset-select"]');
  optSelect.value = rosterStore.current.presets[0].id;
  optSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Find Best Build')).click();
  await waitFor(() => target.querySelector('[data-testid="simulated-preset-card"]'));

  const breakdown = target.querySelector('[data-testid="tank-breakdown"]');
  expect(breakdown).not.toBeNull();
  expect(breakdown.textContent).toContain('Effective HP');
  expect(breakdown.textContent).toContain('Sustainable Incoming DPS');
  expect(target.querySelector('[data-testid="simulated-preset-card"]').textContent).toContain('Tank Score');
  cleanup();
});

it('running the optimizer renders a Simulated Preset card with a changes list and read-only tree board', async () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  // Give the optimizer something to find: a strictly-better unused pet, and
  // a transcendence board with a defensive detour (13:24) that a free reset
  // re-routes into offense - which makes the card render the tree board.
  rosterStore.addPet('Attack Pet', 'Common', { attack_pct: 25 });
  rosterStore.setTranscendenceNode('14:25', true);
  rosterStore.setTranscendenceNode('14:24', true);
  rosterStore.setTranscendenceNode('13:24', true);
  mountScreen();

  // The optimizer requires an explicit preset choice - its button is
  // disabled until one is picked.
  const findBest = () => [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Find Best Build'));
  expect(findBest().disabled).toBe(true);
  const optSelect = target.querySelector('[data-testid="opt-preset-select"]');
  optSelect.value = rosterStore.current.presets[0].id;
  optSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(findBest().disabled).toBe(false);

  findBest().click();
  await waitFor(() => target.querySelector('[data-testid="simulated-preset-card"]'));

  const card = target.querySelector('[data-testid="simulated-preset-card"]');
  expect(card.textContent).toContain('Simulated Preset');
  expect(card.textContent).toContain('What to change');
  // The apply UI names the target preset and offers a new-preset option.
  expect(card.textContent).toContain('Override Preset');
  expect(card.textContent).toContain('(optimized from)');
  expect(card.textContent).toContain('Create new preset');
  // The rebuilt board renders as the read-only pan/zoom grid, not a text list.
  expect(card.textContent).toContain('rebuild to match this board');
  expect(card.querySelector('.viewport')).not.toBeNull();
  cleanup();
});

it('Save Result snapshots a sim run into the Saved Results rail; deleting needs a confirm click', async () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  mountScreen();

  const rail = target.querySelector('[data-testid="saved-results"]');
  expect(rail.textContent).toContain('Nothing saved yet');

  [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Run Simulation')).click();
  await waitFor(() => target.querySelector('[data-testid="sim-results"]'));
  target.querySelector('[data-testid="save-sim-result"]').click();
  flushSync();

  expect(rosterStore.current.savedResults).toHaveLength(1);
  expect(rosterStore.current.savedResults[0].kind).toBe('sim');
  // The new entry auto-expands, showing the snapshot numbers and the seed.
  expect(rail.textContent).toContain('Mean DPS');
  expect(rail.textContent).toContain('Seed (replayable)');
  // ...plus the build configuration as simulated, one line per dimension.
  const config = rail.querySelector('[data-testid="saved-config"]');
  expect(config).not.toBeNull();
  expect(config.textContent).toContain('Gear Loadout');
  expect(config.textContent).toContain('Transcendence');
  expect(rosterStore.current.savedResults[0].summary.config.every((l) => typeof l.value === 'string')).toBe(true);

  // Two-click delete: the first click only arms the confirm state.
  [...rail.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete').click();
  flushSync();
  expect(rosterStore.current.savedResults).toHaveLength(1);
  [...rail.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Confirm delete').click();
  flushSync();
  expect(rosterStore.current.savedResults).toHaveLength(0);
  expect(rail.textContent).toContain('Nothing saved yet');
  cleanup();
});

it('Save Result on an optimizer run stores the change list and survives a character switch away and back', async () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  const originalId = rosterStore.current.id;
  rosterStore.setGearField('Weapon', 0, 'attack', 100);
  mountScreen();

  const optSelect = target.querySelector('[data-testid="opt-preset-select"]');
  optSelect.value = rosterStore.current.presets[0].id;
  optSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Find Best Build')).click();
  await waitFor(() => target.querySelector('[data-testid="save-opt-result"]'));
  target.querySelector('[data-testid="save-opt-result"]').click();
  flushSync();

  expect(rosterStore.current.savedResults).toHaveLength(1);
  const entry = rosterStore.current.savedResults[0];
  expect(entry.kind).toBe('opt');
  expect(entry.summary.goal).toBe('dps');
  expect(entry.summary.bestScore).toBeGreaterThan(0);
  // Opt saves snapshot the RECOMMENDED build's configuration.
  expect(entry.summary.config.length).toBeGreaterThan(0);
  expect(target.querySelector('[data-testid="saved-config"]').textContent).toContain('Recommended configuration');

  // Saved results are per-character state: switching away and back keeps them
  // (unlike the view-state result panels, which reset).
  rosterStore.addCharacter('Someone Else');
  flushSync();
  expect(target.querySelector('[data-testid="saved-results"]')?.textContent || '').not.toContain(entry.name);
  rosterStore.selectCharacter(originalId);
  flushSync();
  expect(target.querySelector('[data-testid="saved-results"]').textContent).toContain('Opt');
  expect(rosterStore.current.savedResults).toHaveLength(1);
  cleanup();
});
