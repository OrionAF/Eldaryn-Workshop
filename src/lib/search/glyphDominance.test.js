import { describe, it, expect } from 'vitest';
import { createBuildSpace, minorRowsFor } from './space.js';
import { subsetsUpTo } from './combinatorics.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { glyphSecondaryValue } from '../model/glyphs.js';
import { MAJOR_GLYPHS } from '../game/mountsGlyphs.js';

const block = (space, id) => space.blocks.find((b) => b.id === id);
// Legendary minors roll in quality [0.8, 1]; the value is whatever glyphSecondaryValue makes of it
const minor = (id, stat, quality) => ({ id, glyphType: 'g-tempest', rarity: 'Legendary', sealed: false, secondary: { stat, quality } });
const valueOf = (character, id) => glyphSecondaryValue(character.glyphs.find((g) => g.id === id).secondary);

/** The WARRIOR fixture with `glyphs` as the whole inventory and empty sockets (or `minorRow` socketed). */
function withGlyphs(glyphs, minorRow = [null, null, null]) {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  const majors = raw.glyphs.filter((g) => !g.secondary);
  raw.glyphs = [...glyphs, ...majors];
  raw.mounts[0].glyphs = { minor: minorRow, major: [null, null], mythic: [null] };
  return normaliseCharacter(raw);
}
const rowsOf = (character) => {
  const space = createBuildSpace(character, 'p1');
  return { space, arms: block(space, 'minorGlyphs').domain(space.start) };
};
const minorsOf = (space, arm) => (arm.mountGlyphs?.minor ?? space.character.mounts[0].glyphs.minor).filter(Boolean);

const SPEED = [minor('s11', 'attackSpeed', 1), minor('s10a', 'attackSpeed', 0.9), minor('s10b', 'attackSpeed', 0.9), minor('s5', 'attackSpeed', 0.8)];

