import { describe, it, expect } from 'vitest';
import { replayCheck, RULES, MAX_PER_RULE } from './replayCheck.js';
import { runDuel } from './resolver.js';
import { mulberry32 } from '../rng.js';
import sample from '../__fixtures__/arena-fight.sample.json';
import { plainA, plainD } from './replayCheck.fixtures.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const status = (rep, rule) => rep.rules.find((r) => r.rule === rule)?.status;
const failing = (rep) => rep.rules.filter((r) => r.status === 'fail').map((r) => r.rule);

// Fighters exercising spells, minions, shields and stacks (as in resolver.test.js).
const fighter = (cls, spec, sigils, o = {}, extra = {}) => ({
  class: cls,
  spec,
  sigils: sigils.map((species) => ({ species, level: 5 })),
  stats: {
    totalHp: 20000, totalAttack: 900, totalAttackSpeed: 1.6, totalDoubleHit: 12, totalCritChance: 25,
    totalCritDamage: 1.8, totalLifesteal: 6, totalHpRegen: 4, totalDamageReduction: 15, totalBlockChance: 8,
    totalMissChance: 0, totalBlindChance: 6, totalParalyzeChance: 4, totalPenetration: 20, totalPvpAttack: 60,
    totalPvpDefense: 80, totalDisruptionChance: 5, totalSpellDamage: 20, totalSpellCritChance: 15,
    totalSpellVamp: 5, totalSpellResist: 10, totalMinionAttack: 10, totalMinionHealth: 10, totalMinionCritChance: 10,
    totalMinionLifesteal: 5, totalSoulLink: 10, totalMinionAttackSpeed: 0, ...o,
  },
  ...extra,
});
const warrior = fighter('WARRIOR', 'WARRIOR_TANK', ['BLADE_OF_JUDGMENT', 'IRON_BASTION', 'HEMORRHAGE', 'BULWARK_OF_THORNS']);
const mystic = fighter('MYSTIC', 'MYSTIC_MAGE', ['ARCANE_SHARD', 'WITHERING_BRAND', 'ARCANE_SURGE'], {},
  { utility: { species: 'ARCANE_BARRIER', level: 5 } });
const necro = fighter('NECROMANCER', 'NECROMANCER_DEATHLORD', ['SOUL_SPIKE', 'GRAVEBORN_VIGOR', 'GRAVE_ROT'], {},
  { utility: { species: 'BONE_SERVANT', level: 5 } });

describe('replayCheck: the synthetic sample', () => {
  it('passes with the fighters; every rule runs', () => {
    const rep = replayCheck(sample, { attacker: plainA, defender: plainD });
    expect(rep.mismatches).toEqual([]);
    expect(rep.ok).toBe(true);
    expect(rep.rules.map((r) => r.rule)).toEqual(RULES);
    for (const r of ['shape', 'terminal', 'max-hp', 'swing-times', 'regen', 'hit-sizes', 'hp-chain']) {
      expect(status(rep, r), r).toBe('pass');
    }
    expect(rep.rules.find((r) => r.rule === 'hit-sizes').checked).toBeGreaterThan(50);
  });

  it('passes without fighters, inferring the swing interval and the hit sizes', () => {
    const rep = replayCheck(sample);
    expect(rep.mismatches).toEqual([]);
    expect(status(rep, 'swing-times')).toBe('pass');
    expect(status(rep, 'hit-sizes')).toBe('pass');
    expect(status(rep, 'spell-casts')).toBe('skipped');
  });

  it('takes the bare result as well as the response body', () => {
    expect(replayCheck(sample.result, { attacker: plainA, defender: plainD }).ok).toBe(true);
  });
});

