import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TranscendenceScreen from './CharacterTranscendencePage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';

let target, app, statuses;

function render() {
  target = document.createElement('div');
  document.body.appendChild(target);
  statuses = [];
  app = mount(TranscendenceScreen, { target, props: { setStatus: (m) => statuses.push(m) } });
  flushSync();
}

beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Tr', 'WARRIOR');
});
afterEach(() => {
  unmount(app);
  target.remove();
});

const node = (label) => target.querySelector(`button[aria-label*="${label}"]`);

it('renders the whole board and starts empty', () => {
  render();
  expect(target.querySelectorAll('button.tnode')).toHaveLength(279);
  expect(target.textContent).toContain('Ichor in use');
});

it('click allocates a reachable node and toasts on an unreachable one', () => {
  render();
  node('at 0,-1').click();
  flushSync();
  expect(rosterStore.current.transcendence.presets[0].allocatedNodeIds).toEqual(['n_0,-1']);
  expect(target.querySelector('.bonus-list')).not.toBeNull();
  node('at 4,-7').click();
  flushSync();
  expect(statuses).toContain('Allocate an adjacent node first');
  node('at 0,-1').click();
  flushSync();
  expect(rosterStore.current.transcendence.presets[0].allocatedNodeIds).toEqual([]);
});

it('adds and switches presets', () => {
  render();
  [...target.querySelectorAll('button')].find((b) => b.textContent.includes("+ Board")).click();
  flushSync();
  expect(target.querySelectorAll('[role="tab"]')).toHaveLength(2);
  expect(rosterStore.current.transcendence.activePresetId).not.toBe('default');
});

it('Used by names linked presets and the presets that follow the active board', () => {
  const [p0, p1] = rosterStore.current.presets;
  const b = rosterStore.addTranscendencePreset('Second');
  rosterStore.setPresetTranscendence(p0.id, 'default');
  rosterStore.setActiveTranscendencePreset(b);
  render();
  const used = target.querySelector('[data-testid="board-used-by"]').textContent;
  expect(used).toContain(p1.name);
  expect(used).toMatch(/follow/i);
  expect(used).not.toContain(p0.name);
  const tabs = [...target.querySelectorAll('[role="tab"]')];
  tabs.find((t) => t.textContent.includes('Default')).click();
  flushSync();
  const used0 = target.querySelector('[data-testid="board-used-by"]').textContent;
  expect(used0).toContain(p0.name);
});

it('has zoom and reset-view controls and says Ichor is information, not a budget', () => {
  render();
  for (const l of ['Zoom in', 'Zoom out', 'Reset view']) expect(target.querySelector(`button[aria-label="${l}"]`)).not.toBeNull();
  expect(target.textContent).toContain('information, not a budget');
});
