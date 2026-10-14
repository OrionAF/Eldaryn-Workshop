// dropFormat.js (F1): display helpers for the Drop Check components. Pure; no store.
import { statLabel, toDisplay, rarityColor } from '../gear/gearFormat.js';
import { rarityById } from '../../lib/game/gear.js';
import { formatFlat } from '../../lib/format.js';

export const VERDICT_LABEL = {
  upgrade: 'Upgrade',
  downgrade: 'Downgrade',
  sidegrade: 'Sidegrade',
  mixed: 'Mixed',
  empty: '',
};
export const VERDICT_GLYPH = { upgrade: '▲', downgrade: '▼', sidegrade: '=', mixed: '±', empty: '' };

/** 12345.6 -> "12.346" (the game's "." thousands separator; a dash for a non-number). */
export function flat(n) {
  return Number.isFinite(n) ? formatFlat(n) : '—';
}

/** 5 -> "+5", -5 -> "-5", 0 -> "0" (grouped thousands). */
export function signedFlat(n, digits = 0) {
  if (!Number.isFinite(n)) return '—';
  const v = digits ? n.toFixed(digits) : formatFlat(n);
  return n > 0 ? `+${v}` : v;
}

/** A percent change: 5.234 -> "+5.2%". */
export function signedPct(n, digits = 1) {
  if (!Number.isFinite(n)) return '—';
  const v = n.toFixed(digits);
  return n > 0 ? `+${v}%` : `${v}%`;
}

/** A probability: 0.635 -> "63.5%". */
export function prob(p, digits = 1) {
  return Number.isFinite(p) ? `${(p * 100).toFixed(digits)}%` : '—';
}

/** A probability difference in percentage points: 0.03 -> "+3.0 pts". */
export function signedPts(d, digits = 1) {
  if (!Number.isFinite(d)) return '—';
  const v = (d * 100).toFixed(digits);
  return d > 0 ? `+${v} pts` : `${v} pts`;
}

/** "+800 to +1.400" for a DPS-style delta interval. */
export function ciFlat(delta) {
  return `${signedFlat(delta.lo)} to ${signedFlat(delta.hi)}`;
}

/** The interval of a probability delta in percentage points. */
export function ciPts(delta) {
  const a = (delta.lo * 100).toFixed(1);
  const b = (delta.hi * 100).toFixed(1);
  return `${delta.lo > 0 ? '+' : ''}${a} to ${delta.hi > 0 ? '+' : ''}${b} pts`;
}

/** One-line description of an item for the "currently equipped" list. */
export function itemSummary(item) {
  if (!item) return 'empty';
  const bits = [];
  const r = item.rarity ? rarityById(item.rarity)?.name : null;
  if (r) bits.push(r);
  if (item.itemLevel) bits.push(`ilvl ${item.itemLevel}`);
  if (item.primaryStats?.attack) bits.push(`Atk ${flat(item.primaryStats.attack)}`);
  if (item.primaryStats?.hp) bits.push(`HP ${flat(item.primaryStats.hp)}`);
  const sec = item.secondaryStats ?? [];
  if (sec.length) bits.push(sec.map((s) => `${statLabel(s.type)} ${toDisplay(s.type, s.value)}`).join(', '));
  return bits.length ? bits.join(' · ') : 'no stats';
}

export { rarityColor };
