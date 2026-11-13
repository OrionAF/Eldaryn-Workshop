/**
 * verifyLog.js - one entry point for the replay checks (ia.md §3.4, §5.19; simulation.md, Replay checks).
 * Says which fight an exported server response is, and runs the engine's checker for it. Each checker
 * returns the same report (`{ok, mismatches, rules, totalMismatches}`), so the Verify tab shows them alike.
 *
 * Campaign is not here: the client runs that fight itself and sends the server only the level it
 * finished (Game/combat-pve.md §1), so there is no log to check.
 */
import { replayCheck } from '../engine/pvp/replayCheck.js';
import { dungeonReplayCheck } from '../engine/pve/dungeonReplay.js';
import { fortressReplayCheck } from '../engine/pve/fortressReplay.js';
import { worldBossReplayCheck, decodeWorldBossLog } from '../engine/pve/worldBossReplay.js';
import { dungeonMobs, raidMobs, dungeonSteps, DUNGEON_IDS } from '../engine/pve/enemies.js';
import { FORTRESS_BOSS_GROUPS } from '../engine/pve/fortressBoss.js';
import { FORTRESS_BOSSES, RAIDS, raidById } from '../game/fortress.js';
import { CLASSIC_DUNGEONS } from '../game/pveContent.js';
import { WORLD_BOSS_AFFINITIES } from '../game/worldBoss.js';

