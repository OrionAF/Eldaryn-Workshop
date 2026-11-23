// The Crusade port (combat-pve.md §21): boss scaling, the drop table, the run of three bosses inside one
// 300 s budget, full against partial clears, the boss fight's own rules (no boss crit roll, 1:1 shield,
// seat targeting) and the injected rng.
import { describe, it, expect, vi } from 'vitest';
import {
  simulateCrusade, simulateBossFight, crusadeBossEntity, mythicPlusBossMultiplier, crusadeEnchantRate,
  expectedEnchantStones, rollEnchantDrops, rollEnchantStoneType, CRUSADE_TIME_LIMIT_MS, CRUSADE_TICK_MS,
  BOSS_START_GAP_MS, CRUSADE_ASSUMPTIONS,
} from './crusade.js';
import { createPlayerEntity } from '../core/entity.js';
import { createStackCombat } from '../core/stacks.js';
import { fightRng, scripted } from '../rng.js';
import { CRUSADE_HELL_BOSSES } from '../../game/pveContent.js';

const stats = (o = {}) => ({
  totalHp: 10_000_000, totalAttack: 500_000, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0,
  totalPvpAttack: 0, totalPvpDefense: 0, ...o,
});
const fighter = (o = {}, f = {}) => ({ stats: stats(o), class: 'WARRIOR', spec: 'WARRIOR_TANK', sigils: [], ...f });
const half = () => 0.5;
const [SENTINEL, DEMON, FIRE_LORD] = CRUSADE_HELL_BOSSES;

describe('Crusade bosses and rewards (pve-content.md §5)', () => {
  it('createBossEntity: party scaling, difficulty and Mythic+ multipliers; attack speed takes the stat multiplier', () => {
    expect(CRUSADE_HELL_BOSSES.map((b) => b.id)).toEqual(['obsidian_sentinel', 'infernal_demon', 'fire_lord']);
    expect(crusadeBossEntity(SENTINEL, 1, 'NORMAL')).toMatchObject({ maxHp: 1555200, hp: 1555200, attack: 3038, attackSpeed: 1.1, critChance: 0, critDamage: 1, damageReduction: 0, blockChance: 0, missChance: 0 });
    const hard = crusadeBossEntity(SENTINEL, 1, 'HARD');
    expect([hard.maxHp, hard.attack]).toEqual([3304800, 10328]);
    expect(hard.attackSpeed).toBeCloseTo(1.87, 12);
    const m4 = crusadeBossEntity(FIRE_LORD, 3, 'MYTHIC', 4);
    expect([m4.maxHp, m4.attack]).toEqual([198956564, 195858]);
    expect(m4.attackSpeed).toBeCloseTo(4.35, 12);
    expect(mythicPlusBossMultiplier(0)).toBe(1);
    expect(mythicPlusBossMultiplier(2)).toBeCloseTo(1.8225, 12);
    expect(mythicPlusBossMultiplier(5)).toBeCloseTo(1.35 ** 3 * 1.5 ** 2, 12);
    expect(() => crusadeBossEntity(SENTINEL, 1, 'EASY')).toThrow(/difficulty/);
  });

  it('the drop rate: a Mythic+ full clear is 3, every other outcome reads the table, no kill rolls nothing', () => {
    expect(crusadeEnchantRate('NORMAL', 1, 0)).toBe(0);
    expect([1, 2, 3].map((k) => crusadeEnchantRate('NORMAL', 1, k))).toEqual([0.1, 0.25, 0.35]);
    expect(crusadeEnchantRate('MYTHIC', 3, 3, 4)).toBe(3);
    expect(crusadeEnchantRate('MYTHIC', 3, 2, 4)).toBe(2.1);
    expect(crusadeEnchantRate('MYTHIC', 3, 3, 0)).toBe(2.8);
    for (const r of [0, 0.35, 1, 1.6, 2.8, 3]) expect(expectedEnchantStones(r)).toBeCloseTo(r, 12);
  });

  it('rollEnchantDrops: a Mythic+ full clear always drops three, one per seat in turn; a partial clear stops early', () => {
    const party = [{}, {}, {}];
    const full = rollEnchantDrops(party, 3, 3, 'MYTHIC', 4, () => 0.99);
    expect(full.map((d) => d.winnerIndex)).toEqual([0, 1, 2]);
    expect(full).toHaveLength(3);
    // rate 2.1: two sure stones, then 0.99 > 0.1 ends the roll
    expect(rollEnchantDrops(party, 3, 2, 'MYTHIC', 4, () => 0.99)).toHaveLength(2);
    // Normal solo full clear: 0.35, one stone at best
    expect(rollEnchantDrops([{}], 1, 3, 'NORMAL', 0, () => 0)).toEqual([{ type: 'PVE_ATTACK', winnerIndex: 0, rolls: [1, 0, 0] }]);
    expect(rollEnchantDrops([{}], 1, 3, 'NORMAL', 0, () => 0.99)).toEqual([]);
    // Mythic+4 weights 2 / 2 / 11 / 31 / 32 / 0: a draw past 46 / 78 is a Mythic stone
    expect(rollEnchantStoneType('MYTHIC', 4, () => 47 / 78)).toBe('MYTHIC');
    expect(rollEnchantStoneType('MYTHIC', 4, () => 45 / 78)).toBe('ULTIMATE');
  });
});

