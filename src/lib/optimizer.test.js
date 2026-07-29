/**
 * Tests optimizer.js - the automatic build search.
 *
 * The core guarantees under test: the result never scores worse than the
 * current build, every recommended configuration is LEGAL (talent tier
 * thresholds, relic cap, glyph tier caps, fortress exclusivity, transcendence
 * reachability + Ichor budget), the search is deterministic, and it never
 * mutates its inputs.
 */
import { describe, it, expect } from 'vitest';
import * as opt from './optimizer.js';
import { computePresetTotals } from './totals.js';
import { computeDps, buffedAttack } from './dps.js';
import { newCharacter, newPetEntry, newMountGlyphEntry, newStoneEntry } from './model.js';
import { TALENT_TREES } from './talentTreeData.js';
import { PRESET_RELIC_CAP, PRESET_SIGIL_CAP, SOURCE_DEFS, SLOTS, TALENT_TOTAL_POINTS } from './constants.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { canUnlock, costForCount, slotsForNode, totalIchorSpent } from './transcendence.js';
import { expectedSigilActiveDps } from './sigilEffects.js';

const GLYPH_TIER_CAPS = SOURCE_DEFS.find((d) => d.key === 'glyphs').tierCaps;

/** A Warrior with real choices on every searchable dimension. */
function makeWarrior() {
  const character = newCharacter('Test Warrior');
  character.class = 'Warrior';
  character.loadouts[0].gear.Weapon.attack = 100;
  character.loadouts[0].gear.Weapon.crit = 20;
  character.loadouts[1].gear.Weapon.attack = 40; // strictly worse loadout

  const atkPet = newPetEntry({ name: 'Attack Pet', stats: { attack_pct: 10 } });
  const hpPet = newPetEntry({ name: 'HP Pet', stats: { health_pct: 10 } });
  character.pets = [atkPet, hpPet];

  // night_wolf star 2: hp [7,10], atk [7,9]; frostfang star 2: hp [10,12], atk [4,7].
  const atkMount = character.mounts.entries.find((m) => m.id === 'night_wolf');
  atkMount.owned = true;
  atkMount.star = 2;
  atkMount.atkPct = 9; // the attack mount
  atkMount.hpPct = 7;
  const hpMount = character.mounts.entries.find((m) => m.id === 'frostfang_wolf');
  hpMount.owned = true;
  hpMount.star = 2;
  hpMount.hpPct = 12; // the tank mount
  hpMount.atkPct = 4;
  character.presets[0].mountId = hpMount.id; // currently riding the wrong one

  character.glyphs.entries = [
    newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 1 }),
    newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 2 }),
    newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 3 }),
    newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 4 }),
    newMountGlyphEntry({ tier: 'major', statKey: 'health_pct', value: 5 }),
  ];

  character.relicLevels = { 'war-charm': 10, fatebreaker: 20, 'iron-heart': 10 };
  character.awakening = { path: 'radiant', points: 15 };

  character.talentSets[0].spec = 'arms';
  character.talentSets[0].allocation = { arms_t1_quick_strikes: 3, arms_t1_precision: 2 }; // 5 points to redistribute

  const preset = character.presets[0];
  preset.petId = hpPet.id; // currently the wrong pet
  return { character, preset, atkPet, hpPet, atkMount };
}

/** Write a candidate back onto a cloned character/preset as if the player applied every change. */
function applyCandidate(character, preset, candidate) {
  const c = structuredClone(character);
  const p = c.presets.find((x) => x.id === preset.id);
  p.loadout = candidate.preset.loadout;
  p.talentSet = candidate.preset.talentSet;
  p.petId = candidate.preset.petId;
  p.relicIds = [...candidate.preset.relicIds];
  p.sigilIds = [...candidate.preset.sigilIds];
  p.fortressBuffs = { ...candidate.preset.fortressBuffs };
  c.loadouts[candidate.preset.loadout].socketedStones = { ...candidate.socketedStones };
  c.talentSets[candidate.preset.talentSet] = { spec: candidate.talentSpec, allocation: { ...candidate.talentAllocation } };
  p.mountId = candidate.preset.mountId;
  // Mirrors rosterStore.applyOptimizerCandidate: the candidate's glyphs belong
  // to the mount it rides, not to the character.
  const ridden = c.mounts.entries.find((m) => m.id === p.mountId);
  if (ridden) ridden.glyphIds = [...candidate.glyphEquippedIds];
  c.awakening.path = candidate.awakeningPath;
  c.transcendence.unlockedPositions = [...candidate.transcendenceUnlocked];
  return { character: c, preset: p };
}

