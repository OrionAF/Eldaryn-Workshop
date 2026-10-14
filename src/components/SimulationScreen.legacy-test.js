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

it('the local Goal toggle is gone; a PVP-goal preset runs the closed-form blend and scores in PVP Score', async () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  // Something for the PVP objective to find: an unused pure-survivability pet.
  rosterStore.addPet('Bulky Pet', 'Common', { health_pct: 50 });
  const presetId = rosterStore.current.presets[0].id;
  rosterStore.setPresetGoal(presetId, { kind: 'pvp', weights: { damage: 20, mitigation: 20, survivability: 60 } });
  mountScreen();

  // No dps/tank toggle buttons anywhere - the goal comes from the preset.
  expect([...target.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Tank')).toBe(false);

  const optSelect = target.querySelector('[data-testid="opt-preset-select"]');
  optSelect.value = presetId;
  optSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  // Readout shows the goal plus its slider split; the fast/accurate scoring
  // toggle is DPS-only and hidden here (closed-form single-stage).
  expect(target.querySelector('[data-testid="opt-goal-readout"]').textContent.trim()).toBe('PVP · 20/20/60');
  expect(target.textContent).not.toContain('sim-verified');
  expect(target.querySelector('[data-testid="goal-unsupported-notice"]')).toBeNull();

  const runBtn = [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Find Best Build'));
  expect(runBtn.disabled).toBe(false);
  runBtn.click();
  await waitFor(() => target.querySelector('[data-testid="simulated-preset-card"]'));

  const breakdown = target.querySelector('[data-testid="pvp-breakdown"]');
  expect(breakdown).not.toBeNull();
  expect(breakdown.textContent).toContain('Maximum Damage');
  expect(breakdown.textContent).toContain('Damage Mitigation');
  expect(breakdown.textContent).toContain('Survivability');
  expect(target.querySelector('[data-testid="simulated-preset-card"]').textContent).toContain('PVP Score');

  rosterStore.setPresetGoal(presetId, { kind: null }); // cleanup
  cleanup();
});

it('a Warrior preset assigned the Tank goal drives the tank controls from the preset and scores in Tank Score', async () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  // Something tanky for the optimizer to find: an unused pure-survivability pet.
  rosterStore.addPet('Bulwark Pet', 'Common', { health_pct: 50 });
  const presetId = rosterStore.current.presets[0].id;
  rosterStore.setPresetGoal(presetId, { kind: 'tank' });
  mountScreen();

  // Tank controls appear once the tank-goal preset is selected to optimize.
  const optSelect = target.querySelector('[data-testid="opt-preset-select"]');
  optSelect.value = presetId;
  optSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(target.querySelector('[data-testid="opt-goal-readout"]').textContent.trim()).toBe('Tank');
  expect(target.querySelector('[data-testid="tank-profile-select"]')).not.toBeNull();
  expect(target.textContent).not.toContain('sim-verified');

  // The balance slider writes through to the preset's persisted goal.
  const slider = target.querySelector('input[aria-label="EHP versus sustain balance"]');
  slider.value = '75';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.presets[0].goal.ehpWeight).toBeCloseTo(0.75);
  expect(target.querySelector('[data-testid="tank-profile-select"]').value).toBe('max-tank'); // matches a named profile

  [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Find Best Build')).click();
  await waitFor(() => target.querySelector('[data-testid="simulated-preset-card"]'));

  const breakdown = target.querySelector('[data-testid="tank-breakdown"]');
  expect(breakdown).not.toBeNull();
  expect(breakdown.textContent).toContain('Effective HP');
  expect(breakdown.textContent).toContain('Sustainable Incoming DPS');
  expect(target.querySelector('[data-testid="simulated-preset-card"]').textContent).toContain('Tank Score');

  rosterStore.setPresetGoal(presetId, { kind: null, ehpWeight: 0.5 }); // cleanup
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

function clearRunHistory() {
  for (const r of [...rosterStore.current.runHistory]) rosterStore.deleteRunEntry(r.id);
}

it('a completed sim run auto-saves a run-history entry with headline, detail, and no Save button', async () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  clearRunHistory();
  mountScreen();

  expect([...target.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Save Result')).toBe(false);

  [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Run Simulation')).click();
  await waitFor(() => target.querySelector('[data-testid="sim-results"]'));

  expect(rosterStore.current.runHistory).toHaveLength(1);
  const entry = rosterStore.current.runHistory[0];
  expect(entry.kind).toBe('sim');
  expect(entry.presetName).toBe(rosterStore.current.presets[0].name);
  expect(entry.headline.meanDps).toBeGreaterThanOrEqual(0);
  expect(entry.headline.iterations).toBeGreaterThan(0);
  // The full payload keeps the distribution + the build configuration as
  // display strings, one line per dimension.
  expect(entry.detail.histogram.bins.length).toBeGreaterThan(0);
  expect(entry.detail.config.every((l) => typeof l.value === 'string')).toBe(true);
  clearRunHistory();
  cleanup();
});

it('a finished optimizer run auto-saves an opt entry that survives a character switch away and back', async () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  const originalId = rosterStore.current.id;
  rosterStore.setGearField('Weapon', 0, 'attack', 100);
  clearRunHistory();
  mountScreen();

  const optSelect = target.querySelector('[data-testid="opt-preset-select"]');
  optSelect.value = rosterStore.current.presets[0].id;
  optSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Find Best Build')).click();
  await waitFor(() => target.querySelector('[data-testid="simulated-preset-card"]'));

  expect(rosterStore.current.runHistory).toHaveLength(1);
  const entry = rosterStore.current.runHistory[0];
  expect(entry.kind).toBe('opt');
  expect(entry.goalKind).toBe(null); // seeded preset - goal unassigned
  expect(entry.headline.unit).toBe('DPS');
  expect(entry.headline.best).toBeGreaterThan(0);
  // Opt entries snapshot the RECOMMENDED build's configuration.
  expect(entry.detail.config.length).toBeGreaterThan(0);

  // Run history is per-character state: switching away and back keeps it
  // (unlike the view-state result panels, which reset).
  rosterStore.addCharacter('Someone Else');
  flushSync();
  expect(rosterStore.current.runHistory).toHaveLength(0);
  rosterStore.selectCharacter(originalId);
  flushSync();
  expect(rosterStore.current.runHistory).toHaveLength(1);
  clearRunHistory();
  cleanup();
});
