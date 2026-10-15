import { it, expect } from 'vitest';
import { fmtScalar, fmtSigned, fmtEstimate, fmtContrast, fmtContrastCi, verdictText, nNeededText, verdictTone, fmtCount } from './statsFormat.js';

const M = '−';

it('#77: a millisecond CI spanning zero keeps both signs', () => {
  const c = { delta: 1000, lo: -3000, hi: 5000, pct: null, n: 800, verdict: 'unresolved' };
  expect(fmtContrastCi('ms', c)).toBe(`95% CI ${M}3.00 s to +5.00 s`);
});

it('signs every unit, never drops a negative', () => {
  expect(fmtSigned('ms', -1500)).toBe(`${M}1.50 s`);
  expect(fmtSigned('ms', 1500)).toBe('+1.50 s');
  expect(fmtSigned('ms', 0)).toBe('0.00 s');
  expect(fmtSigned('p', -0.05)).toBe(`${M}5.0 pts`);
  expect(fmtSigned('p', 0.1234)).toBe('+12.3 pts');
  expect(fmtSigned('dps', -12345)).toBe(`${M}12.345`);
  expect(fmtSigned('dps', 12345)).toBe('+12.345');
});

it('scalar and estimate formatting; null is n/a', () => {
  expect(fmtScalar('ms', 2500)).toBe('2.50 s');
  expect(fmtScalar('p', 0.5)).toBe('50.0%');
  expect(fmtScalar('dps', null)).toBe('n/a');
  expect(fmtEstimate('p', { est: 0.5, lo: 0.4, hi: 0.6 })).toBe('50.0% (40.0% to 60.0%)');
  expect(fmtEstimate('p', { est: 0.5, lo: null, hi: null })).toBe('50.0%');
  expect(fmtEstimate('p', null)).toBe('n/a');
});

it('contrast: dps prefers pct, signed', () => {
  expect(fmtContrast('dps', { delta: 500, pct: 0.068 })).toBe('+6.80%');
  expect(fmtContrast('dps', { delta: -500, pct: -0.068 })).toBe(`${M}6.80%`);
  expect(fmtContrast('dps', { delta: 500, pct: null })).toBe('+500');
  expect(fmtContrast('ms', null)).toBe('');
});

it('verdict text names N when unresolved; nNeeded', () => {
  expect(verdictText({ verdict: 'unresolved', n: 4096 })).toBe('Too close to call at 4,096');
  expect(verdictText({ verdict: 'better', n: 10 })).toBe('Better');
  expect(verdictText({ verdict: 'equivalent', n: 10 })).toBe('Equivalent');
  expect(nNeededText({ nNeeded: 16384 })).toBe('about 16,384 fights needed');
  expect(nNeededText({ nNeeded: null })).toBe('');
  expect(fmtCount(1234567)).toBe('1,234,567');
});

it('tone: only significant verdicts take up/down', () => {
  expect(verdictTone({ verdict: 'better' })).toBe('up');
  expect(verdictTone({ verdict: 'worse' })).toBe('down');
  expect(verdictTone({ verdict: 'unresolved' })).toBe('side');
  expect(verdictTone({ verdict: 'equivalent' })).toBe('side');
  expect(verdictTone(null)).toBe('side');
});

it('a DPS contrast prints its CI in the same percent as the headline', () => {
  const c = { delta: 500, lo: 250, hi: 750, pct: 0.05, n: 800, verdict: 'better' };
  expect(fmtContrast('dps', c)).toBe('+5.00%');
  expect(fmtContrastCi('dps', c)).toBe('95% CI +2.50% to +7.50%');
  // no relative figure to scale by: the absolute CI stays as it was
  expect(fmtContrastCi('dps', { delta: 500, lo: 250, hi: 750, pct: null })).toBe('95% CI +250 to +750');
});
