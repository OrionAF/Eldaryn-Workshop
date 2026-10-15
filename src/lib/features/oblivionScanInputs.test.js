import { it, expect, beforeEach } from 'vitest';
import { rosterStore } from '../rosterStore.svelte.js';
import { floorScanInputs, floorScanRequest, FLOOR_EFFORT } from './oblivionDungeon.js';

beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Obl', 'WARRIOR');
  rosterStore.setOblivionUnlocked(true);
});

it('inputs change with the scan setup and with the character, not between identical calls', () => {
  const c = rosterStore.current;
  const a = floorScanInputs(c, {});
  expect(floorScanInputs(c, {})).toBe(a);
  expect(floorScanInputs(c, { effort: 'thorough' })).not.toBe(a);
  expect(floorScanInputs(c, { applyOutputCut: true })).not.toBe(a);
  rosterStore.setCharacterLevel(50);
  expect(floorScanInputs(rosterStore.current, {})).not.toBe(a);
});

it('request: Standard effort is the default and carries the output-cut toggle', () => {
  const r = floorScanRequest(rosterStore.current, { applyOutputCut: true });
  expect(r.mode).toBe('oblivionFloors');
  expect(r.n).toBe(FLOOR_EFFORT.standard);
  expect(r.applyOutputCut).toBe(true);
  expect(r.fighter.stats).toBeTruthy();
});
