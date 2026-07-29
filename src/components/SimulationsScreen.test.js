/**
 * Tests SimulationsScreen.svelte - the tab shell. Tab content behavior is
 * covered by SimulationScreen.test.js / PvpScreen.test.js; this is tab
 * derivation, keep-alive mounting, and fallback wiring.
 */
import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SimulationsScreen from './SimulationsScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(SimulationsScreen, { target, props: {} });
  flushSync();
});

afterEach(() => {
  unmount(app);
  target.remove();
  for (const p of rosterStore.current.presets) rosterStore.setPresetGoal(p.id, { kind: null });
  for (const r of [...(rosterStore.current.runHistory || [])]) rosterStore.deleteRunEntry(r.id);
});

const tabLabels = () => [...target.querySelectorAll('[role="tab"]')].map((b) => b.textContent.trim());
const clickTab = (label) => {
  [...target.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === label).click();
  flushSync();
};

it('shows only the Dashboard tab while no preset has a goal, with the Dashboard active', () => {
  expect(tabLabels()).toEqual(['Dashboard']);
  expect(target.querySelector('[data-testid="dashboard-setup"]')).not.toBeNull();
  expect(target.querySelector('[data-testid="run-history"]')).not.toBeNull();
});

it('derives one deduped tab per assigned goal kind + a named tab per Custom preset', () => {
  const [a, b] = rosterStore.current.presets;
  rosterStore.setPresetGoal(a.id, { kind: 'dps' });
  rosterStore.setPresetGoal(b.id, { kind: 'pvp' });
  flushSync();
  expect(tabLabels()).toEqual(['Dashboard', 'DPS', 'PVP']);

  const customId = rosterStore.addPreset();
  rosterStore.setPresetGoal(customId, { kind: 'custom', name: 'Farm Blend' });
  flushSync();
  expect(tabLabels()).toEqual(['Dashboard', 'DPS', 'PVP', 'Farm Blend']);

  // Dedupe: a second DPS preset does not add a second DPS tab.
  rosterStore.setPresetGoal(b.id, { kind: 'dps' });
  flushSync();
  expect(tabLabels()).toEqual(['Dashboard', 'DPS', 'Farm Blend']);

  rosterStore.deletePreset(customId); // cleanup
});

it('a visited tab stays mounted (hidden) after switching away - keep-alive for in-flight searches', () => {
  rosterStore.setPresetGoal(rosterStore.current.presets[0].id, { kind: 'dps' });
  flushSync();

  clickTab('DPS');
  const panels = () => [...target.querySelectorAll('[role="tabpanel"]')];
  expect(panels().length).toBe(2); // Dashboard + DPS both mounted
  expect(target.textContent).toContain('Battle Simulation');

  clickTab('Dashboard');
  expect(panels().length).toBe(2); // DPS stays mounted...
  const hidden = panels().filter((p) => p.hidden);
  expect(hidden.length).toBe(1); // ...just hidden
  expect(hidden[0].textContent).toContain('Battle Simulation');
});

it('a vanished tab (goal unassigned) falls back to the Dashboard and unmounts', () => {
  const presetId = rosterStore.current.presets[0].id;
  rosterStore.setPresetGoal(presetId, { kind: 'pvp' });
  flushSync();
  clickTab('PVP');
  expect([...target.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === 'PVP').getAttribute('aria-selected')).toBe('true');

  rosterStore.setPresetGoal(presetId, { kind: null });
  flushSync();
  expect(tabLabels()).toEqual(['Dashboard']);
  expect(target.querySelectorAll('[role="tabpanel"]').length).toBe(1);
  expect(target.querySelector('[data-testid="dashboard-setup"]')).not.toBeNull();
});

it('goal tabs filter the embedded preset pickers to matching presets', () => {
  const [a] = rosterStore.current.presets;
  rosterStore.setPresetGoal(a.id, { kind: 'dps' });
  flushSync();
  clickTab('DPS');

  const optSelect = target.querySelector('[data-testid="opt-preset-select"]');
  const optionLabels = [...optSelect.querySelectorAll('option')].filter((o) => !o.disabled).map((o) => o.textContent);
  expect(optionLabels).toEqual([a.name]); // only the DPS-goal preset
});
