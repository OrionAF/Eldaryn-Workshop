// model/gameProfile.js - import of the game's own player profile (the client state the server returns
// for the player-profile endpoint). Pure; imports L1 only. Mapping table and gaps: data-model.md §7.
//
//   isGameProfile(json)               shape detection (never throws)
//   gameProfileToCharacter(json, opts)  -> a RAW v2 character that normaliseCharacter accepts
//   importedCharacterName(name, existing)  " (imported)" suffix when the name is taken
//
// The profile is the client's state, so field names follow the same enums the v2 model uses (class,
// rarity, SecondaryStatType, stone types); what differs is listed here once:
//   - talent sets are numbered 1|2 (v2: 0|1); pets/mounts/glyphs/sigils/relics sit in *State objects;
//   - mount species are lower snake case, glyph rarity is upper case and glyph secondaries use the
//     stat enum where v2 keeps the pool key (`PENETRATION` -> `penetration`);
//   - pet secondaries are multipliers for Attack Speed / Crit Damage / Minion Attack Speed (0.2 = 20%)
//     where the v2 pet keeps percent points for every stat (model/pets.js);
//   - the pet altar is {totalXp, tier}; v2 stores the derived level (Game/pets.md §6);
//   - skills are `<id>Level` keys; the Oblivion hero lives under `oblivionPrestige.oblivion`;
//   - `computedStats` is the server's final stats for the ACTIVE realm and preset: it becomes that
//     preset's sheet (or the Oblivion sheet when the Oblivion realm is active).
// Never copied: player id, clan, quests, shop, economy and any other account field.
import { CLASSES } from '../game/classes.js';
import { BASE_SLOTS, OBLIVION_ONLY_SLOTS } from '../game/gear.js';
import { PET_ALTAR_XP_NEEDED_BY_TIER, petSpeciesById } from '../game/pets.js';
import { GLYPH_SECONDARY_POOL, mountBySpecies } from '../game/mountsGlyphs.js';
import { SKILL_IDS } from '../game/skills.js';
import { fortressById } from '../game/fortress.js';
import { sigilBySpecies } from '../game/sigils.js';
import { MAX_PRESETS } from './presets.js';

const IMPORT_SUFFIX = ' (imported)';
const DEFAULT_CONDITION = 'ON_COOLDOWN';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' && v ? v : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * True for a captured player-profile response. Requires the markers no app export has: a `player`
 * object with a known class and a numeric level, an `equipment` object, and no `characters` list.
 */
export function isGameProfile(json) {
  if (!isObj(json) || Array.isArray(json.characters)) return false;
  const p = json.player;
  return isObj(p) && CLASSES.includes(String(p.class).toUpperCase()) && typeof p.level === 'number' && isObj(json.equipment);
}

/** `name`, or `name (imported)` when a character of that name exists (case-insensitive). */
export function importedCharacterName(name, existingNames = []) {
  const base = str(name)?.trim() || 'Imported character';
  const taken = new Set(existingNames.map((n) => String(n).trim().toLowerCase()));
  return taken.has(base.toLowerCase()) ? `${base}${IMPORT_SUFFIX}` : base;
}

// --- equipment and stones ---

/** A server item (equipment slot, loot-bag `pendingItems` entry) -> raw v2 Item; normaliseItem validates it. */
export function mapItem(raw) {
  if (!isObj(raw)) return null;
  const item = {
    rarity: str(raw.rarity),
    itemLevel: num(raw.itemLevel),
    quality: null, // the client has no item quality field (only `qualityBonus`, which is not a 1..100 quality)
    primaryStats: { attack: num(raw.primaryStats?.attack) ?? 0, hp: num(raw.primaryStats?.hp) ?? 0 },
    secondaryStats: arr(raw.secondaryStats).filter(isObj).map((s) => ({ type: s.type, value: s.value })),
    conduit: isObj(raw.conduit) ? { type: raw.conduit.type, value: raw.conduit.value } : null,
  };
  return item;
}

function mapEquip(items, sockets, slots) {
  const out = { items: {}, enchantSlots: {} };
  for (const slot of slots) out.items[slot] = mapItem(items?.[slot]);
  for (const slot of BASE_SLOTS) out.enchantSlots[slot] = str(sockets?.[slot]);
  return out;
}

