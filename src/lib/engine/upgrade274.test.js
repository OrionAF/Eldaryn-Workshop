import { describe, expect, it } from 'vitest';
import { sigilBySpecies } from '../game/sigils.js';
import { getSigilSpellScaled } from './sources/sigilScale.js';
import { getSigilSpellScaled as clientScale } from './__client__/sigils.client.js';
import { rollStanceDaze, dazedMissChance, rollShieldBash, castLockoutMs } from './core/stances.js';
import { processAttack } from './pvp/attack.js';
import { processCombatTick } from './pve/tick.js';
import { scripted, laneRng } from './rng.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { buildFighter } from '../build/fighter.js';
import { computePresetStats, sheetInputsKey } from '../build/stats.js';
import { absorbIntoBase } from '../build/residual.js';
import { anchoredDelta } from './pipeline/anchoredDelta.js';
import { applySoftCap, capConfig } from './core/caps.js';
import { engineKey } from '../search/effect.js';
import { fortressPlayerDuelArgs, FORTRESS_FIGHT_RULES } from './pve/fortressBoss.js';
import { preparePveFighter } from './pve/fight.js';

const species = ['BATTLE_STANCE', 'GUARDIAN_STANCE', 'WARBREAKER_STANCE', 'JUGGERNAUT_STANCE'];
const scale = (sp, level) => getSigilSpellScaled(sigilBySpecies(sp).spell, level, 'STANCE');
const entity = (over = {}) => ({
  maxHp: 10000, rawMaxHp: 10000, hp: 10000, attack: 100, attackSpeed: 1,
  critChance: 0, critDamage: 1.5, doubleHit: 0, lifesteal: 0, hpRegen: 0,
  damageReduction: 0, blockChance: 0, missChance: 0, blindChance: 0,
  paralyzeChance: 0, penetration: 0, disruptionChance: 0, shieldHp: 0, pvpAttack: 0, pvpDefense: 0, ...over,
});
const offence = { stanceDazeChance: 100, stanceDazeDurationMs: 3000, stanceDazePenFactor: 1 };

describe('2.7.4 stance scaling', () => {
  it('matches the independent client transcription for every level and stance', () => {
    for (const sp of species) for (let level = 1; level <= 30; level++) {
      expect(scale(sp, level)).toEqual(clientScale(sigilBySpecies(sp).spell, level));
    }
  });
  it('keeps free stances constant and grows only capped bonuses with source precision', () => {
    expect(scale('BATTLE_STANCE', 30)).toEqual(scale('BATTLE_STANCE', 1));
    expect(scale('GUARDIAN_STANCE', 30)).toEqual(scale('GUARDIAN_STANCE', 1));
    expect(scale('WARBREAKER_STANCE', 2)).toMatchObject({ attackMult: 1.054, daze: { chancePercent: 7.6, durationMs: 4000 } });
    expect(scale('WARBREAKER_STANCE', 30)).toMatchObject({ attackMult: 1.07, daze: { chancePercent: 10 } });
    expect(scale('JUGGERNAUT_STANCE', 2)).toMatchObject({ attackMult: .95, hpPercent: 9.7, spellResist: 5.4, shieldBash: { stunMs: 1100 } });
    expect(scale('JUGGERNAUT_STANCE', 30)).toMatchObject({ hpPercent: 12, spellResist: 7, shieldBash: { chancePercent: 9, stunMs: 1500 } });
  });
});

