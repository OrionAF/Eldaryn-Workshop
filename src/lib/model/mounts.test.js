import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from '../build/fixtures.js';
import { newCharacter, normaliseCharacter, normaliseRoster, migrateCharacterFromV1, newRoster, reconcileCharacter } from './index.js';
import {
  defaultMounts,
  normaliseMounts,
  normaliseMount,
  newMount,
  mountEffectiveStats,
  mountRollBounds,
  mountGlyphLoadout,
  activeMajorGlyphs,
  emptyMountSockets,
  MOUNT_GLYPH_SOCKETS,
} from './mounts.js';
import { newGlyph } from './glyphs.js';
import { MOUNT_SPECIES } from '../game/mountsGlyphs.js';

const withGlyphs = (cls = 'WARRIOR') => {
  const c = newCharacter('T', cls);
  return c;
};

describe('mount instances', () => {
  it('normalises species, rarity, level, rolls and sockets', () => {
    const m = normaliseMount({ id: 'x', species: 'STORM_ROC', rarity: 'Common', baseHp: 36.4, baseAtk: 999, level: 9 });
    expect(m).toMatchObject({ id: 'x', species: 'STORM_ROC', rarity: 'Epic', baseHp: 36, baseAtk: 39, level: 5 });
    expect(m.glyphs).toEqual(emptyMountSockets());
    expect(m.glyphs.minor).toHaveLength(3);
    expect(m.glyphs.major).toHaveLength(2);
    expect(m.glyphs.mythic).toHaveLength(1);
    expect(MOUNT_GLYPH_SOCKETS).toEqual({ minor: 3, major: 2, mythic: 1 });
  });

  it('drops unknown species and junk, keeps order, repairs duplicate ids', () => {
    const out = normaliseMounts({ mounts: [{ id: 'a', species: 'NIGHT_WOLF' }, { id: 'a', species: 'THUNDERMAW' }, { species: 'DRAGON' }, null, 5] }).mounts;
    expect(out.map((m) => m.species)).toEqual(['NIGHT_WOLF', 'THUNDERMAW']);
    expect(new Set(out.map((m) => m.id)).size).toBe(2);
    expect(normaliseMounts({}).mounts).toEqual(defaultMounts().mounts);
  });

  it('clamps rolls and level (level 1 default)', () => {
    const m = normaliseMount({ species: 'NIGHT_WOLF', baseHp: -4, baseAtk: 'x', level: 0 });
    expect(m).toMatchObject({ baseHp: 0, baseAtk: 0, level: 1 });
  });

  it('is idempotent', () => {
    const raw = { mounts: [{ id: 'a', species: 'BONE_WYVERN', baseHp: 45, baseAtk: 33, level: 3, glyphs: { minor: ['g1', 'g1', null, 'zzz'], major: [], mythic: ['g2'] } }] };
    const once = normaliseMounts(raw);
    expect(normaliseMounts(once)).toEqual(once);
    // a glyph id occupies one socket within a mount
    expect(once.mounts[0].glyphs.minor).toEqual(['g1', null, null]);
  });

  it('effective stats follow doc §5: round(base * (1 + 0.1 * (level - 1)))', () => {
    expect(mountEffectiveStats({ baseHp: 36, baseAtk: 26, level: 1 })).toEqual({ hpPercent: 36, attackPercent: 26 });
    expect(mountEffectiveStats({ baseHp: 36, baseAtk: 26, level: 5 })).toEqual({ hpPercent: 50, attackPercent: 36 });
    expect(mountEffectiveStats({ baseHp: 6, baseAtk: 7, level: 2 })).toEqual({ hpPercent: 7, attackPercent: 8 });
  });

  it('newMount starts at the species level-1 envelope floor; every species has bounds', () => {
    expect(newMount({ species: 'THUNDERMAW' })).toMatchObject({ baseHp: 14, baseAtk: 10, level: 1, rarity: 'Uncommon' });
    expect(newMount({ species: 'NOPE' })).toBeNull();
    for (const s of MOUNT_SPECIES) expect(mountRollBounds(s.species).hp[0]).toBeLessThanOrEqual(mountRollBounds(s.species).hp[1]);
  });
});

