import { describe, it, expect } from 'vitest';
import { engineKey, changesOf, canonicalise, mergeByEngine, writesOf, revert, candidateEngineKey } from './effect.js';
import { createBuildSpace } from './space.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { buildFighter } from '../build/fighter.js';
import { normaliseCharacter } from '../model/index.js';
import { EngineInputError } from '../engine/validate.js';

function fixture(cls, edit = () => {}, opts) {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter(cls, opts)));
  edit(raw);
  return normaliseCharacter(raw);
}
const ids = (changes) => changes.map((c) => c.id);

describe('engineKey', () => {
  const c = fixtureCharacter('WARRIOR');
  const f = buildFighter(c, 'p1');

  it('is deterministic and changes with any stat the engine reads', () => {
    for (const mode of ['pve', 'pvp']) {
      expect(engineKey(f, mode)).toBe(engineKey(buildFighter(c, 'p1'), mode));
      expect(engineKey({ ...f, stats: { ...f.stats, totalAttack: f.stats.totalAttack + 1 } }, mode)).not.toBe(engineKey(f, mode));
      expect(engineKey({ ...f, stats: { ...f.stats, totalBlockChance: (f.stats.totalBlockChance ?? 0) + 1 } }, mode)).not.toBe(engineKey(f, mode));
    }
  });

  it('a damage sigil condition is no PVE input (cast on cooldown), but is a PVP input', () => {
    const withCond = { ...f, conditions: { ...f.conditions, CATACLYSM: 'ENEMY_HP_BELOW_40' } };
    expect(engineKey(withCond, 'pve')).toBe(engineKey(f, 'pve'));
    expect(engineKey(withCond, 'pvp')).not.toBe(engineKey(f, 'pvp'));
    const selfCond = { ...f, conditions: { ...f.conditions, WARBORN_FURY: 'MY_HP_BELOW_40' } };
    expect(engineKey(selfCond, 'pve')).not.toBe(engineKey(f, 'pve'));
  });

  it('Oblivion fights read the Oblivion power', () => {
    const o = buildFighter(c, 'p1', { realm: 'oblivion' });
    expect(engineKey({ ...o, stats: { ...o.stats, totalOblivionPower: (o.stats.totalOblivionPower ?? 0) + 5 } }, 'pve')).not.toBe(engineKey(o, 'pve'));
  });

  it('a fighter that cannot fight throws EngineInputError', () => {
    expect(() => engineKey({ ...f, stats: {} }, 'pve')).toThrow(EngineInputError);
  });
});

describe('changesOf', () => {
  it('a null board link and its resolved board are no change (#56)', () => {
    const c = fixtureCharacter('WARRIOR');
    const space = createBuildSpace(c, 'p2');
    expect(changesOf(space, { ...space.start, transcendencePresetId: null }, space.start)).toEqual([]);
  });

  it('a condition is a character-wide write naming the other presets that equip the sigil (#54)', () => {
    const c = fixture('WARRIOR', (r) => { r.presets[1].sigilSpecies = ['WARBORN_FURY']; r.presets[1].talentSet = 0; });
    const space = createBuildSpace(c, 'p1');
    const X = { ...space.start, sigilConditions: { WARBORN_FURY: 'MY_HP_BELOW_40' } };
    const [ch] = changesOf(space, space.start, X);
    expect(ch).toMatchObject({ id: 'condition:WARBORN_FURY', scope: 'character', owner: { species: 'WARBORN_FURY' }, from: 'ON_COOLDOWN', to: 'MY_HP_BELOW_40' });
    expect(ch.sideEffects).toEqual([{ presetId: 'p2', name: 'Alt', reason: expect.stringMatching(/equips/) }]);
  });

  it('a socket change is a mount write naming the other presets riding it; talents name their set', () => {
    const c = fixture('WARRIOR', (r) => { r.presets[1].mountId = 'mount-a'; r.presets[1].talentSet = 0; });
    const space = createBuildSpace(c, 'p1');
    const g = c.mounts[0].glyphs;
    const X = { ...space.start, mountGlyphs: { ...g, minor: [g.minor[0], null, null] }, talentAllocation: {} };
    const changes = changesOf(space, space.start, X);
    expect(ids(changes)).toEqual(['talents:0', 'glyph:mount-a:minor:1']);
    for (const ch of changes) expect(ch.sideEffects.map((s) => s.presetId)).toEqual(['p2']);
    const groups = writesOf(space, space.start, X);
    expect(groups.map((w) => [w.scope, w.changeIds])).toEqual([['character', ['talents:0']], ['mount', ['glyph:mount-a:minor:1']]]);
  });

  it('a spec switch bundles what legality drops with it (#50)', () => {
    const c = fixtureCharacter('MYSTIC', { spec: 'MYSTIC_MAGE' });
    const space = createBuildSpace(c, 'p1');
    const [druid] = space.blocks.find((b) => b.id === 'spec').domain(space.start);
    const spec = changesOf(space, space.start, druid).find((ch) => ch.id === 'spec');
    expect(spec.bundle).toContain('utility');
  });

  it('revert takes one change back', () => {
    const c = fixtureCharacter('WARRIOR');
    const space = createBuildSpace(c, 'p1');
    const X = { ...space.start, petId: null, relicIds: [] };
    expect(ids(changesOf(space, space.start, revert(space, space.start, X, 'pet')))).toEqual(['relics']);
  });
});

