import { describe, it, expect } from 'vitest';
import {
  createBuildSpace, candidateOf, canonical, materialise, BLOCKS, SPACE_DEFAULTS, conditionOptionsFor, glyphLabel, runningSigils,
} from './space.js';
import { legalityOf } from './legality.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { buildFighter } from '../build/fighter.js';
import { computePresetStats } from '../build/stats.js';
import { normaliseCharacter } from '../model/index.js';
import { pointsSpent } from '../model/talents.js';
import { glyphTypeInfo } from '../model/glyphs.js';

/** The fixture of `cls`, edited as raw JSON and normalised again. */
function fixture(cls, edit = () => {}, opts) {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter(cls, opts)));
  edit(raw);
  return normaliseCharacter(raw);
}
const spent = (space, c) => pointsSpent(c.talentAllocation ?? space.character.talentSets[c.talentSet].allocation);
const block = (space, id) => space.blocks.find((b) => b.id === id);

describe('candidateOf / canonical / materialise', () => {
  it('the start candidate reproduces the preset: same fighter as buildFighter', () => {
    for (const cls of ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER']) {
      const c = fixtureCharacter(cls);
      const space = createBuildSpace(c, 'p1');
      const f = space.fighterOf(space.start);
      const direct = buildFighter(c, 'p1');
      expect(f.stats).toEqual(computePresetStats(c, 'p1').effective);
      expect(f.sigils).toEqual(direct.sigils);
      expect(f.utility).toEqual(direct.utility);
      expect(f.ancient).toEqual(direct.ancient);
      expect(f.glyphMods).toEqual(direct.glyphMods);
      expect(f.source).toBe('computed');
    }
  });

  it('applying the start candidate writes nothing', () => {
    const c = fixtureCharacter('WARRIOR');
    for (const id of ['p1', 'p2']) {
      const m = materialise(c, id, candidateOf(c, id));
      expect(JSON.stringify(normaliseCharacter(m))).toBe(JSON.stringify(c));
    }
  });

  it('materialise never mutates the character and shares what it does not touch', () => {
    const c = fixtureCharacter('WARRIOR');
    const before = JSON.stringify(c);
    const start = candidateOf(c, 'p1');
    const m = materialise(c, 'p1', { ...start, petId: null, talentAllocation: {}, sigilConditions: { WARBORN_FURY: 'MY_HP_BELOW_40' } });
    expect(JSON.stringify(c)).toBe(before);
    expect(m.presets[0].petId).toBeNull();
    expect(m.talentSets[0].allocation).toEqual({});
    expect(m.talentSets[1]).toBe(c.talentSets[1]);
    expect(m.sigils.owned.WARBORN_FURY.condition).toBe('MY_HP_BELOW_40');
    expect(m.mounts).toBe(c.mounts);
  });

  it('a null board link and the board it resolves to are one build (#56)', () => {
    const c = fixtureCharacter('WARRIOR');
    expect(c.presets[1].transcendencePresetId).toBeNull();
    const space = createBuildSpace(c, 'p2');
    expect(space.start.transcendencePresetId).toBe('default');
    expect(space.key({ ...space.start, transcendencePresetId: null })).toBe(space.key({ ...space.start, transcendencePresetId: 'default' }));
    // and applying it keeps the link null
    expect(materialise(c, 'p2', space.start).presets[1].transcendencePresetId).toBeNull();
  });

  it('set-like lists and sockets are order-free; overrides equal to the stored value vanish', () => {
    const c = fixtureCharacter('WARRIOR');
    const s = candidateOf(c, 'p1');
    const k = (x) => JSON.stringify(canonical(c, 'p1', x));
    expect(k({ ...s, relicIds: [...s.relicIds].reverse(), sigilSpecies: [...s.sigilSpecies].reverse() })).toBe(k(s));
    expect(k({ ...s, talentAllocation: { ...c.talentSets[0].allocation } })).toBe(k(s));
    const g = c.mounts[0].glyphs;
    expect(k({ ...s, mountGlyphs: { ...g, minor: [...g.minor].reverse() } })).toBe(k(s));
    expect(k({ ...s, sigilConditions: { WARBORN_FURY: 'ON_COOLDOWN' } })).toBe(k(s));
    expect(k({ ...s, sigilConditions: { DEFENSE_STANCE: 'MY_HP_BELOW_40' } })).toBe(k(s)); // not equipped
  });
});

