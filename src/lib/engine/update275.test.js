import { describe, it, expect } from 'vitest';
import { capConfig, applySoftCap, rawFromSoftCapped } from './core/caps.js';
import { calculateTotalStats } from './pipeline/totals.js';
import { initSpellRuntimes, processSpellsTick } from './core/spells.js';
import { applyDebuff, processDebuffsTick, computeDebuffModifiers, weakenedAttack } from './core/debuffs.js';
import { createMinion, summonMinion, damageMinion, advanceMinionRespawn } from './core/minions.js';
import { getEquippedSummonConfig } from './core/spellConfig.js';
import { getSigilSpellScaled } from './sources/sigilScale.js';
import { sigilBySpecies } from '../game/sigils.js';
import { normaliseCharacter } from '../model/index.js';
import { createPlayerEntity, createMobEntity } from './core/entity.js';
import { simulateFight } from './pve/fight.js';
import { simulateArenaPvP, completeDuelStats } from './pvp/resolver.js';
import { simulateFortressBoss, FORTRESS_FIGHT_RULES } from './pve/fortressBoss.js';
import { simulateCelestial } from './pve/celestial.js';
import { scripted } from './rng.js';

const never = () => 0.99;
const config = (species, level = 1) => {
  const d = sigilBySpecies(species);
  return { species, name: d.name, spell: { ...getSigilSpellScaled(d.spell, level, d.spellType), spellType: d.spellType } };
};
const stats = (over = {}) => completeDuelStats({ totalHp: 1e8, totalAttack: 100, totalAttackSpeed: 1, ...over }).stats;
const curse = () => config('TYRANTS_BURDEN');
const duel = (spells, options = {}) => simulateArenaPvP(
  stats(), stats(), spells, [config('SOUL_SPIKE')], null, null, null, null, null, null, null, null, null, null,
  { rng: never, ...options },
);

describe('2.7.5 Spell Resist (Game/updates-2.7.5.md §1)', () => {
  it('matches the patch example, inverse, soft boundary and asymptotic hard cap', () => {
    const cfg = capConfig('SPELL_RESIST');
    expect(cfg).toEqual({ soft: 40, hard: 90 });
    expect(applySoftCap(40, cfg)).toBe(40);
    expect(applySoftCap(100, cfg)).toBe(70.46875);
    expect(rawFromSoftCapped(70.46875, cfg)).toBeCloseTo(100, 10);
    expect(rawFromSoftCapped(90, cfg)).toBe(Infinity);
    expect(applySoftCap(1e10, cfg)).toBeCloseTo(90, 6);
    const result = calculateTotalStats(
      { attack: 1, hp: 100, attackSpeed: 1, critChance: 0, critDamage: 1.5 },
      { WEAPON: { primaryStats: { attack: 0, hp: 0 }, secondaryStats: [{ type: 'SPELL_RESIST', value: 100 }] } },
    );
    expect(result.totalSpellResist).toBe(70.5);
  });
  it('spell mitigation clamps at 90', () => {
    const rt = initSpellRuntimes([config('SOUL_SPIKE')]); rt[0].cooldownRemaining = 0;
    const r = processSpellsTick(rt, { maxHp: 1000, dtMs: 0, timestamp: 0, attack: 1000, targetSpellResist: 100 }, never);
    expect(r.targetHpDelta).toBe(-44); // floor(450 * (1 - .9)), JS evaluation order
  });
});

