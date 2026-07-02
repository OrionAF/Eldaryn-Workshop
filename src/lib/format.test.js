import { it, expect } from 'vitest';
import { parseFlat, parsePct, parseStat, formatFlat, formatPct } from './format.js';

// --- parseFlat: "." is a thousands separator (handoff 9) ---
it('parseFlat treats "." as a thousands separator', () => {
  expect(parseFlat('2.664')).toBe(2664);
  expect(parseFlat('48.124')).toBe(48124);
  expect(parseFlat('94.943')).toBe(94943);
  expect(parseFlat('15.654')).toBe(15654);
});

it('parseFlat handles plain integers, commas, blanks, and numbers', () => {
  expect(parseFlat('2664')).toBe(2664);
  expect(parseFlat('2,664')).toBe(2664);
  expect(parseFlat('')).toBe(0);
  expect(parseFlat(null)).toBe(0);
  expect(parseFlat(2664)).toBe(2664);
  expect(parseFlat('-5')).toBe(-5);
});

// --- parsePct: "." is a decimal point ---
it('parsePct treats "." as a decimal point', () => {
  expect(parsePct('6.2')).toBe(6.2);
  expect(parsePct('34.3')).toBe(34.3);
  expect(parsePct('3.4')).toBe(3.4);
  expect(parsePct('')).toBe(0);
  expect(parsePct(150)).toBe(150);
});

it('parsePct also accepts "," as a decimal point, instead of silently dropping it', () => {
  expect(parsePct('2,3')).toBe(2.3); // the exact bug report: was becoming 23
  expect(parsePct('34,3')).toBe(34.3);
  expect(parsePct('6,2')).toBe(6.2);
});

// --- parseStat dispatches by field kind ---
it('parseStat parses flats and percentages by key', () => {
  expect(parseStat('attack', '2.664')).toBe(2664); // flat
  expect(parseStat('health', '15.654')).toBe(15654); // flat
  expect(parseStat('attack_pct', '6.2')).toBe(6.2); // pct
  expect(parseStat('crit', '5.0')).toBe(5.0); // pct
});

// --- new defensive/PVP fields (added ahead of a future PVP phase) ---
it('parseStat treats pvp_attack/pvp_defense as flat, block_chance as pct', () => {
  expect(parseStat('pvp_attack', '1.500')).toBe(1500); // flat, "." thousands
  expect(parseStat('pvp_defense', '283')).toBe(283); // flat
  expect(parseStat('block_chance', '4.5')).toBe(4.5); // pct
});

// --- formatting mirrors parsing (round-trip) ---
it('formatFlat groups thousands with "." and round-trips', () => {
  expect(formatFlat(2664)).toBe('2.664');
  expect(formatFlat(48124)).toBe('48.124');
  expect(parseFlat(formatFlat(94943))).toBe(94943);
});

it('formatPct trims trailing zeros', () => {
  expect(formatPct(6.2)).toBe('6.2');
  expect(formatPct(5.0)).toBe('5');
  expect(formatPct(34.3)).toBe('34.3');
});
