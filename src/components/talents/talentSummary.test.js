import { it, expect } from 'vitest';
import { setEffects } from './talentSummary.js';

it('sums the allocation per stat and formats it like the game', () => {
  const rows = setEffects('WARRIOR_TANK', { tank_t1_fortitude: 3, tank_t1_vitality: 2 });
  const hp = rows.find((r) => r.stat === 'hpPercent');
  expect(hp.label).toBe('Max HP');
  expect(hp.text).toBe('+6%'); // Fortitude: 2 per rank, 3 ranks
  expect(rows.every((r) => r.text.startsWith('+'))).toBe(true);
});

it('is empty for no spec or no points', () => {
  expect(setEffects(null, {})).toEqual([]);
  expect(setEffects('WARRIOR_TANK', {})).toEqual([]);
});

it('shows attack speed as a percent although it is stored as a fraction', () => {
  const rows = setEffects('WARRIOR_DPS', { dps_t1_quick_strikes: 5 });
  expect(rows.find((r) => r.stat === 'attackSpeedFlat')?.text).toMatch(/^\+\d+(\.\d+)?%$/);
});