/** The fights a log can be checked for, in the order the picker lists them. */
export const FIGHT_KINDS = Object.freeze([
  { id: 'arena', label: 'Arena duel' },
  { id: 'dungeon', label: 'Dungeon' },
  { id: 'raid', label: 'Village Raid' },
  { id: 'worldBoss', label: 'World Boss' },
  { id: 'fortressBoss', label: 'Fortress Boss' },
]);
const KIND_IDS = FIGHT_KINDS.map((k) => k.id);
export const fightKindLabel = (id) => FIGHT_KINDS.find((k) => k.id === id)?.label ?? '';
/** Kinds whose attacker is one of the character's presets (the arena takes the duel's two fighters). */
export const isPveKind = (id) => id !== 'arena' && KIND_IDS.includes(id);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const numbered = (n) => Array.from({ length: n }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

// What the log itself does not say and the user picks: which step, boss or affinity was fought.
export const DUNGEON_OPTIONS = Object.freeze([
  ...CLASSIC_DUNGEONS.map((d) => ({ value: d.id, label: d.name })),
  ...CLASSIC_DUNGEONS.map((d) => ({ value: `${d.id}_hard`, label: `Hard: ${d.name}` })),
]);
export const RAID_OPTIONS = Object.freeze(RAIDS.map((r) => ({ value: r.id, label: r.name })));
// dungeons and raids both have this many steps (pve-content.md §4, clan-fortress.md §5)
export const STEP_OPTIONS = Object.freeze(numbered(dungeonSteps(DUNGEON_IDS[0]).length));
export const AFFINITY_OPTIONS = Object.freeze(Object.values(WORLD_BOSS_AFFINITIES).map((a) => ({ value: a.id, label: a.name })));
export const FORTRESS_OPTIONS = Object.freeze(FORTRESS_BOSS_GROUPS.map((g) => ({ value: g, label: FORTRESS_BOSSES[g]?.name ? `${FORTRESS_BOSSES[g].name} (${g})` : g })));

/** The rows of a `{result: {ticks}}` or `{ticks}` response, or null. */
const tickRows = (parsed) => {
  const rows = (isObj(parsed.result) ? parsed.result : parsed).ticks;
  return Array.isArray(rows) ? rows : null;
};

/**
 * Which fight a parsed response is, from its own fields; null when it is not a fight log.
 * A dungeon and a raid share one shape. Only a raid's rows go back to an earlier mob, because its other
 * mobs swing while the first is fought (Game/combat-pve.md §21.1); a raid log that never does reads as
 * a dungeon, which is why the Verify tab lets the user change the fight.
 * @returns {'arena'|'dungeon'|'raid'|'worldBoss'|'fortressBoss'|null}
 */
export function detectFightKind(parsed) {
  if (!isObj(parsed)) return null;
  const log = parsed.combatLog;
  // The Fortress sends its rows as they are; the World Boss sends them packed as `{v, types, ticks}`
  // (Game/combat-pve.md §17), which engine/pve/worldBossReplay.js decodes.
  if (Array.isArray(log)) return 'damageDealt' in parsed || 'playerDied' in parsed || 'bossHp' in parsed ? 'worldBoss' : 'fortressBoss';
  if (isObj(log) && Array.isArray(log.ticks)) return 'worldBoss';
  if (log !== undefined) return null;
  const rows = tickRows(parsed);
  if (!rows) return null;
  if (!rows.some((e) => Number.isInteger(e?.mobIndex))) return 'arena';
  let high = -1;
  for (const e of rows) {
    if (!Number.isInteger(e?.mobIndex)) continue;
    if (e.mobIndex < high) return 'raid';
    high = e.mobIndex;
  }
  return rows[0]?.mobIndex > 0 ? 'raid' : 'dungeon';
}

/** How many events the log holds (the import report's count); 0 when they cannot be read. */
export function fightLogEvents(parsed) {
  if (!isObj(parsed)) return 0;
  // an array passes through the decoder unchanged, so this counts the Fortress's rows too
  if (parsed.combatLog !== undefined) return decodeWorldBossLog(parsed.combatLog)?.length ?? 0;
  return tickRows(parsed)?.length ?? 0;
}

/** The fortress group a response names (`bossName`), or null: the log carries no group id. */
export function fortressGroupOf(parsed) {
  const name = isObj(parsed) ? parsed.bossName : null;
  return (typeof name === 'string' && FORTRESS_BOSS_GROUPS.find((g) => FORTRESS_BOSSES[g]?.name === name)) || null;
}

/**
 * What the check was held against, in words, for the report's heading.
 * @param {string} kind
 * @param {Object} [target]  as `verifyFightLog` takes it
 */
export function describeFight(kind, target = {}) {
  const step = target.step ? `, step ${target.step}` : '';
  if (kind === 'dungeon') {
    const d = DUNGEON_OPTIONS.find((o) => o.value === target.dungeon);
    return d ? `Dungeon: ${d.label}${step}` : 'Dungeon';
  }
  if (kind === 'raid') {
    const r = raidById(target.raid);
    return r ? `Village Raid: ${r.name}${step}` : 'Village Raid';
  }
  if (kind === 'worldBoss') {
    const a = WORLD_BOSS_AFFINITIES[target.affinity];
    return a ? `World Boss (${a.name})` : 'World Boss';
  }
  if (kind === 'fortressBoss') {
    const b = FORTRESS_BOSSES[target.group];
    return b ? `Fortress Boss: ${b.name ?? target.group}` : 'Fortress Boss';
  }
  return fightKindLabel(kind);
}

/**
 * Runs the checker for `kind` on a parsed response.
 * @param {Object} parsed  the server response
 * @param {Object} o
 * @param {string} o.kind  a FIGHT_KINDS id
 * @param {Object|null} [o.attacker]  arena: the duel attacker (features/duel.js `arrange`); every other
 *   kind: a Fighter (build/fighter.js `buildFighter`). Null leaves the sheet rules skipped.
 * @param {Object|null} [o.defender]  arena only
 * @param {{dungeon?: string, raid?: string, step?: number, affinity?: string, group?: string}} [o.target]
 *   what was fought; a part left out leaves the rules that need it skipped
 * @returns {{ok: boolean, mismatches: Array<Object>, rules: Array<Object>, totalMismatches: number}}
 */
export function verifyFightLog(parsed, { kind, attacker = null, defender = null, target = {} } = {}) {
  switch (kind) {
    case 'arena':
      return replayCheck(parsed, attacker && defender ? { attacker, defender } : {});
    case 'dungeon':
      return dungeonReplayCheck(parsed, { attacker, mobs: target.dungeon && target.step ? dungeonMobs(target.dungeon, target.step) : null, mode: 'dungeon' });
    case 'raid':
      return dungeonReplayCheck(parsed, { attacker, mobs: target.raid && target.step ? raidMobs(target.raid, target.step) : null, mode: 'raid' });
    case 'worldBoss':
      return worldBossReplayCheck(parsed, { attacker, affinity: target.affinity || null });
    case 'fortressBoss':
      return fortressReplayCheck(parsed, { attacker, group: target.group || null });
    default:
      throw new Error(`unknown fight '${kind}'`);
  }
}
