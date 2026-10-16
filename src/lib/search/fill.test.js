import { describe, it, expect } from 'vitest';
import { createBuildSpace, socketsOf } from './space.js';
import { candidateEngineKey } from './effect.js';
import { fillCandidates, fillEmptySockets } from './fill.js';
import { minimise } from './minimise.js';
import { rowViolations } from './result.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';

// The WARRIOR fixture: preset p1 rides mount-a (major [gl-3 Warborn Fury cooldown, empty], minor [gl-1, gl-2,
// empty]) and runs Berserk Stance, Warborn Fury and Cataclysm.
const major = (id, glyphType, rarity) => ({ id, glyphType, rarity, sealed: false, secondary: null });
const minor = (id, stat, quality) => ({ id, glyphType: 'g-tempest', rarity: 'Legendary', sealed: false, secondary: { stat, quality } });

function withInventory(extra, edit = () => {}) {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  raw.glyphs.push(...extra);
  edit(raw);
  return normaliseCharacter(raw);
}
const INVENTORY = [
  major('cata', 'sg-cataclysm-cd', 'Common'), major('cataEpic', 'sg-cataclysm-cd', 'Epic'),
  major('bastion', 'sg-bastion-cd', 'Legendary'), // Iron Bastion is not equipped: inert
  major('warborn2', 'sg-warborn-cd', 'Legendary'), // gl-3 is this type already: two never stack
  minor('crit', 'critChance', 0.9),
];

describe('free fills: which glyphs go where (fill.js)', () => {
  it('a major candidate acts for the build: inert types and types already on the mount are left out, best rarity first', () => {
    const space = createBuildSpace(withInventory(INVENTORY), 'p1');
    expect(fillCandidates(space, space.start, 'major').map((g) => g.id)).toEqual(['cataEpic', 'cata']);
    expect(fillCandidates(space, space.start, 'minor').map((g) => g.id)).toEqual(['crit']);
  });

  it('fills every empty major and minor socket, once per type, and the engine inputs change', () => {
    const space = createBuildSpace(withInventory(INVENTORY), 'p1');
    const { candidate, glyphs } = fillEmptySockets(space, space.start, space.start);
    expect(glyphs).toEqual(['cataEpic', 'crit']);
    const rows = socketsOf(space.character, candidate);
    expect(rows.major).toEqual(['gl-3', 'cataEpic']);
    expect(rows.minor).toEqual(['gl-1', 'gl-2', 'crit']);
    expect(candidateEngineKey(space, candidate)).not.toBe(candidateEngineKey(space, space.start));
  });

  it('a tier whose block is off under Allowed to change is not filled', () => {
    const space = createBuildSpace(withInventory(INVENTORY), 'p1', { toggles: { majorGlyphs: false } });
    expect(fillEmptySockets(space, space.start, space.start).glyphs).toEqual(['crit']);
  });

  it('nothing to fill: no mount, or only inert glyphs', () => {
    const inert = createBuildSpace(withInventory([major('bastion', 'sg-bastion-cd', 'Legendary')]), 'p1');
    expect(fillEmptySockets(inert, inert.start, inert.start).glyphs).toEqual([]);
    const noMount = { ...inert.start, mountId: null, mountGlyphs: null };
    expect(fillEmptySockets(inert, inert.start, noMount)).toEqual({ candidate: noMount, glyphs: [] });
  });

  it('a glyph the minimised build took off goes back first, even when a better one of its type is owned', () => {
    for (const [inventory, back] of [[INVENTORY.filter((g) => g.id !== 'warborn2'), 'gl-3'], [INVENTORY, 'gl-3']]) {
      const c = withInventory(inventory);
      const space = createBuildSpace(c, 'p1');
      const F = space.legalise({ ...space.start, mountGlyphs: { ...socketsOf(c, space.start), major: ['cataEpic', null] } });
      expect(socketsOf(c, F).major).not.toContain('gl-3');
      const { candidate, glyphs } = fillEmptySockets(space, space.start, F);
      expect(glyphs[0]).toBe(back);
      expect(socketsOf(c, candidate).major).toEqual(expect.arrayContaining(['cataEpic', back]));
    }
  });
  it('a fill never lands in a socket the baseline holds: an upgraded glyph keeps its socket', () => {
    // saved [gl-3, empty]; F upgrades gl-3 to warborn2 (same type). A fill sorting before warborn2 would push it
    // into socket 2 and read as "gl-3 -> fill"; such a placement is skipped for the next candidate.
    const c = withInventory([...INVENTORY, major('zz-cata', 'sg-cataclysm-cd', 'Epic')].filter((g) => g.id !== 'cataEpic' && g.id !== 'cata'));
    const space = createBuildSpace(c, 'p1');
    const F = space.legalise({ ...space.start, mountGlyphs: { ...socketsOf(c, space.start), major: ['warborn2', null] } });
    expect(socketsOf(c, F).major).toEqual(['warborn2', null]);
    const { candidate, glyphs } = fillEmptySockets(space, space.start, F);
    expect(glyphs).toEqual(['zz-cata', 'crit']);
    expect(socketsOf(c, candidate).major).toEqual(['warborn2', 'zz-cata']);
    const early = withInventory([...INVENTORY.filter((g) => g.id !== 'cata')]);
    const s2 = createBuildSpace(early, 'p1');
    const F2 = s2.legalise({ ...s2.start, mountGlyphs: { ...socketsOf(early, s2.start), major: ['warborn2', null] } });
    // cataEpic sorts before warborn2, so placing it would shuffle warborn2 into socket 2: skipped, nothing else fits
    expect(fillEmptySockets(s2, s2.start, F2).glyphs).toEqual(['crit']);
  });
});

