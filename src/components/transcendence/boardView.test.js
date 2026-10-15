import { it, expect } from 'vitest';
import { fitView, BOARD_SPAN_COLS, TOOLS_CLEARANCE } from './boardView.js';

it('centres the board horizontally and keeps it clear of the controls', () => {
  const v = fitView(1000, 700, 32, 24);
  expect(v.panX + (BOARD_SPAN_COLS / 2) * 32 * v.zoom).toBeCloseTo(500);
  expect(v.panY).toBeGreaterThanOrEqual(TOOLS_CLEARANCE);
});

it('shrinks to show every column in a narrow viewport and never zooms in past 1', () => {
  const narrow = fitView(390, 600, 40, 32);
  expect(narrow.zoom).toBeLessThan(1);
  expect(narrow.panX).toBeGreaterThanOrEqual(0);
  expect(fitView(4000, 4000, 32, 24).zoom).toBe(1);
});