it('never returns a build worse than the current one, and finds the known upgrades', async () => {
  const { character, preset, atkPet, atkMount } = makeWarrior();
  const result = await opt.optimize({ character, preset });

  expect(result.best.score).toBeGreaterThanOrEqual(result.baseline.score);
  expect(result.improvementPct).toBeGreaterThan(0);

  const c = result.best.candidate;
  expect(c.preset.loadout).toBe(0); // the strictly better loadout
  expect(c.preset.petId).toBe(atkPet.id); // attack% pet beats HP pet
  expect(c.preset.mountId).toBe(atkMount.id); // attack mount beats tank mount
  expect(c.preset.fortressBuffs).toEqual(preset.fortressBuffs); // taken as set, never searched
  expect(c.awakeningPath).toBe('shadow'); // pure-offense path beats Radiant
  expect(c.preset.relicIds).toContain('war-charm');
  expect(c.preset.relicIds).toContain('fatebreaker');
  expect(result.transcendencePlan).toEqual([]); // no Ichor budget given
});

it('searchAwakening: false pins the current awakening path', async () => {
  const { character, preset } = makeWarrior();
  const result = await opt.optimize({ character, preset, searchAwakening: false });
  // Shadow would win (see above) - but the path is locked to what the player runs.
  expect(result.best.candidate.awakeningPath).toBe('radiant');
  expect(result.changes.find((c) => c.dimension === 'awakening')).toBeUndefined();
});

it('recommended configuration is legal on every dimension', async () => {
  const { character, preset } = makeWarrior();
  const result = await opt.optimize({ character, preset });
  const c = result.best.candidate;

  // Talents: legal tiers, within the full endgame budget. The saved set's 5
  // spent points do not cap the search - talent points are projected to
  // endgame exactly like awakening points.
  const tree = TALENT_TREES[c.talentSpec];
  expect(opt.isAllocationLegal(tree, c.talentAllocation, TALENT_TOTAL_POINTS)).toBe(true);

  // Relics: within cap, all from the class pool.
  expect(c.preset.relicIds.length).toBeLessThanOrEqual(PRESET_RELIC_CAP);
  const pool = RELICS_BY_CLASS.Warrior.map((d) => d.id);
  for (const id of c.preset.relicIds) expect(pool).toContain(id);

  // Glyphs: per-tier equip caps.
  for (const [tier, cap] of Object.entries(GLYPH_TIER_CAPS)) {
    const equippedInTier = character.glyphs.entries.filter(
      (e) => e.tier === tier && c.glyphEquippedIds.includes(e.id)
    ).length;
    expect(equippedInTier).toBeLessThanOrEqual(cap);
  }

  // Fortress: never touched by the search - exactly what the preset has.
  expect(c.preset.fortressBuffs).toEqual(preset.fortressBuffs);
});

// A tier must be allowed to stay part-filled.
it('the glyph pass leaves a slot empty rather than equipping a glyph that does not help', async () => {
  const { character, preset } = makeWarrior();
  const result = await opt.optimize({ character, preset });
  const equipped = result.best.candidate.glyphEquippedIds;
  const byId = Object.fromEntries(character.glyphs.entries.map((e) => [e.id, e]));

  // The only major in the pool is health_pct - worth nothing to a DPS goal, and
  // the major cap is 2. Filling the tier would put a no-op in the change list.
  const majors = equipped.filter((id) => byId[id].tier === 'major');
  expect(majors).toEqual([]);

  // Minors are all attack_pct and every one pays, so that tier still fills to
  // its cap - with the three strongest, not the first three found.
  const minorValues = equipped.filter((id) => byId[id].tier === 'minor').map((id) => byId[id].value);
  expect(minorValues.sort((a, b) => b - a)).toEqual([4, 3, 2]);
});

it('is idempotent: applying the recommendation and re-optimizing changes nothing', async () => {
  const { character, preset } = makeWarrior();
  const first = await opt.optimize({ character, preset });
  const applied = applyCandidate(character, preset, first.best.candidate);
  const second = await opt.optimize({ character: applied.character, preset: applied.preset });
  expect(second.changes).toEqual([]);
  expect(second.improvementPct).toBeCloseTo(0, 9);
});

