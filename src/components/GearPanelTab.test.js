import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import GearPanelTab from './GearPanelTab.svelte';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(GearPanelTab, { target });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('renders two silhouette columns, defaulting to the first slot selected', () => {
  const columns = target.querySelectorAll('.silhouette-column');
  expect(columns.length).toBe(2);
  expect(target.textContent).toContain('Slot selected: Head');
  cleanup();
});

it('clicking a slot in one loadout selects it in both silhouettes', () => {
  const columns = [...target.querySelectorAll('.silhouette-column')];
  const l1Ring = [...columns[0].querySelectorAll('button')].find((b) => b.textContent.trim() === 'Ring');
  l1Ring.click();
  flushSync();

  const l1RingAfter = [...columns[0].querySelectorAll('button')].find((b) => b.textContent.trim() === 'Ring');
  const l2Ring = [...columns[1].querySelectorAll('button')].find((b) => b.textContent.trim() === 'Ring');
  expect(l1RingAfter.getAttribute('aria-pressed')).toBe('true');
  expect(l2Ring.getAttribute('aria-pressed')).toBe('true');
  expect(target.textContent).toContain('Slot selected: Ring');
  cleanup();
});
