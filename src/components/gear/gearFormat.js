// gearFormat.js (B1): display and parse helpers shared by the gear components. Pure; no store.
import { slotDisplayName, weaponOffhandName } from '../../lib/game/gear.js';
import { isMultiplierStat } from '../../lib/model/equipment.js';
import { formatFlat } from '../../lib/format.js';
import { statLabel, statValueText } from '../../lib/build/statText.js';

/** "CRIT_CHANCE" -> "Crit Chance" (build/statText.js, shared with the optimiser and Drop Check). */
export { statLabel };

/** Slot name for display: class weapon/off-hand names, else the catalogue display name. */
export function slotLabel(cls, slot) {
  if (slot === 'WEAPON' || slot === 'OFFHAND') return weaponOffhandName(cls, slot) ?? slot;
  return slotDisplayName(slot);
}

/** Stored value -> the number the user types (multiplier stats show as percent). */
export function toDisplay(type, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return String(+(isMultiplierStat(type) ? n * 100 : n).toFixed(3));
}

/** What the user typed -> stored value; blank or junk -> 0. */
export function fromDisplay(type, text) {
  const n = Number(String(text ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return isMultiplierStat(type) ? +(n / 100).toFixed(6) : n;
}

/** Signed value with unit for a read-only line: "+3.2%", PvP ratings plain (build/statText.js). */
export const formatStatValue = (type, value) => statValueText(type, value);

/**
 * Flat stat text -> number. The game's own UI groups thousands with "." or "," (device locale,
 * stats.md §1.3), so "48.124" and "48,124" both mean 48124 while "12.5" stays 12.5. Display is always
 * "." grouping (flatFieldText), so what the field shows parses back to the same value.
 */
export function parseFlat(text) {
  const s = String(text ?? '').trim().replace(/\s/g, '');
  if (!s) return 0;
  const n = /^\d{1,3}([.,]\d{3})+$/.test(s) ? Number(s.replace(/[.,]/g, '')) : Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Field text for a flat stat: grouped like the game ("48.124", lib/format.js), blank for 0 so the placeholder shows. */
export function flatFieldText(n) {
  const v = Number(n);
  return Number.isFinite(v) && v !== 0 ? formatFlat(v) : '';
}

/** Stone type -> CSS colour tokens (tokens --stone-*). */
export const STONE_COLOR = {
  PVE_ATTACK: { color: 'var(--stone-crimson)', tint: 'var(--stone-crimson-tint)' },
  PVE_DEFENSE: { color: 'var(--stone-verdant)', tint: 'var(--stone-verdant-tint)' },
  PVP: { color: 'var(--stone-azure)', tint: 'var(--stone-azure-tint)' },
  ULTIMATE: { color: 'var(--stone-eldaryn)', tint: 'var(--stone-eldaryn-tint)' },
  MYTHIC: { color: 'var(--stone-mythic)', tint: 'var(--stone-mythic-tint)' },
  OBLIVION: { color: 'var(--stone-oblivion)', tint: 'var(--stone-oblivion-tint)' },
};

/** Rarity id -> the app.css rarity foreground token. */
export function rarityColor(rarity) {
  return rarity ? `var(--rarity-${rarity.toLowerCase()}-fg)` : 'var(--text-muted)';
}
