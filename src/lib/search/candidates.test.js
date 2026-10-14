import { describe, it, expect } from 'vitest';
import {
  candidateOf, candidatePatch, materialise, createBuildSpace, SPACE_DEFAULTS, DIMENSION_ORDER,
} from './candidates.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { computePresetStats } from '../build/stats.js';
import { buildFighter } from '../build/fighter.js';
import { normaliseCharacter } from '../model/index.js';
import { sanitiseAllocation, pointsSpent, TALENT_POINT_CAP } from '../model/talents.js';
import { relicsForClass } from '../game/relics.js';

// The fixture plus a bigger collection, so every dimension has something to choose from.
function richCharacter(cls = 'WARRIOR') {
  const c = fixtureCharacter(cls);
  const raw = JSON.parse(JSON.stringify(c));
  raw.pets.owned.push(
    { id: 'pet-b', species: 'EMBER_FOX', rarity: 'Uncommon', secondaries: [{ type: 'ATTACK_PERCENT', value: 5 }] },
  );
  raw.mounts.push({ id: 'mount-b', species: 'FROSTFANG_WOLF', level: 2, baseHp: 6, baseAtk: 6, glyphs: { minor: [null, null, null], major: [null, null], mythic: [null] } });
  raw.glyphs.push(
    { id: 'gl-4', glyphType: 'g-swift', rarity: 'Common', secondary: { stat: 'attackPercent', quality: 0.9 } },
    { id: 'gl-5', glyphType: 'g-quick', rarity: 'Common', secondary: { stat: 'critChance', quality: 0.2 } },
    { id: 'gl-6', glyphType: 'g-keen', rarity: 'Uncommon', secondary: { stat: 'critChance', quality: 0.8 } },
  );
  raw.transcendence.presets.push({ id: 'alt', name: 'Alt', allocatedNodeIds: [] });
  return normaliseCharacter(raw);
}

const snapshot = (o) => JSON.stringify(o);

describe('candidateOf / materialise', () => {
  it('the start candidate reproduces the preset: same stats as computePresetStats', () => {
    const c = fixtureCharacter('WARRIOR');
    const preset = c.presets[0];
    const space = createBuildSpace(c, preset);
    const f = space.fighterOf(space.start);
    const ref = computePresetStats(c, 'p1');
    expect(f.stats).toEqual(ref.effective);
    expect(f.source).toBe('computed');
    expect(f.presetId).toBe('p1');
    expect(f.sigils.map((s) => s.species)).toEqual(preset.sigilSpecies);
  });

  it('works for all four classes, including the Form and Summon utility sigils', () => {
    for (const cls of ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER']) {
      const c = fixtureCharacter(cls);
      const space = createBuildSpace(c, c.presets[0]);
      const f = space.fighterOf(space.start);
      const direct = buildFighter(c, 'p1');
      expect(f.stats).toEqual(direct.stats);
      expect(f.utility?.species ?? null).toBe(direct.utility?.species ?? null);
      expect(f.glyphMods).toEqual(direct.glyphMods);
    }
  });

  it('materialise never mutates the character, and changes only what the candidate says', () => {
    const c = richCharacter();
    const before = snapshot(c);
    const start = candidateOf(c, c.presets[0]);
    const cand = { ...start, relicIds: [], petId: 'pet-b', talentAllocation: {}, mountId: 'mount-b', mountGlyphs: { minor: ['gl-4', null, null], major: [null, null], mythic: [null] } };
    const m = materialise(c, c.presets[0], cand);
    expect(snapshot(c)).toBe(before);
    expect(m.preset).toMatchObject({ id: 'p1', relicIds: [], petId: 'pet-b', mountId: 'mount-b', sheet: null });
    expect(m.character.talentSets[0].allocation).toEqual({});
    expect(m.character.talentSets[1]).toBe(c.talentSets[1]); // untouched pieces are shared
    expect(m.character.mounts.find((x) => x.id === 'mount-b').glyphs.minor[0]).toBe('gl-4');
    expect(m.character.mounts.find((x) => x.id === 'mount-a')).toBe(c.mounts.find((x) => x.id === 'mount-a'));
  });

  it('a candidate is computed, never the sheet of the build it replaces; the residual rides along', () => {
    const c = fixtureCharacter('WARRIOR');
    const computed = computePresetStats(c, 'p1').computed;
    const sheeted = { ...c, presets: c.presets.map((p) => (p.id === 'p1' ? { ...p, sheet: { values: { totalAttack: computed.totalAttack + 5000 } } } : p)) };
    const cur = computePresetStats(sheeted, 'p1');
    expect(cur.source).toBe('sheet');
    expect(cur.residual.totalAttack).toBeCloseTo(5000, 0);
    const space = createBuildSpace(sheeted, sheeted.presets[0], { residual: cur.residual });
    expect(space.fighterOf(space.start).stats.totalAttack).toBeCloseTo(computed.totalAttack + 5000, 0);
    const bare = createBuildSpace(sheeted, sheeted.presets[0], { residual: {} });
    expect(bare.fighterOf(bare.start).stats.totalAttack).toBe(computed.totalAttack);
  });

  it('the Oblivion sheet is cleared too', () => {
    const c = fixtureCharacter('WARRIOR');
    const comp = computePresetStats(c, 'p1', { realm: 'oblivion' }).computed;
    const withSheet = { ...c, oblivion: { ...c.oblivion, sheet: { values: { totalAttack: comp.totalAttack + 777 } } } };
    const space = createBuildSpace(withSheet, withSheet.presets[0], { realm: 'oblivion', residual: {} });
    expect(space.fighterOf(space.start).stats.totalAttack).toBe(comp.totalAttack);
    expect(space.fighterOf(space.start).realm).toBe('oblivion');
  });
});

