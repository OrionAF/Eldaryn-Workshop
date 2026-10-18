// build/statText.js (backlog §6): the one place a stat or an owned item becomes display text. Drop Check,
// the optimiser's change rows, its Apply review and the full-build drawer all read these, so the same pet,
// mount or glyph is named the same way everywhere and a raw stat key never reaches the screen.
//
//   statLabel / statValueText / statParts / statLine   "Health +4.5%", "Crit Damage +9%"
//   glyphStatLine(secondary)                           a glyph roll in its pool unit
//   petText / mountText / glyphText                    an owned copy, told apart from the others
//
// Units: gear, stone and glyph Attack Speed / Crit Damage / Minion Attack Speed are multiplier deltas
// (0.09 = +9%); pet secondaries are stored in percent points (data-model.md §8, `petState`), so pets pass
// `points: true`.
import { SECONDARY_STAT_POOL } from '../game/gear.js';
import { petDisplayName } from '../game/pets.js';
import { mountBySpecies } from '../game/mountsGlyphs.js';
import { isMultiplierStat } from '../model/equipment.js';
import { glyphSecondaryDef, glyphSecondaryValue, glyphTypeInfo } from '../model/glyphs.js';
import { mountStatAtLevel } from '../model/mounts.js';
import { formatFlat, formatPct } from '../format.js';
import { STONE_TYPES } from '../game/stones.js';

/** An owned stone described by the rolls and levels shown in its inventory tile. */
export function stoneText(stone) {
  if (!stone) return 'None';
  const name = STONE_TYPES.find((type) => type.enum === stone.type)?.name ?? 'Stone';
  const details = (stone.stats ?? []).map((s) => statLine(s.type, s.value));
  if (stone.quality != null) details.push(`Quality ${stone.quality}`);
  if (stone.oblivionLevel != null) details.push(`Grade ${stone.oblivionLevel}`);
  details.push(`Amplify ${stone.amplifyLevel ?? 0}`);
  return `${name} · ${details.join(', ')}`;
}

const POOL_LABEL = new Map(SECONDARY_STAT_POOL.map((s) => [s.type, s.label]));
const RATINGS = new Set(['PVP_ATTACK', 'PVP_DEFENSE']);

/** "CRIT_CHANCE" -> "Crit Chance"; the gear pool's label where it has one, PVP kept upper-case. */
export function statLabel(type) {
  if (POOL_LABEL.has(type)) return POOL_LABEL.get(type);
  return String(type)
    .split('_')
    .map((w) => (w === 'PVP' ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}

/** "+3.2%" for a secondary value; multiplier stats x100 unless `points`; PVP ratings plain. */
export function statValueText(type, value, { points = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (RATINGS.has(type)) return `+${formatPct(n)}`;
  return `+${formatPct(isMultiplierStat(type) && !points ? n * 100 : n)}%`;
}

/** Label and value apart: the label drops its own "%" when the value carries one ("Health %" -> "Health"). */
export function statParts(type, value, opts) {
  const text = statValueText(type, value, opts);
  const label = text.endsWith('%') ? statLabel(type).replace(/\s*%$/, '') : statLabel(type);
  return { label, text };
}

/** "Health +4.5%". */
export function statLine(type, value, opts) {
  const { label, text } = statParts(type, value, opts);
  return `${label} ${text}`;
}

/** A glyph's rolled secondary ({stat, quality}) as a stat line, in its pool unit; '' when unknown. */
export function glyphStatLine(secondary) {
  const def = glyphSecondaryDef(secondary?.stat);
  return def ? statLine(def.statEnum, glyphSecondaryValue(secondary)) : '';
}

/** " · either of your 2 identical copies" when another owned copy looks the same, else ''. */
function twinsText(list, item, sig) {
  const s = sig(item);
  const n = (list ?? []).filter((x) => sig(x) === s).length;
  return n > 1 ? ` · either of your ${n} identical copies` : '';
}

const petSig = (p) => JSON.stringify([p.species, p.rarity, [...(p.secondaries ?? [])].map((s) => [s.type, s.value]).sort()]);
const mountSig = (m) => JSON.stringify([m.species, m.rarity ?? null, m.level, m.baseHp ?? null, m.baseAtk ?? null]);
const glyphSig = (g) => JSON.stringify([g.glyphType, g.rarity, !!g.sealed, g.secondary?.stat ?? null, g.secondary ? glyphSecondaryValue(g.secondary) : null]);

/** "Infernal Drake (Legendary · Crit Chance +3%, Health +4.5%)": name, rarity and secondaries. */
export function petText(character, pet) {
  if (!pet) return 'None';
  const name = petDisplayName(pet.species, (character.pets?.altar?.tier ?? 1) >= 2) ?? pet.species;
  const stats = (pet.secondaries ?? []).map((s) => statLine(s.type, s.value, { points: true }));
  const bits = [pet.rarity, stats.join(', ')].filter(Boolean).join(' · ');
  return `${name}${bits ? ` (${bits})` : ''}${twinsText(character.pets?.owned, pet, petSig)}`;
}

/** "Night Wolf (level 3 · +8% HP, +8% Attack)": level and what it adds there, as the game shows it. */
export function mountText(character, mount) {
  if (!mount) return 'None';
  const name = mountBySpecies(mount.species)?.name ?? mount.species;
  const at = (base) => `+${formatFlat(mountStatAtLevel(base, mount.level))}%`;
  const rolls = [mount.baseHp != null ? `${at(mount.baseHp)} HP` : '', mount.baseAtk != null ? `${at(mount.baseAtk)} Attack` : ''].filter(Boolean).join(', ');
  return `${name} (level ${mount.level}${rolls ? ` · ${rolls}` : ''})${twinsText(character.mounts, mount, mountSig)}`;
}

/** "Quickstep (Common · Health +4.5%)": type, rarity and the rolled stat. */
export function glyphText(character, glyph) {
  if (!glyph) return 'Empty';
  const name = glyphTypeInfo(glyph.glyphType)?.name ?? glyph.glyphType;
  const stat = glyph.secondary ? glyphStatLine(glyph.secondary) : '';
  return `${name} (${[glyph.rarity, stat].filter(Boolean).join(' · ')})${twinsText(character.glyphs, glyph, glyphSig)}`;
}