describe('free fills in minimise', () => {
  // A stub run: every change of the build is needed ('better'), the baseline is beaten, and a test of a fill
  // (the build against itself without one of `fills`) answers `fillVerdict`.
  function setup({ fillVerdict = 'equivalent', paidVerdict = 'better', fill = true } = {}) {
    const space = createBuildSpace(withInventory(INVENTORY), 'p1');
    const armOf = (cand) => ({ key: space.key(cand), cand });
    const B = armOf(space.start);
    const F = armOf(space.legalise({ ...space.start, equipmentSet: 2 }));
    const count = (cand) => ['cataEpic', 'crit'].filter((id) => Object.values(socketsOf(space.character, cand) ?? {}).flat().includes(id)).length;
    let filledRound = false;
    const compare = async (X, Y) => {
      if (Y.key === B.key) return { verdict: 'better', significant: true };
      if (count(X.cand) > count(Y.cand)) return { verdict: fillVerdict, significant: fillVerdict !== 'equivalent' };
      if (count(X.cand) > 0) filledRound = true;
      const v = count(X.cand) > 0 ? paidVerdict : 'better';
      return { verdict: v, significant: v === 'better' };
    };
    return { space, B, F, ctx: { space, B, armOf, fill, compare }, seen: () => filledRound };
  }

  it('fills the empty sockets after the needed set is found; the fills are free and every other change is still needed', async () => {
    const { space, B, F, ctx } = setup();
    const m = await minimise(ctx, F, { alpha: 0.05, alphaFinal: 0.05 });
    const rows = socketsOf(space.character, m.arm.cand);
    expect(rows.major).toContain('cataEpic');
    expect(rows.minor).toContain('crit');
    expect(m.free).toHaveLength(2);
    for (const id of m.free) expect(id).toMatch(/^glyph:mount-a:(major|minor):\d$/);
    // the row passes I1-I3 with its free changes exempt from I3
    const changes = Object.keys(m.decided).map((id) => ({ id, free: m.free.includes(id), bundle: [] }));
    expect(rowViolations(space, B.cand, { candidate: m.arm.cand, isBaseline: false, changes }, { decided: m.decided })).toEqual([]);
  });

  it('a fill that is worse to keep, or a paid change no longer needed with the fills, leaves the build unfilled', async () => {
    for (const o of [{ fillVerdict: 'worse' }, { paidVerdict: 'equivalent' }]) {
      const { F, ctx } = setup(o);
      const m = await minimise(ctx, F, { alpha: 0.05, alphaFinal: 0.05 });
      expect(m.arm.key).toBe(F.key);
      expect(m.free).toEqual([]);
    }
  });

  it('off unless the caller asks for it', async () => {
    const { F, ctx, seen } = setup({ fill: false });
    const m = await minimise(ctx, F, { alpha: 0.05, alphaFinal: 0.05 });
    expect(m.arm.key).toBe(F.key);
    expect(seen()).toBe(false);
  });
});

describe('free fills through the driver', { timeout: 120000 }, () => {
  it('every row leaves no empty major socket while an owned glyph acts for it; a fill is marked free and not counted', async () => {
    const { optimize } = await import('./search.js');
    const { BLOCKS } = await import('./space.js');
    const { changeSummary } = await import('../ui/optimiserView.js');
    const character = withInventory([major('cataEpic', 'sg-cataclysm-cd', 'Epic')], (raw) => { raw.presets[0].relicIds = []; });
    const space = Object.fromEntries(BLOCKS.map((b) => [b, b === 'relics' || b === 'majorGlyphs']));
    const r = await optimize({ character, presetId: 'p1', target: { kind: 'dummy', seconds: 10 }, space, effort: { level: 'quick', n0: 8, maxN: 32, randomStarts: 0 }, seed: 2 });
    expect(r.status).toBe('done');
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(socketsOf(character, row.candidate).major).toContain('cataEpic');
      for (const c of row.changes.filter((x) => x.free)) {
        expect(c.keptBecause).toBe('free');
        expect(c.dimension).toBe('majorGlyphs');
      }
      const free = row.changes.filter((x) => x.free).length;
      if (free) expect(changeSummary(row.changes)).toMatch(new RegExp(`^${row.changes.length - free} change.* · fills ${free} empty socket`));
    }
  });
});