describe('replayCheck: engine logs are consistent with themselves', () => {
  const pairs = [['mystic-v-warrior', mystic, warrior], ['necro-v-mystic', necro, mystic], ['necro-mirror', necro, necro]];
  for (const [name, a, d] of pairs) {
    it(`${name}: no mismatch over several seeds`, () => {
      for (const seed of [1, 2, 3, 4]) {
        const r = runDuel({ attacker: a, defender: d, rng: mulberry32(seed), log: true });
        const rep = replayCheck({ result: r.result }, { attacker: a, defender: d });
        expect(rep.mismatches, `${name} seed ${seed}`).toEqual([]);
        expect(status(rep, 'spell-casts')).toBe('pass');
      }
    });
  }

  it('opening: the necromancer minion is checked against the sheet', () => {
    const r = runDuel({ attacker: necro, defender: warrior, rng: mulberry32(5), log: true });
    const rep = replayCheck(r.result, { attacker: necro, defender: warrior });
    expect(status(rep, 'opening')).toBe('pass');
    const bad = clone(r.result);
    bad.ticks.find((e) => e.type === 'attacker_minion_summoned').summonReadyMs += 10;
    expect(failing(replayCheck(bad, { attacker: necro, defender: warrior }))).toContain('opening');
  });

  it('plain fighters of random seeds pass, including mutual kills and quick deaths', () => {
    const glass = { ...plainA, stats: { ...plainA.stats, totalHp: 40, totalAttack: 90, totalDamageReduction: 0, totalPvpDefense: 0 } };
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = runDuel({ attacker: glass, defender: glass, rng: mulberry32(seed), log: true });
      expect(replayCheck(r.result, { attacker: glass, defender: glass }).mismatches, `seed ${seed}`).toEqual([]);
    }
  });
});

describe('replayCheck: each rule reports its own mismatch', () => {
  const fit = { attacker: plainA, defender: plainD };
  const tamper = (fn) => { const x = clone(sample); fn(x.result); return replayCheck(x, fit); };
  const swing = (res, type) => res.ticks.findIndex((e) => e.type === type);

  it('shape: malformed response', () => {
    expect(failing(replayCheck({ result: { ticks: 'no' } }))).toEqual(['shape']);
    expect(replayCheck({}).rules.filter((r) => r.status === 'skipped')).toHaveLength(RULES.length - 1);
  });

  it('shape: timestamps going backwards', () => {
    expect(failing(tamper((r) => { r.ticks[10].timestamp = 0; }))).toContain('shape');
  });

  it('max-hp: the x8 pool', () => {
    const rep = tamper((r) => { r.attackerMaxHp = 1000; });
    expect(failing(rep)).toContain('max-hp');
    expect(rep.mismatches.find((m) => m.rule === 'max-hp')).toMatchObject({ expected: 8000, actual: 1000 });
  });

  it('terminal: wrong winner, wrong timeout length', () => {
    expect(failing(tamper((r) => { r.attackerWon = !r.attackerWon; }))).toContain('terminal');
    expect(failing(tamper((r) => { r.ticks.splice(r.ticks.findIndex((e) => e.type === 'time_up'), 1); }))).toContain('terminal');
    expect(failing(tamper((r) => { r.totalDuration += 10; }))).toContain('terminal');
  });

  it('swing-times: a swing moved by one tick', () => {
    const rep = tamper((r) => { r.ticks[swing(r, 'attacker_hit')].timestamp += 10; });
    expect(failing(rep)).toContain('swing-times');
    // and without the fighters: no constant interval fits any more
    const x = clone(sample);
    x.result.ticks[swing(x.result, 'attacker_hit')].timestamp += 10;
    expect(failing(replayCheck(x))).toContain('swing-times');
  });

  it('swing-times: a swing row off the 10 ms grid', () => {
    expect(failing(tamper((r) => { r.ticks[swing(r, 'defender_hit')].timestamp += 3; }))).toContain('swing-times');
  });

  it('regen: pulse off the 100 ms grid, pulse of the wrong size', () => {
    expect(failing(tamper((r) => { r.ticks.find((e) => e.type === 'attacker_regen').timestamp += 10; }))).toContain('regen');
    const rep = tamper((r) => { r.ticks.find((e) => e.type === 'defender_regen').damage += 1; });
    expect(rep.mismatches.find((m) => m.rule === 'regen')).toBeTruthy();
  });

  it('hit-sizes: a hit one point off, a crit that is not a crit', () => {
    expect(failing(tamper((r) => { r.ticks[swing(r, 'attacker_hit')].damage += 1; }))).toContain('hit-sizes');
    const rep = tamper((r) => { r.ticks[swing(r, 'defender_crit')].damage -= 1; });
    expect(rep.mismatches.find((m) => m.rule === 'hit-sizes')).toMatchObject({ message: expect.stringContaining('crit') });
    // without fighters the sizes must still be constant per kind
    const x = clone(sample);
    x.result.ticks[swing(x.result, 'attacker_hit')].damage += 1;
    expect(failing(replayCheck(x))).toContain('hit-sizes');
  });

  it('hp-chain: a hit that heals its target, a final HP that is not the result', () => {
    expect(failing(tamper((r) => { const i = swing(r, 'attacker_hit') + r.ticks.slice(swing(r, 'attacker_hit') + 1).findIndex((e) => e.type === 'attacker_hit') + 1; r.ticks[i].defenderHpAfter = r.defenderMaxHp; }))).toContain('hp-chain');
    expect(failing(tamper((r) => { r.defenderHpRemaining += 8; }))).toContain('hp-chain');
  });

  it('spell-casts: a cast inside the cooldown, a spell the fighter does not carry', () => {
    const r = runDuel({ attacker: mystic, defender: warrior, rng: mulberry32(2), log: true });
    const fits = { attacker: mystic, defender: warrior };
    const x = clone(r.result);
    const casts = x.ticks.filter((e) => e.type === 'attacker_spell_cast');
    expect(casts.length).toBeGreaterThan(1);
    x.ticks.splice(x.ticks.indexOf(casts[0]) + 1, 0, clone(casts[0])); // the same spell again in the same tick
    expect(failing(replayCheck(x, fits))).toContain('spell-casts');
    const y = clone(r.result);
    y.ticks.find((e) => e.type === 'attacker_spell_cast').spell.name = 'Nothing';
    expect(failing(replayCheck(y, fits))).toContain('spell-casts');
  });

  it('caps the listed mismatches per rule, but counts them all', () => {
    const rep = tamper((r) => { for (const e of r.ticks) if (e.type === 'attacker_hit') e.damage += 5; });
    expect(rep.mismatches.filter((m) => m.rule === 'hit-sizes')).toHaveLength(MAX_PER_RULE);
    expect(rep.totalMismatches).toBeGreaterThan(MAX_PER_RULE);
  });
});

