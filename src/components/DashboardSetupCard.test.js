/**
 * Tests DashboardSetupCard.svelte - the linking-simulation setup + launch
 * UI. The orchestrator (linkingSimulation.js) is mocked so these assert the
 * wiring (enable gate, priority slider, progress panel, cancel, completion),
 * not the search itself (covered in linkingSimulation.test.js).
 */
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DashboardSetupCard from './DashboardSetupCard.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { runLinkingSimulation } from '../lib/linkingSimulation.js';

vi.mock('../lib/linkingSimulation.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, runLinkingSimulation: vi.fn() };
});

let target, app;
beforeEach(() => {
  localStorage.clear();
  runLinkingSimulation.mockReset();
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  unmount(app);
  target.remove();
  rosterStore.resetLinkingSim();
  rosterStore.setCharacterClass(rosterStore.current.id, null);
});

function mountCard() {
  app = mount(DashboardSetupCard, { target, props: { setStatus: () => {} } });
  flushSync();
}

/** Bring the character to linkingSetupReady: two linked presets fully set up. */
function makeReady() {
  const id = rosterStore.current.id;
  rosterStore.setCharacterClass(id, 'Sentinel');
  const [p0, p1] = rosterStore.current.presets;
  rosterStore.setPresetGoal(p0.id, { kind: 'dps' });
  rosterStore.setPresetGoal(p1.id, { kind: 'pvp' });
  rosterStore.setGearField('Weapon', 0, 'attack', 1000); // both seeded presets use loadout 0
  rosterStore.current.talentSets[0].spec = 'marksmanship';
  rosterStore.current.talentSets[0].allocation = { t: 1 };
}

async function waitFor(predicate, timeoutMs = 2000) {
  const start = Date.now();
  for (;;) {
    flushSync();
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

const initiateBtn = () => target.querySelector('[data-testid="initiate-linking"]');

it('Initiate is disabled until the character is ready, and the priority slider is present', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel'); // presets exist but unset
  mountCard();
  expect(initiateBtn().disabled).toBe(true);
  expect(target.querySelector('[data-testid="priority-slider"]')).not.toBeNull();
  unmount(app);

  makeReady();
  mountCard();
  expect(initiateBtn().disabled).toBe(false);
});

it('running shows the staged progress panel, then completion persists the outcome', async () => {
  makeReady();
  let resolveRun;
  let captured = {};
  runLinkingSimulation.mockImplementation(({ onStage, signal, priority }) => {
    captured = { onStage, signal, priority };
    return new Promise((resolve) => (resolveRun = resolve));
  });
  mountCard();

  initiateBtn().click();
  await waitFor(() => target.querySelector('[data-testid="linking-progress"]'));
  expect(captured.priority).toBe(50); // default slider position

  captured.onStage({ stage: 1, total: 4, presetName: 'Preset 2', path: 'shadow', progress: { phase: 'search', evals: 1234, bestScore: 42 } });
  flushSync();
  const panel = target.querySelector('[data-testid="linking-progress"]');
  expect(panel.textContent).toContain('2 / 4');
  expect(panel.textContent).toContain('Preset 2');
  expect(panel.textContent).toContain('Shadow Path');
  expect(panel.textContent).toContain('1,234');

  resolveRun({ completedAt: '2026-07-20T10:00:00.000Z', lockedPath: 'shadow', priority: 50, presets: [] });
  await waitFor(() => rosterStore.current.linkingSim !== null);
  expect(rosterStore.current.linkingSim.lockedPath).toBe('shadow');
});

it('Cancel aborts the in-flight run via the signal and discards (linkingSim stays null)', async () => {
  makeReady();
  runLinkingSimulation.mockImplementation(
    ({ signal }) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ aborted: true })))
  );
  mountCard();

  initiateBtn().click();
  await waitFor(() => target.querySelector('[data-testid="cancel-linking"]'));
  target.querySelector('[data-testid="cancel-linking"]').click();
  await waitFor(() => target.querySelector('[data-testid="initiate-linking"]')); // back to the launch state
  expect(rosterStore.current.linkingSim).toBe(null);
});
