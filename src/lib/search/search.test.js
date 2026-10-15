import { describe, it, expect } from 'vitest';
import { optimize, optimizeMore, resolveEffort, EXHAUSTIVE_MAX } from './search.js';
import { BLOCKS, createBuildSpace } from './space.js';
import { legalityOf } from './legality.js';
import { makeObjective, resolveTarget } from './objectives.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { genericSigils } from '../model/sigils.js';
import { sanitiseAllocation } from '../model/talents.js';
import { talentSpec } from '../game/talents.js';
import { dpsVsDummy } from '../engine/metrics.js';

const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const TINY = { level: 'quick', n0: 8, maxN: 32, randomStarts: 0 };
const SHORT = { kind: 'dummy', seconds: 10 };
const edit = (fn, cls = 'WARRIOR') => {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter(cls)));
  fn(raw);
  return normaliseCharacter(raw);
};
const relicless = () => edit((raw) => { raw.presets[0].relicIds = []; });
/** A result without its wall-clock fields (everything else is a function of the request). */
const timeless = (r) => ({ ...r, stats: { ...r.stats, ms: 0 }, phases: r.phases.map((p) => ({ ...p, ms: 0 })) });

describe('optimize: contract', { timeout: 120000 }, () => {
  it('a small space is raced exhaustively; every row is legal, better than the baseline and plain JSON', async () => {
    const character = relicless();
    const r = await optimize({ character, presetId: 'p1', target: SHORT, space: only('relics'), effort: TINY, seed: 2 });
    expect(r).toMatchObject({ schema: 'optimiser-result/2', status: 'done', error: null, checkpoint: null, baselineViolations: [] });
    expect(r.search.strategy).toBe('exhaustive');
    expect(r.search.jointSize).toBeLessThanOrEqual(EXHAUSTIVE_MAX);
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(legalityOf(character, 'p1', row.candidate).ok).toBe(true);
      expect(row.changes.map((c) => c.id)).toEqual(['relics']);
      expect(row.vsBaseline.verdict).toBe('better');
      expect(row.changes[0].needed.verdict).toBe('better');
      expect(row.writes).toEqual([{ scope: 'preset', title: 'Preset Main', owner: { presetId: 'p1' }, changeIds: ['relics'], sideEffects: [] }]);
    }
    expect(r.baseline).toMatchObject({ rank: 0, isBaseline: true, provisional: false, changes: [], vsBaseline: null });
    expect(r.phases.map((p) => [p.id, p.state])).toEqual([['screen', 'done'], ['search', 'done'], ['minimise', 'done'], ['confirm', 'done'], ['attribute', 'done']]);
    expect(r.search.fights.total).toBe(r.phases.reduce((s, p) => s + p.fights, 0));
    expect(r.request.seeds.search).not.toBe(r.request.seeds.confirm);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('is deterministic: the same request and seed give the same result', async () => {
    const req = { character: relicless(), presetId: 'p1', target: SHORT, space: only('relics', 'pet'), effort: TINY, seed: 5 };
    expect(timeless(await optimize(req))).toEqual(timeless(await optimize(req)));
  });

  it('effort sets precision only: retired wall-clock and eval caps are not part of a request (#68)', async () => {
    const req = { character: relicless(), presetId: 'p1', target: SHORT, space: only('relics'), effort: TINY, seed: 3 };
    const a = await optimize(req);
    const b = await optimize({ ...req, budget: { maxMs: 1e-6, finalMs: 1, maxEvals: 1, maxPasses: 1 } });
    expect(timeless(b)).toEqual(timeless(a));
    expect(Object.keys(a.request.effort).sort()).toEqual(['alpha', 'delta', 'deltaKind', 'level', 'maxN', 'n0']);
    expect(resolveEffort('standard', { deltaKind: 'relative' })).toMatchObject({ delta: 0.005, maxN: 32768 });
    expect(resolveEffort('quick', { deltaKind: 'absolute' })).toMatchObject({ delta: 0.02, maxN: 8192 });
  });

  it('a baseline that breaks a game rule is a setup blocker, never silently legalised', async () => {
    const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
    raw.presets[0].relicIds = Object.keys(raw.relics); // five relics, two slots
    const r = await optimize({ character: raw, presetId: 'p1', space: only('pet'), effort: TINY });
    expect(r.status).toBe('failed');
    expect(r.baselineViolations.map((v) => v.gate)).toContain('relicSlots');
    expect(r.rows).toEqual([]);
  });

  it('rejects a request that cannot run', async () => {
    const character = fixtureCharacter('WARRIOR');
    await expect(optimize({})).rejects.toThrow(/character is required/);
    await expect(optimize({ character, objective: { kind: 'ttk-median' } })).rejects.toThrow(/cannot score/);
    await expect(optimize({ character: { ...character, presets: [] } })).rejects.toThrow(/no preset/);
  });
});

describe('optimize: changes are the effect oracle\'s, never describe-line diffs (#65, #72)', { timeout: 120000 }, () => {
  it('a minor-glyph-only swap is listed as a glyph socket change', async () => {
    const character = edit((raw) => {
      raw.glyphs.push({ id: 'gl-9', glyphType: 'g-keen', rarity: 'Legendary', secondary: { stat: 'attackPercent', quality: 1 } });
    });
    const r = await optimize({ character, presetId: 'p1', target: SHORT, space: only('minorGlyphs'), effort: TINY, seed: 1 });
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(row.changes.length).toBeGreaterThan(0);
      expect(row.changes.every((c) => c.id.startsWith('glyph:mount-a:minor:') && c.scope === 'mount')).toBe(true);
      expect(row.writes.map((w) => w.scope)).toEqual(['mount']);
    }
  });

  it('toggling the Ancient sigil is listed as an ancient change', async () => {
    const character = edit((raw) => { raw.presets[0].ancientSigilSpecies = null; });
    const r = await optimize({ character, presetId: 'p1', target: SHORT, space: only('ancient'), effort: TINY, seed: 1 });
    expect(r.rows[0].changes.map((c) => [c.id, c.from])).toEqual([['ancient', 'None']]);
  });
});

