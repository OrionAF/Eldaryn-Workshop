import { describe, it, expect } from 'vitest';
import { optimizeBuild, createEvalCache } from './search.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { sheetInputsKey } from '../build/stats.js';
import { normaliseCharacter } from '../model/index.js';
import { relicsForClass } from '../game/relics.js';

const SMALL = { n1: 4, n2: 8, maxEvals: 24, finalists: 5, maxPasses: 2, topN: 6, width: 2 };
const only = (...on) => Object.fromEntries(
  ['equipmentSet', 'talentSet', 'talents', 'pet', 'mount', 'glyphs', 'relics', 'sigils', 'utility', 'ancient', 'conditions', 'transcendence']
    .map((k) => [k, on.includes(k)]),
);

/** The fixture with the first preset stripped of relics (five are owned at level > 0). */
function relicless(cls = 'WARRIOR') {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter(cls)));
  raw.presets[0].relicIds = [];
  return normaliseCharacter(raw);
}

describe('optimizeBuild on a 60 s dummy', () => {
  it('the top result is at least the current preset, on the same seeds (all four classes)', async () => {
    for (const cls of ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER']) {
      const r = await optimizeBuild({ character: fixtureCharacter(cls), presetId: 'p1', budget: SMALL, seed: 3 });
      expect(r.tier).toBe(2);
      expect(r.aborted).toBe(false);
      expect(r.results[0].score).toBeGreaterThanOrEqual(r.baseline.score);
      expect(r.results[0].value).toBeGreaterThanOrEqual(r.baseline.value);
      expect(r.results.some((e) => e.isBaseline)).toBe(true);
      expect(r.baseline.isBaseline).toBe(true);
      expect(r.baseline.vsBaseline).toBeNull();
    }
  });

  it('finds an obvious improvement: owned relics the preset does not wear', async () => {
    const character = relicless();
    const r = await optimizeBuild({ character, presetId: 'p1', space: only('relics'), budget: SMALL });
    const top = r.results[0];
    expect(top.isBaseline).toBe(false);
    expect(top.value).toBeGreaterThan(r.baseline.value);
    expect(top.candidate.relicIds).toHaveLength(4);
    const owned = new Set(relicsForClass('WARRIOR').map((x) => x.id).filter((id) => character.relics[id] > 0));
    expect(top.candidate.relicIds.every((id) => owned.has(id))).toBe(true);
    expect(top.changes.map((c) => c.label)).toEqual(['Relics']);
    expect(top.changes[0].from).toBe('None');
    expect(top.vsBaseline.delta).toBeGreaterThan(0);
    expect(top.vsBaseline.pct).toBeGreaterThan(0);
    expect(top.vsBaseline.significant).toBe(true);
    expect(top.vsBaseline.lo).toBeLessThanOrEqual(top.vsBaseline.delta);
    expect(top.vsBaseline.hi).toBeGreaterThanOrEqual(top.vsBaseline.delta);
  });

  it('results are ranked best first with 1-based ranks, a describe line set each, and plain JSON', async () => {
    const r = await optimizeBuild({ character: relicless(), presetId: 'p1', space: only('relics', 'pet'), budget: SMALL });
    r.results.forEach((e, i) => {
      expect(e.rank).toBe(i + 1);
      if (i > 0) expect(e.score).toBeLessThanOrEqual(r.results[i - 1].score);
      expect(e.lines.map((l) => l.label)).toContain('Relics');
      expect(e.n).toBe(r.budget.n2);
    });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('builds that are the same in effect appear once (talent points that give the same stats)', async () => {
    // Sharpened Blade and Brutality are both +2 % Attack per point: moving a point between them changes nothing.
    const r = await optimizeBuild({
      character: fixtureCharacter('WARRIOR'), presetId: 'p1', space: only('talents'),
      budget: { ...SMALL, maxEvals: 40, finalists: 8, topN: 8 },
    });
    expect(new Set(r.results.map((e) => e.value)).size).toBe(r.results.length);
    expect(new Set(r.results.map((e) => e.key)).size).toBe(r.results.length);
    // and the current build wins every tie against its own no-op variants
    expect(r.results.some((e) => e.isBaseline)).toBe(true);
  });

  it('is deterministic for a seed, and a different seed may differ', async () => {
    const run = (seed) => optimizeBuild({ character: relicless(), presetId: 'p1', space: only('relics', 'sigils'), budget: SMALL, seed });
    const a = await run(5);
    const b = await run(5);
    const strip = (r) => ({ ...r, stats: { ...r.stats, ms: 0 } });
    expect(strip(a)).toEqual(strip(b));
    const c = await run(6);
    expect(c.baseline.value).not.toBe(a.baseline.value);
  });

  it('the result cache makes a repeat run free and unchanged', async () => {
    const cache = createEvalCache();
    const req = { character: relicless(), presetId: 'p1', space: only('relics'), budget: SMALL, cache };
    const a = await optimizeBuild(req);
    expect(a.stats.cacheHits).toBe(0);
    const b = await optimizeBuild(req);
    expect(b.stats.cacheHits).toBe(b.stats.tier1 + b.stats.tier2);
    expect(b.results).toEqual(a.results);
    // a different character snapshot does not share entries
    const c = await optimizeBuild({ ...req, character: fixtureCharacter('WARRIOR') });
    expect(c.stats.cacheHits).toBe(0);
  });

  it('a cache shared with a run at another N never serves the other N (#76)', async () => {
    const cache = createEvalCache();
    const req = { character: relicless(), presetId: 'p1', space: only('relics'), budget: SMALL, cache };
    await optimizeBuild(req);
    const more = await optimizeBuild({ ...req, budget: { ...SMALL, n1: 6, n2: 12 } });
    expect(more.stats.cacheHits).toBe(0);
    expect(more.results.every((e) => e.n === 12)).toBe(true);
  });

  it('ttk rows compare the ranked quantile: vsBaseline is the median difference in ms, signed as a gain (#73)', async () => {
    const r = await optimizeBuild({
      character: relicless(), presetId: 'p1', target: { kind: 'custom', mob: { hp: 3e6, attack: 1, attackSpeed: 1 }, seconds: 600 },
      objective: { kind: 'ttk-median' }, space: only('relics'), budget: SMALL,
    });
    expect(r.objective.unit).toBe('ms');
    for (const e of r.results.filter((x) => !x.isBaseline)) {
      expect(e.vsBaseline.delta).toBeCloseTo(r.baseline.value - e.value, 6);
      expect(e.vsBaseline.lo).toBeLessThanOrEqual(e.vsBaseline.delta);
      expect(e.vsBaseline.hi).toBeGreaterThanOrEqual(e.vsBaseline.delta);
    }
  });

  it('the budget stops the search and says why', async () => {
    const r = await optimizeBuild({ character: relicless(), presetId: 'p1', budget: { ...SMALL, maxEvals: 3 } });
    expect(r.truncated).toBe('evals');
    expect(r.stats.tier1).toBe(3);
    expect(r.tier).toBe(2);
    const t = await optimizeBuild({ character: relicless(), presetId: 'p1', budget: { ...SMALL, maxMs: 1e-6 } });
    expect(t.truncated).toBe('time');
    expect(t.stats.tier1).toBe(1);
    expect(t.results[0].isBaseline).toBe(true);
  });

  it('progress reports the search, then the final tier', async () => {
    const phases = [];
    await optimizeBuild({ character: relicless(), presetId: 'p1', space: only('relics'), budget: SMALL, onProgress: (p) => phases.push(p) });
    expect(phases[0]).toMatchObject({ phase: 'search', evals: 1 });
    const fin = phases.filter((p) => p.phase === 'final');
    expect(fin.length).toBeGreaterThan(0);
    expect(fin.at(-1).done).toBe(fin.at(-1).total);
    expect(phases.findIndex((p) => p.phase === 'final')).toBeGreaterThan(phases.findLastIndex((p) => p.phase === 'search'));
  });

  it('presetId defaults to the active preset and the second preset can be optimised', async () => {
    const c = fixtureCharacter('WARRIOR');
    const a = await optimizeBuild({ character: c, budget: { ...SMALL, maxEvals: 4 } });
    expect(a.presetId).toBe(c.activePresetId);
    const b = await optimizeBuild({ character: c, presetId: 'p2', space: only('equipmentSet'), budget: SMALL });
    expect(b.presetId).toBe('p2');
    expect(b.results[0].score).toBeGreaterThanOrEqual(b.baseline.score);
  });

  it('echoes the target, objective, realm, seed, space and resolved budget', async () => {
    const r = await optimizeBuild({ character: relicless(), space: only('relics'), budget: SMALL, seed: 9 });
    expect(r.target).toMatchObject({ kind: 'dummy', seconds: 60, label: 'Training dummy, 60 s' });
    expect(r.objective).toMatchObject({ kind: 'dps', unit: 'dps', higherIsBetter: true });
    expect([r.realm, r.seed]).toEqual(['base', 9]);
    expect(r.space.relics).toBe(true);
    expect(r.space.pet).toBe(false);
    expect(r.budget.n1).toBe(4);
    expect(r.budget.screenKeep).toBe(40);
  });
});

describe('abort', () => {
  it('a signal aborted up front returns an empty aborted result', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const r = await optimizeBuild({ character: relicless(), budget: SMALL, signal: ctl.signal });
    expect(r.aborted).toBe(true);
    expect(r.results).toEqual([]);
    expect(r.baseline).toBeNull();
  });

  it('aborting mid-search returns best-so-far at tier 1, never worse than the current build', async () => {
    const ctl = new AbortController();
    const r = await optimizeBuild({
      character: relicless(), presetId: 'p1', space: only('relics'), budget: { ...SMALL, maxEvals: 200 }, signal: ctl.signal,
      onProgress: (p) => { if (p.phase === 'search' && p.evals >= 3) ctl.abort(); },
    });
    expect(r.aborted).toBe(true);
    expect(r.tier).toBe(1);
    expect(r.results.length).toBeGreaterThanOrEqual(2);
    expect(r.results[0].score).toBeGreaterThanOrEqual(r.baseline.score);
    expect(r.results.some((e) => e.isBaseline)).toBe(true);
    expect(r.stats.tier2).toBe(0);
  });

  it('aborting during the final tier ranks everything on tier-1 values (the tiers never mix)', async () => {
    const ctl = new AbortController();
    const r = await optimizeBuild({
      character: relicless(), presetId: 'p1', space: only('relics'), budget: SMALL, signal: ctl.signal,
      onProgress: (p) => { if (p.phase === 'final') ctl.abort(); },
    });
    expect(r.aborted).toBe(true);
    expect(r.tier).toBe(1);
    expect(r.results.every((e) => e.n === r.budget.n1)).toBe(true);
  });
});

describe('other targets and objectives', () => {
  it('campaign time to kill', async () => {
    const c = fixtureCharacter('WARRIOR');
    const r = await optimizeBuild({
      character: c, presetId: 'p1', target: { kind: 'chapter', chapter: 11, level: 5 },
      objective: { kind: 'ttk-median' }, space: only('relics', 'pet'), budget: SMALL,
    });
    expect(r.target.kind).toBe('chapter');
    expect(r.objective).toMatchObject({ kind: 'ttk-median', unit: 'ms', higherIsBetter: false });
    expect(r.results[0].score).toBeGreaterThanOrEqual(r.baseline.score);
  });

  it('survival against a dungeon step', async () => {
    const r = await optimizeBuild({
      character: fixtureCharacter('SENTINEL'), presetId: 'p1', target: { kind: 'dungeon', id: 'dungeon_1', step: 3 },
      objective: { kind: 'survival', seconds: 30 }, space: only('relics'), budget: SMALL,
    });
    expect(r.objective.unit).toBe('p');
    expect(r.baseline.value).toBeGreaterThanOrEqual(0);
    expect(r.baseline.value).toBeLessThanOrEqual(1);
    expect(r.results[0].score).toBeGreaterThanOrEqual(r.baseline.score);
  });

  it('World Boss damage', async () => {
    const r = await optimizeBuild({
      character: fixtureCharacter('WARRIOR'), presetId: 'p1', target: { kind: 'worldBoss', affinity: 'FORTIFIED' },
      objective: { kind: 'dps' }, space: only('relics'), budget: { ...SMALL, maxEvals: 6 },
    });
    expect(r.target.label).toContain('fortified');
    expect(r.results[0].value).toBeGreaterThanOrEqual(r.baseline.value);
  });

  it('an Oblivion floor forces the Oblivion realm and drops the equipment-set dimension', async () => {
    const r = await optimizeBuild({
      character: fixtureCharacter('WARRIOR'), presetId: 'p1', realm: 'base', target: { kind: 'oblivion', floor: 6 },
      objective: { kind: 'survival', seconds: 30 }, space: only('equipmentSet', 'relics'), budget: SMALL,
    });
    expect(r.realm).toBe('oblivion');
    expect(r.results.every((e) => e.candidate.equipmentSet === 1)).toBe(true);
    expect(r.baseline.lines[0].value).toBe('Oblivion set');
  });

  it('rejects an objective the target cannot score, a missing character, and a missing preset', async () => {
    const character = fixtureCharacter('WARRIOR');
    await expect(optimizeBuild({ character, objective: { kind: 'ttk-median' } })).rejects.toThrow(/cannot score/);
    await expect(optimizeBuild({})).rejects.toThrow(/character is required/);
    await expect(optimizeBuild({ character: { ...character, presets: [] } })).rejects.toThrow(/no preset/);
    await expect(optimizeBuild({ character, target: { kind: 'chapter', chapter: 99, level: 1 }, objective: { kind: 'survival' } })).rejects.toThrow(/does not exist/);
  });
});

describe('residual carry', () => {
  const sheetedWith = (stamp) => {
    const base = fixtureCharacter('WARRIOR');
    const c = {
      ...base,
      presets: base.presets.map((p) => (p.id === 'p1' ? { ...p, relicIds: [], sheet: { values: { totalAttack: 90000 } } } : p)),
    };
    if (!stamp) return c;
    const inputsKey = sheetInputsKey(c, 'p1');
    return { ...c, presets: c.presets.map((p) => (p.id === 'p1' ? { ...p, sheet: { ...p.sheet, inputsKey } } : p)) };
  };

  it('an unconfirmed sheet carries no residual, and the run says so', async () => {
    const r = await optimizeBuild({ character: sheetedWith(false), presetId: 'p1', space: only('relics'), budget: SMALL });
    expect(r.stats.residualKeys).toBe(0);
    expect(r.warnings.map((w) => w.code)).toEqual(['sheet-unverified']);
  });

  it('a preset with a confirmed sheet is searched on computed stats plus its residual, and still never loses to itself', async () => {
    const r = await optimizeBuild({ character: sheetedWith(true), presetId: 'p1', space: only('relics'), budget: SMALL });
    expect(r.warnings.map((w) => w.code)).toEqual(['residual-applied']);
    expect(r.stats.residualKeys).toBeGreaterThan(0);
    expect(r.results[0].score).toBeGreaterThanOrEqual(r.baseline.score);
    // the residual lifts every candidate: the baseline sits near the sheet's Attack, not the computed one
    expect(r.baseline.value).toBeGreaterThan(20000);
  });
});
