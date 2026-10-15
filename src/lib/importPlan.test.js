import { describe, it, expect } from 'vitest';
import profile from './__fixtures__/real/profile-warrior-l72.json';
import fightLog from './__fixtures__/real/arena-fight-warrior.json';
import lootBag from './__fixtures__/real/drop-batch.json';
import { planImport, detectKind, describeReportEntry } from './importPlan.js';
import { ImportError } from './storage.js';
import { newRoster, newCharacter, emptyRoster } from './model/index.js';

const text = (v) => JSON.stringify(v);

describe('detectKind', () => {
  it('tells the four kinds apart, and a profile holding pendingItems is still a profile', () => {
    expect(detectKind(profile)).toBe('profile');
    expect(detectKind({ schemaVersion: 2, characters: [] })).toBe('roster');
    expect(detectKind(fightLog)).toBe('fightLog');
    expect(detectKind({ ticks: [] })).toBe('fightLog');
    expect(detectKind(lootBag)).toBe('lootBag');
    expect(detectKind({ pendingItems: [] , ...profile })).toBe('profile');
  });
  it('returns null for anything else', () => {
    for (const v of [null, 3, 'x', [], {}, { hello: 1 }]) expect(detectKind(v)).toBeNull();
  });
});

describe('planImport errors name the case and write nothing', () => {
  const roster = newRoster();
  const snapshot = JSON.stringify(roster);
  const message = (t) => {
    try {
      planImport(t, roster);
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      return e.message;
    }
    throw new Error('did not throw');
  };

  it('empty text', () => expect(message('  ')).toMatch(/empty/));
  it('invalid JSON names the line', () => expect(message('{\n"a": 1,\n"b": }')).toMatch(/not valid JSON \(line 3\)/));
  it('valid JSON of an unknown shape', () => expect(message('{"hello": 1}')).toMatch(/Valid JSON, but not a roster backup, game profile, loot bag or fight log/));
  it('a backup with zero characters says so', () => expect(message(text({ schemaVersion: 2, characters: [] }))).toMatch(/no characters/));
  it('leaves the roster untouched', () => expect(JSON.stringify(roster)).toBe(snapshot));
});

describe('planImport', () => {
  it('a game profile: counts, sheet target, the live-loadout note and the match by name', () => {
    const roster = newRoster();
    const plan = planImport(text(profile), roster);
    expect(plan.kind).toBe('profile');
    expect(plan.counts.find((c) => c.id === 'stones').count).toBeGreaterThan(0);
    expect(plan.counts.find((c) => c.id === 'set1').count).toBeGreaterThan(0);
    expect(plan.match).toBeNull();
    expect(plan.sheet).toEqual({ presetName: expect.any(String) });
    // the same name again offers "Update"
    const existing = roster.characters[0];
    existing.name = plan.character.name.toUpperCase();
    const again = planImport(text(profile), roster);
    expect(again.match?.id).toBe(existing.id);
    expect(again.diff.lines.length).toBeGreaterThan(0);
  });

  it('a profile reports what normalisation dropped (a mount the catalogue does not know)', () => {
    const p = structuredClone(profile);
    p.mountState.ownedMounts.push({ ...p.mountState.ownedMounts[0], species: 'no_such_mount', id: 'zzz' });
    const plan = planImport(text(p), emptyRoster());
    const dropped = plan.report.find((e) => e.kind === 'dropped' && e.what === 'mounts');
    expect(dropped?.count).toBeGreaterThanOrEqual(1);
    expect(describeReportEntry(dropped).text).toMatch(/Dropped \d+ mounts/);
  });

  it('a roster backup says how many characters it replaces', () => {
    const current = newRoster();
    current.characters.push(newCharacter('Two', 'MYSTIC'));
    const incoming = newRoster();
    const plan = planImport(text(incoming), current);
    expect(plan.kind).toBe('roster');
    expect(plan.incoming).toHaveLength(1);
    expect(plan.replaces.characters).toBe(2);
    expect(plan.roster.characters).toHaveLength(1);
  });

  it('a v1 backup is recognised and converted', () => {
    const v1 = { characters: [{ id: 'a', name: 'Old', class: 'WARRIOR', level: 50 }], currentId: 'a' };
    const plan = planImport(text(v1), emptyRoster());
    expect(plan.kind).toBe('roster');
    expect(plan.v1).toBe(true);
  });

  it('a loot bag and a fight log are routed, not imported', () => {
    expect(planImport(text(lootBag), newRoster())).toMatchObject({ kind: 'lootBag', items: expect.any(Number) });
    const log = planImport(text(fightLog), newRoster());
    expect(log.kind).toBe('fightLog');
    expect(log.ticks).toBeGreaterThan(0);
  });
});
