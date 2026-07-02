/**
 * model.js - the typed data model + factories for the optimiser.
 *
 * Roster      = { characters: Character[], currentId, drop: DropState | null }
 * Character   = { id, name, class: 'Warrior'|'Sentinel'|null, loadouts: [Loadout, Loadout],
 *                 sources: SourceState, awakening: { path: 'shadow'|'radiant'|null, points: number } }
 * Loadout     = { name, profileTotals: OffensiveStats, manualTotals: bool,
 *                 gear: Record<Slot, OffensiveStats>,
 *                 stones: Record<Slot, OffensiveStats>,   // stones = per-set
 *                 spec: specKey|null, talentAllocation: Record<talentId, rank>,
 *                 relics: { entries: [{defId, level, equipped}] } }
 * SourceState = one entry per character-scoped, `selection`-bearing SOURCE_DEFS[].key, shape per `selection`:
 *   'all'/'tiered' -> { entries: [] }        (Mount Glyphs/Sigils)
 *   'single'       -> { entries: [], activeId: string|null }  (Transcendence, Pets, Mounts)
 * Talents is scope:'loadout' (Dual Spec = Loadout 1/2 = Set A/B) - its data lives on
 * Loadout.spec/talentAllocation. Tree CONTENT (tiers/talents/values) is static
 * code data in talentTreeData.js, not part of the persisted Roster - the same
 * spec's tree is identical for every player, so it isn't user-authored.
 * Awakening is scope:'character' but has no `selection` (bypasses SourceState
 * entirely) - one path + point count shared by both loadouts, lives on
 * Character.awakening directly. Static per-point content is in awakeningData.js.
 * Transcendence is also scope:'character' with no `selection` - one shared
 * unlocked-node set (an ORDERED array, not a bare Set: unlock order matters
 * for the displayed Ichor-spent total, see transcendence.js), lives on
 * Character.transcendence directly. Static per-class tree content (node
 * positions/types/stats) is in transcendenceData.js.
 * Relics is also scope:'loadout' like Talents (equip set is independent per
 * Set A/B, not shared) - its data lives on Loadout.relics. Static per-relic
 * content (tier/maxLevel/stat min-max) is in relicsData.js; a relic's LEVEL
 * (like its equip status) is per-loadout too - there's no separate
 * account-wide "ownership" tracked, matching Awakening's dropped currency.
 * DropState   = { slot, piece: OffensiveStats }  // persists across char switches
 *
 * Phase 0: profileTotals are a manual input. Phase 1 adds `manualTotals` as a
 * live toggle (was hardcoded true) - see totals.js for the "Calculated" sum.
 */

import { offensiveStats } from './dps.js';
import { SLOTS, SOURCE_DEFS, CLASSES, SPECS_BY_CLASS } from './constants.js';
import { TALENT_TREES } from './talentTreeData.js';
import { AWAKENING_PATHS, AWAKENING_TOTAL_POINTS } from './awakeningData.js';
import { RELICS_BY_CLASS, RELIC_EQUIP_CAP } from './relicsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { reachableFrom, effectiveUnlockedSet } from './transcendence.js';

let _idCounter = 0;
function newId() {
  _idCounter += 1;
  return `c${Date.now().toString(36)}${_idCounter}`;
}

/** Empty stats record (all zero). Re-exported for convenience. */
export function emptyStats(overrides = {}) {
  return offensiveStats(overrides);
}

/** Per-slot map of empty stat records. */
function emptyGear() {
  const g = {};
  for (const slot of SLOTS) g[slot] = emptyStats();
  return g;
}

/** The correctly-shaped empty state for one SOURCE_DEFS entry. */
function emptySourceState(def) {
  return def.selection === 'single' ? { entries: [], activeId: null } : { entries: [] };
}

/** Empty source state for every character-scoped, `selection`-bearing source (SOURCE_DEFS). */
export function emptySources() {
  const s = {};
  for (const def of SOURCE_DEFS) {
    if (def.scope === 'character' && def.selection) s[def.key] = emptySourceState(def);
  }
  return s;
}

/** Empty Awakening state: no path chosen, no points invested. */
function emptyAwakening() {
  return { path: null, points: 0 };
}

/** Empty Transcendence state: no nodes unlocked. */
function emptyTranscendence() {
  return { unlockedPositions: [] };
}

// --- Pets ---
export function newPetEntry({ name = 'New Pet', rarity = 'Common', level = 1, stats = {} } = {}) {
  return { id: newId(), name, rarity, level, stats: emptyStats(stats) };
}