describe('2.7.4 combat ordering', () => {
  it('Daze refreshes even while active and never shortens the timer', () => {
    expect(rollStanceDaze(offence, 4000, scripted([0]))).toMatchObject({ procced: true, dazedMs: 4000 });
    expect(dazedMissChance(50, 1000, { penetration: 40, stanceDazePenFactor: .5 })).toBe(40);
    expect(dazedMissChance(50, 1000, { penetration: 150, stanceDazePenFactor: 1 })).toBe(0);
    expect(dazedMissChance(50, 0, { penetration: 40, stanceDazePenFactor: 1 })).toBe(50);
    expect(rollShieldBash({}, scripted([]))).toBe(0);
  });
  it('rolls Daze after an avoided swing; the triggering avoid uses the previous timer', () => {
    const atk = entity({ ...offence, penetration: 100 });
    const def = entity({ missChance: 100 });
    const rng = scripted([0, 0]);
    expect(processAttack(atk, def, 0, true, null, null, rng).map((e) => e.type)).toEqual(['defender_miss', 'defender_dazed']);
    expect(def.hp).toBe(10000);
    expect(def.dazedMs).toBe(3000);
    const next = processAttack(atk, def, 1000, true, null, null, scripted([.99, 0]));
    expect(next[0].type).toBe('attacker_hit');
    expect(def.hp).toBe(9900);
  });
  it('rolls after blind but never after paralysis, fear or a minion interception', () => {
    const blind = entity({ ...offence, blinded: true });
    expect(processAttack(blind, entity(), 0, true, null, null, scripted([0])).map((e) => e.type)).toEqual(['attacker_blind', 'defender_dazed']);
    for (const status of ['paralyzedMs', 'fearedMs']) {
      processAttack(entity({ ...offence, [status]: 100 }), entity(), 0, true, null, null, scripted([]));
    }
    const def = entity();
    processAttack(entity(offence), def, 0, true, null, { alive: true, hp: 1000, maxHp: 1000 }, scripted([.99]));
    expect(def.dazedMs).toBeUndefined();
  });
  it('Shield Bash follows block and penetration and precedes Daze; logs do not control effects', () => {
    const run = (log) => {
      const atk = entity(offence);
      const def = entity({ blockChance: 100, stanceShieldBashChance: 100, stanceShieldBashStunMs: 750 });
      const events = processAttack(atk, def, 0, true, null, null, scripted([0, 0, 0]), log);
      return { atk, def, events };
    };
    const logged = run(true), quiet = run(false);
    expect(logged.events.map((e) => e.type)).toEqual(['defender_block', 'attacker_paralyzed', 'defender_dazed']);
    expect(logged.events[1]).toMatchObject({ stunSource: 'SHIELD_BASH', paralyzeMs: 750 });
    expect(logged.atk).toEqual(quiet.atk);
    expect(logged.def).toEqual(quiet.def);
    expect(quiet.events).toEqual([]);
  });
  it('shared PvE carries Daze across ticks and Shield Bash stops a later enemy swing', () => {
    const player = entity({ ...offence, blockChance: 100, stanceShieldBashChance: 100, stanceShieldBashStunMs: 1500 });
    const enemy = entity();
    const first = processCombatTick(player, enemy, 10000, 10000,
      { attackerTimer: 0, defenderTimer: 0, regenTimer: 0 }, 1000, 1000, {}, scripted([.99, 0, 0, 0]));
    expect(first.defenderDazedMs).toBe(3000);
    expect(first.defenderParalyzedMs).toBe(1500);
    const second = processCombatTick(player, enemy, first.attackerHp, first.defenderHp, first.timers,
      1000, 2000, { defenderDazedMs: first.defenderDazedMs, defenderParalyzedMs: first.defenderParalyzedMs }, scripted([.99, 0]));
    expect(second.events.at(-1).type).toBe('defender_paralyze');
    expect(second.defenderDazedMs).toBe(3000);
  });
});

