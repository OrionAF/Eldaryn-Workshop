// Offline benchmark preparation. Captures are data: never execute them or copy request headers.
import { createHash } from 'node:crypto';
import { classOfSpec } from '../../src/lib/game/classes.js';
import { opponentFromRankingsProfile, isRankingsProfile } from '../../src/lib/model/opponents.js';

export const digest = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const playerKey = (id) => digest(`eldaryn-performance-player-v1:${id}`);
export const partitionOf = (id) => parseInt(playerKey(id).slice(0, 8), 16) % 5 === 0 ? 'held-out' : 'development';

/** Whitelisted, anonymous engine inputs; rank/Influence never label build strength. */
export function profileRecord(profile, { server, capturedAt }) {
  if (!isRankingsProfile(profile) || typeof profile.playerId !== 'string' || !profile.playerId
    || classOfSpec(profile.activeSpec) !== profile.class || !Number.isInteger(profile.level) || profile.level < 1
    || !Number.isFinite(profile.computedStats.totalHp) || profile.computedStats.totalHp <= 0
    || !Number.isFinite(profile.computedStats.totalAttack) || profile.computedStats.totalAttack < 0
    || !Number.isFinite(profile.computedStats.totalAttackSpeed) || profile.computedStats.totalAttackSpeed <= 0) return null;
  if (!Number.isFinite(Date.parse(capturedAt))) return null;
  const identity = playerKey(profile.playerId), opponent = opponentFromRankingsProfile(profile, { now: capturedAt });
  opponent.name = `Benchmark ${identity.slice(0, 10)}`;
  opponent.id = identity;
  if (opponent.imported) opponent.imported.playerId = null;
  return {
    identity, partition: partitionOf(profile.playerId), server, capturedAt,
    sourceDigest: digest(profile), class: profile.class, spec: profile.activeSpec, level: profile.level,
    realm: typeof profile.realm === 'string' ? profile.realm : 'unknown',
    missing: ['talent-allocation', 'sigil-conditions', 'awakening-level', 'board-allocation'],
    opponent,
    pattern: { sigils: opponent.sigils.map((s) => s.species).sort(), utility: opponent.utility?.species ?? null,
      ancient: opponent.ancient?.species ?? null, pet: profile.equippedPet?.species ?? null, mount: profile.activeMount?.species ?? null },
  };
}

/** Latest snapshot per player, then deterministic round-robin over server/spec/realm/level strata. */
export function selectRecords(records, limit = 48) {
  const latest = new Map();
  for (const record of records) {
    const old = latest.get(record.identity);
    if (!old || record.capturedAt > old.capturedAt || (record.capturedAt === old.capturedAt && record.sourceDigest < old.sourceDigest)) latest.set(record.identity, record);
  }
  const selected = [];
  for (const partition of ['development', 'held-out']) {
    const groups = new Map();
    for (const record of latest.values()) {
      if (record.partition !== partition) continue;
      const stratum = `${record.server}/${record.spec}/${record.realm}/${Math.floor(record.level / 20)}`;
      if (!groups.has(stratum)) groups.set(stratum, []);
      groups.get(stratum).push(record);
    }
    const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, values]) => values.sort((a, b) => a.identity.localeCompare(b.identity)));
    let n = 0;
    for (let rank = 0; rows.some((row) => row.length > rank) && n < limit; rank++) {
      for (const row of rows) if (row[rank] && n < limit) { selected.push(row[rank]); n++; }
    }
  }
  return { records: selected, uniquePlayers: latest.size, selected: selected.length };
}
