import { it, expect } from 'vitest';
import { profileRecord, selectRecords, partitionOf } from './dataset.mjs';

const profile = (id = 'test-player') => ({ playerId: id, name: 'PRIVATE NAME', class: 'WARRIOR', activeSpec: 'WARRIOR_DPS',
  level: 70, realm: 'base', computedStats: { totalAttack: 1000, totalHp: 10000, totalAttackSpeed: 1 }, equippedSigils: [],
  authorization: 'Bearer PRIVATE TOKEN', clanAbbreviation: 'PRIVATE CLAN' });
const context = { server: 'server-5', capturedAt: '2026-10-19T00:00:00.000Z' };

it('uses only whitelisted anonymous fields, with honest missing-data markers', () => {
  const record = profileRecord(profile(), context), text = JSON.stringify(record);
  for (const value of ['PRIVATE NAME', 'PRIVATE TOKEN', 'PRIVATE CLAN', 'Bearer', 'test-player']) expect(text).not.toContain(value);
  expect(record.opponent.sheet.values.totalAttack).toBe(1000);
  expect(record.opponent.imported.playerId).toBeNull();
  expect(record.missing).toContain('talent-allocation');
});
it('rejects malformed or unsupported profiles instead of silently defaulting their class/spec/stats', () => {
  for (const patch of [{ class: 'UNKNOWN' }, { activeSpec: 'MYSTIC_MAGE' }, { level: 0 }, { playerId: null },
    { computedStats: { totalHp: 100, totalAttack: 10, totalAttackSpeed: 0 } }]) expect(profileRecord({ ...profile(), ...patch }, context)).toBeNull();
  expect(profileRecord(profile(), { ...context, capturedAt: 'bad' })).toBeNull();
});
it('deduplicates snapshots across servers and dates without leaking player identity between partitions', () => {
  const old = profileRecord(profile(), context);
  const newer = profileRecord(profile(), { server: 'server-11', capturedAt: '2026-10-20T00:00:00.000Z' });
  const records = selectRecords([old, newer]);
  expect(records.uniquePlayers).toBe(1);
  expect(records.records).toEqual([newer]);
  expect(old.partition).toBe(newer.partition);
});
it('selects deterministically with per-partition bounds and progression/spec coverage', () => {
  const records = Array.from({ length: 100 }, (_, i) => profileRecord({ ...profile(`player-${i}`), level: 20 + i % 70 }, { ...context, server: i % 2 ? 'server-5' : 'server-11' }));
  const a = selectRecords(records, 8), b = selectRecords([...records].reverse(), 8);
  expect(a).toEqual(b);
  expect(a.records.filter((r) => r.partition === 'held-out')).toHaveLength(8);
  expect(a.records.filter((r) => r.partition === 'development')).toHaveLength(8);
  expect(new Set(a.records.map((r) => r.server)).size).toBe(2);
  expect(['held-out', 'development']).toContain(partitionOf('new-id'));
});
