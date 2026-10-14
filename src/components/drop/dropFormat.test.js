import { it, expect } from 'vitest';
import { flat, signedFlat, ciFlat } from './dropFormat.js';
import { formatFlat } from '../../lib/format.js';

it('flat numbers group thousands with "." like every other screen (lib/format.js)', () => {
  expect(flat(12345.6)).toBe('12.346');
  expect(flat(56375)).toBe(formatFlat(56375));
  expect(flat(NaN)).toBe('—');
  expect(signedFlat(1400)).toBe('+1.400');
  expect(signedFlat(-1400)).toBe('-1.400');
  expect(signedFlat(0)).toBe('0');
  expect(ciFlat({ lo: 800, hi: 1400 })).toBe('+800 to +1.400');
});
