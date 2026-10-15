import { describe, it, expect } from 'vitest';
import {
  orientContrast, orientRow, viewResult, viewRun, legacyRows, progressSegments, progressLine, effortPlan,
  changeSummary, changeIdLabel, bundleText, onlyWith, dimensionLabel,
  setGroup, enabledCount, toggleTotal, SPACE_GROUPS, applyPlan, sideEffectsOf, fmtDuration, optimiserJobChips,
} from './optimiserView.js';
import { runFromResult } from '../model/runs.js';
import { BLOCKS } from '../search/space.js';
import { dpsResult, ttkResult, richResult, legacyRun } from '../__fixtures__/optimiser/index.js';

describe('orientContrast', () => {
  it('flips a time contrast so positive means faster, swapping the bounds', () => {
    const c = orientContrast({ delta: -300, lo: -500, hi: -100, pct: -0.1, higherIsBetter: false, basis: 'quantile', verdict: 'better' });
    expect(c).toMatchObject({ delta: 300, lo: 100, hi: 500, pct: 0.1, verdict: 'better' });
  });
  it('leaves a higher-is-better contrast as it is', () => {
    const c = { delta: 5, lo: 1, hi: 9, higherIsBetter: true, verdict: 'better' };
    expect(orientContrast(c)).toBe(c);
  });
  it('a win-rate fallback never lands in the time table: numbers move to winRate', () => {
    const c = orientContrast({ delta: 0.2, lo: 0.1, hi: 0.3, higherIsBetter: true, basis: 'winRate', verdict: 'better' });
    expect(c.delta).toBeNull();
    expect(c.lo).toBeNull();
    expect(c.winRate).toEqual({ delta: 0.2, lo: 0.1, hi: 0.3 });
  });
  it('keeps null contrasts null (provisional rows)', () => {
    expect(orientContrast(null)).toBeNull();
    expect(orientRow({ vsBaseline: null, changes: [{ own: null, needed: null }], remainder: null }).changes[0].own).toBeNull();
  });
});

describe('viewResult', () => {
  it('a recorded TTK result reads positive (faster) in its own unit, and the domain covers every mark', () => {
    const r = ttkResult();
    expect(r.rows[0].vsBaseline.delta).toBeLessThan(0); // raw: ms of the quantile difference
    const v = viewResult(r);
    expect(v.unit).toBe('ms');
    expect(v.rows[0].vsBaseline.delta).toBeGreaterThan(0);
    expect(v.domain.max).toBeGreaterThanOrEqual(v.rows[0].vsBaseline.hi);
    expect(v.domain.min).toBeLessThanOrEqual(0);
  });
  it('withholds a row that lists no change and says how many', () => {
    const r = dpsResult();
    r.rows[1].changes = [];
    const v = viewResult(r);
    expect(v.rows).toHaveLength(2);
    expect(v.withheld).toBe(1);
    expect(v.rows.every((row) => row.changes.length > 0)).toBe(true);
  });
  it('gives the baseline a changes array so the row renders', () => {
    const r = dpsResult();
    delete r.baseline.changes;
    expect(viewResult(r).baseline.changes).toEqual([]);
  });
  it('a failed result has no rows', () => {
    expect(viewResult({ status: 'failed', objective: { unit: 'dps' }, rows: [], baseline: null }).rows).toEqual([]);
  });
});

describe('saved runs', () => {
  it('a schema 2 run renders as recorded', () => {
    const run = runFromResult(richResult(), { id: 'r1' });
    const v = viewRun(run);
    expect(v.rows).toHaveLength(3);
    expect(v.rows[0].changes[0].own.verdict).toBe('better');
  });
  it('a legacy run keeps its numbers, has no per-change effect and maps significance to a verdict', () => {
    const v = viewRun({ ...legacyRun(), schema: 1 });
    expect(v.legacy).toBe(true);
    expect(v.rows[0].changes[0].own).toBeNull();
    expect(v.rows[0].vsBaseline.verdict).toBe('better');
    expect(v.rows[0].value.est).toBe(1050);
  });
  it('a compacted run has no view', () => {
    expect(viewRun({ ...legacyRun(), detail: null })).toBeNull();
  });
  it('a legacy entry that was not significant is "unresolved", never better or worse', () => {
    const run = legacyRun();
    run.detail.results[0].vsBaseline.significant = false;
    expect(legacyRows(run.detail, 'dps').rows[0].vsBaseline.verdict).toBe('unresolved');
  });
});