describe('2.7.5 Tyrant\'s Burden', () => {
  it('stacks on the immediate DoT tick and cadence, caps, expires and restores attack without drift', () => {
    const rt = initSpellRuntimes([curse()]); rt[0].cooldownRemaining = 0;
    const debuffs = [], seen = new Map();
    for (let t = 0; t <= 13000; t += 100) {
      const out = processSpellsTick(rt, { maxHp: 1e8, attack: 100, dtMs: t ? 100 : 0, timestamp: t }, never);
      for (const spec of out.newDebuffs ?? []) applyDebuff(debuffs, spec, t);
      processDebuffsTick(debuffs, t ? 100 : 0, t, never);
      seen.set(t, weakenedAttack(100, debuffs));
    }
    expect([100, 2000, 4000, 6000, 10000, 13000].map(t => seen.get(t))).toEqual([95, 90, 85, 80, 80, 100]);
    expect(debuffs).toEqual([]);
  });
  it('repeated and party applications cannot exceed four stacks; total Attack Down caps at 50%', () => {
    const s = [];
    const spec = { type: 'ATTACK_DOWN', config: { durationMs: 12000, maxStacks: 4, attackReductionPerStack: 5 }, damagePerTickFlat: 0 };
    for (let i = 0; i < 12; i++) applyDebuff(s, spec, i, { partySlot: i % 2 });
    expect(s[0].stacks).toBe(4);
    expect(computeDebuffModifiers(s).attackReductionPercent).toBe(20);
    expect(weakenedAttack(101, s)).toBe(80);
    expect(computeDebuffModifiers([{ ...s[0], attackReductionPerStack: 30 }]).attackReductionPercent).toBe(50);
    expect(weakenedAttack(101, [])).toBe(101);
  });
  it('recasting at the cap refreshes the curse without reducing attack again', () => {
    const rt = initSpellRuntimes([curse()]);
    Object.assign(rt[0], { cooldownRemaining: 0, isEffectActive: true, effectRemaining: 0 });
    const debuffs = [];
    const spec = { type: 'ATTACK_DOWN', config: { durationMs: 1000, maxStacks: 4, attackReductionPerStack: 5 }, damagePerTickFlat: 0 };
    for (let n = 0; n < 4; n++) applyDebuff(debuffs, spec, 0);
    processSpellsTick(rt, { maxHp: 1e8, attack: 100, dtMs: 0, timestamp: 0 }, never);
    const next = processSpellsTick(rt, { maxHp: 1e8, attack: 100, dtMs: 10, timestamp: 10 }, never);
    for (const spec of next.newDebuffs) applyDebuff(debuffs, spec, 10);
    expect(weakenedAttack(100, debuffs)).toBe(80);
    expect(debuffs[0].remainingMs).toBe(11990);
  });
  it('reduces PvE swings against a dynamic boss without mutating its base attack', () => {
    const enemy = createMobEntity({ hp: 1e9, attack: 100, attackSpeed: 1 });
    const r = simulateFight(createPlayerEntity(stats()), enemy, {
      spells: initSpellRuntimes([curse()]), maxMs: 15000, dtMs: 100,
      enemyAt: () => ({ attack: 100 }),
    }, never);
    const hit = t => r.ticks.find(x => x.type === 'defender_hit' && x.timestamp === t)?.damage;
    expect([hit(2000), hit(4000), hit(6000), hit(8000), hit(14000)]).toEqual([95, 90, 85, 80, 100]);
    expect(enemy.attack).toBe(100);
  });
  it('weakens PvP attacks and attack-scaling spells, then restores them; quiet mode agrees', () => {
    const r = duel([curse()]);
    const swings = r.ticks.filter(x => x.type === 'defender_hit');
    expect(swings.find(x => x.timestamp === 2000).damage).toBe(95);
    expect(swings.find(x => x.timestamp === 8000).damage).toBe(80);
    expect(swings.find(x => x.timestamp === 14000).damage).toBe(100);
    const spells = r.ticks.filter(x => x.type === 'defender_spell_damage');
    expect(spells.find(x => x.timestamp === 9000).damage).toBe(36);
    expect(spells.find(x => x.timestamp === 13000).damage).toBe(45);
    expect({ ...duel([curse()], { log: false }), ticks: [] }).toEqual({ ...r, ticks: [] });
  });
  it('also weakens the Fortress boss through its shared duel resolver', () => {
    const fighter = { stats: stats({ totalHp: 1e15 }), spells: [curse()], equipped: [], stackCtx: {}, summon: null };
    const rules = { ...FORTRESS_FIGHT_RULES, bossDamageVariance: 0 };
    const debuffed = simulateFortressBoss({ fighter, group: 'TOP', rng: never, log: true, rules });
    const plain = simulateFortressBoss({ fighter: { ...fighter, spells: null }, group: 'TOP', rng: never, log: true, rules });
    const late = debuffed.combatLog.find(x => x.type === 'defender_hit' && x.timestamp >= 8000);
    const base = plain.combatLog.find(x => x.type === 'defender_hit' && x.timestamp === late.timestamp);
    expect(late.damage).toBe(Math.floor(base.damage * .8));
  });
  it('shares the stack cap in a Celestial duo and leaves add attacks unaffected', () => {
    const member = withCurse => ({
      class: 'NECROMANCER', spec: 'NECROMANCER_DOOMWEAVER', level: 80,
      stats: stats({ totalHp: 1e15, totalAttack: 1 }),
      sigils: withCurse ? [{ species: 'TYRANTS_BURDEN', level: 1 }] : [],
    });
    const run = withCurse => simulateCelestial({
      party: [member(withCurse), member(withCurse)], difficulty: 'HARD', level: 80, log: true, rng: never,
    });
    const plain = run(false), cursed = run(true);
    const stacked = cursed.log.filter(x => x.type === 'spell_debuff_stack');
    expect(Math.max(...stacked.map(x => x.debuffStacks))).toBe(4);
    const hit = cursed.log.find(x => x.type === 'boss_attack' && x.timestamp > 9000 && x.timestamp < 12000);
    const base = plain.log.find(x => x.type === 'boss_attack' && x.timestamp === hit.timestamp);
    expect(hit.damage).toBeCloseTo(Math.floor(base.damage * .8), 0);
    const add = cursed.log.find(x => x.type === 'add_attack' && x.timestamp > 30000);
    expect(add.damage).toBe(plain.log.find(x => x.type === 'add_attack' && x.timestamp === add.timestamp && x.addId === add.addId).damage);
  });
});

