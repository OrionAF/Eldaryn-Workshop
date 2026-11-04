import { it, expect, describe } from 'vitest';
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

import { diffEffects } from './talentSummary.js';

describe('diffEffects', () => {
  const tank = (allocation) => ({ spec: 'WARRIOR_TANK', allocation });
  it('gives the delta for a shared stat, signed', () => {
    const rows = diffEffects(tank({ tank_t1_fortitude: 3 }), tank({ tank_t1_fortitude: 1 }));
    const hp = rows.find((r) => r.stat === 'hpPercent');
    expect(hp).toMatchObject({ text: '+4%', sign: 1 });
    const back = diffEffects(tank({ tank_t1_fortitude: 1 }), tank({ tank_t1_fortitude: 3 }));
    expect(back.find((r) => r.stat === 'hpPercent')).toMatchObject({ text: '-4%', sign: -1 });
  });
  it('shows a stat only one side grants at full value', () => {
    const rows = diffEffects(tank({ tank_t1_fortitude: 2 }), { spec: null, allocation: {} });
    expect(rows.find((r) => r.stat === 'hpPercent')).toMatchObject({ text: '+4%', sign: 1 });
    const lost = diffEffects({ spec: null, allocation: {} }, tank({ tank_t1_fortitude: 2 }));
    expect(lost.find((r) => r.stat === 'hpPercent')).toMatchObject({ text: '-4%', sign: -1 });
  });
  it('is empty for identical sets', () => {
    expect(diffEffects(tank({ tank_t1_fortitude: 2 }), tank({ tank_t1_fortitude: 2 }))).toEqual([]);
    expect(diffEffects(null, null)).toEqual([]);
  });
  it('compares across different specs', () => {
    const rows = diffEffects(tank({ tank_t1_fortitude: 2 }), { spec: 'WARRIOR_DPS', allocation: { dps_t1_quick_strikes: 5 } });
    expect(rows.find((r) => r.stat === 'hpPercent').sign).toBe(1);
    const atk = rows.find((r) => r.stat === 'attackSpeedFlat');
    expect(atk.sign).toBe(-1);
    expect(atk.text).toMatch(/^-\d+(\.\d+)?%$/);
  });
});