it('rebuilds the board from empty, budgeted by refunded + extra Ichor, all unlocks chain-legal', async () => {
  const character = newCharacter('Test Sentinel');
  character.class = 'Sentinel';
  character.loadouts[0].gear.Weapon.attack = 100;
  character.talentSets[0].spec = 'marksmanship';
  character.talentSets[0].allocation = {};
  // A game-legal existing chain: the start node plus its upward neighbor.
  character.transcendence.unlockedPositions = ['14:25', '14:24'];
  const preset = character.presets[0];

  const tree = TRANSCENDENCE_TREES.Sentinel;
  const extra = 12;
  const totalBudget = totalIchorSpent(character.transcendence.unlockedPositions, tree) + extra;
  const result = await opt.optimize({ character, preset, ichorBudget: extra });

  expect(result.transcendencePlan.length).toBeGreaterThan(0);
  expect(result.ichorSpent).toBeLessThanOrEqual(totalBudget);
  expect(result.best.score).toBeGreaterThan(result.baseline.score);

  // Replay the plan FROM AN EMPTY BOARD (reset is free): every unlock must
  // be legal at the moment it happens (start-node-first + orthogonal
  // adjacency, via the same canUnlock the Transcendence screen uses), and
  // every cost must match the tiered table from count zero.
  const unlocked = [];
  let count = 0;
  for (const step of result.transcendencePlan) {
    expect(canUnlock(step.position, unlocked, tree)).toBe(true);
    const node = tree.nodes.find((n) => n.position === step.position);
    expect(step.cost).toBe(costForCount(count + 1, node.type === 'uncommon'));
    count += slotsForNode(node.type === 'uncommon');
    unlocked.push(step.position);
  }
  // The plan IS the rebuilt board.
  expect(unlocked).toEqual(result.best.candidate.transcendenceUnlocked);

  // Gain is credited to the node a buy was made FOR, never spread across the
  // corridor bought to reach it. A corridor row scores exactly 0, so no row
  // can claim DPS its node does not provide.
  for (const step of result.transcendencePlan) {
    expect(typeof step.corridor).toBe('boolean');
    if (step.corridor) expect(step.deltaScore).toBe(0);
    expect(step.deltaScore).toBeGreaterThanOrEqual(0);
  }
  expect(result.transcendencePlan.some((s) => s.deltaScore > 0)).toBe(true);
  // A stats-free node can only ever be a corridor step.
  for (const step of result.transcendencePlan) {
    if (step.statLine === 'no stats') expect(step.deltaScore).toBe(0);
  }
});

it('with zero extra Ichor, re-routes a defensive detour via the free reset', async () => {
  const character = newCharacter('Detour Sentinel');
  character.class = 'Sentinel';
  character.loadouts[0].gear.Weapon.attack = 100;
  character.talentSets[0].spec = 'marksmanship';
  character.talentSets[0].allocation = {};
  // 4 Ichor invested, but the third node (13:24, miss_chance) is pure
  // defense - re-routing that Ichor into any offense node beats it.
  character.transcendence.unlockedPositions = ['14:25', '14:24', '13:24'];
  const preset = character.presets[0];

  const result = await opt.optimize({ character, preset, ichorBudget: 0 });

  expect(result.best.score).toBeGreaterThan(result.baseline.score);
  expect(result.ichorSpent).toBeLessThanOrEqual(4); // never spends Ichor the player doesn't have
  const rebuilt = new Set(result.best.candidate.transcendenceUnlocked);
  expect(rebuilt.has('13:24')).toBe(false); // the detour is gone
});

it('from an empty tree, the plan starts at 14:25 and every unlock is chain-adjacent', async () => {
  const character = newCharacter('Fresh Sentinel');
  character.class = 'Sentinel';
  character.loadouts[0].gear.Weapon.attack = 100;
  character.talentSets[0].spec = 'marksmanship';
  const preset = character.presets[0];

  // Nothing unlocked: the only entry point is the start node (14:25), which
  // is pure health_pct - zero DPS on its own. The attack_pct node at 14:24
  // sits directly behind it, so the stepping-stone lookahead MUST buy the
  // pair rather than skipping the tree entirely.
  const result = await opt.optimize({ character, preset, ichorBudget: 30 });

  const tree = TRANSCENDENCE_TREES.Sentinel;
  expect(result.transcendencePlan.length).toBeGreaterThanOrEqual(2);
  expect(result.transcendencePlan[0].position).toBe(tree.startPosition);
  expect(result.transcendencePlan.map((s) => s.position)).toContain('14:24');
  expect(result.best.score).toBeGreaterThan(result.baseline.score);
  expect(result.ichorSpent).toBeLessThanOrEqual(30);

  // The whole plan must form a legally-unlockable chain from scratch.
  const unlocked = [];
  for (const step of result.transcendencePlan) {
    expect(canUnlock(step.position, unlocked, tree)).toBe(true);
    unlocked.push(step.position);
  }
});

