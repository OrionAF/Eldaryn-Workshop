import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from '../build/fixtures.js';
import { buildFighter } from '../build/fighter.js';
import { computePresetStats } from '../build/stats.js';
import { normaliseCharacter } from './index.js';
import { sanitiseAllocation, pointsSpent } from './talents.js';
import { talentSpec } from '../game/talents.js';
import { createContext } from '../store/context.js';
import { createRelicsStore } from '../store/relics.js';
import { createCharactersStore } from '../store/characters.js';
import { createSigilsStore } from '../store/sigils.js';
import { createPresetsStore } from '../store/presets.js';
import { createTalentsStore } from '../store/talents.js';
import * as L from './legality.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

function storeFor(character) {
  const roster = { schemaVersion: 2, characters: [character], currentId: character.id };
  const ctx = createContext({ getRoster: () => roster, setRoster: () => {}, persist: () => {} });
  return {
    roster,
    relics: createRelicsStore(ctx),
    characters: createCharactersStore(ctx),
    sigils: createSigilsStore(ctx),
    presets: createPresetsStore(ctx),
    talents: createTalentsStore(ctx),
  };
}

function overfull(spec) {
  const all = {};
  for (const tier of talentSpec(spec).tiers) for (const t of tier.talents) all[t.id] = t.maxRank;
  return all;
}

describe('level gates', () => {
  it('talentPointsForLevel: 0 below 15, one per level, 29 at 43', () => {
    expect([14, 15, 30, 43, 100].map(L.talentPointsForLevel)).toEqual([0, 1, 16, 29, 29]);
  });

  it('relicSlotCap and awakeningPointsForLevel', () => {
    expect([21, 22].map((l) => L.relicSlotCap(l, 2))).toEqual([0, 4]);
    expect(L.relicSlotCap(100, 0)).toBe(2);
    expect(L.relicSlotCap(100, 1)).toBe(3);
    expect([44, 45, 50, 59, 100].map(L.awakeningPointsForLevel)).toEqual([0, 1, 6, 15, 15]);
  });

  it('a full allocation at level 30 is trimmed to 16 points with tiers still valid', () => {
    const raw = clone(fixtureCharacter('WARRIOR'));
    raw.level = 30;
    raw.talentSets[0].allocation = overfull(raw.talentSets[0].spec);
    const n = normaliseCharacter(raw);
    const alloc = n.talentSets[0].allocation;
    expect(pointsSpent(alloc)).toBe(16);
    expect(sanitiseAllocation(alloc, n.talentSets[0].spec, 16)).toEqual(alloc);
  });

  it('the talent rank mutator refuses points above the level cap', () => {
    const c = fixtureCharacter('WARRIOR');
    c.level = 15;
    c.talentSets[0].allocation = {};
    const s = storeFor(c);
    const first = talentSpec(c.talentSets[0].spec).tiers[0].talents[0];
    expect(s.talents.setTalentSetRank(0, first.id, 1)).toBe(true);
    expect(s.talents.setTalentSetRank(0, first.id, 2)).toBe(false);
  });

  it('awakening points are capped by level: 15 at level 50 becomes 6', () => {
    const raw = clone(fixtureCharacter('WARRIOR'));
    raw.level = 50;
    raw.awakening = { path: 'SHADOW', level: 15 };
    expect(normaliseCharacter(raw).awakening.level).toBe(6);
  });

  it('an empty, null or boolean level is the max level and keeps the sigils (finding 122)', () => {
    for (const bad of ['', null, true, [], {}]) {
      const raw = clone(fixtureCharacter('WARRIOR'));
      raw.level = bad;
      const n = normaliseCharacter(raw);
      expect(n.level, String(bad)).toBe(100);
      expect(n.presets[0].sigilSpecies.length).toBe(3);
    }
  });
});