describe('canonicalise', () => {
  it('reverts a major glyph whose sigil the build drops (#47 #81)', () => {
    const c = fixture('WARRIOR', (r) => { r.glyphs.push({ id: 'gl-x', glyphType: 'sg-cataclysm-cd', rarity: 'Epic', secondary: null }); });
    const space = createBuildSpace(c, 'p1');
    const B = space.start;
    const g = c.mounts[0].glyphs;
    const X = { ...B, sigilSpecies: B.sigilSpecies.filter((s) => s !== 'CATACLYSM'), mountGlyphs: { ...g, major: [g.major[0], 'gl-x'] } };
    expect(ids(changesOf(space, B, X))).toEqual(['sigils', 'glyph:mount-a:major:1']);
    const r = canonicalise(space, B, X);
    expect(ids(r.inert)).toEqual(['glyph:mount-a:major:1']);
    expect(ids(changesOf(space, B, r.candidate))).toEqual(['sigils']);
  });

  it('a damage-sigil condition is inert in PVE and kept in PVP', () => {
    const c = fixtureCharacter('WARRIOR');
    for (const [mode, kept] of [['pve', []], ['pvp', ['condition:CATACLYSM']]]) {
      const space = createBuildSpace(c, 'p1', { mode });
      const X = { ...space.start, sigilConditions: { CATACLYSM: 'ENEMY_HP_BELOW_40' } };
      expect(ids(changesOf(space, space.start, canonicalise(space, space.start, X).candidate))).toEqual(kept);
    }
  });

  it('keeps every change that alters the engine inputs', () => {
    const c = fixtureCharacter('WARRIOR');
    const space = createBuildSpace(c, 'p1');
    const X = { ...space.start, petId: null, relicIds: [] };
    expect(canonicalise(space, space.start, X).inert).toEqual([]);
  });
});

describe('mergeByEngine', () => {
  it('engine-identical twins collapse to the arm with fewer changes', () => {
    const c = fixture('WARRIOR', (r) => {
      const g = r.glyphs.find((x) => x.id === 'gl-1');
      r.glyphs.push({ ...g, id: 'gl-1b' });
    });
    const space = createBuildSpace(c, 'p1');
    const g = c.mounts[0].glyphs;
    const twin = space.canonical({ ...space.start, mountGlyphs: { ...g, minor: ['gl-1b', g.minor[1], null] } });
    expect(candidateEngineKey(space, twin)).toBe(candidateEngineKey(space, space.start));
    const r = mergeByEngine(space, [twin, space.start, { ...space.start, petId: null }]);
    expect(r.merged).toBe(1);
    expect(r.arms.map((a) => space.key(a))).toEqual([space.key(space.start), space.key({ ...space.start, petId: null })]);
  });

  it('arms whose fighter cannot fight are kept apart, not thrown on and not merged', () => {
    const c = fixture('WARRIOR');
    const base = createBuildSpace(c, 'p1');
    const space = { ...base, fighterOf: (cand) => (cand.petId === null ? { ...base.fighterOf(cand), stats: {} } : base.fighterOf(cand)) };
    const broken = { ...space.start, petId: null };
    const broken2 = { ...space.start, petId: null, mountId: null };
    const r = mergeByEngine(space, [space.start, broken, broken2]);
    expect(r.merged).toBe(0);
    expect(r.arms).toHaveLength(3);
  });
});
