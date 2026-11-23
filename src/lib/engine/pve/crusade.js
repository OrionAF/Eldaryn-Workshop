// Hell Crusade: a party of 1-3 against three bosses in a row inside one run-wide time budget. A port of
// the 2.9.8 client's simulateCrusadeFight (L2237818-2238308) and its simulateBossFight (L2231333-2237566),
// shipped and never called (combat-pve.md §24 has the rules, the per-tick order, the version history and
// every line reference). Written from the 2.7.0 text, brought up to 2.9.8 (2.7.5 weakened boss attack,
// 2.8.2 minion death ward, 2.9.2 per-seat stacks). The server runs the real fight, and no solo Crusade log
// has checked this port yet, so every result is a 'server-model' (CRUSADE_ASSUMPTIONS).
//
// The boss fight is its own loop, not the dungeon one (fight.js): it walks the players in seat order each
// tick, ticks the boss's debuffs after the swings, never rolls a boss crit, absorbs hits 1:1 with the
// shield, and has no Chrono Flux or transform step. Shared pieces are the engine's own (spell pass,
// debuffs, buffs, stack sigils, minions, stances, rolls).
//
// Randomness: player p's swing draws read lane `p<p>` (sub-lanes crit, double, blind, paralyze, disrupt,
// daze), its minion `p<p>:minion` (sub-lane reap), the boss `boss` (sub-lanes avoid, minion-block, bash),
// the loot `drops`; the spell pass and the debuff tick take the root rng, as in fight.js. A plain rng
// function (no lanes) gets every draw in the client's Math.random order. No Math.random.
import {
  processSpellsTick, computeActiveBuffModifiers, activeBuffThornsPercent, isSpellBuffActive, initSpellRuntimes,
} from '../core/spells.js';
import { applyBuffsToEntity, hasActiveBuffs, getBuffedMaxHp } from '../core/buffs.js';
import { initDebuffState, applyDebuff, processDebuffsTick, slowedAttackSpeed, weakenedAttack } from '../core/debuffs.js';
import { applySunderToTarget, applyBulwarkDr, applyElusiveBuff, createStackCombat } from '../core/stacks.js';
import { absorbWithShield, shieldRefillAmount, regenShieldRefillAmount } from '../core/shield.js';
import {
  rollAttackDamage, rollDisruption, PARALYZE_DURATION_MS, STAGGER_STUN_MS,
} from '../core/rolls.js';
import { rollStanceDaze, rollShieldBash, tickDazedMs, SHIELD_BASH_STUN_SOURCE } from '../core/stances.js';
import {
  advanceMinionRespawn, openingSummonWindowMs, openingSwingTimerStart, minionSummonMeta, soulLinkHeal, killMinion,
  isMinionAlive, createMinion, summonMinion, carryMinionIntoNewFight, minionSwing, mitigateMinionHit,
  healMinionLifesteal, damageMinion, minionDeathMeta, expireMinionDeathWard, minionDeathWardLeft, rollMinionReap,
  REAP_STUN_SOURCE,
} from '../core/minions.js';
import { routeSpellHealToMinion, REGEN_INTERVAL_MS, REGEN_PULSES_PER_SEC } from './tick.js';
import { preparePveFighter } from './fight.js';
import { lane } from '../rng.js';
import { EngineInputError } from '../validate.js';
import { CRUSADE, crusadeDifficulty, CRUSADE_HELL_BOSSES } from '../../game/pveContent.js';

/** CRUSADE_CONSTANTS: the tick, the run-wide boss time budget and the seats (pve-content.md §5). */
export const CRUSADE_TICK_MS = CRUSADE.constants.TICK_INTERVAL_MS;
export const CRUSADE_TIME_LIMIT_MS = CRUSADE.constants.BOSS_TIME_LIMIT_MS;
export const CRUSADE_GROUP_SIZE = CRUSADE.constants.GROUP_SIZE;
/** simulateBossFight's wait before each boss, after the opening summon window (L2232097-2232100). */
export const BOSS_START_GAP_MS = 500;

const note = (key, text) => Object.freeze({ key, text });
/** Labels for what the Crusade results rest on (combat-pve.md §24). */
export const CRUSADE_ASSUMPTIONS = Object.freeze({
  serverFight: note('crusade-server-fight', "Server-run fight: simulated with the client's own simulateCrusadeFight, which the client ships but never calls. No solo Crusade log has checked it yet."),
  soloScaling: note('crusade-solo-scaling', 'A solo run scales the bosses for a party of one (the client\'s playerCountScaling[1]); the server sets the party size.'),
  drops: note('crusade-drops', "Enchant stones per run follow the client's rollEnchantDrops table; the server rolls the real drops."),
});

// ---------------------------------------------------------------------------------------------
// Bosses and rewards
// ---------------------------------------------------------------------------------------------

/** A difficulty's config, or an EngineInputError. */
function difficultyOf(difficulty) {
  const cfg = crusadeDifficulty(difficulty);
  if (!cfg) throw new EngineInputError(`unknown Crusade difficulty '${difficulty}'`, { kind: 'crusade', key: 'difficulty', value: difficulty });
  return cfg;
}

// port of getMythicPlusBossMultiplier L2045074-2045108
/** 1.35^min(L, 3), times 1.5^(L - 3) above level 3; 1 at L <= 0. */
export function mythicPlusBossMultiplier(level) {
  if (!(level > 0)) return 1;
  const m = CRUSADE.mythicPlus;
  const low = m.STAT_MULTIPLIER_PER_LEVEL ** Math.min(level, m.STEEPEN_ABOVE_LEVEL);
  return level > m.STEEPEN_ABOVE_LEVEL ? low * m.STAT_MULTIPLIER_PER_LEVEL_HIGH ** (level - m.STEEPEN_ABOVE_LEVEL) : low;
}

// port of createBossEntity L2231043-2231138 (its 2.9.2 combat-log events are not ported): the boss auto-attacks only (every other stat 0, crit damage 1)
/**
 * @param {{hp: number, attack: number, attackSpeed: number}} boss  a CRUSADE_HELL_BOSSES entry
 * @param {1|2|3} playerCount
 * @param {'NORMAL'|'HARD'|'MYTHIC'} difficulty
 * @param {number} [mythicPlus=0]
 */
