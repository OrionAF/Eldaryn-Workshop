// Hell Crusade: a party of 1-3 against three bosses in a row inside one run-wide time budget. A port of
// the client's simulateCrusadeFight and its simulateBossFight (shipped, never called; Game/combat-pve.md
// §21 has the rules, the per-tick order and every line reference). The server runs the real fight, and no
// solo Crusade log has checked this port yet, so every result is a 'server-model' (CRUSADE_ASSUMPTIONS).
//
// The boss fight is its own loop, not the dungeon one (fight.js): it walks the players in seat order each
// tick, ticks the boss's debuffs after the swings, never rolls a boss crit, absorbs hits 1:1 with the
// shield, and has no Chrono Flux or transform step. Shared pieces are the engine's own (spell pass,
// debuffs, buffs, stack sigils, minions, rolls).
//
// Randomness: player p's swing draws read lane `p<p>` (sub-lanes crit, double, blind, paralyze, disrupt),
// its minion `p<p>:minion`, the boss `boss` (sub-lane avoid), the loot `drops`; the spell pass and the
// debuff tick take the root rng, as in fight.js. No Math.random.
import {
  processSpellsTick, computeActiveBuffModifiers, activeBuffThornsPercent, isSpellBuffActive, initSpellRuntimes,
} from '../core/spells.js';
import { applyBuffsToEntity, hasActiveBuffs, getBuffedMaxHp } from '../core/buffs.js';
import { initDebuffState, applyDebuff, processDebuffsTick, slowedAttackSpeed } from '../core/debuffs.js';
import { applySunderToTarget, applyBulwarkDr, applyElusiveBuff, createStackCombat } from '../core/stacks.js';
import { absorbWithShield, shieldRefillAmount, regenShieldRefillAmount } from '../core/shield.js';
import {
  rollAttackDamage, rollDisruption, PARALYZE_DURATION_MS, STAGGER_STUN_MS,
} from '../core/rolls.js';
import {
  advanceMinionRespawn, openingSummonWindowMs, openingSwingTimerStart, minionSummonMeta, soulLinkHeal, killMinion,
  isMinionAlive, createMinion, summonMinion, carryMinionIntoNewFight, minionSwing, mitigateMinionHit,
  healMinionLifesteal, damageMinion, minionDeathMeta,
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
/** simulateBossFight's wait before each boss, after the opening summon window (L1863596-1863603). */
export const BOSS_START_GAP_MS = 500;

const note = (key, text) => Object.freeze({ key, text });
/** Labels for what the Crusade results rest on (combat-pve.md §21). */
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

// port of getMythicPlusBossMultiplier L1701902-1701946
/** 1.35^min(L, 3), times 1.5^(L - 3) above level 3; 1 at L <= 0. */
export function mythicPlusBossMultiplier(level) {
  if (!(level > 0)) return 1;
  const m = CRUSADE.mythicPlus;
  const low = m.STAT_MULTIPLIER_PER_LEVEL ** Math.min(level, m.STEEPEN_ABOVE_LEVEL);
  return level > m.STEEPEN_ABOVE_LEVEL ? low * m.STAT_MULTIPLIER_PER_LEVEL_HIGH ** (level - m.STEEPEN_ABOVE_LEVEL) : low;
}

// port of createBossEntity L1862677-1862773: the boss auto-attacks only (every other stat 0, crit damage 1)
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
 * rollEnchantDrops' starting rate (L1868585-1868630): a Mythic+ full clear drops FULL_CLEAR_DROP_RATE
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

// port of getMythicPlusEnchantWeights L1701588-1701645
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

// port of rollEnchantStoneType L1702035-1702108: a weighted pick in the weights' key order
export function rollEnchantStoneType(difficulty, mythicPlus, rng) {
  const weights = mythicPlus > 0 ? mythicPlusEnchantWeights(mythicPlus) : difficultyOf(difficulty).enchantWeights;
  let r = rng() * Object.values(weights).reduce((a, b) => a + b, 0);
  for (const [type, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return type;
  }
  return 'PVE_ATTACK';
}

// port of rollEnchantDrops L1868585-1868779. Each stone goes to the highest of a d100 roll per member
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

// port of findHighestHpPlayer L1862774-1862813 / findHighestHpPlayerExcluding L1862814-1862858: the first
// living seat with the most current HP, -1 when none
function highestHp(hps, alive, exclude = -1) {
  let idx = -1;
  let best = -1;
  for (let i = 0; i < hps.length; i++) {
    if (i !== exclude && alive[i] && hps[i] > best) { best = hps[i]; idx = i; }
  }
  return idx;
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

// port of simulateBossFight L1862921-1868584 (per-tick order: combat-pve.md §21.2)
/**
 * @param {number} bossIndex
 * @param {Object} boss   crusadeBossEntity output (mutated: hp, statuses)
 * @param {CrusadeState} s
 * @param {{dtMs: number, elapsed: number, limit: number, stack: Object|null, stackIndex: number,
 *   thornsPercent: number, focus: {index: number, lethalRedirect: string}|null, log: boolean}} o
 *   `elapsed` the run's clock at the call, `limit` the run's budget before this boss's opening window
 * @param {() => number} rng
 * @returns {{bossIndex: number, success: boolean, totalDuration: number, playersDiedIndices: number[],
 *   ticks: Object[]}}
 */
export function simulateBossFight(bossIndex, boss, s, o, rng) {
  const { dtMs, stack, stackIndex: si, focus, log } = o;
  const n = s.entities.length;
  const ticks = [];
  const died = [];
  const debuffs = initDebuffState();
  const minionsOn = s.minions.some((m) => m != null);
  const stackOn = stack != null && stack.active && si < n;
  const thornsGlyph = si < n ? o.thornsPercent : 0;
  const dealt = new Array(n).fill(0);
  const speciesOwner = new Map();
  const swingT = new Array(n).fill(0);
  const regenT = new Array(n).fill(0);
  const bossInterval0 = Math.round(1000 / boss.attackSpeed);
  const start = o.elapsed;
  let elapsed = start;
  const hps = s.hps;
  const alive = s.alive;
  const E = lane(rng, 'boss');

  const emit = (ev) => { if (log) ticks.push({ ...ev, bossHpAfter: boss.hp, playerHpsAfter: hps.slice() }); };

  // openMinionTick / finishMinionTick (L1863168-1863302): soul link from this tick's damage, a dead owner's
  // minion dies with it
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
    }
    tickFrom = -1;
  };
  const end = (success) => {
    finishMinionTick();
    return { bossIndex, success, totalDuration: elapsed - start, playersDiedIndices: died, ticks };
  };
  const bossDied = () => {
    if (log) ticks.push({ timestamp: elapsed, type: 'boss_death', damage: 0, playerIndex: -1, bossHpAfter: 0, playerHpsAfter: hps.slice() });
    return end(true);
  };

  // buffed view of a seat as the boss sees it (resolveEffectiveTarget L1863303-1863368): the active buffs
  // only when one grants block, DR or HP, then Bulwark's DR for the stack player
  const targetView = (i) => {
    const base = s.entities[i];
    let v = base;
    if (s.spells[i]) {
      const bm = computeActiveBuffModifiers(s.spells[i]);
      if (bm.blockChance > 0 || bm.damageReduction > 0 || bm.hpPercent > 0) v = applyBuffsToEntity(base, bm);
    }
    if (stackOn && i === si) {
      const sm = stack.selfModifiers();
      if (sm.drPercent > 0) v = { ...v, damageReduction: applyBulwarkDr(v.damageReduction, sm) };
    }
    return v;
  };

  // --- opening (L1863397-1863595): only with a minion in the party. A living minion is carried in (its
  // buffs end, HP and timer reset), a dead one is summoned; the summon window delays everyone's first swing
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
    if (minionsOn) {
      for (let i = 0; i < n; i++) {
        const m = s.minions[i];
        if (m && advanceMinionRespawn(m, dtMs)) emit({ timestamp: elapsed, type: 'minion_summoned', damage: 0, playerIndex: i, ...minionSummonMeta(m) });
      }
    }

    // --- the seats, in order (L1863918-1867158)
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const base = s.entities[i];
      const maxHp = s.maxHps[i];
      swingT[i] += dtMs;
      regenT[i] += dtMs;
      const stackHpPct = stackOn && i === si ? stack.selfModifiers().hpPercent : 0;
      let view = base;
      let buffedMax = maxHp;
      let buffHpPct = 0;

      // spell pass (L1864045-1865237)
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

      // the stack player's own stacks (L1865238-1865406): Bulwark's HP share clamps, Elusive buffs the swing
      if (stackOn && i === si) {
        const sm = stack.selfModifiers();
        if (sm.hpPercent > 0) {
          buffedMax = getBuffedMaxHp(maxHp, buffHpPct + sm.hpPercent);
          if (hps[i] > buffedMax) hps[i] = buffedMax;
        }
        const el = stack.elusiveSelfModifiers();
        if (el.attackPercent > 0 || el.critChancePercent > 0 || el.lifestealPercent > 0 || el.attackSpeedPercent > 0) {
          const e = applyElusiveBuff(view.attack, view.critChance, view.lifesteal, view.attackSpeed, el);
          view = { ...view, attack: e.attack, critChance: e.critChance, lifesteal: e.lifesteal, attackSpeed: e.attackSpeed };
        }
      }

      // regen pulse (L1865407-1865688)
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

      // the swing (L1865689-1866798): no block or miss to roll against, Sunder cuts the boss's DR
      const interval = Math.round(1000 / view.attackSpeed);
      if (swingT[i] >= interval) {
        swingT[i] -= interval;
        let bossDr = boss.damageReduction;
        if (stackOn && i === si) {
          const tm = stack.targetModifiers();
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
        if (boss.hp <= 0) return bossDied();
      }

      // the seat's minion (L1866799-1867158): the boss's raw DR, no Sunder
      const m = minionsOn ? s.minions[i] : null;
      if (m && m.alive) {
        const sw = minionSwing(m, dtMs, lane(rng, `p${i}:minion`));
        if (sw) {
          const dmg = mitigateMinionHit(sw.damage, boss.damageReduction);
          boss.hp = Math.max(0, boss.hp - dmg);
          healMinionLifesteal(m, dmg);
          emit({ timestamp: elapsed, type: sw.isCrit ? 'minion_crit' : 'minion_hit', damage: dmg, playerIndex: i });
          if (boss.hp <= 0) return bossDied();
        }
      }
    }

    // --- the boss's debuffs tick after the swings; a DoT tick is credited to the seat that cast it
    // (L1867159-1867285)
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

    // --- the boss's statuses run down, then its swing (L1867286-1867848)
    if (boss.paralyzedMs > 0) boss.paralyzedMs = Math.max(0, boss.paralyzedMs - dtMs);
    if (boss.silencedMs > 0) boss.silencedMs = Math.max(0, boss.silencedMs - dtMs);
    if (boss.fearedMs > 0) boss.fearedMs = Math.max(0, boss.fearedMs - dtMs);
    const bossInterval = debuffs.length > 0 ? Math.round(1000 / slowedAttackSpeed(boss.attackSpeed, debuffs)) : bossInterval0;
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
        const dmgOn = (v) => (v.damageReduction > 0 ? Math.max(1, Math.round(boss.attack * (1 - v.damageReduction / 100))) : boss.attack);
        // the focus holder's lethal hit goes to the next-highest living seat instead (party only)
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
          const r = damageMinion(s.minions[minionTarget], boss.attack);
          emit({ timestamp: elapsed, type: 'minion_damaged', damage: r.dealt, playerIndex: minionTarget });
          if (r.died) emit({ timestamp: elapsed, type: 'minion_dead', damage: 0, playerIndex: minionTarget, ...minionDeathMeta(s.minions[minionTarget]) });
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
        }
      }
    }

    // --- stack runtimes and thorns (L1867849-1868151). A paralysed, feared or blinded boss swing skips
    // this block for the tick (the client jumps straight to the end check).
    if (!statusSwing) {
      const spellsS = s.spells[si];
      const ironOn = thornsGlyph > 0 && !!spellsS && isSpellBuffActive(spellsS, 'IRON_BASTION');
      const buffThorns = spellsS ? activeBuffThornsPercent(spellsS) : 0;
      if (stackOn || ironOn || buffThorns > 0) {
        let thorns = 0;
        for (const ev of tickEvents) {
          if (ev.playerIndex !== si) continue;
          switch (ev.type) {
            case 'player_attack':
            case 'player_crit':
              if (stackOn) stack.onHitLanded();
              break;
            case 'boss_attack':
              if (stackOn) thorns += stack.hitTakenReflect(ev.damage);
              if (ironOn) thorns += Math.round((ev.damage * thornsGlyph) / 100);
              if (buffThorns > 0) thorns += Math.round((ev.damage * buffThorns) / 100);
              break;
            case 'player_death':
              if (stackOn) stack.onHitTaken();
              break;
            case 'player_block':
              if (stackOn) thorns += stack.blockReflect(ev.damage);
              break;
            case 'player_miss':
            case 'boss_blind':
              if (stackOn) stack.onEvaded();
              break;
            default:
              break;
          }
        }
        if (stackOn) stack.tick(dtMs);
        const snap = stack ? stack.snapshot() : { bulwarkStacks: 0, sunderStacks: 0 };
        if (log) {
          for (let k = logFrom; k < ticks.length; k++) {
            ticks[k].bulwarkStacks = snap.bulwarkStacks;
            ticks[k].sunderStacks = snap.sunderStacks;
          }
        }
        if (thorns > 0 && boss.hp > 0 && alive[si]) {
          const before = boss.hp;
          boss.hp = Math.max(0, boss.hp - thorns);
          if (minionsOn) dealt[si] += before - boss.hp;
          emit({ timestamp: elapsed, type: 'thorns_reflect', damage: thorns, playerIndex: si, bulwarkStacks: snap.bulwarkStacks, sunderStacks: snap.sunderStacks });
          if (boss.hp <= 0) return bossDied();
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

// port of simulateCrusadeFight L1868835-1869345
/**
 * A Crusade run. `party` holds 1-3 Fighters or `prepareCrusadeMember` results in seat order.
 * @param {{party: Array<Object>, difficulty: 'NORMAL'|'HARD'|'MYTHIC', mythicPlus?: number, playerCount?: number,
 *   stackPlayerIndex?: number, focus?: {index: number, lethalRedirect: string}|null, bosses?: Array<Object>,
 *   rng: () => number, log?: boolean, dtMs?: number}} o
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
  // one stack runtime and one Iron Bastion glyph for the run, the stack player's (L1868864-1868886)
  const sp = members[stackPlayerIndex];
  const stack = sp ? createStackCombat(sp.inputs.stack.equipped, true, sp.inputs.stack.glyph, sp.inputs.stack.ctx) : null;
  const thornsPercent = sp ? sp.inputs.thornsPercent ?? 0 : 0;
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
    stack?.resetTarget();
    const windowMs = openingSummonWindowMs(s.minions.map((m, i) => (m && s.alive[i] && !m.alive ? m : null)));
    const r = simulateBossFight(b, boss, s, { dtMs, elapsed, limit, stack, stackIndex: stackPlayerIndex, thornsPercent, focus, log }, rng);
    bossResults.push({ ...r, bossMaxHp: boss.maxHp, bossHpLeft: boss.hp, hpLeft: s.hps.slice() });
    elapsed += r.totalDuration;
    limit += windowMs;
    if (!r.success) return outcome(false, elapsed >= limit);
  }
  return outcome(true, false);
}
