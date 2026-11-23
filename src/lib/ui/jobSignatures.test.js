import { describe, it, expect } from 'vitest';
import { dropSignature, floorScanSignature, restoredJobSignature } from './jobSignatures.js';

const char = (over = {}) => ({ id: 'c1', equipment: { weapon: 1 }, presets: [{ id: 'p1' }], drop: null, dropCheck: null, ...over });
const find = (c) => (id) => (c && c.id === id ? c : null);

describe('restoredJobSignature', () => {
  const mk = (c, tool = 'drop', extra = {}) => ({ tool, request: {}, signature: dropSignature(c), ...extra });

  it('matches the live signature while nothing changed, differs once the character changed', () => {
    const c = char();
    const job = mk(c);
    expect(restoredJobSignature(job, find(c))).toBe(job.signature);
    expect(restoredJobSignature(job, find(char({ equipment: { weapon: 2 } })))).not.toBe(job.signature);
  });

  it('is null (stale) when the character is gone', () => {
    expect(restoredJobSignature(mk(char()), find(null))).toBeNull();
  });

  it('a bag job recomputes with its saved entry keys', () => {
    const c = char();
    const job = { tool: 'drop-bag', request: {}, meta: { extra: '3|a,b' }, signature: dropSignature(c, '3|a,b') };
    expect(restoredJobSignature(job, find(c))).toBe(job.signature);
  });

  it('an optimiser or oblivion job whose preset is gone is null', () => {
    const c = char({ presets: [] });
    expect(restoredJobSignature({ tool: 'optimiser', request: { meta: { presetId: 'p1' } }, signature: dropSignature(char()) }, find(c))).toBeNull();
    expect(floorScanSignature(c, { presetId: 'p1' })).toBeNull();
  });

  it('an unknown tool keeps its saved signature', () => {
    const job = mk(char(), 'mystery');
    expect(restoredJobSignature(job, find(char()))).toBe(job.signature);
  });
});