function mapStone(raw) {
  if (!isObj(raw)) return null;
  return {
    id: str(raw.id),
    type: raw.type,
    activated: raw.activated, // an unactivated stone adds nothing (stones.md §1); only a missing flag defaults to on
    quality: num(raw.quality),
    amplifyLevel: num(raw.amplifyLevel) ?? 0,
    oblivionLevel: num(raw.oblivionLevel),
    // Oblivion Power is derived from quality and grade by the engine, never stored (model/stones.js)
    stats: arr(raw.stats).filter((s) => isObj(s) && s.type !== 'OBLIVION_POWER').map((s) => ({ type: s.type, value: s.value })),
  };
}

// --- pets ---

const PET_PERCENT_POINT_STATS = new Set(['ATTACK_SPEED', 'CRIT_DAMAGE', 'MINION_ATTACK_SPEED']);

/** Game/pets.md §6 getAltarProgress: level from the cumulative altar XP at this tier (1..50). */
export function altarLevelFromXp(totalXp, tier) {
  const t = Math.min(8, Math.max(1, Math.floor(Number(tier)) || 1));
  const need = PET_ALTAR_XP_NEEDED_BY_TIER[String(t)] ?? [];
  let xp = Math.max(0, Math.floor(Number(totalXp)) || 0);
  let level = 1;
  while (level < 50 && level - 1 < need.length && xp >= need[level - 1]) {
    xp -= need[level - 1];
    level += 1;
  }
  return level;
}

function mapPets(petState) {
  const owned = [];
  for (const p of arr(petState?.ownedPets)) {
    if (!isObj(p) || !petSpeciesById(p.species)) continue;
    owned.push({
      id: str(p.id),
      species: p.species,
      secondaries: arr(p.secondaryStats)
        .filter(isObj)
        .map((s) => ({
          type: s.type,
          // v2 keeps percent points for every pet stat; the three multiplier stats are x100 here
          value: typeof s.value === 'number' && PET_PERCENT_POINT_STATS.has(s.type) ? Math.round(s.value * 1e6) / 1e4 : s.value,
        })),
    });
  }
  const tier = num(petState?.altar?.tier) ?? 1;
  return { altar: { level: altarLevelFromXp(petState?.altar?.totalXp, tier), tier }, owned };
}

// --- mounts and glyphs ---

const capWord = (s) => (typeof s === 'string' && s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);
const POOL_KEY_BY_ENUM = new Map(GLYPH_SECONDARY_POOL.map((p) => [p.statEnum, p.stat]));

function mapGlyph(g) {
  return {
    id: str(g.id),
    glyphType: g.glyphType,
    rarity: capWord(g.rarity),
    sealed: g.sealed === true,
    secondary: isObj(g.secondary) ? { stat: POOL_KEY_BY_ENUM.get(g.secondary.stat) ?? null, quality: g.secondary.quality } : null,
  };
}

/**
 * Mounts and the glyph inventory together. The game lets one glyph id sit in the sockets of several mounts
 * (Game/mounts-glyphs.md §8), as the v2 model does, so the ids are kept as the server sent them.
 * @returns {{mounts: object[], glyphs: object[]}}
 */
function mapMountsAndGlyphs(mountState, rawGlyphs) {
  const glyphs = arr(rawGlyphs).filter(isObj).map(mapGlyph);
  const mounts = [];
  for (const m of arr(mountState?.ownedMounts)) {
    if (!isObj(m) || typeof m.species !== 'string') continue;
    const species = m.species.toUpperCase();
    if (!mountBySpecies(species)) continue;
    mounts.push({
      id: str(m.id),
      species,
      baseHp: m.baseHp,
      baseAtk: m.baseAtk,
      level: m.level,
      glyphs: {
        minor: arr(m.glyphs?.minor).map((id) => str(id)),
        major: arr(m.glyphs?.major).map((id) => str(id)),
        mythic: arr(m.glyphs?.mythic).map((id) => str(id)),
      },
    });
  }
  return { mounts, glyphs };
}

