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
import { computeDps } from './dps.js';
import { newCharacter, newPetEntry, newMountEntry, newMountGlyphEntry, newStoneEntry } from './model.js';
import { TALENT_TREES } from './talentTreeData.js';
import { PRESET_RELIC_CAP, PRESET_SIGIL_CAP, SOURCE_DEFS } from './constants.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { canUnlock, costForCount, totalIchorSpent } from './transcendence.js';

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

  const atkMount = newMountEntry({ name: 'War Mount', baseAtkPct: 5 });
  const hpMount = newMountEntry({ name: 'Tank Mount', baseHpPct: 5 });
  character.mounts.entries = [atkMount, hpMount];
  character.mounts.activeId = hpMount.id; // currently riding the wrong one

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
  c.mounts.activeId = candidate.mountActiveId;
  for (const e of c.glyphs.entries) e.equipped = candidate.glyphEquippedIds.includes(e.id);
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
  expect(c.mountActiveId).toBe(atkMount.id); // attack mount beats tank mount
  expect(c.preset.fortressBuffs).toEqual(preset.fortressBuffs); // taken as set, never searched
  expect(c.awakeningPath).toBe('shadow'); // pure-offense path beats Radiant
  expect(c.preset.relicIds).toContain('war-charm');
  expect(c.preset.relicIds).toContain('fatebreaker');
  expect(result.transcendencePlan).toEqual([]); // no Ichor budget given
});

it('recommended configuration is legal on every dimension', async () => {
  const { character, preset } = makeWarrior();
  const result = await opt.optimize({ character, preset });
  const c = result.best.candidate;

  // Talents: legal tiers, within the 5 points the player actually has.
  const tree = TALENT_TREES[c.talentSpec];
  expect(opt.isAllocationLegal(tree, c.talentAllocation, 5)).toBe(true);

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
    count += 1;
    expect(step.cost).toBe(costForCount(count, node.type === 'uncommon'));
    unlocked.push(step.position);
  }
  // The plan IS the rebuilt board.
  expect(unlocked).toEqual(result.best.candidate.transcendenceUnlocked);
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
  // Stuff Set B with a bigger, deliberately bad allocation (all defense-ish
  // speed talents would be fine; use protection spec entirely). If the
  // optimizer consulted saved sets it could switch to it; if it derives the
  // budget from owned points, Set B's 8 points raise the budget to 8.
  character.talentSets[1].spec = 'protection';
  character.talentSets[1].allocation = { protection_t1_fortitude: 3, protection_t1_thick_skin: 5 };

  const result = await opt.optimize({ character, preset });
  const c = result.best.candidate;

  // The set slot never changes - the recommendation is an allocation, not a set switch.
  expect(c.preset.talentSet).toBe(preset.talentSet);
  expect(result.changes.map((ch) => ch.dimension)).not.toContain('talentSet');

  // Budget = most points owned across sets (8 via Set B), spent on the BEST
  // spec/allocation - not Set B's saved protection build.
  const spent = Object.values(c.talentAllocation).reduce((s, r) => s + r, 0);
  expect(spent).toBeLessThanOrEqual(8);
  expect(opt.isAllocationLegal(TALENT_TREES[c.talentSpec], c.talentAllocation, 8)).toBe(true);
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
  expect(stoneChange.detail.some((line) => line.includes('Weapon'))).toBe(true);
});

it('already-optimal sockets produce no stones change', async () => {
  const { character, preset } = makeWarrior();
  const stone = newStoneEntry({ type: 'crimson', stats: { attack_pct: 8 } });
  character.stoneInventory = [stone];
  character.loadouts[0].socketedStones.Weapon = stone.id;

  const result = await opt.optimize({ character, preset });
  expect(result.changes.map((ch) => ch.dimension)).not.toContain('stones');
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
  character.sigilValues = { 'berserkt-stance': { passive: { attack_pct: 12 }, active: {}, damage: 0, tickDamage: 0 } };

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
  // +100% attack for 5s of every 15s doubles swing DPS at 1/3 uptime -> 4/3 base.
  character.sigilValues = { 'warborn-fury': { passive: {}, active: { attack_pct: 100 }, damage: 0, tickDamage: 0 } };
  preset.sigilIds = ['warborn-fury'];
  const base = computeDps(computePresetTotals(character, preset));
  expect(opt.sigilAwareDpsObjective(character, preset)).toBeCloseTo(base * (1 + (5 / 15)), 9);
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