describe('minor glyph dominance (simulation.md Build space / Blocks)', () => {
  it('fixture: the speed glyphs have values 11 > 10 = 10 > 5 in order', () => {
    const c = withGlyphs(SPEED);
    const v = SPEED.map((g) => valueOf(c, g.id));
    expect(v[0]).toBeGreaterThan(v[1]);
    expect(v[1]).toBe(v[2]);
    expect(v[2]).toBeGreaterThan(v[3]);
  });

  it('the weakest glyph of a stat is never socketed while a better one is spare', () => {
    const { space, arms } = rowsOf(withGlyphs(SPEED));
    expect(arms.length).toBeGreaterThan(0);
    for (const a of arms) expect(minorsOf(space, a)).not.toContain('s5');
  });

  it('a stat contributes its top-m glyphs: 2 speed glyphs are the 11 and a 10', () => {
    const { space, arms } = rowsOf(withGlyphs([...SPEED, minor('c1', 'critChance', 0.9)]));
    for (const a of arms) {
      const ids = minorsOf(space, a);
      const speed = ids.filter((id) => id.startsWith('s'));
      if (speed.length >= 1) expect(speed).toContain('s11');
      if (speed.length === 3) expect(speed.filter((id) => id.startsWith('s10')).length).toBe(2);
    }
    // 3 speed + 0 crit, 2 + 1, 1 + 2 (only one crit glyph: not offered), so 2 rows
    expect(arms.map((a) => minorsOf(space, a).length)).toEqual(arms.map(() => 3));
    expect(arms.length).toBe(2);
  });

  it('twins are never swapped: no two rows differ only by exchanging equal-value glyphs; the socketed twin is kept', () => {
    const c = withGlyphs(SPEED, ['s10b', null, null]);
    const { space, arms } = rowsOf(c);
    const shape = (a) => minorsOf(space, a).map((id) => `${c.glyphs.find((g) => g.id === id).secondary.stat}:${valueOf(c, id)}`).sort().join('|');
    const shapes = [...arms.map(shape), shape(space.start)];
    expect(new Set(shapes).size).toBe(shapes.length);
    // s10a (a twin of the socketed s10b) is only used beside s10b, never instead of it
    for (const a of arms) if (minorsOf(space, a).includes('s10a')) expect(minorsOf(space, a)).toContain('s10b');
  });

  it('no row has an empty socket while 3 usable glyphs exist; with fewer, one row uses them all', () => {
    const { space, arms } = rowsOf(withGlyphs([...SPEED, minor('c1', 'critChance', 0.9), minor('h1', 'healthPercent', 0.9)]));
    for (const a of arms) expect(minorsOf(space, a).length).toBe(3);
    const two = withGlyphs([minor('a', 'attackSpeed', 1), minor('b', 'critChance', 1), { ...minor('seal', 'critDamage', 1), sealed: true }]);
    const r = rowsOf(two);
    expect(r.arms.map((a) => minorsOf(r.space, a).sort())).toEqual([['a', 'b']]);
  });

  it('a glyph without a secondary or a sealed one is never offered', () => {
    const c = withGlyphs([...SPEED.slice(0, 3), { id: 'blank', glyphType: 'g-swift', rarity: 'Common', sealed: false, secondary: null }, { ...minor('sealed', 'critChance', 1), sealed: true }]);
    const { space, arms } = rowsOf(c);
    for (const a of arms) expect(minorsOf(space, a)).not.toEqual(expect.arrayContaining(['blank']));
    for (const a of arms) expect(minorsOf(space, a)).not.toContain('sealed');
  });

  it('the pruned domain holds the exhaustive search best under an additive monotone objective', () => {
    const stats = ['attackSpeed', 'critChance', 'healthPercent', 'lifesteal'];
    const inv = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 9; i++) inv.push(minor(`g${i}`, stats[Math.floor(rnd() * stats.length)], [0.8, 0.85, 0.9, 0.95, 1][Math.floor(rnd() * 5)]));
    const c = withGlyphs(inv);
    const weight = { attackSpeed: 3, critChance: 1, healthPercent: 0.4, lifesteal: 2 };
    const cap = { attackSpeed: 0.3, critChance: 100, healthPercent: 100, lifesteal: 9 }; // soft caps only flatten
    const score = (ids) => {
      const sum = {};
      for (const id of ids) {
        const g = c.glyphs.find((x) => x.id === id);
        sum[g.secondary.stat] = (sum[g.secondary.stat] ?? 0) + valueOf(c, id);
      }
      return Object.entries(sum).reduce((t, [s, v]) => t + weight[s] * Math.min(v, cap[s]), 0);
    };
    const best = Math.max(...subsetsUpTo(inv.map((g) => g.id), 3).map(score));
    const cur = { minor: [null, null, null], major: [null, null], mythic: [null] };
    const rows = minorRowsFor(c, cur);
    expect(rows.length).toBeLessThan(subsetsUpTo(inv.map((g) => g.id), 3).length);
    expect(Math.max(...rows.map(score))).toBeCloseTo(best, 10);
  });

  it('is deterministic, and shrinks the domain', () => {
    const c = withGlyphs([...SPEED, minor('c1', 'critChance', 0.9), minor('h1', 'healthPercent', 0.9), minor('l1', 'lifesteal', 0.9)]);
    const a = rowsOf(c);
    const b = rowsOf(c);
    expect(JSON.stringify(a.arms)).toBe(JSON.stringify(b.arms));
    expect(a.arms.length + 1).toBeLessThan(subsetsUpTo(c.glyphs.filter((g) => g.secondary).map((g) => g.id), 3).length);
  });
});

describe('major glyph dominance', () => {
  function withMajors(extra) {
    const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
    const base = raw.glyphs.find((g) => g.id === 'gl-3');
    raw.mounts[0].glyphs.major = [null, null];
    raw.glyphs.push(...extra.map((e) => ({ ...base, ...e })));
    return { c: normaliseCharacter(raw), base };
  }

  it('per glyph type only the best-rarity instance is offered; identical twins collapse', () => {
    const { c } = withMajors([
      { id: 'epic', rarity: 'Epic' }, { id: 'epic2', rarity: 'Epic' }, { id: 'common', rarity: 'Common' },
      { id: 'sealedLeg', rarity: 'Legendary', sealed: true },
    ]);
    const space = createBuildSpace(c, 'p1');
    const used = new Set(block(space, 'majorGlyphs').domain(space.start).flatMap((a) => a.mountGlyphs.major.filter(Boolean)));
    expect([...used]).toEqual(['epic']);
  });

  it('of equal rarity the socketed instance is the representative', () => {
    const { c } = withMajors([{ id: 'aa', rarity: 'Rare' }]);
    const raw = JSON.parse(JSON.stringify(c));
    raw.mounts[0].glyphs.major = ['gl-3', null];
    const space = createBuildSpace(normaliseCharacter(raw), 'p1');
    const used = new Set(block(space, 'majorGlyphs').domain(space.start).flatMap((a) => (a.mountGlyphs?.major ?? ['gl-3']).filter(Boolean)));
    expect(used.has('aa')).toBe(false);
  });
});