describe('simulateCrusadeFight (L1868835-1869345)', () => {
  it('three bosses in order on one run clock: 500 ms before each, HP reset per boss, then the full-clear drop', () => {
    const r = simulateCrusade({ party: [fighter()], difficulty: 'NORMAL', rng: half, log: true });
    expect(r.success).toBe(true);
    expect(r.timedOut).toBe(false);
    expect(r.bossesKilled).toBe(3);
    expect(r.bossResults.map((b) => b.bossIndex)).toEqual([0, 1, 2]);
    // 500 000 per swing, one a second: 4, 5 and 6 swings
    expect(r.bossResults.map((b) => b.totalDuration)).toEqual([4500, 5500, 6500]);
    expect(r.totalDuration).toBe(16500);
    const deaths = r.bossResults.map((b) => b.ticks.filter((e) => e.type === 'boss_death').map((e) => e.timestamp));
    expect(deaths).toEqual([[4500], [10000], [16500]]);
    // the first swing of each boss lands 1000 ms after its 500 ms gap
    expect(r.bossResults.map((b) => b.ticks.find((e) => e.type === 'player_attack').timestamp)).toEqual([1500, 6000, 11500]);
    // the Sentinel (3038 a hit, 909 ms) lands 4 hits before it dies; boss 2 starts at full HP
    expect(r.bossResults[0].hpLeft).toEqual([10_000_000 - 4 * 3038]);
    expect(r.bossResults[1].ticks.find((e) => e.type === 'boss_attack').playerHpsAfter).toEqual([10_000_000 - 3510]); // the Demon hits for round(15600 * 0.45 * 0.5)
    expect(r.enchantRate).toBe(0.35);
    expect(r.expectedStones).toBeCloseTo(0.35, 12);
    expect(r.damageDealt).toBe(r.bossHpTotal);
    expect(r.timeLimitMs).toBe(CRUSADE_TIME_LIMIT_MS);
    expect(CRUSADE_TICK_MS).toBe(10);
    expect(BOSS_START_GAP_MS).toBe(500);
  });

  it('the 300 s budget is for the whole run: a boss that would die in 292 s alone times out after a 195 s first boss', () => {
    // 8000 a swing: Sentinel 195 swings (195.5 s), Demon would need 292 swings
    const r = simulateCrusade({ party: [fighter({ totalAttack: 8000, totalHp: 1e12 })], difficulty: 'NORMAL', rng: half });
    expect(r.success).toBe(false);
    expect(r.timedOut).toBe(true);
    expect(r.bossesKilled).toBe(1);
    expect(r.bossResults.map((b) => [b.success, b.totalDuration])).toEqual([[true, 195500], [false, 104510]]);
    expect(r.totalDuration).toBe(300010); // the first tick past the budget ends it
    // partial clear: the table's one-boss rate
    expect(r.enchantRate).toBe(0.1);
    expect(r.expectedStones).toBeCloseTo(0.1, 12);
    // the share of the three bosses' HP removed
    const left = r.bossResults[1].bossHpLeft + crusadeBossEntity(FIRE_LORD, 1, 'NORMAL').maxHp;
    expect(r.damageDealt).toBe(r.bossHpTotal - left);
  });

  it('no boss killed: no drop roll, a timeout at 300 010 ms', () => {
    const r = simulateCrusade({ party: [fighter({ totalAttack: 1000, totalHp: 1e12 })], difficulty: 'NORMAL', rng: () => 0 });
    expect(r).toMatchObject({ success: false, timedOut: true, bossesKilled: 0, totalDuration: 300010, enchantRate: 0, expectedStones: 0, enchantStoneDrops: [] });
    expect(r.bossResults).toHaveLength(1);
  });

  it('a player death ends the run as a loss that is not a timeout', () => {
    const r = simulateCrusade({ party: [fighter({ totalAttack: 1000, totalHp: 5000 })], difficulty: 'NORMAL', rng: half });
    expect(r).toMatchObject({ success: false, timedOut: false, bossesKilled: 0 });
    expect(r.bossResults[0].playersDiedIndices).toEqual([0]);
    // 3038 a hit: dead on the second, 909 ms apart after the 500 ms gap
    expect(r.totalDuration).toBe(2320); // hits at 1410 and 2320: the boss timer reaches 909 every 91st tick
  });

  it('a Necromancer\'s opening summon window delays the first swings and adds to the run budget', () => {
    const necro = fighter({ totalAttack: 1, totalHp: 1e12, totalMinionAttack: 0, totalMinionHealth: 0 },
      { class: 'NECROMANCER', spec: 'NECROMANCER_SUMMONER', utility: { species: 'BONE_SERVANT', level: 1 } });
    const r = simulateCrusade({ party: [necro], difficulty: 'NORMAL', rng: half, log: true });
    const summoned = r.bossResults[0].ticks.find((e) => e.type === 'minion_summoned');
    expect(summoned).toMatchObject({ timestamp: 0, summonReadyMs: 1500 });
    expect(r.timeLimitMs).toBe(CRUSADE_TIME_LIMIT_MS + 1500);
    expect(r.totalDuration).toBe(CRUSADE_TIME_LIMIT_MS + 1500 + 10);
  });

  it('is a pure function of its rng: the same seed gives the same run, and Math.random is never read', () => {
    const spy = vi.spyOn(Math, 'random');
    const f = fighter({ totalAttack: 60_000, totalCritChance: 30, totalDoubleHit: 20, totalBlockChance: 20, totalBlindChance: 10, totalHp: 3e6 });
    const a = simulateCrusade({ party: [f], difficulty: 'NORMAL', rng: fightRng(7, 3), log: true });
    const b = simulateCrusade({ party: [f], difficulty: 'NORMAL', rng: fightRng(7, 3), log: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    const types = new Set(a.bossResults.flatMap((x) => x.ticks.map((e) => e.type)));
    for (const t of ['player_crit', 'player_attack', 'boss_attack', 'player_block']) expect(types).toContain(t);
  });

  it('labels every result a server model', () => {
    expect(Object.values(CRUSADE_ASSUMPTIONS).map((a) => a.key)).toEqual(['crusade-server-fight', 'crusade-solo-scaling', 'crusade-drops']);
  });

  it('refuses an empty or oversized party and a bad Mythic+ level', () => {
    expect(() => simulateCrusade({ party: [], difficulty: 'NORMAL', rng: half })).toThrow(/1 to 3/);
    expect(() => simulateCrusade({ party: [fighter()], difficulty: 'NORMAL', mythicPlus: 1.5, rng: half })).toThrow(/Mythic\+/);
  });
});

describe('simulateBossFight rules (L1862921-1868584)', () => {
  // a run state with hand-built seats (no spells, no minions)
  const state = (seats) => ({
    entities: seats.map((o) => createPlayerEntity(stats(o))),
    maxHps: seats.map((o) => o.totalHp ?? 10_000_000),
    hps: seats.map((o) => o.totalHp ?? 10_000_000),
    alive: seats.map(() => true),
    spells: seats.map(() => null),
    shieldCur: seats.map((o) => o.shield ?? 0),
    shieldMax: seats.map((o) => o.shield ?? 0),
    vampRefill: seats.map(() => false),
    regenRefill: seats.map(() => false),
    minions: seats.map(() => null),
  });
  const opts = (o = {}) => ({
    dtMs: 10, elapsed: 0, limit: 3000, stack: createStackCombat([], true), stackIndex: 0, thornsPercent: 0, focus: null, log: true, ...o,
  });
  // a seat that never swings inside the window
  const idle = { totalAttackSpeed: 0.001 };

  it('the boss never rolls a crit and its shield hits are 1:1 (no mitigation); the shield carries in the state', () => {
    const s = state([{ ...idle, shield: 5000 }]);
    const boss = crusadeBossEntity(SENTINEL, 1, 'NORMAL');
    // no draw at all: an empty script would throw on any
    const r = simulateBossFight(0, boss, s, opts({ limit: 3500 }), scripted([]));
    const hits = r.ticks.filter((e) => e.type === 'boss_attack');
    expect(hits.map((e) => e.damage)).toEqual([3038, 3038, 3038]);
    expect(hits.map((e) => e.timestamp)).toEqual([1410, 2320, 3230]);
    // 5000 shield takes the first hit whole and 1962 of the second
    expect(hits.map((e) => e.playerHpsAfter[0])).toEqual([10_000_000, 10_000_000 - 1076, 10_000_000 - 1076 - 3038]);
    expect(s.shieldCur).toEqual([0]);
    expect(r.success).toBe(false);
    expect(r.totalDuration).toBe(3510);
  });

  it('the boss hits the living seat with the most HP, or the focus seat while it lives', () => {
    const s = state([{ ...idle, totalHp: 1_000_000 }, { ...idle, totalHp: 2_000_000 }]);
    const r = simulateBossFight(0, crusadeBossEntity(SENTINEL, 2, 'NORMAL'), s, opts({ limit: 1500 }), half);
    expect(r.ticks.filter((e) => e.type === 'boss_attack').map((e) => e.playerIndex)).toEqual([1]);
    const s2 = state([{ ...idle, totalHp: 1_000_000 }, { ...idle, totalHp: 2_000_000 }]);
    const f = simulateBossFight(0, crusadeBossEntity(SENTINEL, 2, 'NORMAL'), s2, opts({ limit: 1500, focus: { index: 0, lethalRedirect: 'always' } }), half);
    expect(f.ticks.filter((e) => e.type === 'boss_attack').map((e) => e.playerIndex)).toEqual([0]);
  });

  it('a blocked boss swing does no damage and names block or miss from the target', () => {
    const s = state([{ ...idle, totalBlockChance: 50 }]);
    const r = simulateBossFight(0, crusadeBossEntity(SENTINEL, 1, 'NORMAL'), s, opts({ limit: 1500 }), () => 0);
    expect(r.ticks.filter((e) => e.type.startsWith('player_')).map((e) => [e.type, e.damage])).toEqual([['player_block', 0]]);
  });
});