describe('progress', () => {
  const phases = [
    { id: 'screen', label: 'Screen', state: 'done', done: 1, total: 1 },
    { id: 'search', label: 'Search', state: 'current', done: 40, total: 100 },
    { id: 'confirm', label: 'Confirm', state: 'queued', done: 0, total: 0 },
  ];
  it('maps a live report: current becomes active', () => {
    expect(progressSegments({ progress: { phases }, status: 'running' }).map((s) => s.state)).toEqual(['done', 'active', 'queued']);
  });
  it('a cancelled run shows the interrupted phase as cancelled', () => {
    expect(progressSegments({ progress: { phases }, status: 'cancelled' })[1].state).toBe('cancelled');
  });
  it('a finished run shows the result phases with their fight counts', () => {
    const segs = progressSegments({ result: dpsResult(), status: 'finished' });
    expect(segs.map((s) => s.id)).toEqual(['screen', 'search', 'minimise', 'confirm', 'attribute']);
    expect(segs.every((s) => s.state === 'done')).toBe(true);
    expect(segs[1].text).toBe('19,248 fights');
  });
  it('prints what the search is doing', () => {
    expect(progressLine({ phases, block: 'relics', counts: { evaluated: 12, fights: 3400 } })).toBe('Search, relics: 12 builds tried, 3,400 fights');
    expect(progressLine(null)).toBe('Starting');
  });
});

describe('effortPlan', () => {
  it('prints δ, n0 and maxN for each level; no time cap anywhere', () => {
    const q = effortPlan('quick', { kind: 'dps' });
    expect(q).toMatchObject({ zone: '1%', n0: 8, maxN: 8192, relative: true });
    const t = effortPlan('thorough', { kind: 'pvp-winrate' });
    expect(t).toMatchObject({ zone: '0.5 points', n0: 32, maxN: 131072, relative: false });
    expect(Object.keys(q)).not.toContain('maxMs');
  });
});

describe('allowed-to-change groups', () => {
  it('cover every search block exactly once', () => {
    const keys = SPACE_GROUPS.flatMap((g) => g.items.map(([k]) => k)).sort();
    expect(keys).toEqual([...BLOCKS].sort());
    expect(toggleTotal).toBe(BLOCKS.length);
  });
  it('all/none per group and overall', () => {
    const all = Object.fromEntries(BLOCKS.map((b) => [b, true]));
    const off = setGroup(all, 'sigils', false);
    expect([off.sigils, off.utility, off.ancient, off.conditions]).toEqual([false, false, false, false]);
    expect(off.relics).toBe(true);
    expect(enabledCount(setGroup(all, null, false))).toBe(0);
  });
});

describe('applyPlan', () => {
  const row = () => richResult().rows[0];
  it('with nothing excluded writes every scope, so the store checks the whole candidate', () => {
    const p = applyPlan(row(), []);
    expect(p.include).toEqual(['preset', 'character', 'mount']);
    expect(p.writesCount).toBe(2);
    expect(p.cand.talentAllocation).not.toBeNull();
  });
  it('excluding the preset group leaves the character write', () => {
    const p = applyPlan(row(), [1]);
    expect(p.include).toEqual(['character']);
    expect(p.writesCount).toBe(1);
  });
  it('excluding the talent group resets the allocation to "equal to saved" and keeps the preset scope', () => {
    const p = applyPlan(row(), [0]);
    expect(p.include).toEqual(['preset']);
    expect(p.cand.talentAllocation).toBeNull();
  });
  it('excluding only the talent group when sigil conditions are also written keeps the character scope', () => {
    const r = row();
    r.writes.push({ scope: 'character', title: 'Sigil conditions', owner: { species: ['CATACLYSM'] }, changeIds: ['condition:CATACLYSM'], sideEffects: [] });
    r.candidate.sigilConditions = { CATACLYSM: 'ENEMY_HP_BELOW_40' };
    const p = applyPlan(r, [0]);
    expect(p.include).toContain('character');
    expect(p.cand.talentAllocation).toBeNull();
    expect(p.cand.sigilConditions).toEqual({ CATACLYSM: 'ENEMY_HP_BELOW_40' });
    const q = applyPlan(r, [2]);
    expect(q.cand.sigilConditions).toEqual({});
    expect(q.cand.talentAllocation).not.toBeNull();
  });
  it('lists every side effect of the groups that stay on', () => {
    expect(sideEffectsOf(row(), []).map((s) => s.name)).toEqual(['Boss build']);
    expect(sideEffectsOf(row(), [0])).toEqual([]);
  });
});