describe('2.7.5 Greater Demon', () => {
  const state = level => ({ ownedSigils: [{ species: 'OVERLORDS_PACT', level }], utilitySlotSpecies: 'OVERLORDS_PACT' });
  const demon = dominion => {
    const m = createMinion(getEquippedSummonConfig(state(1)), { attack: 1000, maxHp: 10000, attackSpeed: 1, critDamage: 1.5 }, { totalDominion: dominion });
    summonMinion(m); return m;
  };
  it('scales the summon and retains ownership', () => {
    expect(getEquippedSummonConfig(state(1))).toMatchObject({ minion: 'GREATER_DEMON', attackPercent: 44, hpPercent: 150, respawnCooldownMs: 10000 });
    expect(getEquippedSummonConfig(state(100))).toMatchObject({ attackPercent: 88, hpPercent: 300 });
    const c = normaliseCharacter({ class: 'NECROMANCER', sigils: { owned: { OVERLORDS_PACT: { level: 1 }, TYRANTS_BURDEN: { level: 1 } } } });
    expect(Object.keys(c.sigils.owned)).toEqual(expect.arrayContaining(['OVERLORDS_PACT', 'TYRANTS_BURDEN']));
    expect(demon(1)).toMatchObject({ attack: 440, maxHp: 15000, alive: true });
  });
  it('uses all five Dominion tiers and preserves defenses across death and respawn', () => {
    expect([1, 2, 3, 4, 5].map(n => demon(n).dominion?.blockChance ?? 0)).toEqual([0, 10, 20, 20, 30]);
    const m = demon(5);
    const roll = scripted([0]);
    expect(damageMinion(m, 100, { swing: true }, roll)).toEqual({ dealt: 0, died: false, blocked: true });
    expect(damageMinion(m, 100, { swing: true, penetration: 20 }, () => 0)).toEqual({ dealt: 14, died: false, blocked: true });
    expect(damageMinion(m, 100, { swing: true }, never)).toEqual({ dealt: 70, died: false, thorns: 14 });
    expect(damageMinion(m, 100)).toEqual({ dealt: 70, died: false });
    damageMinion(m, 1e9);
    expect(m).toMatchObject({ alive: false, respawnMs: 10000 });
    expect(advanceMinionRespawn(m, 9990)).toBe(false);
    expect(advanceMinionRespawn(m, 10)).toBe(true);
    expect(m.hp).toBe(m.maxHp);
    expect(m.dominion).toEqual({ blockChance: 30, damageReduction: 30, thornsPercent: 20 });
  });
  it('intercepts PvE swings, mitigates damage and reflects thorns while its owner stays safe', () => {
    const m = demon(5);
    const r = simulateFight(createPlayerEntity(stats({ totalAttack: 0 })), createMobEntity({ hp: 1e9, attack: 100, attackSpeed: 1 }), {
      minion: m, maxMs: 1000, dtMs: 100,
    }, never);
    expect(r.hp).toBe(1e8);
    expect(r.ticks.find(x => x.type === 'minion_damaged').damage).toBe(70);
    expect(r.ticks.find(x => x.type === 'minion_thorns').damage).toBe(14);
    expect(m.hp).toBe(15000 - 70);
  });
  it('also intercepts PvP swings and reflects thorns; traced and quiet results agree', () => {
    const run = log => simulateArenaPvP(
      stats({ totalDominion: 5 }), stats(), null, null, null, null, null, null, null, null, null, null,
      getEquippedSummonConfig(state(1)), null, { rng: never, log },
    );
    const r = run(true);
    expect(r.ticks.find(x => x.type === 'attacker_minion_damaged').damage).toBe(70);
    expect(r.ticks.find(x => x.type === 'attacker_minion_thorns').damage).toBe(14);
    expect({ ...run(false), ticks: [] }).toEqual({ ...r, ticks: [] });
  });
});