export function crusadeBossEntity(boss, playerCount, difficulty, mythicPlus = 0) {
  const cfg = difficultyOf(difficulty);
  const scale = CRUSADE.playerCountScaling[playerCount];
  if (!scale) throw new EngineInputError(`no Crusade scaling for ${playerCount} players`, { kind: 'crusade', key: 'playerCount', value: playerCount });
  const stat = cfg.bossStatMultiplier;
  const plus = mythicPlusBossMultiplier(mythicPlus);
  const hp = Math.round(boss.hp * scale.hpMultiplier * stat * (cfg.bossHpMultiplier ?? 1) * plus);
  return {
    id: boss.id, name: boss.name,
    maxHp: hp, rawMaxHp: hp, hp,
    attack: Math.round(boss.attack * scale.attackMultiplier * stat * (cfg.bossAttackMultiplier ?? 1) * plus),
    attackSpeed: boss.attackSpeed * scale.attackSpeedMultiplier * stat,
    doubleHit: 0, critChance: 0, critDamage: 1, lifesteal: 0, hpRegen: 0, damageReduction: 0, blockChance: 0,
    missChance: 0, blindChance: 0, paralyzeChance: 0, penetration: 0, disruptionChance: 0, disruptionEffect: 'SILENCE',
    pvpAttack: 0, pvpDefense: 0, spellDamage: 0, spellResist: 0, spellCritChance: 0, spellVamp: 0, shieldHp: 0, shieldMax: 0,
    paralyzedMs: 0, silencedMs: 0, fearedMs: 0, staggerStacks: 0, blinded: false,
  };
}

/**
 * rollEnchantDrops' starting rate (L2237568-2237767): a Mythic+ full clear drops FULL_CLEAR_DROP_RATE
 * (3), anything else reads `enchantDropChance[partySize][bossesKilled]`. 0 with no boss killed (the client
 * rolls nothing then).
 */
export function crusadeEnchantRate(difficulty, playerCount, bossesKilled, mythicPlus = 0) {
  if (!(bossesKilled > 0)) return 0;
  if (mythicPlus > 0 && bossesKilled === 3) return CRUSADE.mythicPlus.FULL_CLEAR_DROP_RATE;
  return difficultyOf(difficulty).enchantDropChance[playerCount]?.[bossesKilled] ?? 0;
}

/**
 * The mean stone count of the drop loop at a starting rate: one stone with chance min(rate, 1), the next
 * with min(rate - 1, 1), and so on while the rate stays above 0 (so the mean is the rate itself).
 */
export function expectedEnchantStones(rate) {
  let e = 0;
  let p = 1;
  for (let r = rate; r > 0; r -= 1) {
    p *= Math.min(r, 1);
    e += p;
  }
  return e;
}

// port of getMythicPlusEnchantWeights L2044717-2044773
function mythicPlusEnchantWeights(level) {
  return {
    PVE_ATTACK: Math.max(0, 10 - level * 2),
    PVE_DEFENSE: Math.max(0, 10 - level * 2),
    PVP: Math.max(10, 15 - level),
    ULTIMATE: Math.max(25, 35 - level),
    MYTHIC: level * CRUSADE.mythicPlus.MYTHIC_STONE_WEIGHT_PER_LEVEL,
    OBLIVION: 0,
  };
}

