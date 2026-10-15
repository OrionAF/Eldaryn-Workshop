// build/fixtures.js (C1a): one fully populated character per class, built through normaliseCharacter
// so the shape is always a valid v2 Character. Shared by the build tests and by later slices' tests
// (swap, search, duel) that need a realistic character. Deterministic: no ids from Date or random.
import { normaliseCharacter } from '../model/index.js';
import { sanitiseAllocation } from '../model/talents.js';
import { talentSpec } from '../game/talents.js';
import { available } from '../game/classes.js';
import { relicsForClass } from '../game/relics.js';
import { majorGlyphForSigil } from '../game/mountsGlyphs.js';
import { boardKeyFor, boardGraph } from '../transcendence.js';
import { sigilBySpecies } from '../game/sigils.js';
import { isFormSigil } from '../model/sigils.js';

/** Default spec per class for the golden fixtures (Mystic is a Druid so the Form path is covered). */
export const FIXTURE_SPECS = {
  WARRIOR: 'WARRIOR_DPS',
  SENTINEL: 'SENTINEL_MARKSMANSHIP',
  MYSTIC: 'MYSTIC_DRUID',
  NECROMANCER: 'NECROMANCER_DEATHLORD',
};
const OTHER_SPEC = {
  WARRIOR: 'WARRIOR_TANK',
  SENTINEL: 'SENTINEL_DISRUPTION',
  MYSTIC: 'MYSTIC_MAGE',
  NECROMANCER: 'NECROMANCER_DOOMWEAVER',
};

// Sigil loadouts per spec: generic picks, utility (Summon/Shield/Form) and Ancient.
const SIGILS = {
  WARRIOR_DPS: { generic: ['BERSERK_STANCE', 'WARBORN_FURY', 'CATACLYSM'], utility: null, ancient: 'FLAMEBORN' },
  WARRIOR_TANK: { generic: ['DEFENSE_STANCE', 'IRON_BASTION', 'REJUVENATION'], utility: null, ancient: 'EARTHWARDEN' },
  SENTINEL_MARKSMANSHIP: { generic: ['HAWK_FOCUS', 'CRIMSON_ARROW', 'SANGUINE_RUSH'], utility: null, ancient: 'STORMCALLER' },
  SENTINEL_DISRUPTION: { generic: ['MIST_VEIL', 'PHANTOM_VEIL', 'VENOM_WOUND'], utility: null, ancient: 'FLAMEBORN' },
  MYSTIC_DRUID: { generic: ['ARCANE_EMPOWERMENT', 'PRIMAL_AWAKENING', 'ARCANE_SURGE'], utility: 'DIRE_URSINE', ancient: null },
  MYSTIC_MAGE: { generic: ['ARCANE_EMPOWERMENT', 'ARCANE_SHARD', 'ARCANE_BURST'], utility: 'ARCANE_BARRIER', ancient: null },
  NECROMANCER_DEATHLORD: { generic: ['SOUL_CONDUIT', 'GRAVEBORN_VIGOR', 'RAVENOUS_FRENZY'], utility: 'BONE_SERVANT', ancient: null },
  NECROMANCER_DOOMWEAVER: { generic: ['WITHERING_HEX', 'GRAVEBORN_VIGOR', 'GRAVE_ROT'], utility: 'REAPERS_CALL', ancient: null },
};

const SLOTS = ['WEAPON', 'OFFHAND', 'HEAD', 'SHOULDERS', 'CHEST', 'LEGGINGS', 'BOOTS', 'RING', 'TRINKET'];
const ROLL_POOL = [
  ['ATTACK_PERCENT', 8], ['CRIT_CHANCE', 6], ['CRIT_DAMAGE', 0.12], ['ATTACK_SPEED', 0.06], ['DOUBLE_HIT', 5],
  ['HEALTH_PERCENT', 9], ['LIFESTEAL', 4], ['PENETRATION', 5], ['SPELL_DAMAGE', 7], ['HP_REGEN', 2],
  ['DAMAGE_REDUCTION', 3], ['BLOCK_CHANCE', 4], ['MISS_CHANCE', 4], ['SPELL_CRIT_CHANCE', 4], ['MINION_ATTACK', 6],
];

