import { describe, it, expect, beforeEach } from 'vitest';
import { rosterStore } from '../rosterStore.svelte.js';
import { computePresetStats } from '../build/stats.js';

let a;
let b;
beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Sheet Test', 'WARRIOR');
  [a, b] = rosterStore.current.presets.map((p) => p.id);
});
const sheetOf = (id) => rosterStore.current.presets.find((p) => p.id === id).sheet;

describe('copyPresetSheet', () => {
  it('copies values, leaves the source intact and the copy unverified', () => {
    rosterStore.setPresetSheet(a, { totalAttack: 5000, totalHp: 90000 });
    expect(rosterStore.copyPresetSheet(a, b)).toBe(true);
    expect(sheetOf(b).values).toEqual({ totalAttack: 5000, totalHp: 90000 });
    expect(sheetOf(b).inputsKey).toBeNull();
    expect(sheetOf(a).values.totalAttack).toBe(5000);
    expect(computePresetStats(rosterStore.current, b).sheetStatus).toBe('unverified');
  });
  it('replaces an existing sheet on the target', () => {
    rosterStore.setPresetSheet(a, { totalAttack: 5000 });
    rosterStore.setPresetSheet(b, { totalHp: 7 });
    expect(rosterStore.copyPresetSheet(a, b)).toBe(true);
    expect(sheetOf(b).values).toEqual({ totalAttack: 5000 });
  });
  it('is a no-op for the same preset, a missing preset or an empty source', () => {
    rosterStore.setPresetSheet(a, { totalAttack: 5000 });
    expect(rosterStore.copyPresetSheet(a, a)).toBe(false);
    expect(rosterStore.copyPresetSheet('nope', b)).toBe(false);
    expect(rosterStore.copyPresetSheet(a, 'nope')).toBe(false);
    expect(rosterStore.copyPresetSheet(b, a)).toBe(false);
    expect(sheetOf(b)).toBeNull();
    expect(sheetOf(a).values).toEqual({ totalAttack: 5000 });
  });
});