// port of rollEnchantStoneType L2045207-2045290: a weighted pick in the weights' key order
export function rollEnchantStoneType(difficulty, mythicPlus, rng) {
  const weights = mythicPlus > 0 ? mythicPlusEnchantWeights(mythicPlus) : difficultyOf(difficulty).enchantWeights;
  let r = rng() * Object.values(weights).reduce((a, b) => a + b, 0);
  for (const [type, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return type;
  }
  return 'PVE_ATTACK';
}

// port of rollEnchantDrops L2237568-2237767 (unchanged 2.7.4-2.9.8). Each stone goes to the highest of a d100 roll per member
// (d50 for a bot) among those who have not won one yet; once all have, the set clears.
/**
 * @param {Array<{isBot?: boolean}|null>} members
 * @returns {Array<{type: string, winnerIndex: number, rolls: number[]}>}
 */
export function rollEnchantDrops(members, playerCount, bossesKilled, difficulty, mythicPlus, rng) {
  let rate = crusadeEnchantRate(difficulty, playerCount, bossesKilled, mythicPlus);
  const drops = [];
  const won = new Set();
  const maxFor = (i) => (members[i]?.isBot ? 50 : 100);
  while (rate > 0) {
    if (rng() > Math.min(rate, 1)) break;
    const type = rollEnchantStoneType(difficulty, mythicPlus, rng);
    const rolls = [0, 0, 0];
    let best = -1;
    let winner = 0;
    for (let i = 0; i < members.length; i++) {
      if (won.has(i)) continue;
      rolls[i] = Math.floor(rng() * maxFor(i)) + 1;
      if (rolls[i] > best) { best = rolls[i]; winner = i; }
    }
    if (best === -1) {
      won.clear();
      for (let i = 0; i < members.length; i++) {
        rolls[i] = Math.floor(rng() * maxFor(i)) + 1;
        if (rolls[i] > best) { best = rolls[i]; winner = i; }
      }
    }
    if (!members[winner]) break;
    won.add(winner);
    drops.push({ type, winnerIndex: winner, rolls });
    rate -= 1;
  }
  return drops;
}

// ---------------------------------------------------------------------------------------------
// Party
// ---------------------------------------------------------------------------------------------

/** A party member, prepared once and reused across runs: a Fighter or a `preparePveFighter` result. */
export const prepareCrusadeMember = (f) => (f?.fresh ? f : preparePveFighter(f));

// port of findHighestHpPlayer L2231140-2231178 / findHighestHpPlayerExcluding L2231180-2231223: the first
// living seat with the most current HP, -1 when none
function highestHp(hps, alive, exclude = -1) {
  let idx = -1;
  let best = -1;
  for (let i = 0; i < hps.length; i++) {
    if (i !== exclude && alive[i] && hps[i] > best) { best = hps[i]; idx = i; }
  }
  return idx;
}

/**
 * The run's stack runtimes (resolvePartyStacks' result shape). Arrays are GROUP_SIZE long, by seat.
 * @typedef {Object} CrusadePartyStacks
 * @property {Array<Object|null>} stacks  createStackCombat runtimes
 * @property {number[]} ibThornsPct  Iron Bastion glyph thorns % per seat
 * @property {number[]} reactSlots  the seats whose events feed step 7
 * @property {number} legacySlot  the stack player in range, else -1
 * @property {boolean} perSlotOut  per-slot path with any active runtime (log tuples)
 */

/** No seat reacts (a hand-built boss fight without stacks). */
export const NO_PARTY_STACKS = Object.freeze({ stacks: [], ibThornsPct: [], reactSlots: [], legacySlot: -1, perSlotOut: false });

// port of resolvePartyStacks L2238400-2238651 (2.9.2), called once per run (L2237849-2237866). The client's
// fight-level sigilState / glyph mods / stackContext are the stack player's own here; a seat's own
// `stackSigils` are its member's. `selfSpecies` (the result's playerStackSpecies) is not ported.
/**
 * @param {Array<Object>} members  prepareCrusadeMember results by seat
 * @param {{stackPlayerIndex?: number, stackSigils?: Array<boolean|null|undefined>}} [o]  any stackSigils
 *   entry other than undefined switches to the per-slot path; a truthy one gives that seat its own runtime
 * @returns {CrusadePartyStacks}
 */
export function resolvePartyStacks(members, { stackPlayerIndex = 0, stackSigils } = {}) {
  const G = CRUSADE_GROUP_SIZE;
  const stacks = new Array(G).fill(null);
  const ibThornsPct = new Array(G).fill(0);
  const own = (i) => {
    const { stack, thornsPercent } = members[i].inputs;
    stacks[i] = createStackCombat(stack.equipped, true, stack.glyph, stack.ctx);
    ibThornsPct[i] = thornsPercent ?? 0;
  };
  const inRange = stackPlayerIndex >= 0 && stackPlayerIndex < G;
  const perSlot = Array.isArray(stackSigils) && members.some((m, i) => m != null && stackSigils[i] !== undefined);
  if (!perSlot) {
    if (!inRange) return { stacks, ibThornsPct, reactSlots: [], legacySlot: -1, perSlotOut: false };
    if (members[stackPlayerIndex]) own(stackPlayerIndex);
    return { stacks, ibThornsPct, reactSlots: [stackPlayerIndex], legacySlot: stackPlayerIndex, perSlotOut: false };
  }
  const reactSlots = [];
  for (let i = 0; i < G; i++) {
    reactSlots.push(i);
    if (members[i] && stackSigils[i]) own(i);
  }
  return {
    stacks, ibThornsPct, reactSlots, legacySlot: inRange ? stackPlayerIndex : -1,
    perSlotOut: stacks.some((st) => st?.active === true),
  };
}

// ---------------------------------------------------------------------------------------------
// One boss
// ---------------------------------------------------------------------------------------------

/**
 * Run state of a Crusade (simulateCrusadeFight's arrays, one entry per seat), mutated by the boss fights.
 * @typedef {Object} CrusadeState
 * @property {Object[]} entities   base player entities (never mutated)
 * @property {number[]} maxHps
 * @property {number[]} hps
 * @property {boolean[]} alive
 * @property {Array<Object[]|null>} spells   spell runtimes, fresh per boss
 * @property {number[]} shieldCur  carried from boss to boss
 * @property {number[]} shieldMax
 * @property {boolean[]} vampRefill
 * @property {boolean[]} regenRefill
 * @property {Array<Object|null>} minions
 */

// port of simulateBossFight L2231333-2237566 (per-tick order: combat-pve.md §24.2)
/**
 * @param {number} bossIndex
 * @param {Object} boss   crusadeBossEntity output (mutated: hp, statuses)
 * @param {CrusadeState} s
 * @param {{dtMs: number, elapsed: number, limit: number, party?: CrusadePartyStacks,
 *   focus: {index: number, lethalRedirect: string}|null, log: boolean}} o
 *   `elapsed` the run's clock at the call, `limit` the run's budget before this boss's opening window,
 *   `party` the run's resolvePartyStacks result (default: no seat reacts)
 * @param {() => number} rng
 * @returns {{bossIndex: number, success: boolean, totalDuration: number, playersDiedIndices: number[],
 *   ticks: Object[]}}
 */
export function simulateBossFight(bossIndex, boss, s, o, rng) {
  const { dtMs, focus, log } = o;
  const party = o.party ?? NO_PARTY_STACKS;
  const n = s.entities.length;
  const ticks = [];
  const died = [];
  const debuffs = initDebuffState();
  const minionsOn = s.minions.some((m) => m != null);
  const dealt = new Array(n).fill(0);
  const speciesOwner = new Map();
  const swingT = new Array(n).fill(0);
  const regenT = new Array(n).fill(0);
  // each seat's stance-daze timer on the boss (L2231862): counted down and set, never read (inert here)
  const dazed = new Array(n).fill(0);
  const bossInterval0 = Math.round(1000 / boss.attackSpeed);
  // liveStack (L2231477-2231500, 2.9.2): the seat's own runtime while it is active
  const liveStack = (i) => {
    const st = party.stacks[i];
    return st != null && st.active ? st : null;
  };
  const start = o.elapsed;
  let elapsed = start;
  const hps = s.hps;
  const alive = s.alive;
  const E = lane(rng, 'boss');

  const emit = (ev) => { if (log) ticks.push({ ...ev, bossHpAfter: boss.hp, playerHpsAfter: hps.slice() }); };

  // openMinionTick / finishMinionTick (L2231585-2231780): soul link from this tick's damage, a dead owner's
  // minion dies with it (killMinion clears a pending death ward without granting one)
  let tickFrom = -1;
  let tickTs = elapsed;
  const openMinionTick = () => { if (minionsOn) { tickFrom = ticks.length; tickTs = elapsed; } };
  const finishMinionTick = () => {
    if (!minionsOn || tickFrom < 0) return;
    for (let i = 0; i < n; i++) {
      const m = s.minions[i];
      if (!m) continue;
      const heal = soulLinkHeal(m, dealt[i]);
      dealt[i] = 0;
      if (heal > 0 && log) ticks.push({ timestamp: tickTs, type: 'minion_heal', damage: heal, playerIndex: i, bossHpAfter: boss.hp, playerHpsAfter: hps.slice() });
      if (!alive[i] && killMinion(m) && log) {
        ticks.push({ timestamp: tickTs, type: 'minion_dead', damage: 0, playerIndex: i, bossHpAfter: boss.hp, playerHpsAfter: hps.slice(), ...minionDeathMeta(m) });
      }
    }
    if (log) {
      const mh = s.minions.map((m) => m?.hp ?? 0);
      for (let k = tickFrom; k < ticks.length; k++) ticks[k].playerMinionHps = mh;
      // 2.8.2 (L2231711-2231771): what is left of each seat's death ward in its shield, a 3-seat tuple
      if (s.minions.some((m) => (m?.deathWard ?? 0) > 0)) {
        const w = Array.from({ length: CRUSADE_GROUP_SIZE }, (_, k) => minionDeathWardLeft(s.minions[k], s.shieldCur[k] ?? 0));
        for (let k = tickFrom; k < ticks.length; k++) ticks[k].playerMinionWards = w;
      }
    }
    tickFrom = -1;
  };
  const end = (success) => {
    finishMinionTick();
    return { bossIndex, success, totalDuration: elapsed - start, playersDiedIndices: died, ticks };
  };
  const bossDied = (extra) => {
    if (log) ticks.push({ timestamp: elapsed, type: 'boss_death', damage: 0, playerIndex: -1, bossHpAfter: 0, playerHpsAfter: hps.slice(), ...extra });
    return end(true);
  };

  // buffed view of a seat as the boss sees it (resolveEffectiveTarget L2231781-2231838): the active buffs
  // only when one grants block, DR or HP, then Bulwark's DR from that seat's own live stack (2.9.2)
  const targetView = (i) => {
    const base = s.entities[i];
    let v = base;
    if (s.spells[i]) {
      const bm = computeActiveBuffModifiers(s.spells[i]);
      if (bm.blockChance > 0 || bm.damageReduction > 0 || bm.hpPercent > 0) v = applyBuffsToEntity(base, bm);
    }
    const st = liveStack(i);
    if (st) {
      const sm = st.selfModifiers();
      if (sm.drPercent > 0) v = { ...v, damageReduction: applyBulwarkDr(v.damageReduction, sm) };
    }
    return v;
  };

  // --- opening (L2231876-2232101): only with a minion in the party. A living minion is carried in (its
  // buffs end, soul-link bonus 0, HP and timer reset), a dead one is summoned and its unspent death ward
  // leaves the owner's shield (2.8.2); the summon window delays everyone's first swing
  let windowMs = 0;
  let bossTimer = 0;
  if (minionsOn) {
    const summons = s.minions.map((m, i) => (m && alive[i] && !m.alive ? m : null));
    windowMs = openingSummonWindowMs(summons);
    openMinionTick();
    for (let i = 0; i < n; i++) {
      const m = s.minions[i];
      if (!m || !alive[i]) continue;
      if (!summons[i]) {
        for (const r of carryMinionIntoNewFight(m)) emit({ timestamp: elapsed, type: 'minion_buff_end', damage: 0, playerIndex: i, spell: r.spell, minionMaxHp: r.minionMaxHp });
      } else {
        summonMinion(m);
        s.shieldCur[i] = expireMinionDeathWard(m, s.shieldCur[i] ?? 0);
        emit({ timestamp: elapsed, type: 'minion_summoned', damage: 0, playerIndex: i, ...minionSummonMeta(m, start + windowMs) });
      }
    }
    finishMinionTick();
    elapsed += windowMs;
    for (let i = 0; i < n; i++) swingT[i] = openingSwingTimerStart(Math.round(1000 / s.entities[i].attackSpeed), windowMs, swingT[i]);
    bossTimer = openingSwingTimerStart(bossInterval0, windowMs, 0);
    for (const m of s.minions) {
      if (isMinionAlive(m)) m.timer = openingSwingTimerStart(Math.round(1000 / m.attackSpeed), windowMs, m.timer);
    }
  }
  const limit = o.limit + windowMs;
  elapsed += BOSS_START_GAP_MS;
  if (!(boss.hp > 0)) return end(boss.hp <= 0);

  // the spell pass input, refilled per seat and tick (processSpellsTick keeps nothing)
  const spellInput = {
    maxHp: 0, dtMs, timestamp: 0, attack: 0, healReductionPercent: 0, hp: 0, enemyHp: 0, enemyMaxHp: boss.maxHp,
    offensiveConditions: false, selfConditionsMet: false, spellDamage: 0, targetSpellResist: 0, spellCritChance: 0,
    critDamage: 0, spellVamp: 0, silencedMs: 0, healingMult: 1, healBaseMaxHp: 0, minionAlive: false,
  };
  // this tick's events for the stack runtimes (type, damage, seat), kept even without a log
  const tickEvents = [];
  const swingEvent = (type, damage, playerIndex, extra) => {
    tickEvents.push({ type, damage, playerIndex });
    emit({ timestamp: elapsed, type, damage, playerIndex, ...extra });
  };

  while (alive.some(Boolean)) {
    finishMinionTick();
    elapsed += dtMs;
    if (elapsed > limit) break;
    tickEvents.length = 0;
    const logFrom = ticks.length;
    openMinionTick();
    // step 1b (L2232291-2232309): every seat's daze timer runs down
    for (let i = 0; i < n; i++) if (dazed[i] > 0) dazed[i] = tickDazedMs(dazed[i], dtMs);
    // step 2 (L2232310-2232382): respawns, every seat; a risen minion's unspent death ward leaves the shield
    if (minionsOn) {
      for (let i = 0; i < n; i++) {
        const m = s.minions[i];
        if (m && advanceMinionRespawn(m, dtMs)) {
          s.shieldCur[i] = expireMinionDeathWard(m, s.shieldCur[i] ?? 0);
          emit({ timestamp: elapsed, type: 'minion_summoned', damage: 0, playerIndex: i, ...minionSummonMeta(m) });
        }
      }
    }

    // --- the seats, in order (L2232461-2235917)
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const base = s.entities[i];
      const maxHp = s.maxHps[i];
      swingT[i] += dtMs;
      regenT[i] += dtMs;
      const st = liveStack(i);
      const stackHpPct = st ? st.selfModifiers().hpPercent : 0;
      let view = base;
      let buffedMax = maxHp;
      let buffHpPct = 0;

      // spell pass (L2232594-2233758); minion heal / empower routed to the seat's minion (L2232658-2232690)
      const spells = s.spells[i];
      if (spells) {
        spellInput.maxHp = maxHp;
        spellInput.timestamp = elapsed;
        spellInput.attack = base.attack;
        spellInput.hp = hps[i];
        spellInput.enemyHp = boss.hp;
        spellInput.spellDamage = base.spellDamage;
        spellInput.targetSpellResist = boss.spellResist;
        spellInput.spellCritChance = base.spellCritChance;
        spellInput.critDamage = base.critDamage;
        spellInput.spellVamp = base.spellVamp;
        spellInput.minionAlive = minionsOn && isMinionAlive(s.minions[i]);
        const res = processSpellsTick(spells, spellInput, rng);
        const minionEvents = minionsOn ? routeSpellHealToMinion(s.minions[i], res, maxHp) : [];
        const bm = res.buffModifiers;
        if (hasActiveBuffs(bm)) view = applyBuffsToEntity(base, bm);
        buffHpPct = bm.hpPercent;
        const totalHpPct = bm.hpPercent + stackHpPct;
        buffedMax = getBuffedMaxHp(maxHp, totalHpPct);
        if (res.ownerHpDelta > 0) {
          const prev = hps[i];
          hps[i] = Math.min(buffedMax, hps[i] + res.ownerHpDelta);
          const refill = shieldRefillAmount(res, hps[i] - prev, s.vampRefill[i]);
          if (refill > 0 && s.shieldMax[i] > 0 && s.shieldCur[i] < s.shieldMax[i]) {
            s.shieldCur[i] = Math.min(s.shieldMax[i], s.shieldCur[i] + refill);
          }
        }
        if (totalHpPct <= 0 && hps[i] > maxHp) hps[i] = maxHp;
        if (res.targetHpDelta < 0) {
          const before = boss.hp;
          boss.hp = Math.max(0, boss.hp + res.targetHpDelta);
          if (minionsOn) dealt[i] += before - boss.hp;
        }
        if (res.targetParalyzeMs && boss.hp > 0) {
          boss.paralyzedMs = Math.max(boss.paralyzedMs ?? 0, res.targetParalyzeMs);
          emit({ timestamp: elapsed, type: 'boss_paralyzed', damage: 0, playerIndex: i, paralyzeMs: res.targetParalyzeMs });
        }
        if (res.targetSilenceMs && boss.hp > 0) {
          boss.silencedMs = Math.max(boss.silencedMs ?? 0, res.targetSilenceMs);
          emit({ timestamp: elapsed, type: 'boss_silenced', damage: 0, playerIndex: i });
        }
        if (res.targetFearMs && boss.hp > 0) {
          boss.fearedMs = Math.max(boss.fearedMs ?? 0, res.targetFearMs);
          emit({ timestamp: elapsed, type: 'boss_feared', damage: 0, playerIndex: i, fearMs: res.targetFearMs });
        }
        if (res.targetBlinded && boss.hp > 0) {
          boss.blinded = true;
          emit({ timestamp: elapsed, type: 'boss_blinded', damage: 0, playerIndex: i });
        }
        if (res.newDebuffs) {
          for (const spec of res.newDebuffs) {
            const d = applyDebuff(debuffs, spec, elapsed, { partySlot: i });
            if (minionsOn) speciesOwner.set(d.source?.species, i);
            emit({
              timestamp: elapsed, type: d.type === 'debuff_applied' ? 'spell_debuff_applied' : 'spell_debuff_stack', damage: 0,
              playerIndex: i, spell: d.source, debuffStacks: d.stacks, debuffMaxStacks: d.maxStacks,
              debuffPermanent: d.permanent, damagePerTick: d.damagePerTick,
            });
          }
        }
        if (log) {
          for (const ev of res.events) {
            emit({
              timestamp: ev.timestamp, type: ev.type, damage: ev.value, playerIndex: i, spell: ev.spell,
              ...(ev.isCrit ? { isCrit: true } : {}),
              ...(res.ownerMomentumStacks !== undefined ? { momentumStacks: res.ownerMomentumStacks } : {}),
            });
          }
          for (const ev of minionEvents) {
            emit({
              timestamp: ev.timestamp, type: ev.type, damage: ev.healed, playerIndex: i, spell: ev.spell,
              ...(ev.minionMaxHp !== undefined ? { minionMaxHp: ev.minionMaxHp } : {}),
            });
          }
        }
        if (boss.hp <= 0) return bossDied();
      }

      // the seat's own live stack (L2233759-2233918, 2.9.2): Bulwark's HP share clamps, Elusive buffs the swing
      if (st) {
        const sm = st.selfModifiers();
        if (sm.hpPercent > 0) {
          buffedMax = getBuffedMaxHp(maxHp, buffHpPct + sm.hpPercent);
          if (hps[i] > buffedMax) hps[i] = buffedMax;
        }
        const el = st.elusiveSelfModifiers();
        if (el.attackPercent > 0 || el.critChancePercent > 0 || el.lifestealPercent > 0 || el.attackSpeedPercent > 0) {
          const e = applyElusiveBuff(view.attack, view.critChance, view.lifesteal, view.attackSpeed, el);
          view = { ...view, attack: e.attack, critChance: e.critChance, lifesteal: e.lifesteal, attackSpeed: e.attackSpeed };
        }
      }

      // regen pulse (L2233919-2234200)
      const pulseDue = regenT[i] >= REGEN_INTERVAL_MS;
      if (pulseDue) regenT[i] -= REGEN_INTERVAL_MS;
      if (pulseDue && view.hpRegen > 0) {
        const pulse = Math.max(1, Math.round((view.maxHp * view.hpRegen) / 100 / REGEN_PULSES_PER_SEC));
        const applied = hps[i] < buffedMax ? Math.min(buffedMax - hps[i], pulse) : 0;
        if (applied > 0) {
          hps[i] += applied;
          emit({ timestamp: elapsed, type: 'player_regen', damage: 0, playerIndex: i });
        }
        const refill = regenShieldRefillAmount(pulse, applied, s.regenRefill[i]);
        if (refill > 0 && s.shieldMax[i] > 0 && s.shieldCur[i] < s.shieldMax[i]) {
          s.shieldCur[i] = Math.min(s.shieldMax[i], s.shieldCur[i] + refill);
        }
      }

      // the swing (L2234201-2235409): no block or miss to roll against, the seat's own Sunder cuts the boss's DR
      const interval = Math.round(1000 / view.attackSpeed);
      if (swingT[i] >= interval) {
        swingT[i] -= interval;
        let bossDr = boss.damageReduction;
        if (st) {
          const tm = st.targetModifiers();
          if (tm.drReductionPercent > 0 || tm.blindReductionPercent > 0 || tm.blockReductionPercent > 0 ||
            tm.missReductionPercent > 0 || tm.hpRegenReductionPercent > 0) {
            bossDr = applySunderToTarget(boss.damageReduction, boss.blindChance, boss.blockChance, boss.missChance, boss.hpRegen, tm).damageReduction;
          }
        }
        const P = lane(rng, `p${i}`);
        const roll = rollAttackDamage(view, P);
        const cut = (d) => (bossDr > 0 ? Math.max(1, Math.round(d * (1 - bossDr / 100))) : d);
        const d1 = cut(roll.damage);
        const d2 = cut(roll.doubleHitDamage);
        const lifesteal = (d) => {
          if (!(view.lifesteal > 0 && hps[i] < buffedMax)) return;
          const h = Math.floor((d * view.lifesteal) / 100);
          if (h > 0) hps[i] = Math.min(buffedMax, hps[i] + h);
        };
        const before = boss.hp;
        boss.hp = Math.max(0, boss.hp - d1);
        lifesteal(d1);
        swingEvent(roll.isCrit ? 'player_crit' : 'player_attack', d1, i);
        if (roll.isDoubleHit && boss.hp > 0) {
          boss.hp = Math.max(0, boss.hp - d2);
          lifesteal(d2);
          swingEvent('player_attack', d2, i, { doubleHit: true });
        }
        if (minionsOn) dealt[i] += before - boss.hp;
        if (view.blindChance > 0 && !boss.blinded && boss.hp > 0 && lane(P, 'blind')() * 100 < view.blindChance) {
          boss.blinded = true;
          emit({ timestamp: elapsed, type: 'boss_blinded', damage: 0, playerIndex: i });
        }
        if (view.paralyzeChance > 0 && !(boss.paralyzedMs > 0) && boss.hp > 0 && lane(P, 'paralyze')() * 100 < view.paralyzeChance) {
          boss.paralyzedMs = PARALYZE_DURATION_MS;
          emit({ timestamp: elapsed, type: 'boss_paralyzed', damage: 0, playerIndex: i });
        }
        if (view.disruptionChance > 0 && boss.hp > 0) {
          const rd = rollDisruption(view, boss.silencedMs ?? 0, boss.staggerStacks ?? 0, boss.fearedMs ?? 0, P);
          if (rd?.procced) {
            boss.silencedMs = rd.silencedMs;
            boss.staggerStacks = rd.staggerStacks;
            boss.fearedMs = rd.fearedMs;
            if (rd.procced === 'SILENCE') emit({ timestamp: elapsed, type: 'boss_silenced', damage: 0, playerIndex: i });
            else if (rd.procced === 'STAGGER') {
              emit({ timestamp: elapsed, type: 'boss_staggered', damage: 0, playerIndex: i, staggerStacks: rd.staggerStacks });
              if (rd.staggerStunned) {
                boss.paralyzedMs = Math.max(boss.paralyzedMs ?? 0, STAGGER_STUN_MS);
                emit({ timestamp: elapsed, type: 'boss_paralyzed', damage: 0, playerIndex: i, paralyzeMs: STAGGER_STUN_MS });
              }
            } else emit({ timestamp: elapsed, type: 'boss_feared', damage: 0, playerIndex: i, fearMs: rd.fearedMs });
          }
        }
        // stance Daze (L2235286-2235389): sets the seat's daze timer; nothing here reads it, so it only logs
        if (boss.hp > 0 && (view.stanceDazeChance ?? 0) > 0) {
          const dz = rollStanceDaze(view, dazed[i], lane(P, 'daze'));
          if (dz.procced) {
            dazed[i] = dz.dazedMs;
            emit({ timestamp: elapsed, type: 'boss_dazed', damage: 0, playerIndex: i, dazeMs: dz.durationMs });
          }
        }
        if (boss.hp <= 0) return bossDied();
      }

      // the seat's minion (L2235410-2235836): the boss's raw DR, no Sunder; Reap after a hit the boss survives
      const m = minionsOn ? s.minions[i] : null;
      if (m && m.alive) {
        const ML = lane(rng, `p${i}:minion`);
        const sw = minionSwing(m, dtMs, ML);
        if (sw) {
          const dmg = mitigateMinionHit(sw.damage, boss.damageReduction);
          boss.hp = Math.max(0, boss.hp - dmg);
          healMinionLifesteal(m, dmg);
          emit({ timestamp: elapsed, type: sw.isCrit ? 'minion_crit' : 'minion_hit', damage: dmg, playerIndex: i });
          if (boss.hp <= 0) return bossDied();
          const reap = rollMinionReap(m, lane(ML, 'reap'));
          if (reap > 0) {
            boss.paralyzedMs = Math.max(boss.paralyzedMs ?? 0, reap);
            emit({ timestamp: elapsed, type: 'boss_paralyzed', damage: 0, playerIndex: i, paralyzeMs: reap, stunSource: REAP_STUN_SOURCE });
          }
        }
      }
    }

    // --- the boss's debuffs tick after the swings; a DoT tick is credited to the seat that cast it
    // (L2235918-2236044)
    if (debuffs.length > 0) {
      const d = processDebuffsTick(debuffs, dtMs, elapsed, rng);
      if (d.targetHpDelta < 0) boss.hp = Math.max(0, boss.hp + d.targetHpDelta);
      for (const ev of d.events) {
        if (minionsOn && ev.type === 'debuff_tick') {
          const owner = speciesOwner.get(ev.source?.species);
          if (owner !== undefined) dealt[owner] += ev.value;
        }
        emit({
          timestamp: ev.timestamp, type: ev.type === 'debuff_tick' ? 'spell_debuff_tick' : 'spell_debuff_expired',
          damage: ev.value, playerIndex: -1, spell: ev.source, debuffStacks: ev.stacks, debuffMaxStacks: ev.maxStacks,
          debuffPermanent: ev.permanent, damagePerTick: ev.damagePerTick, ...(ev.isCrit ? { isCrit: true } : {}),
        });
      }
      if (boss.hp <= 0) return bossDied();
    }

    // --- the boss's statuses run down (L2236045-2236101), then its swing (L2236102-2236851)
    if (boss.paralyzedMs > 0) boss.paralyzedMs = Math.max(0, boss.paralyzedMs - dtMs);
    if (boss.silencedMs > 0) boss.silencedMs = Math.max(0, boss.silencedMs - dtMs);
    if (boss.fearedMs > 0) boss.fearedMs = Math.max(0, boss.fearedMs - dtMs);
    const bossInterval = debuffs.length > 0 ? Math.round(1000 / slowedAttackSpeed(boss.attackSpeed, debuffs)) : bossInterval0;
    // 2.7.5 (L2236124-2236140): the boss's attack is weakened while any debuff is up
    const bossAttack = weakenedAttack(boss.attack, debuffs);
    bossTimer += dtMs;
    let statusSwing = false;
    if (bossTimer >= bossInterval) {
      bossTimer -= bossInterval;
      const target = focus && alive[focus.index] === true ? focus.index : highestHp(hps, alive);
      if (target === -1) break;
      if (boss.paralyzedMs > 0) {
        emit({ timestamp: elapsed, type: 'boss_paralyze', damage: 0, playerIndex: target });
        statusSwing = true;
      } else if (boss.fearedMs > 0) {
        emit({ timestamp: elapsed, type: 'boss_fear', damage: 0, playerIndex: target });
        statusSwing = true;
      } else if (boss.blinded) {
        boss.blinded = false;
        emit({ timestamp: elapsed, type: 'boss_blind', damage: 0, playerIndex: target });
        statusSwing = true;
      } else {
        let hit = target;
        let minionTarget = minionsOn && isMinionAlive(s.minions[target]) ? target : -1;
        let view = targetView(target);
        const negate = view.blockChance + view.missChance;
        let negated = minionTarget === -1 && negate > 0 ? lane(E, 'avoid')() * 100 < negate : false;
        const dmgOn = (v) => (v.damageReduction > 0 ? Math.max(1, Math.round(bossAttack * (1 - v.damageReduction / 100))) : bossAttack);
        // the focus holder's lethal hit goes to the next-highest living seat instead (party only,
        // L2236253-2236392)
        if (!negated && minionTarget === -1 && focus && focus.lethalRedirect === 'always' && target === focus.index &&
          hps[target] - absorbWithShield(s.shieldCur[target] ?? 0, dmgOn(view)).hpDamage <= 0) {
          const alt = highestHp(hps, alive, target);
          if (alt !== -1) {
            hit = alt;
            view = targetView(alt);
            if (minionsOn && isMinionAlive(s.minions[alt])) minionTarget = alt;
            else {
              const an = view.blockChance + view.missChance;
              negated = an > 0 ? lane(E, 'avoid')() * 100 < an : false;
            }
          }
        }
        if (minionTarget !== -1) {
          // the minion takes the (weakened) attack as a swing (L2236646-2236851): its Bastion / Dominion
          // block (no boss penetration) and DR, never the seat's DR; a death grants the owner its death
          // ward (2.8.2, uncapped by the shield max); its thorns hit back and can kill the boss
          const mm = s.minions[minionTarget];
          const r = damageMinion(mm, bossAttack, { swing: true }, lane(E, 'minion-block'));
          emit({ timestamp: elapsed, type: 'minion_damaged', damage: r.dealt, playerIndex: minionTarget, ...(r.blocked ? { minionBlocked: true } : {}) });
          if (r.died) {
            if (r.deathWard) s.shieldCur[minionTarget] = (s.shieldCur[minionTarget] ?? 0) + r.deathWard;
            emit({ timestamp: elapsed, type: 'minion_dead', damage: 0, playerIndex: minionTarget, ...minionDeathMeta(mm) });
          }
          if (r.thorns > 0 && boss.hp > 0 && alive[minionTarget]) {
            const before = boss.hp;
            boss.hp = Math.max(0, boss.hp - r.thorns);
            emit({ timestamp: elapsed, type: 'minion_thorns', damage: before - boss.hp, playerIndex: minionTarget });
            if (boss.hp <= 0) return bossDied();
          }
        } else if (!negated) {
          const dmg = dmgOn(view);
          const sh = absorbWithShield(s.shieldCur[hit] ?? 0, dmg);
          s.shieldCur[hit] = sh.shieldHp;
          hps[hit] = Math.max(0, hps[hit] - sh.hpDamage);
          const dead = hps[hit] <= 0;
          swingEvent(dead ? 'player_death' : 'boss_attack', dmg, hit);
          if (dead) {
            alive[hit] = false;
            died.push(hit);
          }
        } else {
          swingEvent(view.missChance > 0 ? 'player_miss' : 'player_block', 0, hit);
          // Shield Bash (L2236552-2236630): a block (target miss chance 0) may stun the boss
          if (view.missChance <= 0 && (view.stanceShieldBashChance ?? 0) > 0) {
            const stun = rollShieldBash(view, lane(E, 'bash'));
            if (stun > 0) {
              boss.paralyzedMs = Math.max(boss.paralyzedMs ?? 0, stun);
              emit({ timestamp: elapsed, type: 'boss_paralyzed', damage: 0, playerIndex: hit, paralyzeMs: stun, stunSource: SHIELD_BASH_STUN_SOURCE });
            }
          }
        }
      }
    }

    // --- stack runtimes and thorns (L2236852-2237113; reactPartyStacksTick L2238682-2238971, 2.9.2). A
    // paralysed, feared or blinded boss swing skips this block for the tick (the client jumps straight to
    // the end check).
    if (!statusSwing) {
      if (party.reactSlots.length > 0) {
        const thorns = new Array(CRUSADE_GROUP_SIZE).fill(0);
        const reacted = new Array(CRUSADE_GROUP_SIZE).fill(false);
        for (const slot of party.reactSlots) {
          const stS = party.stacks[slot] ?? null;
          const on = stS !== null && stS.active;
          const spellsS = s.spells[slot];
          const ib = party.ibThornsPct[slot] ?? 0;
          // Iron Bastion glyph thorns count only while that seat's Iron Bastion buff is up
          const ironOn = ib > 0 && !!spellsS && isSpellBuffActive(spellsS, 'IRON_BASTION');
          const buffThorns = spellsS ? activeBuffThornsPercent(spellsS) : 0;
          if (!on && !ironOn && buffThorns <= 0) continue;
          reacted[slot] = true;
          let t = 0;
          // crusadeStackReaction (L2231287-2231331): the seat's own events only
          for (const ev of tickEvents) {
            if (ev.playerIndex !== slot) continue;
            switch (ev.type) {
              case 'player_attack':
              case 'player_crit':
                if (on) stS.onHitLanded();
                break;
              case 'boss_attack':
                if (on) t += stS.hitTakenReflect(ev.damage);
                if (ironOn) t += Math.round((ev.damage * ib) / 100);
                if (buffThorns > 0) t += Math.round((ev.damage * buffThorns) / 100);
                break;
              case 'player_death':
                if (on) stS.onHitTaken();
                break;
              case 'player_block':
                // the reflect reads the event's damage, 0 for a block: only the +1 stack counts
                if (on) t += stS.blockReflect(ev.damage);
                break;
              case 'player_miss':
              case 'boss_blind':
                if (on) stS.onEvaded();
                break;
              default:
                break;
            }
          }
          if (on) stS.tick(dtMs);
          thorns[slot] = t;
        }
        // log annotations: the legacy seat's stacks while it reacted, per-seat tuples on the per-slot path
        const legacy = party.legacySlot;
        const legacyOn = legacy >= 0 && reacted[legacy] === true;
        const snap = legacy >= 0 && party.stacks[legacy] ? party.stacks[legacy].snapshot() : { bulwarkStacks: 0, sunderStacks: 0 };
        const snapFields = legacyOn ? { bulwarkStacks: snap.bulwarkStacks, sunderStacks: snap.sunderStacks } : {};
        let tupleFields = {};
        if (party.perSlotOut) {
          const shot = (k) => party.stacks[k]?.snapshot() ?? { bulwarkStacks: 0, sunderStacks: 0 };
          const all = Array.from({ length: CRUSADE_GROUP_SIZE }, (_, k) => shot(k));
          tupleFields = { playerBulwarkStacks: all.map((x) => x.bulwarkStacks), playerSunderStacks: all.map((x) => x.sunderStacks) };
        }
        if (log && (legacyOn || party.perSlotOut)) {
          for (let k = logFrom; k < ticks.length; k++) Object.assign(ticks[k], snapFields, tupleFields);
        }
        for (const slot of party.reactSlots) {
          const t = thorns[slot] ?? 0;
          if (!(t > 0) || !(boss.hp > 0) || !alive[slot]) continue;
          const before = boss.hp;
          boss.hp = Math.max(0, boss.hp - t);
          if (minionsOn) dealt[slot] += before - boss.hp;
          emit({ timestamp: elapsed, type: 'thorns_reflect', damage: t, playerIndex: slot, ...snapFields, ...tupleFields });
          if (boss.hp <= 0) return bossDied({ ...snapFields, ...tupleFields });
        }
      }
      finishMinionTick();
      if (log && s.shieldMax.some((x) => x > 0)) {
        const sh = s.shieldCur.slice();
        for (let k = logFrom; k < ticks.length; k++) ticks[k].playerShieldHps = sh;
      }
    }
    if (!(boss.hp > 0)) break;
  }
  return end(boss.hp <= 0);
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {Object} CrusadeResult
 * @property {boolean} success        all three bosses died
 * @property {boolean} timedOut       a failed run whose clock reached the budget
 * @property {number} bossesKilled
 * @property {number} totalDuration   the run's clock at the end (ms)
 * @property {number} timeLimitMs     the run's budget at the end (300 s plus every opening summon window)
 * @property {Array<Object>} bossResults  simulateBossFight results, plus bossMaxHp and bossHpLeft
 * @property {number} bossHpTotal     the three bosses' HP summed
 * @property {number} damageDealt     boss HP removed over the run
 * @property {number} enchantRate     rollEnchantDrops' starting rate for this outcome
 * @property {number} expectedStones  the mean stone count of that rate (the party's, all seats together)
 * @property {Array<Object>} enchantStoneDrops  the client's drop roll for this run (lane `drops`)
 * @property {number[]} playerMaxHps
 */

// port of simulateCrusadeFight L2237818-2238308
/**
 * A Crusade run. `party` holds 1-3 Fighters or `prepareCrusadeMember` results in seat order.
 * @param {{party: Array<Object>, difficulty: 'NORMAL'|'HARD'|'MYTHIC', mythicPlus?: number, playerCount?: number,
 *   stackPlayerIndex?: number, stackSigils?: Array<boolean|null|undefined>,
 *   focus?: {index: number, lethalRedirect: string}|null, bosses?: Array<Object>, rng: () => number, log?: boolean,
 *   dtMs?: number}} o  `stackSigils`: per seat, the member carries its own stack sigils (2.9.2 per-slot path,
 *   resolvePartyStacks); without it the stack player's runtime is the only one (legacy)
 * @returns {CrusadeResult}
 */
export function simulateCrusade(o) {
  const { difficulty, mythicPlus = 0, stackPlayerIndex = 0, rng, log = false } = o;
  difficultyOf(difficulty);
  if (!(Number.isInteger(mythicPlus) && mythicPlus >= 0)) {
    throw new EngineInputError(`Mythic+ level must be a whole number from 0, got ${mythicPlus}`, { kind: 'crusade', key: 'mythicPlus', value: mythicPlus });
  }
  const members = (o.party ?? []).map(prepareCrusadeMember);
  if (members.length < 1 || members.length > CRUSADE_GROUP_SIZE) {
    throw new EngineInputError(`a Crusade party has 1 to ${CRUSADE_GROUP_SIZE} members`, { kind: 'crusade', key: 'party', value: members.length });
  }
  const playerCount = o.playerCount ?? members.length;
  const bosses = o.bosses ?? CRUSADE_HELL_BOSSES;
  const dtMs = o.dtMs ?? CRUSADE_TICK_MS;

  const entities = [];
  const configs = [];
  const s = {
    entities, maxHps: [], hps: [], alive: [], spells: [], shieldCur: [], shieldMax: [], vampRefill: [], regenRefill: [], minions: [],
  };
  for (const m of members) {
    const { inputs } = m;
    const e = { ...inputs.player, hp: inputs.player.maxHp };
    entities.push(e);
    configs.push(inputs.spells);
    s.maxHps.push(e.maxHp);
    s.hps.push(e.hp);
    s.alive.push(true);
    s.spells.push(null);
    const sh = inputs.shield.hpPercent > 0 ? Math.floor((e.maxHp * inputs.shield.hpPercent) / 100) : 0;
    s.shieldCur.push(sh);
    s.shieldMax.push(sh);
    s.vampRefill.push(inputs.shield.vampAlwaysRefills === true);
    s.regenRefill.push(inputs.shield.regenAlwaysRefills === true);
    s.minions.push(createMinion(inputs.summon, e, inputs.minionStats));
  }
  // the run's stack runtimes and Iron Bastion glyph thorns, by seat (L2237849-2237866, 2.9.2)
  const party = resolvePartyStacks(members, { stackPlayerIndex, stackSigils: o.stackSigils });
  const focus = o.focus && members[o.focus.index] ? o.focus : null;

  const bossResults = [];
  let elapsed = 0;
  let limit = CRUSADE_TIME_LIMIT_MS;
  const outcome = (success, timedOut) => {
    const killed = bossResults.filter((r) => r.success).length;
    const bossHpTotal = bosses.reduce((t, b) => t + crusadeBossEntity(b, playerCount, difficulty, mythicPlus).maxHp, 0);
    const left = bosses.reduce((t, b, k) => t + (bossResults[k] ? bossResults[k].bossHpLeft : crusadeBossEntity(b, playerCount, difficulty, mythicPlus).maxHp), 0);
    const rate = crusadeEnchantRate(difficulty, playerCount, killed, mythicPlus);
    return {
      success, timedOut, bossesKilled: killed, totalDuration: elapsed, timeLimitMs: limit, bossResults,
      bossHpTotal, damageDealt: bossHpTotal - left, enchantRate: rate, expectedStones: expectedEnchantStones(rate),
      enchantStoneDrops: killed > 0 ? rollEnchantDrops(members, playerCount, killed, difficulty, mythicPlus, lane(rng, 'drops')) : [],
      playerMaxHps: s.maxHps.slice(),
    };
  };
  for (let b = 0; b < bosses.length; b++) {
    for (let i = 0; i < members.length; i++) {
      s.hps[i] = s.maxHps[i];
      s.alive[i] = true;
      s.spells[i] = configs[i].length > 0 ? initSpellRuntimes(configs[i]) : null;
    }
    const boss = crusadeBossEntity(bosses[b], playerCount, difficulty, mythicPlus);
    // every runtime's target side (Sunder / Siegebreaker) resets per boss; Bulwark / Elusive carry (L2238162-2238180)
    for (const st of party.stacks) st?.resetTarget();
    const windowMs = openingSummonWindowMs(s.minions.map((m, i) => (m && s.alive[i] && !m.alive ? m : null)));
    const r = simulateBossFight(b, boss, s, { dtMs, elapsed, limit, party, focus, log }, rng);
    bossResults.push({ ...r, bossMaxHp: boss.maxHp, bossHpLeft: boss.hp, hpLeft: s.hps.slice() });
    elapsed += r.totalDuration;
    limit += windowMs;
    if (!r.success) return outcome(false, elapsed >= limit);
  }
  return outcome(true, false);
}