describe('relic slots and ownership', () => {
  it('extraRelicSlots 0 keeps 2 relics per preset; the default (old saves) keeps 4', () => {
    const base = clone(fixtureCharacter('WARRIOR'));
    base.presets[0].relicIds = Object.keys(base.relics).slice(0, 4);
    expect(normaliseCharacter(base).presets[0].relicIds).toHaveLength(4);
    delete base.extraRelicSlots;
    expect(normaliseCharacter(base).extraRelicSlots).toBe(2);
    base.extraRelicSlots = 0;
    expect(normaliseCharacter(base).presets[0].relicIds).toHaveLength(2);
  });

  it('a relic set to level 0 leaves every preset; equipping past the cap is refused', () => {
    const c = fixtureCharacter('WARRIOR');
    const s = storeFor(c);
    const id = c.presets[0].relicIds[0];
    c.presets[1].relicIds = [id];
    s.relics.setRelicLevel(id, 0);
    expect(c.presets.every((p) => !p.relicIds.includes(id))).toBe(true);
    c.extraRelicSlots = 0;
    s.presets.setPresetRelics('p1', Object.keys(c.relics));
    expect(c.presets[0].relicIds).toHaveLength(2);
    const other = Object.keys(c.relics).find((r) => !c.presets[0].relicIds.includes(r));
    expect(s.relics.togglePresetRelic('p1', other)).toBe(false);
  });
});

describe('Form sigils stay at level 1', () => {
  it('DIRE_URSINE level 12 normalises to 1 and the fixture owns it at level 1', () => {
    const c = fixtureCharacter('MYSTIC');
    expect(c.sigils.owned.DIRE_URSINE.level).toBe(1);
    const raw = clone(c);
    raw.sigils.owned.DIRE_URSINE = { level: 12 };
    expect(normaliseCharacter(raw).sigils.owned.DIRE_URSINE.level).toBe(1);
    const s = storeFor(c);
    s.sigils.setSigilLevel('DIRE_URSINE', 20);
    expect(c.sigils.owned.DIRE_URSINE.level).toBe(1);
  });
});

describe('sigil conditions are character-wide', () => {
  it('two presets with different conditions for one species merge: active preset wins, a report entry is made', () => {
    const raw = clone(fixtureCharacter('WARRIOR'));
    const sp = 'REJUVENATION';
    raw.sigils.owned[sp] = { level: 5 };
    raw.presets[0].sigilSpecies = [sp];
    raw.presets[1].sigilSpecies = [sp];
    raw.presets[0].sigilConditions = { [sp]: 'MY_HP_BELOW_80' };
    raw.presets[1].sigilConditions = { [sp]: 'MY_HP_BELOW_40' };
    raw.activePresetId = 'p2';
    const report = [];
    const n = normaliseCharacter(raw, { report });
    expect(n.sigils.owned[sp].condition).toBe('MY_HP_BELOW_40');
    expect(n.presets.every((p) => !('sigilConditions' in p))).toBe(true);
    expect(report.some((r) => r.kind === 'conditionConflict' && r.species === sp)).toBe(true);
    expect(buildFighter(n, 'p1').conditions[sp]).toBe('MY_HP_BELOW_40');
  });

  it('setSigilCondition writes the owned sigil; null clears it', () => {
    const c = fixtureCharacter('WARRIOR');
    const s = storeFor(c);
    s.sigils.setSigilCondition('CATACLYSM', 'ENEMY_HP_BELOW_40');
    expect(c.sigils.owned.CATACLYSM.condition).toBe('ENEMY_HP_BELOW_40');
    s.sigils.setSigilCondition('CATACLYSM', null);
    expect(c.sigils.owned.CATACLYSM.condition).toBeUndefined();
  });
});

describe('Ancient follows the board (Q3 strict)', () => {
  it('Flameborn on a board without its node is dropped from the fighter with a warning', () => {
    const c = fixtureCharacter('WARRIOR');
    expect(buildFighter(c, 'p1').ancient).toEqual({ species: 'FLAMEBORN', level: 1 });
    const board = c.transcendence.presets[0];
    board.allocatedNodeIds = board.allocatedNodeIds.filter((id) => !id.startsWith('sig_'));
    const f = buildFighter(c, 'p1');
    expect(f.ancient).toBeNull();
    expect(computePresetStats(c, 'p1').warnings.join(' ')).toMatch(/FLAMEBORN/);
    expect(f.conditions.FLAMEBORN).toBeUndefined();
  });
});

