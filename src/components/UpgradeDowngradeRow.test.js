/**
 * Proves the specific reactivity fix: dps.js's Speed/CritMult stacking flag
 * is plain module state, not itself reactive - UpgradeDowngradeRow's
 * $derived must read settingsStore to know to recompute when the user
 * flips the toggle mid-comparison, or the displayed deltas would go stale.
 */
import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import UpgradeDowngradeRow from './UpgradeDowngradeRow.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { settingsStore } from '../lib/settingsStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.setProfileField(0, 'attack', 100);
  rosterStore.setProfileField(0, 'speed', 200);
  rosterStore.setProfileField(1, 'attack', 100);
  rosterStore.setProfileField(1, 'speed', 200);
  rosterStore.startDrop('Weapon');
  rosterStore.setDropField('speed', 100); // candidate adds +100 speed, differently under each stacking mode
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(UpgradeDowngradeRow, { target });
  flushSync();
});
afterEach(() => {
  settingsStore.setMultiplicative(false);
  unmount(app);
  target.remove();
});

it('recomputes DPS when the multiplicative toggle flips, with no other trigger', () => {
  // Additive (default): newSpeed = 200 - 0 + 100 = 300 -> DPS = 100 * 3 = 300
  expect(target.textContent).toContain('300.0');

  settingsStore.setMultiplicative(true);
  flushSync();

  // Multiplicative: M = (200/100)/1 * (1+100/100) = 2*2 = 4 -> newSpeed=400 -> DPS = 100*4 = 400
  expect(target.textContent).toContain('400.0');
  expect(target.textContent).not.toContain('300.0');
});