it('searches talents from scratch: never switches the set slot, ignores saved allocations', async () => {
  const { character, preset } = makeWarrior();
  // Stuff Set B with a deliberately bad allocation in the other spec. If the
  // optimizer consulted saved sets it could switch to it.
  character.talentSets[1].spec = 'protection';
  character.talentSets[1].allocation = { protection_t1_fortitude: 3, protection_t1_thick_skin: 5 };

  const result = await opt.optimize({ character, preset });
  const c = result.best.candidate;

  // The set slot never changes - the recommendation is an allocation, not a set switch.
  expect(c.preset.talentSet).toBe(preset.talentSet);
  expect(result.changes.map((ch) => ch.dimension)).not.toContain('talentSet');

  // The budget is the full endgame allocation, NOT inferred from what the
  // saved sets happen to hold (5 in Set A, 8 in Set B). Talent points are
  // level-derived like awakening points, so the plan is the build to grow into.
  const spent = Object.values(c.talentAllocation).reduce((s, r) => s + r, 0);
  expect(spent).toBeGreaterThan(8);
  expect(spent).toBeLessThanOrEqual(TALENT_TOTAL_POINTS);
  expect(opt.isAllocationLegal(TALENT_TREES[c.talentSpec], c.talentAllocation, TALENT_TOTAL_POINTS)).toBe(true);

  // And it is still the BEST allocation, not Set B's saved protection build.
  expect(c.talentAllocation).not.toEqual(character.talentSets[1].allocation);
});

it('beats or matches a brute-force sweep of loadout x pet', async () => {
  const { character, preset } = makeWarrior();
  let bruteBest = -Infinity;
  for (let lo = 0; lo < 2; lo++) {
    for (const petId of [null, ...character.pets.map((p) => p.id)]) {
      const variant = { ...preset, loadout: lo, petId };
      bruteBest = Math.max(bruteBest, computeDps(computePresetTotals(character, variant)));
    }
  }
  const result = await opt.optimize({ character, preset });
  expect(result.best.score).toBeGreaterThanOrEqual(bruteBest);
});

it('is deterministic: two runs agree exactly', async () => {
  const { character, preset } = makeWarrior();
  const a = await opt.optimize({ character, preset });
  const b = await opt.optimize({ character, preset });
  expect(a.best.score).toBe(b.best.score);
  expect(a.changes).toEqual(b.changes);
  expect(a.best.candidate).toEqual(b.best.candidate);
});

it('never mutates the input character or preset', async () => {
  const { character, preset } = makeWarrior();
  const before = JSON.stringify({ character, preset });
  await opt.optimize({ character, preset, ichorBudget: 10 });
  expect(JSON.stringify({ character, preset })).toBe(before);
});

it('isAllocationLegal rejects points in locked tiers and over-budget totals', () => {
  const tree = TALENT_TREES.arms;
  // Tier 2 needs 5 points below it - 1 point straight into tier 2 is illegal.
  expect(opt.isAllocationLegal(tree, { arms_t2_brutality: 1 })).toBe(false);
  // 5 points in tier 1 unlocks tier 2.
  expect(opt.isAllocationLegal(tree, { arms_t1_sharpened_blade: 5, arms_t2_brutality: 1 })).toBe(true);
  // Over budget.
  expect(opt.isAllocationLegal(tree, { arms_t1_sharpened_blade: 5 }, 4)).toBe(false);
});

it('petLabel shows name + bonus stats and hides the core Attack/Health flats', () => {
  const character = newCharacter('X');
  character.class = 'Warrior';
  const pet = newPetEntry({ name: 'Fenrir', stats: { attack: 500, health: 400, attack_pct: 4, crit: 1.5 } });
  character.pets = [pet];

  const label = opt.petLabel(character, pet.id);
  expect(label).toContain('Fenrir');
  expect(label).toContain('(');       // bonus summary present
  expect(label).not.toContain('500'); // core flats hidden
  expect(label).not.toContain('400');
  expect(opt.petLabel(character, null)).toBe('No pet');
});

it('sockets a strictly better inventory stone', async () => {
  const { character, preset } = makeWarrior();
  const weak = newStoneEntry({ type: 'crimson', stats: { attack_pct: 1 } });
  const strong = newStoneEntry({ type: 'crimson', stats: { attack_pct: 8 } });
  character.stoneInventory = [weak, strong];
  character.loadouts[0].socketedStones.Weapon = weak.id;

  const result = await opt.optimize({ character, preset });

  expect(Object.values(result.best.candidate.socketedStones)).toContain(strong.id);
  expect(result.best.score).toBeGreaterThan(result.baseline.score);
  const stoneChange = result.changes.find((ch) => ch.dimension === 'stones');
  expect(stoneChange).toBeTruthy();
  // The weak stone still has positive value, so it stays exactly where the
  // player socketed it; the strong stone goes into a free slot instead.
  expect(result.best.candidate.socketedStones.Weapon).toBe(weak.id);
  expect(stoneChange.detail.some((line) => line.includes('Weapon'))).toBe(false);
});