describe('optimize: no inert or target-inert riders (#53, #71)', { timeout: 120000 }, () => {
  it('against the dummy no row carries a heal-sigil condition, and builds equal in effect appear once', async () => {
    const character = edit((raw) => {
      raw.sigils.owned.REJUVENATION = { level: 10 };
      raw.presets[0].sigilSpecies = ['BERSERK_STANCE', 'REJUVENATION', 'CATACLYSM'];
      raw.presets[0].relicIds = [];
    });
    const r = await optimize({ character, presetId: 'p1', target: SHORT, space: only('relics', 'conditions', 'minorGlyphs'), effort: TINY, seed: 1 });
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) expect(row.changes.some((c) => c.id.startsWith('condition:'))).toBe(false);
    const values = r.rows.map((row) => `${row.value.n}|${row.value.est}`);
    expect(new Set(values).size).toBe(values.length);
    expect(r.search.merged.sampleIdentical).toBeGreaterThan(0);
  });
});

describe('optimize: coverage (#52, #57, #70)', { timeout: 120000 }, () => {
  it('a deliberately poor 29-point allocation climbs to the converged optimum (old default: 3 points, +9 %)', async () => {
    const character = edit((raw) => {
      const spec = raw.talentSets[0].spec;
      const defensive = (t) => (['hpPercent', 'hpRegenFlat', 'lifestealFlat', 'damageReductionFlat', 'blockChanceFlat'].includes(t.bonusPerRank.stat) ? 0 : 1);
      const alloc = {};
      let left = 29;
      for (const tier of talentSpec(spec).tiers) {
        for (const t of [...tier.talents].sort((a, b) => defensive(a) - defensive(b))) {
          const r = Math.min(t.maxRank, left, tier.tier < 6 ? 5 : 99);
          if (r > 0) {
            alloc[t.id] = (alloc[t.id] ?? 0) + r;
            left -= r;
          }
        }
      }
      raw.talentSets[0].allocation = sanitiseAllocation(alloc, spec);
    });
    const r = await optimize({ character, presetId: 'p1', target: { kind: 'dummy', seconds: 15 }, space: only('talents'), effort: TINY, seed: 1 });
    expect(r.search.strategy).toBe('local');
    expect(r.search.converged).toBe(true);
    const space = createBuildSpace(character, 'p1', {});
    const truth = (cand) => dpsVsDummy(space.fighterOf(cand), { seconds: 60, n: 400, seed: 4242, cache: false }).mean;
    // the old beam with maxPasses = 30 reached 1.2246x the poor allocation; its default (3 passes) 1.089x
    expect(truth(r.rows[0].candidate) / truth(space.start)).toBeGreaterThan(1.21);
  }, 120000);

  it('a Warrior owning all 12 generic sigils still reaches every enabled block', async () => {
    const character = edit((raw) => {
      for (const s of genericSigils('WARRIOR', 'WARRIOR_DPS')) raw.sigils.owned[s.species] ??= { level: 10 };
    });
    const r = await optimize({ character, presetId: 'p1', target: SHORT, effort: { level: 'quick', n0: 4, maxN: 4, randomStarts: 0 }, seed: 1 });
    expect(r.search.blocks.find((b) => b.id === 'sigils').domain).toBe(299);
    expect(r.search.blocks.every((b) => b.enabled)).toBe(true);
    expect(r.search.blocks.map((b) => b.status).filter((s) => s === 'not-reached')).toEqual([]);
  }, 120000);
});

