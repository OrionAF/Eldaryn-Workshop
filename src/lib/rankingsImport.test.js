// Backlog §2: a Rankings profile imported as a PVP opponent and offered as a Celestial partner.
import { describe, it, expect, beforeEach } from 'vitest';
import rankings from './__fixtures__/real/leaderboard-warrior-l95-tank.json';
import profile from './__fixtures__/real/profile-warrior-l72.json';
import sentinel from './__fixtures__/real/profile-sentinel-l85-oct15b.json';
import { detectKind, planImport } from './importPlan.js';
import { importFlow, loadImportText, confirmImport, resetImportFlow } from './importFlow.svelte.js';
import { rosterStore } from './rosterStore.svelte.js';
import { newRoster, normaliseCharacter } from './model/index.js';
import { gameProfileToCharacter } from './model/gameProfile.js';
import { normaliseOpponent } from './model/opponents.js';
import { opponentFighter } from './features/duel.js';
import { resolveTarget } from './search/objectives.js';

const NOW = '2026-10-15T00:00:00.000Z';
// the fixture carries no identifiers; a player id and name are added here only to exercise de-duplication
const withId = (id, extra = {}) => ({ ...rankings, playerId: id, name: 'Test Player', ...extra });
const opps = () => rosterStore.current.opponents;

beforeEach(() => {
  localStorage.clear();
  resetImportFlow();
  rosterStore.roster.characters.splice(0);
  rosterStore.addCharacter('Aria', 'WARRIOR');
});

describe('detectKind', () => {
  it('tells a Rankings profile from an own profile and from a backup', () => {
    expect(detectKind(rankings)).toBe('opponent');
    expect(detectKind(profile)).toBe('profile');
    expect(detectKind({ schemaVersion: 2, characters: [] })).toBe('roster');
  });
});

describe('importing a Rankings profile', () => {
  it('plans without writing, and needs a character to save into', () => {
    expect(() => planImport(JSON.stringify(rankings), newRoster())).toThrow(/create or select a character/);
    const plan = planImport(JSON.stringify(rankings), rosterStore.roster, { now: NOW, character: rosterStore.current });
    expect(plan.kind).toBe('opponent');
    expect(plan.match).toBeNull();
    expect(opps()).toHaveLength(0);
  });

  it('saves the opponent with the server sheet exactly and the loadout mechanics', () => {
    expect(loadImportText(JSON.stringify(rankings))).toBe(true);
    expect(importFlow.plan.kind).toBe('opponent');
    expect(confirmImport()).toBe(true);
    expect(opps()).toHaveLength(1);
    const o = opps()[0];
    for (const [k, v] of Object.entries(rankings.computedStats)) expect(o.sheet.values[k]).toBe(v);
    expect(o).toMatchObject({ class: 'WARRIOR', spec: 'WARRIOR_TANK', altarTier: 3 });
    expect(o.imported).toMatchObject({ level: 95 });
    expect(o.ancient).toEqual({ species: 'EARTHWARDEN', level: 1 });
    expect(o.sigils).toEqual([{ species: 'SUNDER_MARK', level: 2 }, { species: 'BULWARK_OF_THORNS', level: 3 }]);
  });

  it('re-importing the same playerId updates that opponent, a new one adds', () => {
    loadImportText(JSON.stringify(withId('p-1')));
    confirmImport();
    const id = opps()[0].id;
    const changed = withId('p-1', { computedStats: { ...rankings.computedStats, totalAttack: 3000000 }, level: 96 });
    loadImportText(JSON.stringify(changed));
    expect(importFlow.plan.match?.id).toBe(id);
    confirmImport();
    expect(opps()).toHaveLength(1);
    expect(opps()[0]).toMatchObject({ id, name: 'Test Player' });
    expect(opps()[0].sheet.values.totalAttack).toBe(3000000);
    expect(opps()[0].imported.level).toBe(96);
    loadImportText(JSON.stringify(withId('p-2')));
    confirmImport();
    expect(opps()).toHaveLength(2);
  });

  it('keeps no identifier beyond the playerId and the name', () => {
    loadImportText(JSON.stringify(withId('p-1', { clanId: 'clan-x', accountId: 'acc-9' })));
    confirmImport();
    expect(JSON.stringify(opps()[0])).not.toMatch(/clan-x|acc-9/);
  });
});

describe('the duel and Celestial use the imported loadout', () => {
  const imported = () => {
    loadImportText(JSON.stringify(rankings));
    confirmImport();
    return opps()[0];
  };

  it('opponentFighter has the imported sigils, spec, altar tier, glyphs and level', () => {
    const f = opponentFighter(imported());
    expect(f).toMatchObject({ spec: 'WARRIOR_TANK', altarTier: 3, level: 95, source: 'sheet' });
    expect(f.sigils.map((s) => s.species)).toEqual(['SUNDER_MARK', 'BULWARK_OF_THORNS']);
    expect(f.ancient.species).toBe('EARTHWARDEN');
    expect(f.glyphMods).toEqual([{ glyphType: 'sg-sunder-decay', rarity: 'Epic' }]);
  });

  it('a typed opponent keeps the placeholder level', () => {
    expect(opponentFighter(normaliseOpponent({ spec: 'WARRIOR_DPS' })).level).toBe(100);
  });

  it('a Celestial run with a Rankings partner scales by its level and says so', () => {
    const o = imported();
    const me = normaliseCharacter(gameProfileToCharacter(sentinel, { now: NOW }));
    const t = resolveTarget({ kind: 'celestial', difficulty: 'HARD', partner: { source: 'opponent', opponentId: o.id } }, { character: { ...me, opponents: [o] } });
    expect(t.celestial.level).toBe(95);
    expect(t.label).toMatch(/L95/);
    expect(t.assumptions.find((a) => a.id === 'celestial-partner').label).toMatch(/imported from Rankings \(level 95\)/);
  });
});

describe('old saves', () => {
  it('an opponent without `imported` loads as a typed one', () => {
    const o = normaliseOpponent({ id: 'o1', name: 'Old', spec: 'WARRIOR_DPS', sheet: { values: { totalHp: 5 } } });
    expect(o.imported).toBeNull();
    expect(normaliseOpponent(o)).toEqual(o);
  });
  it('a bad `imported` is cleaned', () => {
    expect(normaliseOpponent({ imported: { playerId: 7, level: 'x' } }).imported).toEqual({ playerId: '7', level: 1, importedAt: null });
    expect(normaliseOpponent({ imported: 'junk' }).imported).toBeNull();
  });
});

describe('fixture', () => {
  it('carries no player identifiers', () => {
    for (const k of ['playerId', 'name', 'username', 'clanId', 'clan', 'userId', 'accountId']) expect(rankings).not.toHaveProperty(k);
  });
});