// --- Mounts ---
export function newMountEntry({ name = 'New Mount', rarity = 'Common', baseHpPct = 0, baseAtkPct = 0 } = {}) {
  return { id: newId(), name, rarity, baseHpPct, baseAtkPct };
}

// --- Mount Glyphs ---
export function newMountGlyphEntry({ tier = 'minor', statKey = 'attack_pct', value = 0, equipped = false } = {}) {
  return { id: newId(), tier, statKey, value, equipped };
}

export function newLoadout(name) {
  return {
    name,
    profileTotals: emptyStats(),
    manualTotals: true, // Phase 0: totals typed directly
    gear: emptyGear(),
    stones: emptyGear(), // enchant stones, per-set (handoff 8.8) - SCAFFOLD
    spec: null, // Talents: Dual Spec - Loadout 1 = Set A, Loadout 2 = Set B
    talentAllocation: {}, // { [talentId]: rankInvested }
    relics: { entries: [] }, // { defId, level, equipped }[] - independent per loadout, like Talents
  };
}

export function newCharacter(name = 'New Character') {
  return {
    id: newId(),
    name,
    class: null, // 'Warrior' | 'Sentinel' | null - gates which specs the loadouts can use
    loadouts: [newLoadout('Loadout 1'), newLoadout('Loadout 2')],
    sources: emptySources(),
    awakening: emptyAwakening(),
    transcendence: emptyTranscendence(),
  };
}

export function newRoster() {
  const c = newCharacter('Character 1');
  return { characters: [c], currentId: c.id, drop: null };
}

export function getCurrent(roster) {
  return roster.characters.find((c) => c.id === roster.currentId) || roster.characters[0] || null;
}

/**
 * Migrate / normalise an arbitrary parsed object into a valid Roster, filling
 * missing fields with defaults. Keeps import and old-state loads safe.
 */
export function normaliseRoster(raw) {
  if (!raw || !Array.isArray(raw.characters) || raw.characters.length === 0) {
    return newRoster();
  }
  const characters = raw.characters.map((c) => normaliseCharacter(c));
  const currentId = characters.some((c) => c.id === raw.currentId)
    ? raw.currentId
    : characters[0].id;
  const drop = normaliseDrop(raw.drop);
  return { characters, currentId, drop };
}

function normaliseCharacter(c) {
  const base = newCharacter(c?.name || 'Character');
  if (c?.id) base.id = c.id;
  base.class = CLASSES.includes(c?.class) ? c.class : null;
  const loadouts = Array.isArray(c?.loadouts) ? c.loadouts : [];
  base.loadouts = [
    normaliseLoadout(loadouts[0], 'Loadout 1', base.class),
    normaliseLoadout(loadouts[1], 'Loadout 2', base.class),
  ];
  base.sources = normaliseSources(c?.sources);
  base.awakening = normaliseAwakening(c?.awakening);
  base.transcendence = normaliseTranscendence(c?.transcendence, base.class);
  return base;
}

/** Validates path against the static AWAKENING_PATHS, clamps points to [0, cap], forces points to 0 with no path. */
function normaliseAwakening(raw) {
  const path = raw?.path in AWAKENING_PATHS ? raw.path : null;
  if (!path) return emptyAwakening();
  const points = Math.max(0, Math.min(Number(raw?.points) || 0, AWAKENING_TOTAL_POINTS));
  return { path, points };
}

/**
 * Drops positions that no longer exist in this class's (static) tree, drops
 * glyph sockets (inert - never a legal stored entry, even from old/corrupt
 * data), de-dupes while preserving unlock order (order feeds the Ichor-spent
 * display, see transcendence.js), and drops anything no longer reachable
 * from the tree's start position via the remaining unlocked set - the same
 * cascade rule applied live when a node is removed through the UI, reapplied
 * here in case a class change or manual import left an orphaned position.
 * The start position has no special exemption here - it's stored like any
 * other unlocked node (see transcendence.js: it has no adjacency
 * prerequisite, but it's still something the player had to unlock).
 */