// --- sigils ---

function mapSigils(sigilState) {
  const owned = {};
  for (const s of arr(sigilState?.ownedSigils)) {
    if (!isObj(s) || typeof s.species !== 'string' || typeof s.level !== 'number') continue;
    owned[s.species] = { level: s.level };
    const cond = str(s.activationCondition);
    if (cond && cond !== DEFAULT_CONDITION) owned[s.species].condition = cond;
  }
  return { altarTier: num(sigilState?.altarTier) ?? 1, owned };
}

/** The sigil slots of a client preset: Ancients have their own v2 slot, the rest stay in the generic list. */
function mapPresetSigils(preset) {
  const generic = [];
  let ancient = null;
  for (const sp of arr(preset.sigilSpecies)) {
    if (typeof sp !== 'string') continue;
    if (sigilBySpecies(sp)?.rarity === 'Ancient' && !ancient) ancient = sp;
    else generic.push(sp);
  }
  const utility = str(preset.utilitySigilSpecies);
  return { sigilSpecies: generic, ancientSigilSpecies: ancient, utilitySigilSpecies: utility };
}

// --- presets, talents, transcendence ---

const talentSetIndex = (n) => (n === 2 ? 1 : 0);

function mapTalentSet(state) {
  return { spec: str(state?.specialization), allocation: isObj(state?.allocation) ? { ...state.allocation } : {} };
}

/** Sheet values: the finite, non-negative `total*` / `raw*` numbers of the server's computedStats. */
function sheetValues(computedStats) {
  const values = {};
  if (!isObj(computedStats)) return values;
  for (const [k, v] of Object.entries(computedStats)) {
    if (/^(total|raw)[A-Z]/.test(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) values[k] = v;
  }
  return values;
}

const LIVE_NAME = 'Live loadout'; // only the fallback preset when the profile's selected preset is missing

/** Druid sigils live in their own client lists, so the live loadout reads them when the active talent set is Druid. */
function isDruid(profile) {
  if (String(profile.player.class).toUpperCase() !== 'MYSTIC') return false;
  const active = profile.activeTalentSet === 2 ? profile.talentState2 : profile.talentState;
  return active?.specialization === 'MYSTIC_DRUID';
}

/** The sigil lists the player actually runs: {species, utility} (either may be undefined when the profile omits it). */
function liveSigils(profile) {
  const s = profile.sigilState;
  return isDruid(profile)
    ? { species: s?.druidEquippedSpecies, utility: s?.druidUtilitySlotSpecies }
    : { species: s?.equippedSpecies, utility: s?.utilitySlotSpecies };
}

/**
 * The live loadout as a (client-shaped) preset: the active equipment and talent sets, the equipped pet,
 * mount, relics and sigils. A profile with no presets (the Presets feature unlocks at level 41) is
 * exactly this one preset; a profile whose live state differs from its active preset gets it appended.
 * It links no board: a null link runs the active board (transcendence.md §9), which is imported as
 * `transcendence.activePresetId`, and a link needs level 58.
 */
function livePreset(profile, id, name) {
  const sigils = liveSigils(profile);
  return {
    id,
    name,
    equipmentSet: profile.activeEquipmentSet,
    talentSet: profile.activeTalentSet,
    petId: profile.petState?.equippedPetId,
    mountId: profile.mountState?.activeMountId,
    relicIds: profile.relicState?.equippedRelicIds,
    sigilSpecies: sigils.species,
    utilitySigilSpecies: sigils.utility,
    transcendencePresetId: null,
  };
}

const sameSet = (a, b) => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
};

/**
 * The preset fields whose live value differs from the preset's; a field the profile omits never counts.
 * Names are the raw preset field names (the report entry carries them).
 */