describe('2.7.4 saved builds and stats', () => {
  const character = (sp = 'GUARDIAN_STANCE') => {
    const c = fixtureCharacter('WARRIOR');
    c.sigils.owned[sp] = { level: 10 };
    c.presets[0].utilitySigilSpecies = sp;
    return normaliseCharacter(c);
  };
  it('grants two level-1 stances at 25, preserves all four saves, old aura IDs and an empty slot', () => {
    for (const sp of species) {
      const c = normaliseCharacter(JSON.parse(JSON.stringify(character(sp))));
      expect(c.presets[0].utilitySigilSpecies).toBe(sp);
      expect(c.sigils.owned.BATTLE_STANCE).toEqual({ level: 1 });
      expect(c.presets[0].sigilSpecies).toContain('BERSERK_STANCE');
    }
    const c = character();
    c.presets[0].utilitySigilSpecies = null;
    expect(normaliseCharacter(c).presets[0].utilitySigilSpecies).toBeNull();
    c.level = 24;
    expect(normaliseCharacter(c).presets[0].utilitySigilSpecies).toBeNull();
    c.level = 25;
    c.sigils.owned = {};
    expect(normaliseCharacter(c).sigils.owned).toEqual({ BATTLE_STANCE: { level: 1 }, GUARDIAN_STANCE: { level: 1 } });
  });
  it('adds flat stats once, HP before percent and resist before the cap, and exposes runtime fields', () => {
    const c = character();
    const withStance = computePresetStats(c, c.presets[0].id);
    const empty = structuredClone(c); empty.presets[0].utilitySigilSpecies = null;
    const without = computePresetStats(empty, empty.presets[0].id);
    const tier = c.sigils.altarTier;
    expect(withStance.exact.attackFlat - without.exact.attackFlat).toBe(166 * 3 ** (tier - 1));
    expect(withStance.computed.totalAttack).toBe(Math.floor(withStance.exact.attackFlat * (1 + withStance.exact.attackPercent / 100) * .97));
    expect(withStance.exact.healthPercent - without.exact.healthPercent).toBe(6);
    expect(withStance.computed.totalSpellResist).toBe(parseFloat(applySoftCap(without.exact.raw.totalSpellResist + 3, capConfig('totalSpellResist')).toFixed(1)));
    const f = buildFighter(c);
    expect(preparePveFighter(f).inputs.player.stanceShieldBashChance).toBe(4);
    expect(fortressPlayerDuelArgs(f).stats.stanceShieldBashStunMs).toBe(750);
    expect(FORTRESS_FIGHT_RULES.bossSpellResist).toBe(20);
  });
  it('sheets carry runtime fields without reapplying stance stats; changed stance makes a confirmed sheet stale', () => {
    const c = character(); const id = c.presets[0].id;
    const original = computePresetStats(c, id);
    c.presets[0].sheet = { values: { totalAttack: 123456 }, inputsKey: sheetInputsKey(c, id) };
    const sheet = computePresetStats(c, id);
    expect(sheet.effective.totalAttack).toBe(123456);
    expect(sheet.effective.stanceShieldBashChance).toBe(4);
    c.presets[0].utilitySigilSpecies = 'BATTLE_STANCE';
    expect(computePresetStats(c, id).sheetStatus).toBe('stale');
    const absorbed = absorbIntoBase(c.baseResidual, original.computed, { totalAttack: 970 }, original.ctx);
    expect(absorbed.base.attack - c.baseResidual.attack).toBeCloseTo(970 / ((1 + original.computed.totalAttackPercent / 100) * .97), 3);
    const delta = anchoredDelta(original.computed, { totalAttack: 100 }, { ...original.ctx, exact: original.exact });
    expect(delta.totalAttack).toBe(Math.floor((original.exact.attackFlat + 100) * (1 + original.exact.attackPercent / 100) * .97));
  });
  it('stance runtime changes affect engine keys in PvE, PvP and Fortress', () => {
    const f = buildFighter(character('WARBREAKER_STANCE'));
    f.utility.level = 1;
    const g = structuredClone(f); g.utility.level = 2;
    for (const mode of ['pve', 'pvp', 'fortress']) expect(engineKey(f, mode)).not.toBe(engineKey(g, mode));
  });
  it('mount changes preserve character-wide Fortress bonuses in stat rebuilds', () => {
    const c = character(); c.fortress.owned = ['TOP', 'CORE'];
    const original = computePresetStats(c).computed;
    c.presets[0].mountId = null;
    const buffed = computePresetStats(c).computed;
    c.fortress.owned = [];
    const bare = computePresetStats(c).computed;
    expect(buffed.totalAttackPercent).toBeGreaterThan(bare.totalAttackPercent);
    expect(original.totalAttackPercent).toBeGreaterThanOrEqual(buffed.totalAttackPercent);
  });
});
