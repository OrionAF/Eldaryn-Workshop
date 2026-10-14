import { it, expect } from 'vitest';
import { fmtDeltaCi } from './format.js';

it('#77: a millisecond CI spanning zero keeps its signs', () => {
  expect(fmtDeltaCi('ms', { lo: -3000, hi: 5000 })).toBe('95% CI -3.00 s to +5.00 s');
});
