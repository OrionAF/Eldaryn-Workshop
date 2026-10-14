import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TranscendenceScreen from './TranscendenceScreen.svelte';
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
  [...target.querySelectorAll('button')].find((b) => b.textContent.includes('+ Preset')).click();
  flushSync();
  expect(target.querySelectorAll('[role="tab"]')).toHaveLength(2);
  expect(rosterStore.current.transcendence.activePresetId).not.toBe('default');
});