describe('replayCheck: a pass means the schedule was compared', () => {
  it('takes one side\'s sheet: that side is held to it, the other only to the log', () => {
    const rep = replayCheck(sample, { attacker: plainA });
    expect(rep.mismatches).toEqual([]);
    expect(status(rep, 'swing-times')).toBe('pass');
    expect(status(rep, 'regen')).toBe('pass');
    const bad = clone(sample);
    for (const e of bad.result.ticks) if (e.type.startsWith('attacker_') && e.timestamp > 0) e.timestamp += 10;
    bad.result.ticks.sort((x, y) => x.timestamp - y.timestamp);
    expect(status(replayCheck(bad, { attacker: plainA }), 'swing-times')).toBe('fail');
    expect(status(replayCheck(sample, { attacker: { ...plainA, stats: { ...plainA.stats, totalHpRegen: 1 } } }), 'regen')).toBe('fail');
  });

  it('reports swing-times and regen as skipped, not pass, when only the grid could be checked', () => {
    const { log } = runDuel({ attacker: mystic, defender: warrior, rng: mulberry32(11), log: true });
    const rep = replayCheck({ result: runDuel({ attacker: mystic, defender: warrior, rng: mulberry32(11), log: true }).result });
    expect(log.length).toBeGreaterThan(0);
    expect(status(rep, 'swing-times')).toBe('skipped');
    expect(status(rep, 'regen')).toBe('skipped');
    expect(rep.rules.find((r) => r.rule === 'swing-times').note).toMatch(/grid only/);
  });

  it('a skip never hides a mismatch found before it', () => {
    const { result } = runDuel({ attacker: mystic, defender: warrior, rng: mulberry32(11), log: true });
    const bad = clone(result);
    const i = bad.ticks.findIndex((e, k) => e.timestamp > 0 && e.type.endsWith('_hit') && bad.ticks[k + 1].timestamp > e.timestamp + 3);
    const swing = bad.ticks[i];
    swing.timestamp += 3; // off the 10 ms grid
    const rep = replayCheck(bad);
    expect(status(rep, 'swing-times')).toBe('fail');
  });
});