describe('identity', () => {
  const c = richCharacter();
  const space = createBuildSpace(c, c.presets[0]);
  const s = space.start;

  it('set-like fields are order-insensitive', () => {
    expect(space.key({ ...s, relicIds: [...s.relicIds].reverse() })).toBe(space.key(s));
    expect(space.key({ ...s, sigilSpecies: [...s.sigilSpecies].reverse() })).toBe(space.key(s));
  });

  it('an explicit allocation equal to the saved one has the start key', () => {
    expect(space.key({ ...s, talentAllocation: { ...c.talentSets[0].allocation } })).toBe(space.key(s));
    expect(space.key({ ...s, mountGlyphs: JSON.parse(JSON.stringify(c.mounts[0].glyphs)) })).toBe(space.key(s));
  });

  it('every dimension that can differ changes the key', () => {
    const variants = [
      { equipmentSet: 2 }, { talentSet: 1 }, { petId: 'pet-b' }, { mountId: 'mount-b' }, { relicIds: [] },
      { sigilSpecies: [] }, { utilitySigilSpecies: 'X' }, { ancientSigilSpecies: null }, { transcendencePresetId: 'alt' },
      { sigilConditions: { [s.sigilSpecies[0]]: 'MY_HP_BELOW_40' } },
      { talentAllocation: {} }, { mountGlyphs: { minor: [null, null, null], major: [null, null], mythic: [null] } },
    ];
    const keys = new Set([space.key(s), ...variants.map((v) => space.key({ ...s, ...v }))]);
    expect(keys.size).toBe(variants.length + 1);
  });

  it('distance counts the changes from the current build', () => {
    expect(space.distance(s)).toBe(0);
    expect(space.distance({ ...s, petId: 'pet-b' })).toBe(1);
    expect(space.distance({ ...s, relicIds: s.relicIds.slice(1) })).toBe(0.5);
    expect(space.distance({ ...s, relicIds: [] })).toBe(s.relicIds.length / 2);
    const [first] = Object.keys(c.talentSets[0].allocation);
    // one point moved between two talents is |-1| + |+1| over 2 = 1
    const moved = { ...c.talentSets[0].allocation, [first]: c.talentSets[0].allocation[first] - 1, dps_t1_precision: 0 };
    expect(space.distance({ ...s, talentAllocation: moved })).toBeGreaterThan(0);
    expect(space.distance({ ...s, equipmentSet: 2, talentSet: 1 })).toBeGreaterThanOrEqual(2);
  });

  it('the Oblivion realm has no equipment-set dimension and ignores the set in the key', () => {
    const o = createBuildSpace(c, c.presets[0], { realm: 'oblivion' });
    expect(o.dimensions.map((d) => d.id)).not.toContain('equipmentSet');
    expect(o.key({ ...s, equipmentSet: 2 })).toBe(o.key(s));
  });
});

