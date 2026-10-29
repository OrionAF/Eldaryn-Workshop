// features/statPriority.js: the stat priority card, the one-line "A > B ≈ C" other games' build guides
// use. Read from the Spec guide's per-roll values (src/data/specGuide.json) and the game's soft caps;
// the Awakening path from the Spec baseline. Contract: docs/Reference/simulation.md §Stat priority.
//
//   priorityTiers()   rows ranked by their mean score over the guide's levels, grouped into near-ties
//   specPriority()    one spec's card: main and second list, gear to look for, stats to ignore, caps, path
//   priorityText()    the card as text to share
import { classLabel } from '../game/classes.js';
import { AWAKENING_PATHS } from '../game/awakening.js';
import { guideSpec, guideSpecLabel } from './specGuide.js';

/** Two stats are a near-tie ("≈") when the weaker is worth at least this share of its tier's best. */
export const TIE_RATIO = 0.85;
/** Specs whose card leads with survival. */
export const TANK_SPECS = new Set(['WARRIOR_TANK', 'MYSTIC_DRUID_BEAR']);
/** How many of the main list's stats the card says to look for on gear. */
export const KEEP_COUNT = 3;

const MULTIPLIER_KEYS = new Set(['totalAttackSpeed', 'totalCritDamage', 'totalMinionAttackSpeed']);

/**
 * A list's stats ranked by mean score over `entries` (one per level; a level where a stat has no clear
 * effect counts 0), grouped into tiers of near-ties. Stats with no clear effect at any level, or none
 * for the class, are left out. Also the levels where a stat sits two or more places from its overall rank.
 * @returns {{tiers: Array<Array<{key, label, score}>>, shifts: Array<{key, label, level, rank, overall}>}}
 */
export function priorityTiers(entries, list) {
  const sum = new Map();
  for (const e of entries) {
    for (const r of e[list]) {
      const s = sum.get(r.key) ?? { key: r.key, label: r.label, total: 0 };
      s.total += r.inert ? 0 : r.score ?? 0;
      sum.set(r.key, s);
    }
  }
  const ranked = [...sum.values()].filter((s) => s.total > 0).map((s) => ({ key: s.key, label: s.label, score: s.total / entries.length }))
    .sort((a, b) => b.score - a.score);
  const tiers = [];
  for (const s of ranked) {
    const t = tiers[tiers.length - 1];
    if (t && s.score >= TIE_RATIO * t[0].score) t.push(s);
    else tiers.push([s]);
  }
  const overall = new Map(ranked.map((s, i) => [s.key, i]));
  const shifts = [];
  for (const e of entries) {
    const order = e[list].filter((r) => overall.has(r.key) && r.score > 0 && !r.inert).map((r) => r.key);
    order.forEach((k, i) => {
      if (Math.abs(i - overall.get(k)) >= 2) shifts.push({ key: k, label: sum.get(k).label, level: e.level, rank: i + 1, overall: overall.get(k) + 1 });
    });
  }
  return { tiers, shifts };
}

export const tierLine = (tiers) => tiers.map((t) => t.map((s) => s.label).join(' ≈ ')).join(' > ');

const capPct = (key, v) => `${MULTIPLIER_KEYS.has(key) ? Math.round(v * 100) : v}%`;

/**
 * One spec's card. `guide` is specGuide.json, `baseline` specBaseline.json (for the Awakening path the
 * simulated players took most from level 60).
 */
export function specPriority(guide, baseline, id) {
  const g = guideSpec(id);
  const entries = guide.entries.filter((e) => e.id === id).sort((a, b) => a.level - b.level);
  const damage = priorityTiers(entries, 'damage');
  const survival = priorityTiers(entries, 'survival');
  const tank = TANK_SPECS.has(id);
  const main = tank ? { kind: 'survival', ...survival } : { kind: 'damage', ...damage };
  const second = tank ? { kind: 'damage', ...damage } : { kind: 'survival', ...survival };
  const keep = main.tiers.flat().slice(0, KEEP_COUNT).map((s) => s.label);

  // stats no list ranks: no effect for the class (inert) or too little to measure, at every level
  const ranked = new Set([...damage.tiers.flat(), ...survival.tiers.flat()].map((s) => s.key));
  const rows = new Map();
  for (const e of entries) for (const r of [...e.damage, ...e.survival]) if (!ranked.has(r.key)) rows.set(r.key, { label: r.label, inert: (rows.get(r.key)?.inert ?? true) && !!r.inert });
  const ignore = [...rows.values()].map((r) => ({ label: r.label, reason: r.inert ? `no effect for ${classLabel(g.cls)}` : 'too little to measure' }));

  const caps = [];
  const any = entries[entries.length - 1];
  for (const s of main.tiers.flat()) {
    const cap = [...any.damage, ...any.survival].find((r) => r.key === s.key)?.cap;
    if (cap) {
      const soft = capPct(s.key, cap.soft);
      const hard = capPct(s.key, cap.hard);
      caps.push({ label: s.label, soft, hard, text: `${soft} (hard ${hard})` });
    }
  }

  const profile = tank ? 'balanced' : 'damage';
  const counts = {};
  for (const e of baseline.entries) if (e.id === id && e.profile === profile && e.level >= 60 && e.path) counts[e.path] = (counts[e.path] ?? 0) + 1;
  const path = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    id, label: guideSpecLabel(g), cls: g.cls, tank, levels: entries.map((e) => e.level),
    main, second, keep, ignore, caps, path,
  };
}

const LIST_TITLES = { damage: 'Damage', survival: 'Survival' };

/** The card as plain text, ready to paste. */
export function priorityText(card) {
  const lines = [`${card.label}: stat priority`, `${LIST_TITLES[card.main.kind]}: ${tierLine(card.main.tiers)}`];
  if (card.second.tiers.length) lines.push(`${LIST_TITLES[card.second.kind]}: ${tierLine(card.second.tiers)}`);
  lines.push(`Look for on gear: ${card.keep.join(', ')}`);
  if (card.ignore.length) lines.push(`Ignore: ${card.ignore.map((r) => `${r.label} (${r.reason})`).join(', ')}`);
  if (card.path) lines.push(`Awakening: ${AWAKENING_PATHS[card.path].name}`);
  if (card.caps.length) lines.push(`Soft caps: ${card.caps.map((c) => `${c.label} ${c.text}`).join(', ')}`);
  return lines.join('\n');
}