it('keeps kept stones in their current slots instead of shuffling them around', async () => {
  const { character, preset } = makeWarrior();
  const a = newStoneEntry({ type: 'crimson', stats: { attack_pct: 5 } });
  const b = newStoneEntry({ type: 'crimson', stats: { attack_pct: 3 } });
  const extra = newStoneEntry({ type: 'crimson', stats: { attack_pct: 8 } });
  character.stoneInventory = [a, b, extra];
  // Deliberately socketed in NON-first slots: the old greedy pass refilled
  // slots in SLOTS order from empty, which reassigned kept stones to new
  // slots and produced pointless "move stone from A to B" instructions.
  character.loadouts[0].socketedStones.Chest = a.id;
  character.loadouts[0].socketedStones.Boots = b.id;

  const result = await opt.optimize({ character, preset });

  const stones = result.best.candidate.socketedStones;
  expect(stones.Chest).toBe(a.id);
  expect(stones.Boots).toBe(b.id);
  expect(Object.values(stones)).toContain(extra.id);
  // No recommended change may touch a slot whose stone is being kept - the
  // only instruction should be socketing the new stone into a free slot.
  const stoneChange = result.changes.find((ch) => ch.dimension === 'stones');
  expect(stoneChange).toBeTruthy();
  expect(stoneChange.detail).toHaveLength(1);
  expect(stoneChange.detail[0]).toContain('socket');
});

it('already-optimal sockets produce no stones change', async () => {
  const { character, preset } = makeWarrior();
  const stone = newStoneEntry({ type: 'crimson', stats: { attack_pct: 8 } });
  character.stoneInventory = [stone];
  character.loadouts[0].socketedStones.Weapon = stone.id;

  const result = await opt.optimize({ character, preset });
  expect(result.changes.map((ch) => ch.dimension)).not.toContain('stones');
});

it('alignStonesToCurrentSlots keeps current placements and fills new stones into free slots', () => {
  const current = { Chest: 's1', Boots: 's2', Weapon: 's3' };
  // s3 dropped from the selection, s4 added: s1/s2 must not move, s4 takes
  // the first free slot in SLOTS order.
  const aligned = opt.alignStonesToCurrentSlots(['s1', 's2', 's4'], current);
  expect(aligned.Chest).toBe('s1');
  expect(aligned.Boots).toBe('s2');
  const firstFreeSlot = SLOTS.find((slot) => slot !== 'Chest' && slot !== 'Boots');
  expect(aligned[firstFreeSlot]).toBe('s4');
  expect(Object.values(aligned).sort()).toEqual(['s1', 's2', 's4']);
});

it('never recommends the same stone in two slots', async () => {
  const { character, preset } = makeWarrior();
  const stoneA = newStoneEntry({ type: 'crimson', stats: { attack_pct: 8 } });
  const stoneB = newStoneEntry({ type: 'crimson', stats: { attack_pct: 6 } });
  character.stoneInventory = [stoneA, stoneB];

  const result = await opt.optimize({ character, preset });
  const used = Object.values(result.best.candidate.socketedStones).filter(Boolean);
  expect(new Set(used).size).toBe(used.length);
});

it('reports a pet change even when two pets share a label', async () => {
  const { character, preset } = makeWarrior();
  const weakTwin = newPetEntry({ name: 'Twin', stats: { attack: 500, attack_pct: 5 } });
  const strongTwin = newPetEntry({ name: 'Twin', stats: { attack: 2000, attack_pct: 5 } });
  character.pets = [weakTwin, strongTwin];
  preset.petId = weakTwin.id;

  const result = await opt.optimize({ character, preset });
  const petChange = result.changes.find((ch) => ch.dimension === 'pet');
  expect(petChange).toBeTruthy();
  expect(petChange.from).not.toBe(petChange.to);
});

it('equips a sigil with entered activation damage and reports the change', async () => {
  const { character, preset } = makeWarrior();
  character.sigilValues = { 'blade-of-judgment': { passive: {}, active: {}, damage: 1000, tickDamage: 0 } };

  const result = await opt.optimize({ character, preset });

  expect(result.best.candidate.preset.sigilIds).toContain('blade-of-judgment');
  const change = result.changes.find((ch) => ch.dimension === 'sigils');
  expect(change).toBeTruthy();
  expect(change.from).toBe('None');
  expect(change.to).toContain('Blade of Judgment');
  expect(change.detail).toContain('Equip Blade of Judgment');
});