function liveChanges(profile, preset) {
  const live = livePreset(profile, null, null);
  const setOf = (n) => (n === 2 ? 2 : 1);
  const out = [];
  if (live.equipmentSet !== undefined && setOf(live.equipmentSet) !== setOf(preset.equipmentSet)) out.push('equipmentSet');
  if (live.talentSet !== undefined && setOf(live.talentSet) !== setOf(preset.talentSet)) out.push('talentSet');
  if (live.petId !== undefined && str(live.petId) !== str(preset.petId)) out.push('petId');
  if (live.mountId !== undefined && str(live.mountId) !== str(preset.mountId)) out.push('mountId');
  if (Array.isArray(live.relicIds) && !sameSet(live.relicIds.filter((x) => typeof x === 'string'), arr(preset.relicIds))) out.push('relicIds');
  if (Array.isArray(live.sigilSpecies) && !sameSet(live.sigilSpecies.filter((x) => typeof x === 'string'), arr(preset.sigilSpecies))) out.push('sigilSpecies');
  if (live.utilitySigilSpecies !== undefined && str(live.utilitySigilSpecies) !== str(preset.utilitySigilSpecies)) out.push('utilitySigilSpecies');
  // an unlinked preset follows whatever board is active, so only a link to another board is a change
  const link = str(preset.transcendencePresetId);
  const board = str(profile.activeTranscendencePresetId);
  if (link && board && link !== board) out.push('transcendencePresetId');
  return out;
}

function mapPreset(p, sheet) {
  return {
    id: str(p.id),
    name: str(p.name),
    equipmentSet: p.equipmentSet === 2 ? 2 : 1,
    talentSet: talentSetIndex(p.talentSet),
    petId: str(p.petId),
    mountId: str(p.mountId),
    relicIds: arr(p.relicIds).filter((x) => typeof x === 'string'),
    ...mapPresetSigils(p),
    transcendencePresetId: str(p.transcendencePresetId),
    sheet,
  };
}

/**
 * -> {presets, activePresetId, liveId}. `liveId` is the preset that holds the live loadout (and so the
 * server's computedStats sheet). When the worn loadout differs from the game's selected preset
 * (`activePresetId`), that preset is UPDATED with it (name, icon and id kept) and reported as
 * `liveLoadoutApplied`. Fallback when the profile has no such preset: the live loadout is appended as a
 * single "Live loadout" preset (nothing is lost); at the cap of 8 the sheet has no owner.
 */
function mapPresets(profile, sheet, report) {
  let list = arr(profile.presets).filter(isObj).slice(0, MAX_PRESETS);
  const implicit = list.length === 0;
  if (implicit) list = [livePreset(profile, 'default', 'Default')];
  const selected = list.find((p) => p.id === profile.activePresetId);
  const activeId = selected ? selected.id : list[0]?.id;
  const presets = list.map((p) => mapPreset(p, null));
  let liveId = str(activeId);
  if (!implicit) {
    const fields = liveChanges(profile, selected ?? list[0]);
    if (fields.length && selected) {
      const live = { ...livePreset(profile, selected.id, selected.name), transcendencePresetId: profile.activeTranscendencePresetId };
      // a field the profile omits keeps the preset's value
      const merged = { ...selected };
      for (const k of fields) merged[k] = live[k];
      presets[list.indexOf(selected)] = mapPreset(merged, null);
      report?.push({ kind: 'liveLoadoutApplied', presetId: str(selected.id), presetName: str(selected.name), fields });
    } else if (fields.length) {
      if (list.length < MAX_PRESETS) {
        liveId = 'live-loadout';
        while (list.some((p) => p.id === liveId)) liveId += '_';
        presets.push(mapPreset(livePreset(profile, liveId, LIVE_NAME), null));
      } else {
        liveId = null;
      }
    }
  }
  const owner = presets.find((p) => p.id === liveId);
  if (owner) owner.sheet = sheet;
  return { presets, activePresetId: activeId ?? null, liveId };
}

function mapTranscendence(profile) {
  let presets = arr(profile.transcendencePresets)
    .filter((p) => isObj(p) && str(p.id))
    .map((p) => ({ id: p.id, name: p.name, allocatedNodeIds: arr(p.allocatedNodeIds).filter((x) => typeof x === 'string') }));
  if (presets.length === 0 && Array.isArray(profile.transcendence?.allocatedNodeIds)) {
    presets = [{ id: 'default', name: 'Default', allocatedNodeIds: profile.transcendence.allocatedNodeIds.filter((x) => typeof x === 'string') }];
  }
  return { presets, activePresetId: str(profile.activeTranscendencePresetId) };
}