describe('block domains', () => {
  it('has the documented blocks, all on by default; toggles switch one off', () => {
    const c = fixtureCharacter('WARRIOR');
    const space = createBuildSpace(c, 'p1', { toggles: { relics: false } });
    expect(space.blocks.map((b) => b.id)).toEqual(BLOCKS);
    expect(Object.values(SPACE_DEFAULTS).every(Boolean)).toBe(true);
    expect(block(space, 'relics').enabled).toBe(false);
    expect(block(space, 'relics').domain(space.start)).toEqual([]);
  });

  it('a level-30 Warrior with 16 of 16 points gets no 17-point arm (#48)', () => {
    const c = fixture('WARRIOR', (r) => { r.level = 30; });
    const space = createBuildSpace(c, 'p1');
    expect(spent(space, space.start)).toBe(16);
    const arms = block(space, 'talents').domain(space.start);
    expect(arms.length).toBeGreaterThan(0);
    expect(Math.max(...arms.map((a) => spent(space, a)))).toBe(16);
    expect(arms.some((a) => spent(space, a) === 15)).toBe(true); // -1 moves
  });

  it('relicSlotCap 2 gives no 3-relic arm (#49)', () => {
    const c = fixture('WARRIOR', (r) => { r.extraRelicSlots = 0; });
    const space = createBuildSpace(c, 'p1');
    const arms = block(space, 'relics').domain(space.start);
    expect(arms.length).toBeGreaterThan(0);
    expect(Math.max(...arms.map((a) => a.relicIds.length))).toBe(2);
    expect(arms.some((a) => a.relicIds.length === 0)).toBe(true); // an empty slot is a legal choice
  });

  it('every subset up to the slot cap of the owned generic sigils, empty included', () => {
    const c = fixtureCharacter('WARRIOR');
    const space = createBuildSpace(c, 'p1');
    const arms = block(space, 'sigils').domain(space.start);
    const sizes = arms.map((a) => a.sigilSpecies.length);
    expect(Math.max(...sizes)).toBe(3);
    expect(sizes).toContain(0);
    expect(new Set(arms.map((a) => space.key(a))).size).toBe(arms.length);
  });

  it('Mage to Druid: the spec arm carries no Mage SHIELD and no Mage-locked major (#47 #50)', () => {
    const c = fixture('MYSTIC', (r) => {
      r.mounts[0].glyphs.major = [null, null];
      r.glyphs.push({ id: 'gl-m', glyphType: 'sg-m-burst-cd', rarity: 'Epic', secondary: null });
    }, { spec: 'MYSTIC_MAGE' });
    const space = createBuildSpace(c, 'p1');
    expect(space.start.utilitySigilSpecies).toBe('ARCANE_BARRIER');
    // the major-glyph block socketing the Mage-only glyph first (it acts on the Mage)
    const mageGlyph = c.glyphs.find((g) => g.id === 'gl-m');
    expect(glyphTypeInfo(mageGlyph.glyphType).def.requiredSpec).toBe('MYSTIC_MAGE');
    const X = block(space, 'majorGlyphs').domain(space.start).find((a) => a.mountGlyphs?.major.includes(mageGlyph.id));
    expect(X).toBeDefined();
    const [druid] = block(space, 'spec').domain(X);
    expect(space.specOf(druid)).toBe('MYSTIC_DRUID');
    expect(druid.utilitySigilSpecies).toBeNull();
    expect(druid.mountGlyphs?.major ?? c.mounts[0].glyphs.major).not.toContain(mageGlyph.id);
    expect(legalityOf(c, 'p1', druid).ok).toBe(true);
  });

  it('the major-glyph block offers only majors that act for the spec, one per glyph type', () => {
    const c = fixture('MYSTIC', (r) => {
      r.mounts[0].glyphs.major = [null, null];
      const g = r.glyphs.find((x) => x.id === 'gl-3');
      r.glyphs.push({ ...g, id: 'gl-3b', rarity: 'Legendary' });
    }, { spec: 'MYSTIC_DRUID' });
    const space = createBuildSpace(c, 'p1');
    for (const a of block(space, 'majorGlyphs').domain(space.start)) {
      const types = (a.mountGlyphs?.major ?? []).filter(Boolean).map((id) => c.glyphs.find((g) => g.id === id).glyphType);
      expect(new Set(types).size).toBe(types.length);
      for (const t of types) expect([null, 'MYSTIC_DRUID']).toContain(glyphTypeInfo(t).def.requiredSpec);
    }
  });

  it('two identical minor glyph instances can both be socketed (#58)', () => {
    const c = fixture('WARRIOR', (r) => {
      const g = r.glyphs.find((x) => x.id === 'gl-1');
      r.glyphs.push({ ...g, id: 'gl-1b' });
    });
    const space = createBuildSpace(c, 'p1');
    const arms = block(space, 'minorGlyphs').domain(space.start);
    expect(arms.some((a) => a.mountGlyphs?.minor.includes('gl-1') && a.mountGlyphs.minor.includes('gl-1b'))).toBe(true);
  });

  it('a level-16 Necromancer gets no utility or Ancient arm (#59)', () => {
    const c = fixture('NECROMANCER', (r) => { r.level = 16; });
    expect(c.sigils.owned.BONE_SERVANT).toBeDefined();
    const space = createBuildSpace(c, 'p1');
    expect(block(space, 'utility').domain(space.start)).toEqual([]);
    expect(block(space, 'ancient').domain(space.start)).toEqual([]);
    expect(block(space, 'sigils').domain(space.start)).toEqual([]);
  });

  it('PVP offers ENEMY_HP_BELOW_40 for Cataclysm, PVE does not (#51 #62)', () => {
    const c = fixtureCharacter('WARRIOR');
    const pvp = createBuildSpace(c, 'p1', { mode: 'pvp' });
    const pve = createBuildSpace(c, 'p1', { mode: 'pve' });
    const offers = (space) => block(space, 'conditions').domain(space.start).some((a) => a.sigilConditions.CATACLYSM === 'ENEMY_HP_BELOW_40');
    expect(offers(pvp)).toBe(true);
    expect(offers(pve)).toBe(false);
    expect(conditionOptionsFor('WARBORN_FURY', 'WARRIOR_DPS', 'pve')).toContain('MY_HP_BELOW_40');
  });

  it('conditions are a block only from level 54', () => {
    const c = fixture('WARRIOR', (r) => { r.level = 53; });
    const space = createBuildSpace(c, 'p1', { mode: 'pvp' });
    expect(block(space, 'conditions').domain(space.start)).toEqual([]);
  });

  it('the Ancient is offered only on a board that allocates its node; a board switch drops it (#55, Q3)', () => {
    const c = fixture('WARRIOR', (r) => {
      r.transcendence.presets.push({ id: 'bare', name: 'Bare', allocatedNodeIds: [] });
    });
    const space = createBuildSpace(c, 'p1');
    expect(space.start.ancientSigilSpecies).toBe('FLAMEBORN');
    const [bare] = block(space, 'transcendence').domain(space.start);
    expect(bare.transcendencePresetId).toBe('bare');
    expect(bare.ancientSigilSpecies).toBeNull();
    expect(block(space, 'ancient').domain(bare)).toEqual([]);
  });

  it('below 55 the Ancient is never offered, even on a board that allocates its node; the fighter agrees', () => {
    const offered = (level) => {
      const space = createBuildSpace(fixture('WARRIOR', (r) => { r.level = level; }), 'p1');
      return block(space, 'ancient').domain({ ...space.start, ancientSigilSpecies: null }).map((a) => a.ancientSigilSpecies);
    };
    expect(offered(55)).toContain('FLAMEBORN');
    expect(offered(54)).not.toContain('FLAMEBORN');
    const c = fixture('WARRIOR', (r) => { r.level = 54; });
    const space = createBuildSpace(c, 'p1');
    expect(runningSigils(c, space.start)).not.toContain('FLAMEBORN');
    expect(space.fighterOf(space.start).sigils).toEqual(buildFighter(c, 'p1').sigils);
  });

  it('below level 58 the board is not searched; set 2 and talent set 2 follow their unlock levels', () => {
    const c = fixture('WARRIOR', (r) => {
      r.level = 27;
      r.presets[0].mountId = null; // mounts unlock at 40: a mount here would be an illegal baseline
      r.presets[0].ancientSigilSpecies = null; // and no board counts below 55, so neither does the Ancient
      r.transcendence.presets.push({ id: 'bare', name: 'Bare', allocatedNodeIds: [] });
    });
    const space = createBuildSpace(c, 'p1');
    expect(block(space, 'transcendence').domain(space.start)).toEqual([]);
    expect(block(space, 'equipmentSet').domain(space.start)).toEqual([]);
    expect(block(space, 'spec').domain(space.start)).toEqual([]);
    expect(block(space, 'mount').domain(space.start).every((a) => a.mountId === null)).toBe(true);
  });

  it('the Oblivion realm never searches the gear set', () => {
    const c = fixtureCharacter('WARRIOR');
    const space = createBuildSpace(c, 'p1', { realm: 'oblivion' });
    expect(block(space, 'equipmentSet').domain(space.start)).toEqual([]);
    expect(space.fighterOf(space.start).realm).toBe('oblivion');
  });

  it('talent moves include k-point moves and tier re-specs, all within the cap', () => {
    const c = fixture('WARRIOR', (r) => { r.level = 30; });
    const space = createBuildSpace(c, 'p1');
    const base = c.talentSets[0].allocation;
    const arms = block(space, 'talents').domain(space.start);
    const moved = (a) => Object.keys({ ...base, ...a.talentAllocation }).reduce((n, id) => n + Math.abs((a.talentAllocation[id] || 0) - (base[id] || 0)), 0);
    expect(arms.some((a) => moved(a) >= 4)).toBe(true);
  });
});

