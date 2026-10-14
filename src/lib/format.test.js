import { it, expect } from 'vitest';
import { parseFlat, parsePct, parseStat, formatFlat, formatPct, formatStat, isFlatKey } from './format.js';

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
  expect(parseStat('totalAttack', '2.664')).toBe(2664); // flat
  expect(parseStat('totalHp', '15.654')).toBe(15654); // flat
  expect(parseStat('totalCritChance', '6.2')).toBe(6.2); // pct
  expect(parseStat('totalCritChance', '5.0')).toBe(5.0); // pct
});

// --- new defensive/PVP fields (added ahead of a future PVP phase) ---
it('parseStat treats pvp attack/defense as flat, block chance as pct', () => {
  expect(parseStat('totalPvpAttack', '1.500')).toBe(1500); // flat, "." thousands
  expect(parseStat('totalPvpDefense', '283')).toBe(283); // flat
  expect(parseStat('totalBlockChance', '4.5')).toBe(4.5); // pct
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

// --- keys are the sheet's computedKey names (rebuild-plan C1b) ---
it('treats integer sheet rows as flat and percent/multiplier rows as decimals', () => {
  expect(isFlatKey('totalAttack')).toBe(true);
  expect(isFlatKey('totalHp')).toBe(true);
  expect(isFlatKey('totalFlameConduit')).toBe(true);
  expect(isFlatKey('totalCritChance')).toBe(false);
  expect(isFlatKey('totalAttackPercent')).toBe(false);
  expect(parseStat('totalAttack', '48.124')).toBe(48124);
  expect(parseStat('totalCritChance', '6.2')).toBe(6.2);
  expect(formatStat('totalHp', 15654)).toBe('15.654');
  expect(formatStat('totalHealthPercent', 12.5)).toBe('12.5');
});

import { rarityClass, RARITY_ORDER } from './format.js';

it('rarityClass maps every tier to its app.css class and unknown names to rarity-unknown', () => {
  expect(RARITY_ORDER[0]).toBe('Common');
  expect(rarityClass('Legendary')).toBe('rarity-legendary');
  expect(rarityClass('Oblivion')).toBe('rarity-oblivion');
  expect(rarityClass('nope')).toBe('rarity-unknown');
});