// --- skills, fortress ---

/** `huntingLevel` -> `hunting`, ... (the client's skill state keys are `<skillId>Level`). */
function mapSkills(skills) {
  const out = {};
  if (!isObj(skills)) return out;
  for (const id of SKILL_IDS) {
    const v = skills[`${id}Level`];
    if (typeof v === 'number') out[id] = v;
  }
  return out;
}

function mapFortress(fortressBuffs) {
  const owned = [];
  for (const id of arr(fortressBuffs?.ownedFortressIds)) {
    const group = fortressById(id)?.group;
    if (group && !owned.includes(group)) owned.push(group);
  }
  return { owned };
}

// --- the entry point ---

/**
 * Game profile -> raw v2 character. Does not generate an id (normaliseCharacter does) and does not
 * validate: normaliseCharacter drops whatever no longer resolves against the catalogues.
 * @param {object} profile  a value for which isGameProfile() holds
 * @param {{now?: string, report?: object[]}} [opts]  `now` stamps the sheet's enteredAt (default: current time);
 *   `report` receives {kind: 'liveLoadoutApplied', presetId, presetName, fields} entries (data-model.md §7)
 */
export function gameProfileToCharacter(profile, { now = new Date().toISOString(), report } = {}) {
  const player = profile.player;
  const oblivionPrestige = isObj(profile.oblivionPrestige) ? profile.oblivionPrestige : {};
  const hero = isObj(oblivionPrestige.oblivion) ? oblivionPrestige.oblivion : null;
  const oblivionActive = oblivionPrestige.unlocked === true && oblivionPrestige.activeRealm === 'OBLIVION';
  const values = sheetValues(profile.computedStats);
  const sheet = Object.keys(values).length ? { values, enteredAt: now } : null;
  const { presets, activePresetId, liveId } = mapPresets(profile, oblivionActive ? null : sheet, report);
  const baseSlots = [...BASE_SLOTS];
  const allSlots = [...BASE_SLOTS, ...OBLIVION_ONLY_SLOTS];
  const { mounts, glyphs } = mapMountsAndGlyphs(profile.mountState, player.glyphs);

  return {
    name: str(player.name)?.trim() || 'Imported character',
    class: String(player.class).toUpperCase(),
    level: player.level,
    equipment: {
      set1: mapEquip(profile.equipment, profile.enchantSlots, baseSlots),
      set2: mapEquip(profile.equipment2, profile.enchantSlots2, baseSlots),
      oblivion: mapEquip(hero?.equipment, hero?.enchantSlots, allSlots),
    },
    enchantStones: arr(profile.enchantStones).map(mapStone).filter(Boolean),
    oblivionEnchantStones: arr(hero?.enchantStones).map(mapStone).filter(Boolean),
    talentSets: [mapTalentSet(profile.talentState), mapTalentSet(profile.talentState2)],
    pets: mapPets(profile.petState),
    mounts,
    glyphs,
    sigils: mapSigils(profile.sigilState),
    relics: Object.fromEntries(
      arr(profile.relicState?.ownedRelics)
        .filter((r) => isObj(r) && typeof r.relicId === 'string' && typeof r.level === 'number')
        .map((r) => [r.relicId, r.level]),
    ),
    extraRelicSlots: profile.relicState?.extraSlotsPurchased,
    awakening: { path: str(profile.awakeningState?.path), level: profile.awakeningState?.level },
    transcendence: mapTranscendence(profile),
    skills: mapSkills(profile.skills),
    attunementBans: arr(profile.excludedDropStats).filter((s) => typeof s === 'string'),
    fortress: mapFortress(profile.fortressBuffs),
    server: Number.isInteger(player.server) ? player.server : null,
    oblivion: {
      unlocked: oblivionPrestige.unlocked === true,
      level: hero?.level,
      activeRealm: oblivionActive ? 'oblivion' : 'base',
      // the sheet's owner is the preset that holds the live loadout (model/oblivion.js)
      sheet: oblivionActive && sheet ? { ...sheet, presetId: liveId } : null,
    },
    presets,
    activePresetId,
  };
}
