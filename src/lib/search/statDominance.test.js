// Stat dominance pruning (backlog §16, simulation.md §Build space / Dominance): talents, relics, pets, and the
// damage-only and thorns rules, on small synthetic characters.
import { describe, it, expect } from 'vitest';
import { createBuildSpace, BLOCKS } from './space.js';
import { optimize } from './search.js';
import { dpsVsDummy } from '../engine/metrics.js';
import { dominanceContextOf, damageOnly, paretoFilter, isDefensiveSpell, fighterHasThorns } from './dominance.js';
import { resolveTarget } from './objectives.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { RELICS } from '../game/relics.js';
import { TALENT_SPECS } from '../game/talents.js';
import { PET_SPECIES } from '../game/pets.js';
import { sigilBySpecies } from '../game/sigils.js';

const HARMLESS = dominanceContextOf(resolveTarget({ kind: 'dummy' }), 'pve');
const block = (space, id) => space.blocks.find((b) => b.id === id);
const sorted = (sets) => sets.map((s) => [...s].sort()).sort((a, b) => a.join().localeCompare(b.join()));

/** The Warrior fixture (DPS, no thorns sigil) with `edit` applied to the character and to preset p1. */
function warrior(edit = {}, presetEdit = {}, spec) {
  const c = normaliseCharacter(JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR', spec ? { spec } : {}))));
  return normaliseCharacter({ ...c, ...edit, presets: c.presets.map((p) => (p.id === 'p1' ? { ...p, ...presetEdit } : p)) });
}

describe('catalogue facts the rules rest on', () => {
  it('every relic bonus is positive and grows with level (Game/relics.md §2)', () => {
    for (const r of RELICS) for (const b of r.bonuses) expect(b.base > 0 && b.max >= b.base, `${r.id} ${b.stat}`).toBe(true);
  });
  it('every talent adds a positive amount per rank (Game/talents.md §5)', () => {
    for (const spec of Object.values(TALENT_SPECS)) {
      for (const t of spec.tiers.flatMap((x) => x.talents)) {
        expect(t.bonusPerRank.valuePerRank > 0, t.id).toBe(true);
        if (t.secondaryBonusPerRank) expect(t.secondaryBonusPerRank.valuePerRank > 0, t.id).toBe(true);
      }
    }
  });
  it('every pet species adds positive flat Attack and HP (Game/pets.md §4)', () => {
    for (const p of PET_SPECIES) expect(p.baseAttack > 0 && p.baseHp > 0, p.species).toBe(true);
  });
});

describe('relics', () => {
  const RELIC_EDIT = { relics: { relic_iron_heart: 1, relic_phoenix_feather: 1, relic_war_charm: 1 }, extraRelicSlots: 0 };

  it('only full sets, and a set another set beats on every stat is dropped', () => {
    const space = createBuildSpace(warrior(RELIC_EDIT, { relicIds: [] }), 'p1');
    const tried = block(space, 'relics').domain(space.start).map((c) => c.relicIds);
    // Phoenix Feather (HP 15%, PVP Defense) beats Iron Heart (HP 6%) in PVE; War Charm adds attack
    expect(sorted(tried)).toEqual(sorted([['relic_iron_heart', 'relic_phoenix_feather'], ['relic_phoenix_feather', 'relic_war_charm']]));
    expect(space.pruned('relics', space.start)).toEqual([
      { id: ['relic_iron_heart', 'relic_war_charm'], by: ['relic_phoenix_feather', 'relic_war_charm'], reason: 'dominated' },
    ]);
  });

  it('a dominated current set stays the baseline', () => {
    const space = createBuildSpace(warrior(RELIC_EDIT, { relicIds: ['relic_iron_heart', 'relic_war_charm'] }), 'p1');
    expect(space.start.relicIds).toEqual(['relic_iron_heart', 'relic_war_charm']);
    const tried = block(space, 'relics').domain(space.start).map((c) => c.relicIds);
    expect(sorted(tried)).toEqual(sorted([['relic_iron_heart', 'relic_phoenix_feather'], ['relic_phoenix_feather', 'relic_war_charm']]));
    expect(space.pruned('relics', space.start)).toEqual([]);
  });

  it('against a target that cannot hurt the player, only the attacking stats count', () => {
    const edit = { relics: { relic_iron_heart: 1, relic_war_charm: 1, relic_swift_emblem: 1 }, extraRelicSlots: 0 };
    const all = createBuildSpace(warrior(edit, { relicIds: [] }), 'p1');
    expect(block(all, 'relics').domain(all.start)).toHaveLength(3);
    const dmg = createBuildSpace(warrior(edit, { relicIds: [] }), 'p1', { dominance: HARMLESS });
    expect(block(dmg, 'relics').domain(dmg.start).map((c) => [...c.relicIds].sort())).toEqual([['relic_swift_emblem', 'relic_war_charm']]);
  });
});

describe('pets', () => {
  const pets = (extra) => ({
    pets: {
      altar: { level: 30, tier: 2 },
      owned: [
        { id: 'pet-a', species: 'INFERNAL_DRAKE', rarity: 'Legendary', secondaries: [{ type: 'ATTACK_PERCENT', value: 12.5 }, { type: 'CRIT_DAMAGE', value: 20 }] },
        { id: 'pet-b', species: 'INFERNAL_DRAKE', rarity: 'Legendary', secondaries: [{ type: 'ATTACK_PERCENT', value: 10 }] },
        ...extra,
      ],
    },
  });

  it('never "no pet" while one is owned, and a pet another beats on every stat is dropped', () => {
    const space = createBuildSpace(warrior(pets([]), { petId: null }), 'p1');
    expect(block(space, 'pet').domain(space.start).map((c) => c.petId)).toEqual(['pet-a']);
    expect(space.pruned('pet', space.start)).toEqual([{ id: 'pet-b', by: 'pet-a', reason: 'dominated' }]);
  });

  it('a dominated current pet stays the baseline; a pet that wins on one stat stays offered', () => {
    const lucky = { id: 'pet-c', species: 'INFERNAL_DRAKE', rarity: 'Legendary', secondaries: [{ type: 'LIFESTEAL', value: 9 }] };
    const space = createBuildSpace(warrior(pets([lucky]), { petId: 'pet-b' }), 'p1');
    expect(space.start.petId).toBe('pet-b');
    expect(block(space, 'pet').domain(space.start).map((c) => c.petId).sort()).toEqual(['pet-a', 'pet-c']);
  });
});

describe('talents', () => {
  // level 20 has 6 talent points (Game/talents.md §3), all spent here, so no +1 move exists
  const ALLOC = { dps_t1_sharpened_blade: 5, dps_t2_keen_edge: 1 };
  const space = createBuildSpace(warrior({ level: 20, talentSets: [{ spec: 'WARRIOR_DPS', allocation: ALLOC }, { spec: 'WARRIOR_TANK', allocation: {} }] }, { talentSet: 0, mountId: null }), 'p1'); // mounts unlock at 40
  const tried = block(space, 'talents').domain(space.start).map((c) => c.talentAllocation);
  const has = (list, a) => list.some((x) => JSON.stringify(x) === JSON.stringify(a));

  it('a move the incumbent beats on every stat is dropped, and the incumbent is named as the dominator', () => {
    const pruned = space.pruned('talents', space.start);
    // taking the Keen Edge point back, or moving it to the weaker Precision (crit 1 < 1.5), only loses stats
    expect(pruned).toContainEqual({ id: { dps_t1_sharpened_blade: 5 }, by: null, reason: 'dominated' });
    expect(pruned).toContainEqual({ id: { dps_t1_precision: 1, dps_t1_sharpened_blade: 5 }, by: null, reason: 'dominated' });
    expect(has(tried, { dps_t1_sharpened_blade: 5 })).toBe(false);
  });

  it('a move that wins on some stat stays (tier legality kept: no move breaks tier 2)', () => {
    expect(has(tried, { dps_t1_sharpened_blade: 5, dps_t2_brutality: 1 })).toBe(true);
    for (const a of tried) {
      const t1 = Object.entries(a ?? {}).filter(([id]) => id.startsWith('dps_t1_')).reduce((s, [, r]) => s + r, 0);
      const higher = Object.entries(a ?? {}).some(([id, r]) => !id.startsWith('dps_t1_') && r > 0);
      if (higher) expect(t1).toBeGreaterThanOrEqual(5);
    }
  });

  it('every pruned move is matched or beaten on every computed total by its dominator (independent check)', () => {
    const totals = (alloc) => space.fighterOf(space.legalise({ ...space.start, talentAllocation: alloc })).stats;
    const IGNORED = new Set(['totalPvpAttack', 'totalPvpDefense']);
    for (const p of space.pruned('talents', space.start)) {
      const me = totals(p.id);
      const by = p.by === null ? space.fighterOf(space.start).stats : totals(p.by);
      for (const [k, v] of Object.entries(me)) if (typeof v === 'number' && !IGNORED.has(k)) expect(by[k], k).toBeGreaterThanOrEqual(v);
    }
  });

  it('on attacking stats only, fewer moves survive (Protection spends points on HP and defence)', () => {
    const tank = warrior({}, {}, 'WARRIOR_TANK');
    const all = createBuildSpace(tank, 'p1');
    const dmg = createBuildSpace(tank, 'p1', { dominance: HARMLESS });
    expect(block(dmg, 'talents').domain(dmg.start).length).toBeLessThan(block(all, 'talents').domain(all.start).length);
  });
});

describe('thorns', () => {
  it('while a thorns source runs, hit-taken stats must be equal: a higher-DR relic no longer dominates', () => {
    const edit = { relics: { relic_basalt_guard: 1, relic_titans_oath: 1, relic_war_charm: 1 }, extraRelicSlots: 0 };
    const plain = createBuildSpace(warrior(edit, { relicIds: [] }), 'p1');
    expect(block(plain, 'relics').domain(plain.start)).toHaveLength(2); // Basalt Guard (DR 3) + War Charm loses to Titan's Oath (DR 8) + War Charm
    const base = warrior({}, {}, 'WARRIOR_TANK');
    const sigils = { ...base.sigils, owned: { ...base.sigils.owned, BULWARK_OF_THORNS: { level: 1 } } };
    const thorny = createBuildSpace(warrior({ ...edit, sigils }, { relicIds: [], sigilSpecies: ['BULWARK_OF_THORNS'] }, 'WARRIOR_TANK'), 'p1');
    expect(thorny.start.sigilSpecies).toEqual(['BULWARK_OF_THORNS']);
    expect(block(thorny, 'relics').domain(thorny.start)).toHaveLength(3);
  });

  it('a partner with thorns makes hit-taken stats equal-only; an opponent with thorns makes every stat equal-only', () => {
    const thornsFighter = { stats: {}, class: 'WARRIOR', spec: 'WARRIOR_TANK', sigils: [{ species: 'BULWARK_OF_THORNS', level: 1 }] };
    expect(fighterHasThorns(thornsFighter)).toBe(true);
    expect(dominanceContextOf({ kind: 'celestial', partner: { fighter: thornsFighter } }, 'pve').otherThorns).toBe('ally');
    expect(dominanceContextOf({ kind: 'pvp', opponents: [{ fighter: thornsFighter }] }, 'pvp').otherThorns).toBe('enemy');
  });
});

describe('damage-only comparison', () => {
  const view = (o = {}) => ({ stats: { attack: 10, maxHp: 100 }, rest: { spells: [], shield: null, stack: { equipped: [] } }, thorns: false, spells: [], summon: false, hp: 1000, fluxFromHits: false, equippedKey: 'stack', ...o });
  const fortress = { harmless: false, fortressMaxDamage: 500, otherThorns: null };

  it('holds against a harmless target, never against one that hits (dungeon, Celestial, PVP)', () => {
    expect(HARMLESS.harmless).toBe(true);
    expect(dominanceContextOf(resolveTarget({ kind: 'dungeon', id: 'dungeon_1_hard', step: 6 }), 'pve').harmless).toBe(false);
    expect(dominanceContextOf(resolveTarget({ kind: 'custom', mob: { hp: 1000, attack: 0, attackSpeed: 1 } }), 'pve').harmless).toBe(true);
    expect(dominanceContextOf(resolveTarget({ kind: 'custom', mob: { hp: 1000, attack: 5, attackSpeed: 1 } }), 'pve').harmless).toBe(false);
  });

  it('the Fortress bound is 61 swings at the top of the boss damage range', () => {
    const t = resolveTarget({ kind: 'fortressBoss', group: 'TOP', stars: 5 });
    const ctx = dominanceContextOf(t, 'fortress');
    expect(ctx.fortressMaxDamage).toBeGreaterThan(0);
    expect(ctx.fortressMaxDamage % 61).toBe(0);
  });

  it('Fortress: only while HP exceeds the bound, with no thorns, minion, hit-charged transform or HP-gated damage spell', () => {
    expect(damageOnly(view(), fortress)).toBe(true);
    expect(damageOnly(view({ hp: 500 }), fortress)).toBe(false);
    expect(damageOnly(view({ thorns: true }), fortress)).toBe(false);
    expect(damageOnly(view({ summon: true }), fortress)).toBe(false);
    const transform = { species: 'X', spell: { spellType: 'TRANSFORM' } };
    expect(damageOnly(view({ fluxFromHits: true, spells: [transform] }), fortress)).toBe(false);
    expect(damageOnly(view({ spells: [transform] }), fortress)).toBe(true);
    const gated = { species: 'Y', spell: { spellType: 'DAMAGE', attackPercent: 100, cooldownMs: 5000 }, activationCondition: 'MY_HP_BELOW_40' };
    expect(damageOnly(view({ spells: [gated] }), fortress)).toBe(false);
    expect(damageOnly(view({ spells: [{ ...gated, activationCondition: 'ENEMY_HP_BELOW_40' }] }), fortress)).toBe(true);
    expect(damageOnly(view({ hp: 1 }), HARMLESS)).toBe(true);
  });

  it('heal sigils are defensive spells, damage sigils are not', () => {
    const entry = (sp) => ({ species: sp, spell: { ...sigilBySpecies(sp).spell, spellType: sigilBySpecies(sp).spellType } });
    expect(isDefensiveSpell(entry('REJUVENATION'))).toBe(true);
    expect(isDefensiveSpell(entry('HEMORRHAGE'))).toBe(false);
  });

  it('two values that differ only by a heal spell and HP are twins on attacking stats; on every stat neither dominates', () => {
    const heal = { species: 'REJUVENATION', spell: { spellType: 'HEAL', healPercentPerTick: 8, tickIntervalMs: 1000, durationMs: 6000, cooldownMs: 20000 } };
    const a = view({ stats: { attack: 10, maxHp: 120 }, spells: [heal], rest: { spells: [heal], shield: null, stack: { equipped: ['REJUVENATION'] } } });
    const b = view({ stats: { attack: 10, maxHp: 100 } });
    const inc = view({ stats: { attack: 9, maxHp: 90 } });
    expect(paretoFilter([{ value: 'a', view: a }, { value: 'b', view: b }], inc, HARMLESS).kept).toEqual(['a']);
    const none = { harmless: false, fortressMaxDamage: null, otherThorns: null };
    expect(paretoFilter([{ value: 'a', view: a }, { value: 'b', view: b }], inc, none).kept).toEqual(['a', 'b']);
  });
});

describe('a full optimise with pruning', () => {
  // Measured for this request on c37a4ce, before pruning: the best build's dps (400 dummy fights on their own
  // seed) and the search phase's fights.
  const BEFORE_DPS = 929150.512666667;
  const BEFORE_SEARCH_FIGHTS = 17720;
  it('reaches a result at least as good as before on the same seed', { timeout: 120000 }, async () => {
    const character = warrior({ relics: { relic_iron_heart: 3, relic_phoenix_feather: 2, relic_war_charm: 4, relic_swift_emblem: 2, relic_fortune_token: 3 } });
    const space = Object.fromEntries(BLOCKS.map((b) => [b, ['talents', 'relics', 'pet'].includes(b)]));
    const r = await optimize({ character, presetId: 'p1', target: { kind: 'dummy', seconds: 10 }, space, effort: { level: 'quick', n0: 8, maxN: 32, randomStarts: 0 }, seed: 1 });
    const s = createBuildSpace(character, 'p1');
    const best = r.rows[0]?.candidate ?? r.baseline.candidate;
    const dps = dpsVsDummy(s.fighterOf(best), { seconds: 60, n: 400, seed: 4242, cache: false }).mean;
    expect(dps).toBeGreaterThanOrEqual(BEFORE_DPS);
    expect(r.phases.find((p) => p.id === 'search').fights).toBeLessThan(BEFORE_SEARCH_FIGHTS);
    // the result names what a block skipped ("N talent moves skipped: dominated")
    const talents = r.search.blocks.find((b) => b.id === 'talents').pruned;
    expect(talents.length).toBeGreaterThan(0);
    expect(talents.every((p) => p.reason === 'dominated')).toBe(true);
  });
});