function normaliseTranscendence(raw, characterClass) {
  const tree = characterClass ? TRANSCENDENCE_TREES[characterClass] : null;
  if (!tree) return emptyTranscendence();
  const byPosition = new Map(tree.nodes.map((n) => [n.position, n]));
  const seen = new Set();
  const ordered = [];
  for (const position of Array.isArray(raw?.unlockedPositions) ? raw.unlockedPositions : []) {
    const node = byPosition.get(position);
    if (!node || node.type === 'glyph' || seen.has(position)) continue;
    seen.add(position);
    ordered.push(position);
  }
  const reachable = reachableFrom(tree.startPosition, effectiveUnlockedSet(ordered), tree);
  return { unlockedPositions: ordered.filter((p) => reachable.has(p)) };
}

/**
 * Deep-normalise source state per SOURCE_DEFS (not a shallow spread): a raw
 * import/reload might predate a source existing at all (emptySources()
 * fills it in), predate `activeId` on a 'single' source (Phase 0's pets/
 * mounts scaffold had no activeId), or carry a malformed entries array.
 */
function normaliseSources(raw) {
  const s = {};
  for (const def of SOURCE_DEFS) {
    if (def.scope !== 'character' || !def.selection) continue;
    const empty = emptySourceState(def);
    const rawState = raw?.[def.key];
    let entries = Array.isArray(rawState?.entries) ? rawState.entries : [];
    if (def.key === 'pets') {
      // Pets are the only source with an embedded OffensiveStats sub-object
      // this pass - defend against a malformed import the way gear/stones already do.
      entries = entries.map((e) => ({ ...e, stats: emptyStats(e?.stats || {}) }));
    }
    if (def.selection === 'single') {
      const activeId = entries.some((e) => e?.id === rawState?.activeId) ? rawState.activeId : null;
      s[def.key] = { entries, activeId };
    } else {
      s[def.key] = { ...empty, entries };
    }
  }
  return s;
}

function normaliseLoadout(l, fallbackName, characterClass) {
  const base = newLoadout(l?.name || fallbackName);
  base.profileTotals = emptyStats(l?.profileTotals || {});
  base.manualTotals = l?.manualTotals !== false;
  for (const slot of SLOTS) {
    base.gear[slot] = emptyStats(l?.gear?.[slot] || {});
    base.stones[slot] = emptyStats(l?.stones?.[slot] || {});
  }
  const validSpecKeys = (SPECS_BY_CLASS[characterClass] || []).map((s) => s.key);
  base.spec = validSpecKeys.includes(l?.spec) ? l.spec : null;
  base.talentAllocation = normaliseTalentAllocation(l?.talentAllocation, base.spec);
  base.relics = normaliseRelics(l?.relics, characterClass);
  return base;
}

/**
 * Drops entries whose defId no longer exists for this class's (static)
 * relics, de-dupes repeated defIds, clamps level to [1, maxLevel], and caps
 * the equipped count at RELIC_EQUIP_CAP (unmarking any excess rather than
 * dropping the entry - an over-cap import still keeps its level/ownership).
 */
function normaliseRelics(raw, characterClass) {
  const defs = RELICS_BY_CLASS[characterClass] || [];
  const defById = new Map(defs.map((d) => [d.id, d]));
  const rawEntries = Array.isArray(raw?.entries) ? raw.entries : [];
  const seen = new Set();
  const entries = [];
  let equippedCount = 0;
  for (const e of rawEntries) {
    const def = defById.get(e?.defId);
    if (!def || seen.has(def.id)) continue;
    seen.add(def.id);
    const level = Math.max(1, Math.min(Number(e?.level) || 1, def.maxLevel));
    let equipped = !!e?.equipped;
    if (equipped && equippedCount >= RELIC_EQUIP_CAP) equipped = false;
    if (equipped) equippedCount += 1;
    entries.push({ defId: def.id, level, equipped });
  }
  return { entries };
}

/** Drops allocations pointing at talents/ranks that no longer exist in the (static) tree. */
function normaliseTalentAllocation(raw, spec) {
  const tree = spec ? TALENT_TREES[spec] : null;
  if (!tree || !raw || typeof raw !== 'object') return {};
  const talentById = new Map();
  for (const tier of tree.tiers) {
    for (const t of tier.talents) talentById.set(t.id, t);
  }
  const allocation = {};
  for (const [talentId, rank] of Object.entries(raw)) {
    const talent = talentById.get(talentId);
    if (!talent) continue;
    const clamped = Math.max(0, Math.min(Number(rank) || 0, talent.ranks.length));
    if (clamped > 0) allocation[talentId] = clamped;
  }
  return allocation;
}

function normaliseDrop(d) {
  if (!d || !SLOTS.includes(d.slot)) return null;
  return { slot: d.slot, piece: emptyStats(d.piece || {}) };
}