describe('text helpers', () => {
  it('formats durations', () => {
    expect(fmtDuration(400)).toBe('0.4 s');
    expect(fmtDuration(38_000)).toBe('38 s');
    expect(fmtDuration(134_000)).toBe('2m 14s');
    expect(fmtDuration(null)).toBe('n/a');
  });
  it('job chips say what was found', () => {
    expect(optimiserJobChips(richResult())).toEqual([{ tone: 'up', text: '2 better' }, { tone: 'warn', text: '1 too close to call' }]);
    expect(optimiserJobChips({ status: 'failed' })).toEqual([{ tone: 'warn', text: 'Could not run' }]);
    expect(optimiserJobChips({ status: 'done', headline: { better: 0, unresolved: 0 } })).toEqual([{ text: 'Nothing beat the current build' }]);
  });
});

describe('change labels (no internal id reaches the UI)', () => {
  const glyph = (i) => ({ id: `glyph:bb55b082-1082-43da-ba9d-bd6b1633c75d:minor:${i}`, dimension: 'minorGlyphs', label: `Wolf minor socket ${i + 1}` });
  const changes = [
    { id: 'spec', dimension: 'spec', label: 'Talent set' },
    { id: 'talents:0', dimension: 'talents', label: 'Talents (Set A)' },
    { id: 'mount', dimension: 'mount', label: 'Mount' },
    glyph(0), glyph(1), glyph(2),
  ];

  it('summarises each dimension once, with the glyph sockets counted together', () => {
    expect(changeSummary(changes)).toBe('6 changes · Talent set, Talents, Mount, 3 glyph sockets');
    expect(changeSummary([glyph(0)])).toBe('1 change · 1 glyph socket');
    expect(changeSummary(changes)).not.toMatch(/minorGlyphs/);
  });
  it('names a dimension, never its key', () => {
    expect(dimensionLabel('minorGlyphs')).toBe('Minor glyphs');
    expect(dimensionLabel('talents')).toBe('Talents');
    expect(dimensionLabel('somethingNew')).toBe('Other');
  });
  it('maps a change id to its label, from the row or from the id shape', () => {
    expect(changeIdLabel('talents:0', changes)).toBe('Talents (Set A)');
    expect(changeIdLabel('talents:1')).toBe('Talents (Set B)');
    expect(changeIdLabel('glyph:abc:minor:2')).toBe('Minor glyph socket 3');
    expect(changeIdLabel('condition:BERSERK_STANCE')).toBe('Sigil condition');
    expect(changeIdLabel('relics')).toBe('Relics');
    expect(changeIdLabel('zzz:9')).toBe('Another change');
  });
  it('writes the Comes with text from labels, counting sockets', () => {
    const t = bundleText(['talents:0', glyph(0).id, glyph(1).id, glyph(2).id], changes);
    expect(t).toBe('Talents (Set A), 3 glyph sockets');
    expect(t).not.toMatch(/glyph:|talents:\d|[0-9a-f]{8}-/);
  });
});

describe('onlyWith', () => {
  const z = { delta: 0, lo: 0, hi: 0 };
  const need = { delta: -5, lo: -6, hi: -4 };
  const changes = [
    { id: 'mount', label: 'Mount', bundle: ['glyph:m:minor:0'], own: { delta: 3, lo: 1, hi: 5 }, needed: need },
    { id: 'glyph:m:minor:0', label: 'Minor glyph socket 1', bundle: [], own: z, needed: need },
    { id: 'pet', label: 'Pet', bundle: [], own: z, needed: null },
  ];
  it('names the change whose bundle forces a zero-own change; null otherwise', () => {
    expect(onlyWith(changes[1], changes)).toBe('Mount');
    expect(onlyWith(changes[0], changes)).toBeNull();
    expect(onlyWith(changes[2], changes)).toBeNull();
  });
});