// A deterministic 3-secondary item for slot i, using only stats the class can roll.
function makeItem(cls, i, scale = 1, withConduit = false) {
  const pool = ROLL_POOL.filter(([t]) => available(t, cls));
  const secondaryStats = [0, 1, 2].map((k) => {
    const [type, value] = pool[(i * 3 + k) % pool.length];
    return { type, value: Number((value * scale).toFixed(2)) };
  });
  const weapon = i < 2;
  return {
    rarity: 'ETERNAL',
    itemLevel: 200,
    quality: 80,
    primaryStats: weapon ? { attack: 4200 * scale, hp: 0 } : { attack: 900 * scale, hp: 21000 * scale },
    secondaryStats,
    conduit: withConduit ? { type: ['FLAME', 'EARTHEN', 'DARK'][i % 3], value: 40 * scale } : null,
  };
}

function makeEquip(cls, scale, conduits) {
  const items = {};
  SLOTS.forEach((slot, i) => {
    items[slot] = makeItem(cls, i, scale, conduits.includes(slot));
  });
  return items;
}

// 10 nodes reachable from the core, in a fixed order (breadth first over the board graph).
function transcendenceNodes(cls) {
  const g = boardGraph(boardKeyFor(cls, null));
  const out = [];
  const seen = new Set([g.coreId]);
  const queue = [g.coreId];
  while (queue.length && out.length < 10) {
    const id = queue.shift();
    for (const n of [...(g.neighbors.get(id) ?? [])].sort()) {
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
      queue.push(n);
    }
  }
  return out;
}

// Core-to-node path (inclusive of the node, without the core) so an Ancient's sigil node is allocated
// and connected; the strict Ancient rule (plan Q3) ignores an Ancient whose node is missing.
function pathToNode(cls, nodeId) {
  const g = boardGraph(boardKeyFor(cls, null));
  const prev = new Map([[g.coreId, null]]);
  const queue = [g.coreId];
  while (queue.length && !prev.has(nodeId)) {
    const id = queue.shift();
    for (const n of [...(g.neighbors.get(id) ?? [])].sort()) {
      if (prev.has(n)) continue;
      prev.set(n, id);
      queue.push(n);
    }
  }
  const out = [];
  for (let id = prev.has(nodeId) ? nodeId : null; id && id !== g.coreId; id = prev.get(id)) out.unshift(id);
  return out;
}

function fullAllocation(specKey) {
  const all = {};
  for (const tier of talentSpec(specKey).tiers) for (const t of tier.talents) all[t.id] = t.maxRank;
  return sanitiseAllocation(all, specKey);
}

/**
 * A fully populated character of `cls`. `opts.spec` picks the active spec (default FIXTURE_SPECS[cls]);
 * the other talent set holds the class's other spec. Preset 1 uses gear set 1 / talent set 0 with a pet,
 * a mount, three relics and sigils; preset 2 uses gear set 2 / talent set 1 with fewer pieces.
 */
