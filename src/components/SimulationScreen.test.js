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

  [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Find Best Build')).click();
  await waitFor(() => target.querySelector('[data-testid="simulated-preset-card"]'));

  const card = target.querySelector('[data-testid="simulated-preset-card"]');
  expect(card.textContent).toContain('Simulated Preset');
  expect(card.textContent).toContain('What to change');
  expect(card.textContent).toContain('nothing is saved');
  // The rebuilt board renders as the read-only pan/zoom grid, not a text list.
  expect(card.textContent).toContain('rebuild to match this board');
  expect(card.querySelector('.viewport')).not.toBeNull();
  cleanup();
});