describe('sockets reconcile (through normaliseCharacter)', () => {
  function build(cls, glyphDefs, socketing) {
    const glyphs = glyphDefs.map((g, i) => ({ id: `g${i}`, ...g }));
    const mount = { id: 'm1', species: 'NIGHT_WOLF', baseHp: 6, baseAtk: 6, level: 1, glyphs: socketing };
    return normaliseCharacter({ ...newCharacter('T', cls), glyphs, mounts: [mount] });
  }

  it('keeps unsealed glyphs in the right row, drops sealed, missing and wrong-tier ones', () => {
    const c = build(
      'WARRIOR',
      [
        { glyphType: 'g-swift', rarity: 'Common', sealed: false, secondary: { stat: 'critChance', quality: 0.5 } },
        { glyphType: 'g-keen', rarity: 'Uncommon', sealed: true },
        { glyphType: 'sg-warborn-cd', rarity: 'Rare', sealed: false },
        { glyphType: 'g-wrath', rarity: 'Common', sealed: false },
      ],
      { minor: ['g0', 'g1', null], major: ['g3', 'missing'], mythic: ['g2'] },
    );
    expect(c.mounts[0].glyphs.minor).toEqual(['g0', null, null]); // sealed g1 out
    expect(c.mounts[0].glyphs.major).toEqual([null, null]); // g3 is a mythic glyph, 'missing' does not exist
    expect(c.mounts[0].glyphs.mythic).toEqual([null]); // g2 is a major glyph
  });

  it('a mythic glyph in the mythic socket stays', () => {
    const c = build('WARRIOR', [{ glyphType: 'g-wrath', rarity: 'Epic', sealed: false }], { mythic: ['g0'] });
    expect(c.mounts[0].glyphs.mythic).toEqual(['g0']);
  });

  it('a major is socketable only for its class', () => {
    const g = [{ glyphType: 'sg-warborn-cd', rarity: 'Rare', sealed: false }];
    expect(build('WARRIOR', g, { major: ['g0'] }).mounts[0].glyphs.major).toEqual(['g0', null]);
    const sentinel = build('SENTINEL', g, { major: ['g0'] });
    expect(sentinel.glyphs).toEqual([]); // the warrior major leaves the inventory
    expect(sentinel.mounts[0].glyphs.major).toEqual([null, null]);
  });

  it('a glyph instance may sit on several mounts, but only once per mount', () => {
    const base = newCharacter('T', 'WARRIOR');
    const glyph = { id: 'g0', glyphType: 'g-swift', rarity: 'Common', sealed: false, secondary: null };
    const mk = (id) => ({ id, species: 'NIGHT_WOLF', baseHp: 6, baseAtk: 6, level: 1, glyphs: { minor: ['g0'], major: [], mythic: [] } });
    const c = normaliseCharacter({ ...base, glyphs: [glyph], mounts: [mk('a'), mk('b')] });
    expect(c.mounts[0].glyphs.minor[0]).toBe('g0');
    expect(c.mounts[1].glyphs.minor[0]).toBe('g0');
    const twice = normaliseCharacter({ ...base, glyphs: [glyph], mounts: [{ ...mk('a'), glyphs: { minor: ['g0', 'g0', null], major: [], mythic: [] } }] });
    expect(twice.mounts[0].glyphs.minor).toEqual(['g0', null, null]);
  });

  it('majors with a requiredSpec need a talent set using that spec (inventory keeps them)', () => {
    const c = newCharacter('T', 'MYSTIC');
    c.glyphs = [
      { id: 'a', glyphType: 'sg-m-runic-dmg', rarity: 'Epic', sealed: false, secondary: null }, // MAGE
      { id: 'b', glyphType: 'sg-m-rending-cd', rarity: 'Epic', sealed: false, secondary: null }, // DRUID
    ];
    const mk = () => ({ id: 'm', species: 'NIGHT_WOLF', baseHp: 6, baseAtk: 6, level: 1, glyphs: { minor: [], major: ['a', 'b'], mythic: [] } });
    c.mounts = [mk()];
    reconcileCharacter(c); // specs unknown: class gate only
    expect(c.mounts[0].glyphs.major).toEqual(['a', 'b']);
    c.mounts = [mk()];
    c.talentSets[0].spec = 'MYSTIC_MAGE';
    reconcileCharacter(c);
    expect(c.mounts[0].glyphs.major).toEqual(['a', null]);
    expect(c.glyphs).toHaveLength(2);
  });
});