describe('checkPreset', () => {
  it('flags set 2 at level 20 and advises on an altar tier above 3; a fixture is clean', () => {
    const c = fixtureCharacter('WARRIOR');
    expect(L.checkPreset(c, c.presets[0])).toEqual([]);
    c.level = 20;
    c.sigils.altarTier = 5;
    const v = L.checkPreset(c, c.presets[1]);
    expect(v.some((x) => x.gate === 'dualEquip')).toBe(true);
    expect(v.some((x) => x.gate === 'altarTier' && x.warn)).toBe(true);
  });

  it('below 55 only a link to another board than the unlinked one breaks the Transcendence gate', () => {
    const c = fixtureCharacter('WARRIOR');
    c.transcendence.presets.push({ id: 'bare', name: 'Bare', allocatedNodeIds: [] });
    c.level = 38;
    const p = { ...c.presets[1], transcendencePresetId: 'default' }; // the active board: a no-op link
    expect(L.checkPreset(c, p).map((x) => x.gate)).not.toContain('transcendence');
    p.transcendencePresetId = 'bare';
    expect(L.checkPreset(c, p).map((x) => x.gate)).toContain('transcendence');
  });
});

describe('transcendence links below level 58 (transcendence.md §9)', () => {
  const withLink = (level, link, edit = () => {}) => {
    const raw = clone(fixtureCharacter('WARRIOR'));
    raw.level = level;
    raw.transcendence.presets.push({ id: 'bare', name: 'Bare', allocatedNodeIds: [] });
    raw.presets[0].transcendencePresetId = link;
    edit(raw);
    return normaliseCharacter(raw).presets[0].transcendencePresetId;
  };

  it('a link to the board an unlinked preset uses anyway is cleared on load, so saved imports heal', () => {
    expect(withLink(38, 'default')).toBeNull();
    expect(withLink(57, 'default')).toBeNull();
    expect(withLink(38, 'bare', (r) => { r.transcendence.activePresetId = 'bare'; })).toBeNull();
  });

  it('a link to another board stays saved below 58, and any link stays from 58', () => {
    expect(withLink(38, 'bare')).toBe('bare');
    expect(withLink(58, 'default')).toBe('default');
  });
});

describe('level change', () => {
  it('previewLevelChange reports what drops without mutating; setCharacterLevel then reconciles', () => {
    const c = fixtureCharacter('WARRIOR');
    const s = storeFor(c);
    const pv = s.characters.previewLevelChange(30);
    expect(pv.talentPointsLost).toBeGreaterThan(0);
    expect(pv.sigilsDropped.length).toBeGreaterThan(0);
    expect(pv.awakeningPointsLost).toBe(10);
    expect(s.roster.characters[0].level).toBe(100);
    s.characters.setCharacterLevel(30);
    const cur = s.roster.characters[0];
    expect(pointsSpent(cur.talentSets[0].allocation)).toBe(16);
    expect(cur.awakening.level).toBe(0);
  });
});

describe('previewLevelChange inert gates', () => {
  const inertAt = (from, to) => {
    const c = fixtureCharacter('WARRIOR');
    c.level = from;
    return storeFor(c).characters.previewLevelChange(to).inert;
  };

  it('names each gate the new level falls below, which stays saved but stops counting', () => {
    expect(inertAt(100, 27)).toEqual(['Set 2', 'Set B', 'Mounts', 'Transcendence', 'Transcendence presets']);
    expect(inertAt(100, 57)).toEqual(['Transcendence presets']);
    expect(inertAt(100, 54)).toEqual(['Transcendence', 'Transcendence presets']);
    expect(inertAt(100, 39)).toEqual(['Mounts', 'Transcendence', 'Transcendence presets']);
    expect(inertAt(100, 37)).toEqual(['Set B', 'Mounts', 'Transcendence', 'Transcendence presets']);
  });

  it('lists nothing when no gate is crossed, including a level that is already below it', () => {
    expect(inertAt(100, 58)).toEqual([]);
    expect(inertAt(30, 29)).toEqual([]);
    expect(inertAt(20, 10)).toEqual([]);
  });
});
