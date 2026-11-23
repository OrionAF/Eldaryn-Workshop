import { describe, it, expect } from 'vitest';
import { setCards, chipFor, pctInterval, goalFigure, axisOf, tally, tallyChips, runMoreRequest, isDowngrade, bagSummaryText, comboView } from './dropView.js';
import { statKeyLabel } from './swap.js';

const row = (setKey, presetId, { pct = 3, rawDelta = { totalAttack: 100 } } = {}) => ({
  presetId, name: presetId, setKey, method: 'recomputed', approx: false, rawDelta, closed: { pct },
});
const metric = (verdict, delta, o = {}) => ({
  goalId: 'dps', label: 'Training dummy, 60 s: Damage per second', unit: 'dps', deltaKind: 'relative', damageOnly: true,
  before: { mean: 1000, n: 512 },
  after: { mean: 1000 + delta, n: 512 },
  delta: {
    delta, lo: delta - 20, hi: delta + 20, n: 512, verdict, zone: 5, p: 0.001, nLooks: 1, nNeeded: null,
    holmReject: verdict === 'better' || verdict === 'worse', ...o,
  },
});

describe('setCards', () => {
  it('C2: an upgrade with a goal too close to call carries the caveat labels', () => {
    const rows = [row('set1', 'a')];
    const [c] = setCards(rows, { a: { goals: [metric('better', 60), { ...metric('unresolved', 2, { holmReject: false }), goalId: 'fort', label: 'Fortress boss' }] } });
    expect(c.verdict).toBe('upgrade');
    expect(c.caveat).toEqual(['Fortress boss']);
    expect(c.unresolved).toBe(true);
    const [clean] = setCards(rows, { a: { goals: [metric('better', 60)] } });
    expect(clean.caveat).toEqual([]);
  });

  it('a comparison unresolved at maxN makes the set inconclusive ("Too close to call"), not a sidegrade', () => {
    const rows = [row('set1', 'a')];
    const [c] = setCards(rows, { a: { goals: [metric('unresolved', 2, { nNeeded: 90000, holmReject: false })] } });
    expect(c.verdict).toBe('inconclusive');
    expect(c.unresolved).toBe(true);
    expect(c.nNeeded).toBe(90000);
    expect(chipFor(c.verdict, c.basis)).toEqual({ verdict: 'unresolved', label: 'Too close to call' });
  });

  it('DPS-only coverage is labelled and the stats it cannot see are listed as not judged', () => {
    const rows = [row('set1', 'a', { rawDelta: { totalHealthPercent: 20 } })];
    const [c] = setCards(rows, { a: { goals: [metric('equivalent', 0)] } });
    expect(c.coverageLabel).toBe('Training dummy, 60 s: Damage per second. Damage only: defence not measured');
    expect(c.notJudged).toEqual([statKeyLabel('totalHealthPercent')]);
    expect(c.verdict).toBe('sidegrade');
  });

  it('presets on one set are judged together: +6 on one and -9 on the other is mixed', () => {
    const rows = [row('set1', 'a'), row('set1', 'b')];
    const [c] = setCards(rows, { a: { goals: [metric('better', 60)] }, b: { goals: [metric('worse', -90)] } });
    expect(c.verdict).toBe('mixed');
    expect(c.presetNames).toEqual(['a', 'b']);
  });

  it('one card per set, and only a finished simulation is "sim"; the closed-form figure is carried as an estimate', () => {
    const rows = [row('set1', 'a', { pct: 2 }), row('set2', 'b', { pct: 4 })];
    const cards = setCards(rows, { a: { goals: [metric('better', 60)] } });
    expect(cards.map((c) => [c.setKey, c.basis])).toEqual([['set1', 'sim'], ['set2', 'closed']]);
    expect(cards[1].estimatePct).toBe(4);
  });

  it('accepts results per row as well as by preset id', () => {
    const rows = [row('set1', 'a'), row('set1', 'b')];
    const [c] = setCards(rows, [{ goals: [metric('better', 60)] }, { goals: [metric('better', 80)] }]);
    expect(c.verdict).toBe('upgrade');
    expect(c.presets.map((p) => p.metrics.length)).toEqual([1, 1]);
  });

  it('a preset no goal judges stays out of the set verdict and is named; with none judged the card is not simulated', () => {
    const rows = [row('set1', 'a'), row('set1', 'b')];
    const [c] = setCards(rows, { a: { goals: [metric('better', 60)] }, b: { goals: [], noGoals: true } });
    expect(c).toMatchObject({ verdict: 'upgrade', basis: 'sim', presetNames: ['a', 'b'], unjudgedNames: ['b'] });
    expect(c.presets.map((p) => p.presetId)).toEqual(['a']);
    const [none] = setCards(rows, { a: { goals: [], noGoals: true }, b: { goals: [], noGoals: true } });
    expect(none).toMatchObject({ basis: 'closed', unjudgedNames: [] });
  });

  it('guards show per preset with their reason, and a broken one flags the card', () => {
    const guard = { goalId: 'gd', label: 'Dungeon: chance', targetLabel: 'Dungeon 8', role: 'guard', guard: { status: 'fail', target: 0.95, after: { est: 0.88 } } };
    const [c] = setCards([row('set1', 'a')], { a: { goals: [metric('better', 60), guard] } });
    expect(c.verdict).toBe('downgrade');
    expect(c.failedGuard).toBe(true);
    expect(c.presets[0].guards).toEqual([{ id: 'gd', label: 'Dungeon: chance', status: 'fail', text: 'Dungeon 8 drops to 88% (guard 95%)' }]);
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

describe('goalFigure', () => {
  it('draws relative goals in percent, rates in points and other units raw', () => {
    expect(axisOf(metric('better', 100))).toBe('pct');
    expect(goalFigure(metric('better', 100))).toMatchObject({ axis: 'pct', est: 10, n: 512 });
    const rate = { unit: 'p', deltaKind: 'absolute', before: { mean: 0.5 }, delta: { delta: 0.03, lo: 0.01, hi: 0.05, n: 200, verdict: 'better' } };
    expect(goalFigure(rate)).toMatchObject({ axis: 'pts', est: 3, lo: 1, hi: 5 });
    const raw = { unit: 'influence', deltaKind: 'absolute', before: { mean: 2 }, delta: { delta: 0.4, lo: 0.1, hi: 0.7, n: 64, verdict: 'better' } };
    expect(goalFigure(raw)).toMatchObject({ axis: 'raw', est: 0.4 });
    expect(goalFigure(null)).toBeNull();
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

describe('isDowngrade', () => {
  it('is true only for a simulated downgrade', () => {
    expect(isDowngrade({ verdict: 'downgrade', basis: 'sim' })).toBe(true);
    expect(isDowngrade({ verdict: 'downgrade', basis: 'closed' })).toBe(false);
    expect(isDowngrade({ verdict: 'inconclusive', basis: 'sim' })).toBe(false);
    expect(isDowngrade({ verdict: 'mixed', basis: 'sim' })).toBe(false);
    expect(isDowngrade(null)).toBe(false);
  });
});

describe('bagSummaryText', () => {
  it('writes one line per row for a simulated figure, an estimate and no figure', () => {
    const text = bagSummaryText([
      { name: 'Axe', slot: 'Weapon', figure: { kind: 'sim', est: 2.34, lo: 1, hi: 3.66 }, verdict: 'Upgrade' },
      { name: 'Ring', slot: 'Ring', figure: { kind: 'est', est: -1.25 }, verdict: 'Not simulated' },
      { name: 'Cap', slot: 'Helmet', figure: null, verdict: 'Queued' },
    ]);
    expect(text.split('\n')).toEqual([
      'Axe | Weapon | +2.3% [+1.0%, +3.7%] | Upgrade',
      'Ring | Ring | -1.3% (estimate) | Not simulated',
      'Cap | Helmet | no figure | Queued',
    ]);
  });
  it('is empty for no rows', () => expect(bagSummaryText([])).toBe(''));
});

describe('comboView', () => {
  const entries = [
    { key: 'a', name: 'Helm A', slot: 'HEAD' }, { key: 'b', name: 'Helm B', slot: 'HEAD' },
    { key: 'c', name: 'Chest C', slot: 'CHEST' }, { key: 'd', name: 'Legs D', slot: 'LEGGINGS' },
  ];
  const set = (o = {}) => ({
    setKey: 'set1', realm: 'base', status: 'done',
    picks: [{ entry: 'a', slot: 'HEAD', alone: 'upgrade' }, { entry: 'c', slot: 'CHEST', alone: 'sidegrade' }],
    steps: [{}, {}],
    alone: { a: 'upgrade', b: 'upgrade', c: 'sidegrade', d: 'upgrade' },
    onTop: { b: 'downgrade', d: 'sidegrade' },
    total: { rows: [row('set1', 'p1')], results: [{ presetId: 'p1', goals: [metric('better', 80)] }], confirmed: true, verdict: 'upgrade', score: 8 },
    ...o,
  });

  it('is null without a combination, and has no sets when nothing was picked', () => {
    expect(comboView(null, entries)).toBeNull();
    expect(comboView({ rounds: 1, sets: [set({ picks: [], total: null })] }, entries)).toEqual({ sets: [], rounds: 1 });
  });

  it('lists the picks in order, flags the one that only pays off with the others, and carries the total as a set card', () => {
    const v = comboView({ rounds: 3, shared: ['c'], sets: [set()] }, entries);
    const [s] = v.sets;
    expect(s).toMatchObject({ setKey: 'set1', setLabel: 'Set 1', status: 'done', confirmed: true, steps: 2 });
    expect(s.picks.map((p) => [p.entry.name, p.note, p.shared])).toEqual([
      ['Helm A', '', false],
      ['Chest C', 'Alone it is a sidegrade: it pays off with the others on', true],
    ]);
    expect(s.card).toMatchObject({ setKey: 'set1', verdict: 'upgrade', basis: 'sim', presetNames: ['p1'] });
  });

  it('says why an upgrade was left out: its slot is taken, or it is none on top of the picks', () => {
    const [s] = comboView({ rounds: 3, sets: [set()] }, entries).sets;
    expect(s.leftOut.map((l) => [l.entry.name, l.reason])).toEqual([
      ['Helm B', 'Helm A is the better pick for this slot'],
      ['Legs D', 'on top of the picks it is a sidegrade'],
    ]);
    expect(s.leftOut[0].holder.key).toBe('a');
    const [capped] = comboView({ rounds: 12, sets: [set({ status: 'capped', onTop: null })] }, entries).sets;
    expect(capped.leftOut[1].reason).toBe('not judged on top of the picks');
    // two drops of one name: the item level says which one holds the slot
    const twins = entries.map((e) => (e.slot === 'HEAD' ? { ...e, name: 'Relic', item: { itemLevel: e.key === 'a' ? 144 : 139 } } : e));
    expect(comboView({ rounds: 3, sets: [set()] }, twins).sets[0].leftOut[0].reason).toBe('Relic (ilvl 144) is the better pick for this slot');
  });

  it('with pools it shows only the asked pool, and takes "shared" from that pool\'s own picks', () => {
    const pooled = (pool, o = {}) => ({ ...set(o), pool });
    const combo = { rounds: 3, shared: ['a'], sets: [pooled('dropped', { picks: [{ entry: 'a', slot: 'HEAD', alone: 'upgrade' }] }), pooled('q100', { picks: [{ entry: 'c', slot: 'CHEST', alone: 'upgrade', shared: true }] })] };
    expect(comboView(combo, entries, 'dropped').sets.map((s) => s.picks.map((p) => [p.entry.key, p.shared]))).toEqual([[['a', false]]]);
    expect(comboView(combo, entries, 'q100').sets.map((s) => s.picks.map((p) => [p.entry.key, p.shared]))).toEqual([[['c', true]]]);
    expect(comboView(combo, entries).sets).toHaveLength(2);
  });

  it('drops picks whose entry has left the bag, and a set left with none; an unmeasured total has no card', () => {
    const rest = entries.filter((e) => e.key !== 'a');
    const [s] = comboView({ rounds: 3, sets: [set({ total: null })] }, rest).sets;
    expect(s.picks.map((p) => p.entry.key)).toEqual(['c']);
    expect(s.card).toBeNull();
    expect(comboView({ rounds: 3, sets: [set()] }, entries.filter((e) => e.key === 'd')).sets).toEqual([]);
  });
});