describe('mountGlyphLoadout', () => {
  it('sums minors, dedups majors by type keeping the highest rarity, filters by spec, ignores sealed', () => {
    const c = newCharacter('T', 'MYSTIC');
    c.glyphs = [
      { id: 'a', glyphType: 'sg-m-runic-dmg', rarity: 'Common', sealed: false, secondary: null },
      { id: 'b', glyphType: 'sg-m-runic-dmg', rarity: 'Legendary', sealed: false, secondary: null },
      { id: 'c', glyphType: 'sg-m-rending-cd', rarity: 'Epic', sealed: false, secondary: null },
      { id: 'd', glyphType: 'g-swift', rarity: 'Common', sealed: false, secondary: { stat: 'critChance', quality: 1 } },
      { id: 'e', glyphType: 'g-keen', rarity: 'Uncommon', sealed: true, secondary: null },
    ];
    const mount = { id: 'm', species: 'NIGHT_WOLF', baseHp: 6, baseAtk: 6, level: 1, glyphs: { minor: ['d', 'e', null], major: ['a', 'b'], mythic: [null] } };
    const out = mountGlyphLoadout(c, mount, 'MYSTIC_MAGE');
    expect(out.minors).toEqual([{ stat: 'critChance', value: 5, glyphType: 'g-swift', rarity: 'Common' }]);
    expect(out.majors).toHaveLength(1);
    expect(out.majors[0]).toMatchObject({ glyphType: 'sg-m-runic-dmg', rarity: 'Legendary', sigilSpecies: 'RUNIC_AFFLICTION' });
    expect(out.majors[0].values.damagepercent).toBeGreaterThan(0);
    expect(mountGlyphLoadout(c, { ...mount, glyphs: { ...mount.glyphs, major: ['c'] } }, 'MYSTIC_MAGE').majors).toEqual([]);
  });
});

