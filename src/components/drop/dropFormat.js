// dropFormat.js (F1): display helpers for the Drop Check components. Pure; no store.
import { statLabel, toDisplay, rarityColor } from '../gear/gearFormat.js';
import { statParts } from '../../lib/build/statText.js';
import { rarityById } from '../../lib/game/gear.js';
import { formatFlat } from '../../lib/format.js';
import { pctInterval } from '../../lib/features/dropView.js';
import { sheetKeyMeta } from '../../lib/engine/pipeline/sheet.js';

export const VERDICT_LABEL = {
  upgrade: 'Upgrade',
  downgrade: 'Downgrade',
  sidegrade: 'Sidegrade',
  mixed: 'Mixed',
  inconclusive: 'Too close to call',
  empty: '',
};
export const VERDICT_GLYPH = { upgrade: '▲', downgrade: '▼', sidegrade: '=', mixed: '±', inconclusive: '?', empty: '' };

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

const TONE = { better: 'up', worse: 'down' };

/**
 * One table per metric of the cards (setCards output): DPS in percent of the starting DPS, survival and each
 * PVP opponent's win rate in points. A table's rows are its metric of every preset in every set, so Set 1 and
 * Set 2 sit side by side on that metric's own axis; the three scales are never mixed.
 * @returns {{id: string, title: string, axisTitle: string, unit: 'pct'|'pts', rows: object[]}[]}
 */
export function metricTables(cards) {
  const byId = new Map();
  for (const card of cards ?? []) {
    for (const p of card.presets) {
      for (const m of p.metrics) {
        if (!byId.has(m.id)) {
          const dps = m.unit === 'dps';
          byId.set(m.id, {
            id: m.id,
            title: m.label,
            axisTitle: dps ? 'Δ DPS vs current (%)' : `Δ ${m.id === 'survival' ? 'survival' : 'PVP win rate'} vs current (pts)`,
            unit: dps ? 'pct' : 'pts',
            rows: [],
          });
        }
        const t = byId.get(m.id);
        const iv = t.unit === 'pct' ? pctInterval(m.m) : { est: m.m.delta.delta * 100, lo: m.m.delta.lo * 100, hi: m.m.delta.hi * 100, n: m.m.delta.n };
        const verdict = m.m.delta.verdict;
        t.rows.push({
          key: `${card.setKey}:${p.presetId}`,
          label: `${card.setLabel} · ${p.name}`,
          est: iv?.est ?? null,
          lo: iv?.lo ?? null,
          hi: iv?.hi ?? null,
          n: m.m.delta.n,
          verdict,
          tone: TONE[verdict] ?? 'side',
        });
      }
    }
  }
  return [...byId.values()];
}

/** `ATTACK` -> `totalAttack`; the sheet key a secondary stat type formats under, when there is one. */
const sheetKeyOf = (type) => `total${String(type).toLowerCase().replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase())}`;

/** StatTable rows for a drop's stats: attack and HP, then each secondary stat as the game prints it. */
export function dropStatRows(item) {
  if (!item) return [];
  const rows = [];
  if (item.primaryStats?.attack) rows.push({ key: 'totalAttack', label: 'Attack', value: item.primaryStats.attack });
  if (item.primaryStats?.hp) rows.push({ key: 'totalHp', label: 'HP', value: item.primaryStats.hp });
  for (const s of item.secondaryStats ?? []) {
    const key = sheetKeyOf(s.type);
    rows.push({ key: sheetKeyMeta(key) ? key : `secondary:${s.type}`, label: statLabel(s.type), value: Number(toDisplay(s.type, s.value)) });
  }
  return rows;
}

/**
 * A drop's stats as read-only lines (backlog §6: labels, never raw keys): Attack and Health as flat figures
 * ("." thousands), then every secondary as the gear components print it ("Health +4.5%").
 * @returns {{primary: Array<{label: string, text: string}>, secondary: Array<{label: string, text: string}>}}
 */
export function dropStatLines(item) {
  if (!item) return { primary: [], secondary: [] };
  const primary = [
    { label: 'Attack', text: formatFlat(item.primaryStats?.attack ?? 0) },
    { label: 'Health', text: formatFlat(item.primaryStats?.hp ?? 0) },
  ];
  const secondary = (item.secondaryStats ?? []).map((s) => statParts(s.type, s.value));
  return { primary, secondary };
}
