import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DpsHpsReadout from './DpsHpsReadout.svelte';
import { offensiveStats, computeDps, computeHps } from '../lib/dps.js';

let target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

it('displays DPS/HPS matching dps.js for a given profile', () => {
  const profile = offensiveStats({ attack: 100, speed: 100, crit: 50, crit_mult: 200, double_hit: 0, health: 1000, hp_regen: 2, lifesteal: 10 });
  const app = mount(DpsHpsReadout, { target, props: { profile } });
  flushSync();

  const expectedDps = computeDps(profile).toFixed(1);
  const expectedHps = computeHps(profile).total_hps.toFixed(1);
  expect(target.textContent).toContain(expectedDps);
  expect(target.textContent).toContain(expectedHps);
  unmount(app);
});