it('never exceeds the sigil cap and never recommends an all-zero sigil', async () => {
  const { character, preset } = makeWarrior();
  character.sigilValues = {
    'blade-of-judgment': { passive: {}, active: {}, damage: 1000, tickDamage: 0 },
    cataclysm: { passive: {}, active: {}, damage: 900, tickDamage: 0 },
    hemorrhage: { passive: {}, active: {}, damage: 300, tickDamage: 100 },
    'withering-touch': { passive: {}, active: {}, damage: 800, tickDamage: 0 },
    'defense-stance': { passive: { attack: 0, health: 0, health_pct: 0 }, active: {}, damage: 0, tickDamage: 0 },
  };

  const result = await opt.optimize({ character, preset });
  const sigilIds = result.best.candidate.preset.sigilIds;

  expect(sigilIds.length).toBeLessThanOrEqual(PRESET_SIGIL_CAP);
  expect(sigilIds).not.toContain('defense-stance'); // all-zero: filtered from the pool
  // With 4 real damage sigils competing for 3 slots, the weakest one loses.
  expect(sigilIds).toContain('blade-of-judgment');
});

it('picks up a passive-only sigil through Calculated totals', async () => {
  const { character, preset } = makeWarrior();
  // Needs a level: attack_pct is baked per level now, so the entered number is
  // ignored and level 0 ("not owned") contributes nothing - the same rule the
  // derived Attack/Health already followed.
  character.sigilValues = { 'berserkt-stance': { level: 5, passive: { attack_pct: 12 }, active: {}, damage: 0, tickDamage: 0 } };

  const result = await opt.optimize({ character, preset });
  expect(result.best.candidate.preset.sigilIds).toContain('berserkt-stance');
});

it('sigilAwareDpsObjective reduces exactly to expectedDpsObjective without sigil data', () => {
  const { character, preset } = makeWarrior();
  const candidate = opt.candidateFromCurrent(character, preset);
  const { candidateCharacter, candidatePreset } = opt.materializeCandidate(character, candidate);
  expect(opt.sigilAwareDpsObjective(candidateCharacter, candidatePreset)).toBe(
    opt.expectedDpsObjective(candidateCharacter, candidatePreset)
  );
});

it('sigilAwareDpsObjective mixes a timed attack buff by uptime (exact closed form)', () => {
  const { character, preset } = makeWarrior();
  // Warborn Fury buffs Attack% for 5s of every 15s = 1/3 uptime. The buff's
  // size is baked per level now (level 1 = +12%), so the objective should be
  // the unbuffed DPS 2/3 of the time and the buffed DPS 1/3 of the time.
  character.sigilValues = { 'warborn-fury': { level: 1, passive: {}, active: {}, damage: 0, tickDamage: 0 } };
  preset.sigilIds = ['warborn-fury'];
  const totals = computePresetTotals(character, preset);
  const base = computeDps(totals);
  // SETTLED 2026-07-28: the buff's Attack % is ADDITIVE into the build's own
  // Attack % total, so the buffed Attack is a decompose -> add -> recombine,
  // NOT totals.attack * 1.12. (This test previously asserted the multiplicative
  // model, which is how audit F3 stayed hidden.) See dps.js buffedAttack.
  const buffed = computeDps({ ...totals, attack: buffedAttack(totals.attack, totals.attack_pct, 0, 12) });
  expect(opt.sigilAwareDpsObjective(character, preset)).toBeCloseTo(base + (5 / 15) * (buffed - base), 9);
});

it('sigilAwareDpsFromTotals boosts only the flat sigil-spell side by Spell Damage', () => {
  const { character, preset } = makeWarrior();
  character.sigilValues = { 'blade-of-judgment': { passive: {}, active: {}, damage: 600, tickDamage: 0 } };
  preset.sigilIds = ['blade-of-judgment'];
  const totals = computePresetTotals(character, preset);
  const base = opt.sigilAwareDpsFromTotals(totals, character, preset);
  // +100% Spell Damage adds exactly one extra copy of the sigil flat DPS -
  // the swing side (computeDps) doesn't read spell_damage at all.
  const boosted = opt.sigilAwareDpsFromTotals({ ...totals, spell_damage: 100 }, character, preset);
  const { flatDps } = expectedSigilActiveDps(character, preset);
  expect(flatDps).toBeGreaterThan(0);
  expect(boosted - base).toBeCloseTo(flatDps, 9);
});