describe('legality of every arm (light; the deep run is H3)', () => {
  const specs = [
    ['WARRIOR', 'WARRIOR_DPS'], ['WARRIOR', 'WARRIOR_TANK'], ['SENTINEL', 'SENTINEL_MARKSMANSHIP'], ['SENTINEL', 'SENTINEL_DISRUPTION'],
    ['MYSTIC', 'MYSTIC_MAGE'], ['MYSTIC', 'MYSTIC_DRUID'], ['NECROMANCER', 'NECROMANCER_DEATHLORD'], ['NECROMANCER', 'NECROMANCER_DOOMWEAVER'],
  ];
  for (const [cls, spec] of specs) {
    it(`${spec}: every arm of every block passes legalityOf in both realms and modes`, () => {
      const c = fixtureCharacter(cls, { spec });
      for (const realm of ['base', 'oblivion']) {
        const space = createBuildSpace(c, 'p1', { realm, mode: realm === 'base' ? 'pvp' : 'pve' });
        for (const b of space.blocks) {
          for (const arm of b.domain(space.start)) {
            const r = legalityOf(c, 'p1', arm);
            if (!r.ok) throw new Error(`${spec} ${realm} ${b.id}: ${JSON.stringify(r.violations)} ${JSON.stringify(arm)}`);
          }
        }
      }
    });
  }
});

describe('glyphLabel', () => {
  it('prints the secondary stat as words, not its camelCase key', () => {
    const c = { glyphs: [{ id: 'g1', glyphType: 'NO_SUCH_TYPE', rarity: 'Rare', secondary: { stat: 'attackSpeed' } }, { id: 'g2', glyphType: 'NO_SUCH_TYPE', rarity: 'Rare', secondary: null }] };
    expect(glyphLabel(c, 'g1')).toBe('NO_SUCH_TYPE (Rare · Attack Speed +3%)');
    expect(glyphLabel(c, 'g2')).toBe('NO_SUCH_TYPE (Rare)');
    expect(glyphLabel(c, null)).toBe('Empty');
  });
});