describe('cancel and resume', { timeout: 120000 }, () => {
  const req = { character: relicless(), presetId: 'p1', target: SHORT, space: only('relics', 'pet'), effort: TINY, seed: 4 };

  it('a cancelled run posts a checkpoint and returns provisional rows; resuming equals an uninterrupted run', async () => {
    const whole = await optimize(req);
    for (const stopAt of ['search', 'minimise', 'attribute']) {
      const ctl = new AbortController();
      const cps = [];
      const cut = await optimize(req, {
        signal: ctl.signal,
        onCheckpoint: (c) => cps.push(c),
        onProgress: (p) => { if (p.phase === stopAt) ctl.abort(); },
      });
      expect(cut).toMatchObject({ status: 'cancelled', aborted: true, checkpoint: { phase: stopAt, resumable: true } });
      expect(cut.rows.every((row) => row.provisional)).toBe(true);
      expect(cut.phases.find((p) => p.id === stopAt).state).toBe('cancelled');
      const cp = cps.at(-1);
      expect(cp).toMatchObject({ schema: 'optimiser-checkpoint/1', phase: stopAt });
      const resumed = await optimize({ ...req, resumeFrom: JSON.parse(JSON.stringify(cp)) });
      expect(timeless(resumed)).toEqual(timeless(whole));
    }
  });

  it('a checkpoint from another request is ignored with a note', async () => {
    const ctl = new AbortController();
    let cp = null;
    await optimize(req, { signal: ctl.signal, onCheckpoint: (c) => { cp = c; }, onProgress: (p) => { if (p.phase === 'minimise') ctl.abort(); } });
    const other = await optimize({ ...req, seed: 99, resumeFrom: cp });
    expect(other.warnings.map((w) => w.code)).toContain('checkpoint-ignored');
    expect(other.status).toBe('done');
  });

  it('progress messages carry the phase segments and counts', async () => {
    const seen = [];
    await optimize(req, { onProgress: (p) => seen.push(p) });
    expect(seen[0]).toMatchObject({ type: 'progress', phase: 'screen' });
    expect(seen.map((p) => p.phase)).toEqual(expect.arrayContaining(['screen', 'search', 'minimise', 'confirm', 'attribute']));
    const last = seen.at(-1);
    expect(last.phases.map((p) => p.id)).toEqual(['screen', 'search', 'minimise', 'confirm', 'attribute']);
    expect(last.counts.fights).toBeGreaterThan(0);
  });
});

describe('optimizeMore', { timeout: 120000 }, () => {
  it('re-measures rows and the baseline at a fixed N on a fresh seed', async () => {
    const character = relicless();
    const r = await optimize({ character, presetId: 'p1', target: SHORT, space: only('relics'), effort: TINY, seed: 2 });
    const m = await optimizeMore({ character, result: r, rowKeys: [r.rows[0].key], targetN: 24 });
    expect(m.more).toMatchObject({ round: 1, targetN: 24, rowKeys: [r.rows[0].key] });
    expect(m.rows[0].value.n).toBe(24);
    expect(m.rows[0].value.seed).toBe(m.more.seed);
    expect(m.rows[0].vsBaseline.n).toBe(24);
    expect(m.baseline.value.n).toBe(24);
    await expect(optimizeMore({ character: fixtureCharacter('WARRIOR'), result: r, targetN: 24 })).rejects.toThrow(/changed/);
  });
});

describe('objectives through the driver', { timeout: 120000 }, () => {
  it('time to kill: values and contrasts are in ms of the ranked quantile, win rate alongside', async () => {
    const r = await optimize({
      character: relicless(), presetId: 'p1', target: { kind: 'custom', mob: { hp: 3e6, attack: 1, attackSpeed: 1 }, seconds: 600 },
      objective: { kind: 'ttk-median' }, space: only('relics'), effort: TINY, seed: 1,
    });
    expect(r.objective).toMatchObject({ unit: 'ms', higherIsBetter: false, statistic: 'censored-quantile', q: 0.5 });
    for (const row of [r.baseline, ...r.rows]) {
      expect(row.value.lo).toBeLessThanOrEqual(row.value.est);
      expect(row.value.hi).toBeGreaterThanOrEqual(row.value.est);
      expect(row.aux.winRate.method).toBe('wilson');
    }
    for (const row of r.rows) {
      expect(row.vsBaseline.method).toBe('paired-bootstrap');
      expect(row.vsBaseline.delta).toBeLessThan(0); // faster
    }
  });

  it('the space follows the target mode', () => {
    const o = makeObjective({ kind: 'dps' }, resolveTarget(SHORT));
    expect(resolveEffort({ level: 'thorough' }, o)).toMatchObject({ level: 'thorough', n0: 32, maxN: 131072, delta: 0.0025 });
  });
});