describe('glyph dominance edge cases', () => {
  it('the baseline row stays as it is when partial or holding a dominated glyph, and the swap to its dominator is offered', () => {
    const c = withGlyphs(SPEED, ['s5', null, null]);
    const space = createBuildSpace(c, 'p1');
    expect(space.start.mountGlyphs ?? null).toBeNull(); // untouched: the saved sockets still hold s5
    const arms = block(space, 'minorGlyphs').domain(space.start);
    expect(arms.length).toBeGreaterThan(0);
    for (const a of arms) expect(minorsOf(space, a)).not.toContain('s5');
    expect(arms.some((a) => minorsOf(space, a).includes('s11'))).toBe(true);
  });

  it('a glyph socketed in a major socket is not reused as a minor (types are tiered, so a major never has a secondary)', () => {
    const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
    raw.glyphs.push(minor('s11', 'attackSpeed', 1), minor('s10', 'attackSpeed', 0.9), minor('c1', 'critChance', 0.9));
    const c = normaliseCharacter(raw);
    expect(c.mounts[0].glyphs.major).toContain('gl-3');
    const rows = minorRowsFor(c, c.mounts[0].glyphs);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).not.toContain('gl-3');
  });

  it('rows are per mount: the same inventory glyph may sit on several mounts', () => {
    const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
    raw.glyphs = [minor('s11', 'attackSpeed', 1), minor('c1', 'critChance', 0.9), minor('h1', 'healthPercent', 0.9)];
    raw.mounts.push({ ...raw.mounts[0], id: 'mount-b', glyphs: { minor: [null, null, null], major: [null, null], mythic: [null] } });
    raw.mounts[0].glyphs = { minor: ['s11', 'c1', 'h1'], major: [null, null], mythic: [null] };
    const c = normaliseCharacter(raw);
    const mountB = c.mounts.find((m) => m.id === 'mount-b');
    expect(minorRowsFor(c, mountB.glyphs).map((r) => [...r].sort())).toEqual([['c1', 'h1', 's11']]);
    const space = createBuildSpace(c, 'p1');
    const onB = block(space, 'minorGlyphs').domain({ ...space.start, mountId: 'mount-b', mountGlyphs: null });
    expect(onB.length).toBeGreaterThan(0);
  });
});

describe('major glyph tables are monotone in the player\'s favour (rarity index 0..4)', () => {
  // Direction per field from mounts-glyphs.md §10: SUNDER_DECAY takes the min (lower decay is better); the
  // ELUSIVE burn override is null (no override) below Epic, then 1 (stack loss capped, better than none).
  const LOWER_IS_BETTER = new Set(['SUNDER_DECAY.decaypersecond']);
  it('every field is non-decreasing (non-increasing where lower is better) and has five entries', () => {
    const bad = [];
    for (const g of MAJOR_GLYPHS) {
      for (const [field, values] of Object.entries(g.perRarity)) {
        const key = `${g.effectKind}.${field}`;
        if (values.length !== 5) bad.push(`${g.id} ${key}: ${values.length} entries`);
        const set = values.filter((v) => v != null);
        const firstSet = values.findIndex((v) => v != null);
        if (values.slice(firstSet).some((v) => v == null)) bad.push(`${g.id} ${key}: null after a value`);
        const lower = LOWER_IS_BETTER.has(key);
        for (let i = 1; i < set.length; i++) if (lower ? set[i] > set[i - 1] : set[i] < set[i - 1]) bad.push(`${g.id} ${key}: ${values.join()}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
