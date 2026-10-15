import { describe, it, expect } from 'vitest';
import { setCards, chipFor, pctInterval, tally, tallyChips, runMoreRequest } from './dropView.js';
import { statKeyLabel } from './swap.js';

const row = (setKey, presetId, { pct = 3, rawDelta = { totalAttack: 100 } } = {}) => ({
  presetId, name: presetId, setKey, method: 'recomputed', approx: false, rawDelta, closed: { pct },
});
const metric = (verdict, delta, o = {}) => ({
  before: { mean: 1000, n: 512 },
  after: { mean: 1000 + delta, n: 512 },
  delta: {
    delta, lo: delta - 20, hi: delta + 20, n: 512, verdict, zone: 5, p: 0.001, nLooks: 1, nNeeded: null,
    holmReject: verdict === 'better' || verdict === 'worse', ...o,
  },
});

describe('setCards', () => {
  it('a comparison unresolved at maxN makes the set inconclusive ("Too close to call"), not a sidegrade', () => {
    const rows = [row('set1', 'a')];
    const [c] = setCards(rows, { a: { sim: metric('unresolved', 2, { nNeeded: 90000, holmReject: false }) } });
    expect(c.verdict).toBe('inconclusive');
    expect(c.unresolved).toBe(true);
    expect(c.nNeeded).toBe(90000);
    expect(chipFor(c.verdict, c.basis)).toEqual({ verdict: 'unresolved', label: 'Too close to call' });
  });

  it('DPS-only coverage is labelled and the stats it cannot see are listed as not judged', () => {
    const rows = [row('set1', 'a', { rawDelta: { totalHealthPercent: 20 } })];
    const [c] = setCards(rows, { a: { sim: metric('equivalent', 0) } });
    expect(c.coverageLabel).toBe('DPS only: defence not measured');
    expect(c.notJudged).toEqual([statKeyLabel('totalHealthPercent')]);
    expect(c.verdict).toBe('sidegrade');
  });

  it('presets on one set are judged together: +6 on one and -9 on the other is mixed', () => {
    const rows = [row('set1', 'a'), row('set1', 'b')];
    const [c] = setCards(rows, { a: { sim: metric('better', 60) }, b: { sim: metric('worse', -90) } });
    expect(c.verdict).toBe('mixed');
    expect(c.presetNames).toEqual(['a', 'b']);
  });

  it('one card per set, and only a finished simulation is "sim"; the closed-form figure is carried as an estimate', () => {
    const rows = [row('set1', 'a', { pct: 2 }), row('set2', 'b', { pct: 4 })];
    const cards = setCards(rows, { a: { sim: metric('better', 60) } });
    expect(cards.map((c) => [c.setKey, c.basis])).toEqual([['set1', 'sim'], ['set2', 'closed']]);
    expect(cards[1].estimatePct).toBe(4);
  });

  it('accepts results per row as well as by preset id', () => {
    const rows = [row('set1', 'a'), row('set1', 'b')];
    const [c] = setCards(rows, [{ sim: metric('better', 60) }, { sim: metric('better', 80) }]);
    expect(c.verdict).toBe('upgrade');
    expect(c.presets.map((p) => p.metrics.length)).toEqual([1, 1]);
  });
});

describe('chipFor', () => {
  it('only a simulated upgrade or downgrade takes up/down colour', () => {
    expect(chipFor('upgrade', 'sim').verdict).toBe('better');
    expect(chipFor('downgrade', 'sim').verdict).toBe('worse');
    expect(chipFor('upgrade', 'closed').verdict).toBe('unresolved');
    expect(chipFor('upgrade', 'closed', 'running')).toEqual({ verdict: 'pending', label: 'Simulating…' });
    expect(chipFor('upgrade', 'closed', 'queued')).toEqual({ verdict: 'queued', label: 'Queued' });
    expect(chipFor('mixed', 'sim').verdict).toBe('unresolved');
  });
});

describe('pctInterval', () => {
  it('expresses a DPS contrast as percent of the starting DPS', () => {
    const p = pctInterval(metric('better', 100));
    expect(p.est).toBeCloseTo(10);
    expect(p.lo).toBeCloseTo(8);
    expect(p.hi).toBeCloseTo(12);
  });
  it('is null without a usable baseline', () => {
    expect(pctInterval(null)).toBeNull();
    expect(pctInterval({ before: { mean: 0 }, delta: { delta: 1, lo: 0, hi: 2 } })).toBeNull();
  });
});

describe('tally', () => {
  it('counts an item without a finished simulation as pending, whatever its closed-form verdict', () => {
    const t = tally([{ verdict: 'upgrade', basis: 'sim' }, { verdict: 'upgrade', basis: 'closed' }, null, { verdict: 'inconclusive', basis: 'sim' }], [{ name: 'x' }]);
    expect(t).toMatchObject({ upgrade: 1, pending: 2, inconclusive: 1, skipped: 1 });
    expect(tallyChips(t).map((c) => c.text)).toEqual(['▲ 1 upgrade', '1 too close to call', '2 not simulated', '! 1 skipped']);
  });
});

describe('runMoreRequest', () => {
  it('raises the precision a step and drops a stale maxN', () => {
    expect(runMoreRequest({ precision: 'quick', maxN: 99, seed: 1 })).toEqual({ precision: 'standard', seed: 1 });
    expect(runMoreRequest({ precision: 'standard', seed: 1 })).toEqual({ precision: 'thorough', seed: 1 });
  });
  it('past Thorough quadruples the give-up N, up to a ceiling', () => {
    const a = runMoreRequest({ precision: 'thorough' });
    expect(a.maxN).toBe(131072 * 4);
    expect(runMoreRequest(a).maxN).toBe(131072 * 16);
    expect(runMoreRequest(runMoreRequest(a))).toBeNull();
    expect(runMoreRequest(null)).toBeNull();
  });
});
