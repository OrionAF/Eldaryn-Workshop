// ui/deepCheckView.js: the view model of Drop Check's deep check (features/deepCheck.js, simulation.md
// §Drop Check, Deep check). Pure: which presets and goals a deep check can run on, the job request, and the result
// card. Nothing here decides a verdict (deepCheck.js and swap.js verdictFor do).
import { goalsForRealm, goalJudgesPreset, requestGoals } from './dropGoals.js';
import { goalFigure, chipFor } from '../features/dropView.js';
import { guardText } from '../features/swap.js';
import { DEEP_BUDGET_MS } from '../features/deepCheck.js';

/** Time per side the panel offers, in minutes (the default is DEEP_BUDGET_MS). */
export const DEEP_MINUTES = Object.freeze([1, 2, 5, 10]);
export const DEEP_DEFAULT_MINUTES = DEEP_BUDGET_MS / 60_000;

/** The judge goals of `realm` that judge `presetId`: the goals a deep check of that preset can optimise for. */
export const deepGoals = (resolved, realm, presetId) => goalsForRealm(resolved, realm).filter((r) => r.role !== 'guard' && goalJudgesPreset(r, presetId));
/** The guards of `realm` that judge `presetId`: checked on the re-tuned build with the drop. */
export const deepGuards = (resolved, realm, presetId) => goalsForRealm(resolved, realm).filter((r) => r.role === 'guard' && goalJudgesPreset(r, presetId));

/**
 * The worker request (mode 'dropDeepCheck'), or null when the preset has no judge goal `goalId`.
 * @param {{character: Object, presetId: string, drop: Object, realm: string, resolved: Object[], goalId: string,
 *   space: 'full'|'light', minutes: number, precision: string, seed: number, reuse?: Object|null}} o
 *   `character` already stripped of runs (dropBatch.js goalCharacter)
 */
export function deepRequest({ character, presetId, drop, realm, resolved, goalId, space, minutes, precision, seed, reuse = null }) {
  const judge = deepGoals(resolved, realm, presetId).find((r) => r.goal.id === goalId);
  if (!judge || !drop?.item) return null;
  const [goal] = requestGoals([judge]);
  return {
    mode: 'dropDeepCheck',
    character,
    presetId,
    drop: { slot: drop.slot, realm, item: JSON.parse(JSON.stringify(drop.item)) },
    goal,
    guards: requestGoals(deepGuards(resolved, realm, presetId)),
    space: space === 'light' ? 'light' : 'full',
    effort: { level: precision },
    budgetMs: Math.round(minutes * 60_000),
    seed,
    precision,
    reuse,
  };
}

/** A goal figure as text on its axis: percent, points or the goal's own unit. */
export function figureText(f, unit = '') {
  if (!f) return '';
  const s = (v, d) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;
  if (f.axis === 'pts') return `${s(f.est, 1)} pts (${s(f.lo, 1)} to ${s(f.hi, 1)})`;
  if (f.axis === 'raw') return `${s(f.est, 2)}${unit ? ` ${unit}` : ''} (${s(f.lo, 2)} to ${s(f.hi, 2)})`;
  return `${s(f.est, 1)}% (${s(f.lo, 1)}% to ${s(f.hi, 1)}%)`;
}

const changeText = (c) => (c.from != null && c.to != null && c.from !== '' ? `${c.label}: ${c.from} → ${c.to}` : c.label);

/**
 * The result card of a finished (or cancelled) deep check.
 * @returns {{chip: {verdict: string, label: string}, partial: boolean, unworn: boolean, drop: string, retune: string,
 *   withChanges: string[], withoutChanges: string[], guards: Array<{id: string, label: string, status: string, text: string}>,
 *   reused: boolean, notes: string[]}}
 */
export function deepCard(result) {
  const dropFig = result?.drop ? goalFigure(result.drop) : null;
  const retuneFig = result?.retune ? goalFigure(result.retune) : null;
  const done = result?.status === 'done' || (result?.partial && !!result?.drop);
  return {
    chip: done && result?.verdict ? chipFor(result.verdict, 'sim') : chipFor(null, 'closed'),
    partial: !!result?.partial,
    unworn: result?.reason === 'unworn',
    drop: figureText(dropFig, result?.drop?.unit),
    retune: figureText(retuneFig, result?.retune?.unit),
    withChanges: (result?.with?.changes ?? []).map(changeText),
    withoutChanges: (result?.without?.changes ?? []).map(changeText),
    guards: (result?.guards ?? []).filter((g) => g?.guard).map((g) => ({ id: g.goalId, label: g.label, status: g.guard.status, text: guardText(g) })),
    reused: !!result?.without?.run?.reused,
    notes: result?.guardNotes ?? [],
  };
}