it('the Monte Carlo objective rebuilds sigil effects per candidate', () => {
  const { character, preset } = makeWarrior();
  character.sigilValues = { 'blade-of-judgment': { passive: {}, active: {}, damage: 1000, tickDamage: 0 } };
  const objective = opt.createMonteCarloObjective({ iterations: 50 });

  const bare = opt.candidateFromCurrent(character, preset);
  const withSigil = opt.candidateFromCurrent(character, preset);
  withSigil.preset.sigilIds = ['blade-of-judgment'];

  const scoreOf = (candidate) => {
    const { candidateCharacter, candidatePreset } = opt.materializeCandidate(character, candidate);
    return objective(candidateCharacter, candidatePreset);
  };
  // Same seed, same stats - the only difference is the sigil's nuke damage.
  expect(scoreOf(withSigil)).toBeGreaterThan(scoreOf(bare));
});

it('diffCandidate reports only genuinely changed dimensions', async () => {
  const { character, preset } = makeWarrior();
  const unchanged = opt.candidateFromCurrent(character, preset);
  expect(opt.diffCandidate(character, preset, unchanged)).toEqual([]);

  const result = await opt.optimize({ character, preset });
  const dims = result.changes.map((ch) => ch.dimension);
  expect(dims).toContain('pet');
  expect(dims).toContain('mount');
  expect(new Set(dims).size).toBe(dims.length); // one item per dimension
});

it('searchDimensions locks a dimension while the others still improve', async () => {
  const { character, preset, hpPet, atkMount } = makeWarrior();
  const result = await opt.optimize({ character, preset, searchDimensions: { pets: false } });
  // The attack pet would win (see the first test) - but pets are locked.
  expect(result.best.candidate.preset.petId).toBe(hpPet.id);
  expect(result.changes.find((c) => c.dimension === 'pet')).toBeUndefined();
  // Unlocked dimensions still get searched.
  expect(result.best.candidate.preset.mountId).toBe(atkMount.id);
});

it('an AbortSignal stops the search and returns best-so-far with aborted: true', async () => {
  const { character, preset } = makeWarrior();
  const controller = new AbortController();
  let reports = 0;
  const result = await opt.optimize({
    character,
    preset,
    signal: controller.signal,
    onProgress: () => {
      reports += 1;
      if (reports === 3) controller.abort();
    },
  });
  expect(result.aborted).toBe(true);
  expect(result.best.score).toBeGreaterThanOrEqual(result.baseline.score);
});

it('aborting before the baseline eval rejects instead of returning garbage', async () => {
  const { character, preset } = makeWarrior();
  const controller = new AbortController();
  controller.abort();
  await expect(opt.optimize({ character, preset, signal: controller.signal })).rejects.toThrow(/aborted/i);
});

it('two-stage scoring: the screen ranks, but the expensive objective gates adoption', async () => {
  const { character, preset, atkPet, hpPet, atkMount } = makeWarrior();
  // Screen = plain DPS (prefers the attack pet). Confirm = DPS minus a huge
  // penalty for the attack pet - so every screen-approved pet challenger
  // must be REJECTED at confirmation, while other dimensions sail through.
  const confirm = (c, p) => opt.expectedDpsObjective(c, p) - (p.petId === atkPet.id ? 1e9 : 0);
  const result = await opt.optimize({
    character,
    preset,
    objective: confirm,
    screenObjective: opt.expectedDpsObjective,
  });
  expect(result.best.candidate.preset.petId).toBe(hpPet.id); // challenger rejected
  expect(result.best.candidate.preset.mountId).toBe(atkMount.id); // confirmed upgrade adopted
  // Reported scores are in confirm units (no penalty applied to the winner).
  expect(result.best.score).toBeGreaterThanOrEqual(result.baseline.score);
  expect(result.best.score).toBeLessThan(1e8);
});

it('cheapestUnlockPaths prices corridors node-by-node and stays chain-legal', () => {
  const tree = TRANSCENDENCE_TREES.Warrior;
  const paths = opt.cheapestUnlockPaths(tree, [], 0);
  expect(paths.size).toBeGreaterThan(1); // sees past the start node
  for (const { nodes, cost } of paths.values()) {
    // Chain-legal: each node is unlockable given the path prefix.
    const prefix = [];
    let expected = 0;
    let slots = 0;
    for (let i = 0; i < nodes.length; i++) {
      expect(canUnlock(nodes[i].position, prefix, tree)).toBe(true);
      expected += costForCount(slots + 1, nodes[i].type === 'uncommon');
      slots += slotsForNode(nodes[i].type === 'uncommon');
      prefix.push(nodes[i].position);
    }
    expect(cost).toBe(expected);
  }
  // Depth beyond one stepping stone is reachable (the old lookahead's limit).
  expect([...paths.values()].some(({ nodes }) => nodes.length > 2)).toBe(true);
});