export function fixtureCharacter(cls, { spec = FIXTURE_SPECS[cls] } = {}) {
  const other = OTHER_SPEC[cls] === spec ? FIXTURE_SPECS[cls] : OTHER_SPEC[cls];
  const loadout = SIGILS[spec];
  const alt = SIGILS[other];
  const owned = {};
  for (const sp of [...loadout.generic, loadout.utility, loadout.ancient, ...alt.generic, alt.utility, alt.ancient]) {
    if (sp) owned[sp] = { level: sp === loadout.ancient || sp === alt.ancient || isFormSigil(sp) ? 1 : 12 };
  }
  const relicIds = relicsForClass(cls).slice(0, 3).map((r) => r.id);
  const relics = Object.fromEntries(relicsForClass(cls).slice(0, 5).map((r, i) => [r.id, 3 + i]));

  const petTypes = [['ATTACK_PERCENT', 12.5], ['CRIT_DAMAGE', 20], ['ATTACK_SPEED', 8]].filter(([t]) => available(t, cls));
  const nodes = [...transcendenceNodes(cls)];
  for (const anc of [loadout.ancient, alt.ancient]) {
    const node = anc ? sigilBySpecies(anc)?.transcendenceNode : null;
    if (node) for (const id of pathToNode(cls, node)) if (!nodes.includes(id)) nodes.push(id);
  }
  const major = loadout.generic.map((s) => majorGlyphForSigil(s)).find((g) => g && g.playerClass.toUpperCase() === cls);
  const mountSpecies = 'NIGHT_WOLF';

  const raw = {
    id: `fixture-${cls.toLowerCase()}`,
    name: `Fixture ${cls}`,
    class: cls,
    level: 100,
    talentSets: [
      { spec, allocation: fullAllocation(spec) },
      { spec: other, allocation: fullAllocation(other) },
    ],
    equipment: {
      set1: {
        items: makeEquip(cls, 1, ['WEAPON', 'HEAD', 'RING']),
        enchantSlots: { WEAPON: 'st-atk', HEAD: 'st-def', CHEST: 'st-atk2' },
      },
      set2: { items: makeEquip(cls, 0.8, []), enchantSlots: { WEAPON: 'st-atk' } },
      oblivion: {
        items: { ...makeEquip(cls, 1.3, ['WEAPON']), BELT: makeItem(cls, 9, 1.3), GLOVES: makeItem(cls, 10, 1.3), RIFT_CORE: makeItem(cls, 11, 1.3) },
        enchantSlots: { WEAPON: 'ob-1' },
      },
    },
    enchantStones: [
      { id: 'st-atk', type: 'PVE_ATTACK', quality: 70, amplifyLevel: 4, stats: [{ type: 'CRIT_DAMAGE', value: 0.1 }, { type: 'ATTACK_SPEED', value: 0.05 }] },
      { id: 'st-def', type: 'PVE_DEFENSE', quality: 60, amplifyLevel: 2, stats: [{ type: 'HEALTH_PERCENT', value: 6 }, { type: 'DAMAGE_REDUCTION', value: 2 }] },
      { id: 'st-atk2', type: 'PVE_ATTACK', quality: 50, amplifyLevel: 0, stats: [{ type: 'DOUBLE_HIT', value: 4 }, { type: 'LIFESTEAL', value: 3 }] },
    ],
    oblivionEnchantStones: [{ id: 'ob-1', type: 'OBLIVION', quality: 80, amplifyLevel: 0, oblivionLevel: 3, stats: [] }],
    pets: {
      altar: { level: 30, tier: 2 },
      owned: [{ id: 'pet-a', species: 'INFERNAL_DRAKE', rarity: 'Legendary', secondaries: petTypes.map(([type, value]) => ({ type, value })) }],
    },
    mounts: [{
      id: 'mount-a', species: mountSpecies, level: 3, baseHp: 7, baseAtk: 7,
      glyphs: { minor: ['gl-1', 'gl-2', null], major: major ? ['gl-3', null] : [null, null], mythic: [null] },
    }],
    glyphs: [
      { id: 'gl-1', glyphType: 'g-swift', rarity: 'Common', secondary: { stat: 'critChance', quality: 0.5 } },
      { id: 'gl-2', glyphType: 'g-keen', rarity: 'Uncommon', secondary: { stat: 'attackPercent', quality: 0.75 } },
      ...(major ? [{ id: 'gl-3', glyphType: major.id, rarity: 'Rare', secondary: null }] : []),
    ],
    sigils: { altarTier: 2, owned },
    relics,
    awakening: { path: 'SHADOW', level: 10 },
    transcendence: { presets: [{ id: 'default', name: 'Default', allocatedNodeIds: nodes }], activePresetId: 'default' },
    fortress: { owned: ['TOP', 'CORE'] },
    oblivion: { unlocked: true, level: 20, activeRealm: 'base', sheet: null },
    presets: [
      {
        id: 'p1', name: 'Main', equipmentSet: 1, talentSet: 0, petId: 'pet-a', mountId: 'mount-a', relicIds,
        sigilSpecies: loadout.generic, utilitySigilSpecies: loadout.utility, ancientSigilSpecies: loadout.ancient,
        transcendencePresetId: 'default', sheet: null,
      },
      {
        id: 'p2', name: 'Alt', equipmentSet: 2, talentSet: 1, petId: null, mountId: null, relicIds: [],
        sigilSpecies: alt.generic.slice(0, 2), utilitySigilSpecies: alt.utility, ancientSigilSpecies: alt.ancient,
        transcendencePresetId: null, sheet: null,
      },
    ],
    activePresetId: 'p1',
  };
  return normaliseCharacter(raw);
}
