import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SimulationsDashboard from './SimulationsDashboard.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(SimulationsDashboard, { target, props: { setStatus: () => {} } });
  flushSync();
});

afterEach(() => {
  unmount(app);
  target.remove();
  rosterStore.resetLinkingSim();
  rosterStore.setCharacterClass(rosterStore.current.id, null);
});

it('shows the setup card (not the report) while linkingSim is null, always with the run-history hub', () => {
  expect(target.querySelector('[data-testid="dashboard-setup"]')).not.toBeNull();
  expect(target.querySelector('[data-testid="linking-report"]')).toBeNull();
  expect(target.querySelector('[data-testid="run-history"]')).not.toBeNull();
});

it('swaps the setup card for the report once linkingSim is set', () => {
  rosterStore.current.linkingSim = {
    completedAt: '2026-07-20T10:00:00.000Z',
    lockedPath: 'shadow',
    reasoning: 'Shadow Path is the shared lock.',
    regret: { shadow: 0.05, radiant: 0.2 },
    presets: [],
  };
  flushSync();
  expect(target.querySelector('[data-testid="dashboard-setup"]')).toBeNull();
  expect(target.querySelector('[data-testid="linking-report"]')).not.toBeNull();
  expect(target.querySelector('[data-testid="run-history"]')).not.toBeNull(); // hub stays
});