it('verifyDpsOutcome re-simulates before/after on one shared fresh seed', async () => {
  const { character, preset } = makeWarrior();
  const result = await opt.optimize({ character, preset });
  const verify = opt.verifyDpsOutcome({
    character,
    preset,
    candidate: result.best.candidate,
    iterations: 300,
  });
  expect(verify.before.seed).toBe(verify.after.seed);
  expect(verify.before.iterations).toBe(300);
  // The recommended build strictly dominates the baseline in this fixture.
  expect(verify.after.meanDps).toBeGreaterThan(verify.before.meanDps);
});

it('returns runner-up builds: distinct from the winner, sorted, scored on the same objective', async () => {
  const { character, preset } = makeWarrior();
  const result = await opt.optimize({ character, preset });

  expect(Array.isArray(result.topCandidates)).toBe(true);
  expect(result.topCandidates.length).toBeGreaterThan(0);
  expect(result.topCandidates.length).toBeLessThanOrEqual(4);
  const winnerKey = JSON.stringify(result.best.candidate);
  for (let i = 0; i < result.topCandidates.length; i++) {
    const alt = result.topCandidates[i];
    expect(alt.score).toBeLessThanOrEqual(result.best.score);
    if (i > 0) expect(alt.score).toBeLessThanOrEqual(result.topCandidates[i - 1].score);
    expect(JSON.stringify(alt.candidate)).not.toBe(winnerKey);
    expect(Array.isArray(alt.changes)).toBe(true);
    expect(typeof alt.improvementPct).toBe('number');
  }
});

it('attributes each change: solo gain is positive-ish and reverting it alone re-scores lower', async () => {
  const { character, preset } = makeWarrior();
  const result = await opt.optimize({ character, preset });

  expect(result.changes.length).toBeGreaterThan(0);
  for (const ch of result.changes) {
    // Every diffed dimension has a reverter, so solo is always attached.
    expect(typeof ch.solo).toBe('number');
    // Reverting a recommended change can never make the build better than
    // the winner (the search already explored that neighborhood).
    expect(ch.solo).toBeGreaterThanOrEqual(-1e-9);
  }
  // The pet swap was a known strict upgrade - its solo contribution is real.
  const petChange = result.changes.find((ch) => ch.dimension === 'pet');
  expect(petChange.solo).toBeGreaterThan(0);
});

// --- Enumeration size and cost estimation ---

it('subsetsUpTo returns every subset up to the cap, empty set first, with no duplicates', () => {
  const s = opt.subsetsUpTo(['a', 'b', 'c'], 2);
  expect(s[0]).toEqual([]);
  expect(s.length).toBe(1 + 3 + 3); // C(3,0)+C(3,1)+C(3,2)
  expect(s.every((x) => x.length <= 2)).toBe(true);
  expect(new Set(s.map((x) => x.slice().sort().join(','))).size).toBe(s.length);
  // An empty pool still yields the empty subset ("equip nothing" is an option).
  expect(opt.subsetsUpTo([], 4)).toEqual([[]]);
});

it('subsetsUpTo survives a pool large enough to break an argument-spread accumulator', () => {
  const pool = Array.from({ length: 40 }, (_, i) => `r${i}`);
  const s = opt.subsetsUpTo(pool, 4);
  expect(s.length).toBe(1 + 40 + 780 + 9880 + 91390);
});

it('estimateSearchCost counts the enumerated dimensions without running the search', () => {
  const { character, preset } = makeWarrior();
  const est = opt.estimateSearchCost({ character, preset, maxPasses: 5 });
  // The fixture levels three relics; only level > 0 relics enter the pool.
  expect(est.relicPoolSize).toBe(3);
  expect(est.relicSubsets).toBe(opt.subsetsUpTo(['a', 'b', 'c'], PRESET_RELIC_CAP).length);
  expect(est.worstCaseEvals).toBe(est.perPass * 5);
  // Locking a dimension removes its contribution entirely.
  const locked = opt.estimateSearchCost({ character, preset, searchDimensions: { relics: false, sigils: false } });
  expect(locked.relicSubsets).toBe(0);
  expect(locked.sigilSubsets).toBe(0);
  expect(locked.perPass).toBeLessThan(est.perPass);
});

it('estimateSearchCost grows combinatorially in the relic pool - the cliff it exists to warn about', () => {
  const { character, preset } = makeWarrior();
  const big = { ...character, relicLevels: Object.fromEntries(RELICS_BY_CLASS.Warrior.map((d) => [d.id, 10])) };
  const est = opt.estimateSearchCost({ character: big, preset });
  const small = opt.estimateSearchCost({ character, preset });
  expect(est.relicPoolSize).toBe(RELICS_BY_CLASS.Warrior.length);
  expect(est.relicSubsets).toBeGreaterThan(small.relicSubsets * 10);
});