describe('dimensions', () => {
  const c = richCharacter();
  const preset = c.presets[0];
  const space = createBuildSpace(c, preset);
  const s = space.start;
  const dim = (id, sp = space) => sp.dimensions.find((d) => d.id === id);

  it('are searched in the documented order', () => {
    const ids = space.dimensions.map((d) => d.id);
    expect(ids).toEqual(DIMENSION_ORDER.filter((id) => ids.includes(id)));
  });

  it('toggles switch dimensions off, and relicSlots is clamped', () => {
    const off = createBuildSpace(c, preset, { space: { talents: false, relics: false, pet: false } });
    expect(off.dimensions.map((d) => d.id)).not.toEqual(expect.arrayContaining(['talents']));
    expect(off.dimensions.map((d) => d.id)).not.toContain('relics');
    expect(off.toggles).toMatchObject({ talents: false, relics: false, pet: false, mount: true });
    expect(createBuildSpace(c, preset, { space: { relicSlots: 9 } }).toggles.relicSlots).toBe(4);
    expect(createBuildSpace(c, preset, { space: { relicSlots: 0 } }).toggles.relicSlots).toBe(1);
    expect(SPACE_DEFAULTS.relicSlots).toBe(4);
  });

  it('pet / mount / transcendence / set moves offer the alternatives, mount resets the sockets', () => {
    expect(new Set(dim('pet').neighbours(s).map((x) => x.petId))).toEqual(new Set([null, 'pet-b']));
    const mounts = dim('mount').neighbours({ ...s, mountGlyphs: { minor: ['gl-4', null, null], major: [null, null], mythic: [null] } });
    expect(new Set(mounts.map((x) => x.mountId))).toEqual(new Set([null, 'mount-b']));
    expect(mounts.every((x) => x.mountGlyphs === null)).toBe(true);
    expect(dim('transcendence').neighbours(s).map((x) => x.transcendencePresetId)).toEqual(['alt']);
    expect(dim('equipmentSet').neighbours(s).map((x) => x.equipmentSet)).toEqual([2]);
    expect(dim('talentSet').neighbours(s).map((x) => [x.talentSet, x.talentAllocation])).toEqual([[1, null]]);
  });

  it('relic moves stay inside the owned, class-legal pool and the slot count', () => {
    const owned = new Set(relicsForClass('WARRIOR').map((r) => r.id).filter((id) => c.relics[id] > 0));
    const moves = dim('relics').neighbours({ ...s, relicIds: [] });
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(m.relicIds.length).toBeLessThanOrEqual(4);
      expect(m.relicIds.every((id) => owned.has(id))).toBe(true);
      expect(new Set(m.relicIds).size).toBe(m.relicIds.length);
    }
    const two = createBuildSpace(c, preset, { space: { relicSlots: 2 } });
    expect(Math.max(...dim('relics', two).neighbours(s).map((m) => m.relicIds.length))).toBe(2);
  });

  it('a big relic pool is enumerated while it stays small, and falls back to single swaps beyond that', () => {
    const own = (cls) => {
      const raw = JSON.parse(JSON.stringify(fixtureCharacter(cls)));
      for (const r of relicsForClass(cls)) raw.relics[r.id] = 3;
      return normaliseCharacter(raw);
    };
    // Warrior: 14 relics, C(14,4) = 1001 <= the enumeration limit: every set of four, once each
    const w = own('WARRIOR');
    const sw = createBuildSpace(w, w.presets[0]);
    const all = dim('relics', sw).neighbours(sw.start);
    expect(all).toHaveLength(1001);
    expect(new Set(all.map((m) => sw.key(m))).size).toBe(1001);
    // Mystic: 20 relics, C(20,4) = 4845 > limit: add one (17) + swap each of the 3 current (3 x 17) = 68
    const m = own('MYSTIC');
    const sm = createBuildSpace(m, m.presets[0]);
    const swaps = dim('relics', sm).neighbours(sm.start);
    expect(swaps).toHaveLength(17 + 3 * 17);
    for (const x of swaps) expect(x.relicIds.length).toBeLessThanOrEqual(4);
  });

  it('sigil moves are owned, active for the spec, and within the slot cap', () => {
    for (const cls of ['WARRIOR', 'MYSTIC', 'NECROMANCER']) {
      const ch = fixtureCharacter(cls);
      const sp = createBuildSpace(ch, ch.presets[0]);
      for (const m of dim('sigils', sp).neighbours(sp.start)) {
        expect(m.sigilSpecies.length).toBeLessThanOrEqual(3);
        expect(m.sigilSpecies.every((x) => ch.sigils.owned[x])).toBe(true);
      }
      for (const m of dim('utility', sp).neighbours(sp.start)) {
        expect(m.utilitySigilSpecies === null || ch.sigils.owned[m.utilitySigilSpecies]).toBeTruthy();
      }
    }
  });

  it('talent moves are legal single-point changes that keep the point total', () => {
    const base = { ...s, talentAllocation: sanitiseAllocation({ dps_t1_sharpened_blade: 5, dps_t1_quick_strikes: 3, dps_t1_precision: 3 }, 'WARRIOR_DPS') };
    const spent = pointsSpent(base.talentAllocation);
    expect(spent).toBe(11);
    const moves = dim('talents').neighbours(base);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      const a = m.talentAllocation ?? c.talentSets[0].allocation;
      expect(sanitiseAllocation(a, 'WARRIOR_DPS')).toEqual(a);
      expect([spent, spent + 1]).toContain(pointsSpent(a));
      expect(pointsSpent(a)).toBeLessThanOrEqual(TALENT_POINT_CAP);
    }
    // 5 points in tier 1 unlock tier 2: a move that takes one out of tier 1 would strand tier 2, so it is not offered
    const tight = { ...s, talentAllocation: sanitiseAllocation({ dps_t1_sharpened_blade: 5, dps_t2_brutality: 5 }, 'WARRIOR_DPS') };
    expect(pointsSpent(tight.talentAllocation)).toBe(10);
    const tier1 = (a) => (a.dps_t1_sharpened_blade ?? 0) + (a.dps_t1_quick_strikes ?? 0) + (a.dps_t1_precision ?? 0);
    const tightMoves = dim('talents').neighbours(tight);
    expect(tightMoves.length).toBeGreaterThan(0);
    for (const m of tightMoves) {
      const a = m.talentAllocation ?? c.talentSets[0].allocation;
      if ((a.dps_t2_brutality ?? 0) > 0) expect(tier1(a)).toBeGreaterThanOrEqual(5);
    }
    // ...while moving a point inside tier 1 is
    expect(tightMoves.some((m) => m.talentAllocation?.dps_t1_quick_strikes === 1 && m.talentAllocation?.dps_t1_sharpened_blade === 4)).toBe(true);
  });

  it('condition moves offer only self conditions (enemy conditions are inert in PVE) and only from level 54', () => {
    const ch = fixtureCharacter('NECROMANCER');
    const sp = createBuildSpace(ch, ch.presets[0]);
    const moves = dim('conditions', sp).neighbours(sp.start);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      const changed = Object.entries(m.sigilConditions).filter(([k, v]) => v !== (sp.start.sigilConditions[k] ?? 'ON_COOLDOWN'));
      expect(changed).toHaveLength(1);
      expect(changed[0][1]).toMatch(/^MY_HP_BELOW_/);
      expect(sp.distance(m)).toBe(1);
      expect(sp.fighterOf(m).conditions[changed[0][0]]).toBe(changed[0][1]);
    }
    // below level 54 conditions do not apply: no dimension, and the key ignores them
    const low = normaliseCharacter({ ...JSON.parse(JSON.stringify(ch)), level: 40 });
    const sl = createBuildSpace(low, low.presets[0]);
    expect(sl.dimensions.map((d) => d.id)).not.toContain('conditions');
    expect(sl.key({ ...sl.start, sigilConditions: { [sl.start.sigilSpecies[0]]: 'MY_HP_BELOW_40' } })).toBe(sl.key(sl.start));
  });

  it('a spec-less talent set offers no talent moves', () => {
    const raw = JSON.parse(JSON.stringify(c));
    raw.talentSets[0] = { spec: null, allocation: {} };
    const none = normaliseCharacter(raw);
    const sp = createBuildSpace(none, none.presets[0]);
    expect(dim('talents', sp).neighbours(sp.start)).toEqual([]);
  });

  it('glyph moves use only unsealed, socketable glyphs not on another mount, one representative per kind', () => {
    const moves = dim('glyphs').neighbours(s);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      const ids = [...m.mountGlyphs.minor, ...m.mountGlyphs.major].filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(c.glyphs.find((g) => g.id === id)).toBeTruthy();
    }
    // gl-4 and gl-5 are different glyphs, so both are offered for a minor socket
    const offered = new Set(moves.flatMap((m) => m.mountGlyphs.minor).filter(Boolean));
    expect(offered.has('gl-4')).toBe(true);
    expect(offered.has('gl-5')).toBe(true);
    // a glyph socketed on the other mount is not offered here
    const other = c.mounts.map((m) => (m.id === 'mount-b' ? { ...m, glyphs: { ...m.glyphs, minor: ['gl-4', null, null] } } : m));
    const c2 = normaliseCharacter({ ...JSON.parse(JSON.stringify(c)), mounts: other });
    const sp2 = createBuildSpace(c2, c2.presets[0]);
    const offered2 = new Set(dim('glyphs', sp2).neighbours(sp2.start).flatMap((m) => m.mountGlyphs.minor));
    expect(offered2.has('gl-4')).toBe(false);
    // no mount, no glyph moves
    expect(dim('glyphs').neighbours({ ...s, mountId: null })).toEqual([]);
  });

  it('every neighbour of every dimension builds a fighter (no crash on any move)', () => {
    for (const cls of ['WARRIOR', 'MYSTIC']) {
      const ch = richCharacter(cls);
      const sp = createBuildSpace(ch, ch.presets[0]);
      for (const d of sp.dimensions) {
        for (const n of d.neighbours(sp.start).slice(0, 6)) {
          const f = sp.fighterOf(n);
          expect(f.stats.totalAttack).toBeGreaterThan(0);
          expect(sp.describeArgs(n)[1].id).toBe('p1');
        }
      }
    }
  });
});

describe('candidatePatch', () => {
  it('turns a candidate into the persisted writes', () => {
    const c = richCharacter();
    const s = candidateOf(c, c.presets[0]);
    const plain = candidatePatch(s);
    expect(plain.talentAllocation).toBeNull();
    expect(plain.mountGlyphs).toBeNull();
    expect(plain.preset).toMatchObject({ equipmentSet: 1, talentSet: 0, petId: 'pet-a', mountId: 'mount-a' });
    const full = candidatePatch({ ...s, talentAllocation: { a: 1 }, mountGlyphs: { minor: ['x', null, null], major: [null, null], mythic: [null] } });
    expect(full.talentAllocation).toEqual({ talentSet: 0, allocation: { a: 1 } });
    expect(full.mountGlyphs.mountId).toBe('mount-a');
    expect(JSON.parse(JSON.stringify(full))).toEqual(full);
  });
});
