import { it, expect } from 'vitest';
import { fitView, startView, PHONE_ZOOM, BOARD_SPAN_COLS, BOARD_SPAN_ROWS, TOOLS_CLEARANCE } from './boardView.js';

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

it('startView opens a phone on the start node at a readable zoom', () => {
  const v = startView(300, 520, 40, 32);
  expect(v.zoom).toBe(PHONE_ZOOM);
  // the start node (column 0, the bottom row) sits at the horizontal centre, one cell above the bottom edge
  expect(v.panX + (BOARD_SPAN_COLS / 2) * 40 * v.zoom).toBeCloseTo(150);
  expect(v.panY + BOARD_SPAN_ROWS * 40 * v.zoom).toBeCloseTo(520 - (32 / 2 + 40) * v.zoom);
});