describe('v1 migration (through model/index.js)', () => {
  const V1 = {
    id: 'old',
    name: 'Aria',
    class: 'Warrior',
    mounts: {
      entries: [
        { id: 'night_wolf', name: 'Night Wolf', rarity: 'Common', star: 0, hpPct: 6, atkPct: 6, glyphIds: [] },
        { id: 'storm_roc', name: 'Storm Roc', rarity: 'Epic', star: 3, hpPct: 43, atkPct: 31, glyphIds: ['gm1', 'gM1', 'gx'] },
        { id: 'thundermaw', name: 'Thundermaw', rarity: 'Uncommon', star: 1, hpPct: 15, atkPct: 11, glyphIds: ['gm1'] },
      ],
    },
    glyphs: {
      entries: [
        { id: 'gm1', tier: 'minor', rarity: 'Rare', statKey: 'crit', value: 3, special: null },
        { id: 'gM1', tier: 'major', rarity: 'Rare', statKey: 'attack_pct', value: 0, special: 'warhaste-emblem:rare' },
        { id: 'gx', tier: 'minor', rarity: 'Common', statKey: 'speed', value: 12, special: null },
        { id: 'gloose', tier: 'minor', rarity: 'Epic', statKey: 'attack', value: 100, special: null },
      ],
    },
    presets: [
      { id: 'a', name: 'Arms', loadout: 0, talentSet: 0, mountId: 'storm_roc' },
      { id: 'b', name: 'Prot', loadout: 1, talentSet: 1, mountId: 'night_wolf' },
    ],
    activePresetId: 'a',
  };

  it('owned mounts only, level = star, base back-solved from the effective value', () => {
    const c = migrateCharacterFromV1(V1);
    expect(c.mounts.map((m) => m.species)).toEqual(['STORM_ROC', 'THUNDERMAW']);
    const roc = c.mounts[0];
    expect(roc).toMatchObject({ level: 3, rarity: 'Epic', baseHp: 36, baseAtk: 26 });
    expect(mountEffectiveStats(roc)).toEqual({ hpPercent: 43, attackPercent: 31 });
  });

  it('a v1 preset keeps its mount; one pointing at an unowned mount ends up null', () => {
    const c = migrateCharacterFromV1(V1);
    const roc = c.mounts.find((m) => m.species === 'STORM_ROC');
    expect(c.presets.find((p) => p.id === 'a').mountId).toBe(roc.id);
    expect(c.presets.find((p) => p.id === 'b').mountId).toBeNull();
  });

  it('glyphs migrate with sockets; a glyph used on two mounts is cloned, not shared', () => {
    const c = migrateCharacterFromV1(V1);
    const roc = c.mounts.find((m) => m.species === 'STORM_ROC');
    const thunder = c.mounts.find((m) => m.species === 'THUNDERMAW');
    expect(roc.glyphs.minor[0]).toBe('gm1');
    expect(roc.glyphs.minor[1]).toBe('gx');
    expect(roc.glyphs.major[0]).toBe('gM1');
    expect(thunder.glyphs.minor[0]).not.toBe('gm1');
    expect(c.glyphs.find((g) => g.id === thunder.glyphs.minor[0])).toMatchObject({ glyphType: 'g-tough', secondary: { stat: 'critChance' } });
    const types = Object.fromEntries(c.glyphs.map((g) => [g.id, g.glyphType]));
    expect(types.gM1).toBe('sg-warborn-cd');
    expect(types.gloose).toBeDefined();
  });

  it('whole-roster import of v1 JSON round-trips and is stable under re-normalisation', () => {
    const roster = normaliseRoster({ characters: [V1], currentId: 'old' });
    expect(normaliseRoster(JSON.parse(JSON.stringify(roster)))).toEqual(roster);
    expect(newRoster().characters[0].mounts).toEqual([]);
  });

  it('missing hp/atk values back-solve to 0', () => {
    const c = migrateCharacterFromV1({ ...V1, mounts: { entries: [{ id: 'bone_wyvern', star: 2 }] }, presets: [] });
    expect(c.mounts[0]).toMatchObject({ species: 'BONE_WYVERN', level: 2, baseHp: 0, baseAtk: 0 });
  });
});

describe('newGlyph helper used by sockets', () => {
  it('is covered in glyphs.test.js', () => {
    expect(newGlyph({ glyphType: 'g-swift', rarity: 'Common' }).sealed).toBe(false);
    expect(withGlyphs().glyphs).toEqual([]);
  });
});

describe('activeMajorGlyphs (B1)', () => {
  it('splits the majors by whether their sigil is equipped', () => {
    const c = fixtureCharacter('WARRIOR');
    const mount = c.mounts[0];
    const all = mountGlyphLoadout(c, mount, 'WARRIOR_ARMS').majors;
    expect(all.length).toBeGreaterThan(0);
    const sp = all[0].sigilSpecies;
    expect(activeMajorGlyphs(c, mount, 'WARRIOR_ARMS', [sp]).active.map((g) => g.glyphType)).toEqual(all.map((g) => g.glyphType));
    const off = activeMajorGlyphs(c, mount, 'WARRIOR_ARMS', []);
    expect(off.active).toEqual([]);
    expect(off.inert.length).toBe(all.length);
    expect(activeMajorGlyphs(c, null, null, [sp])).toEqual({ active: [], inert: [] });
  });
});

describe('the value the game shows and the roll behind it', () => {
  it('mountStatAtLevel scales a level-1 roll; mountBaseForValue inverts it at every level', async () => {
    const { mountStatAtLevel, mountBaseForValue } = await import('./mounts.js');
    expect(mountStatAtLevel(37, 2)).toBe(41); // Crystal Drake: round(37 * 1.1)
    expect(mountStatAtLevel(25, 2)).toBe(28); // round(27.5)
    for (let level = 1; level <= 5; level++) {
      for (let base = 0; base <= 60; base++) expect(mountBaseForValue(mountStatAtLevel(base, level), level)).toBe(base);
    }
    expect(mountBaseForValue(54, 5)).toBe(38); // no roll shows 54 at level 5 (38 -> 53, 39 -> 55): the nearest
    expect(mountBaseForValue(-3, 2)).toBe(0);
  });
});
