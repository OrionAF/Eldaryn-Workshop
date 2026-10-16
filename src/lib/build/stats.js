// build/stats.js (C1a): pick the effective stat sheet for a preset (rebuild-plan §4, three tiers).
//   tier 2  a sheet the user entered (preset.sheet, or oblivion.sheet in the Oblivion realm) is used
//           verbatim while it still describes the build (sheet status: data-model.md §6);
//   tier 1  otherwise calculateTotalStats on the user's pieces.
//   tier 3  the gap between the two is the `residual` (build/residual.js), carried onto candidates.
import { calculateTotalStatsExact } from '../engine/pipeline/totals.js';
import { sheetKeyMeta } from '../engine/pipeline/sheet.js';
import { metricKey } from '../engine/metrics.js';
import { buildPresetInputs } from './presetInputs.js';
import { computeResidual, sheetValuesOf } from './residual.js';

/** The Sheet that applies to a preset in a realm, or null. */
export function sheetFor(character, preset, realm = 'base') {
  return (realm === 'oblivion' ? character?.oblivion?.sheet : preset?.sheet) ?? null;
}

// The base residual (args[0]) is left out: absorbing a sheet gap changes it, not the build.
function inputsKeyOf(inputs, level) {
  return metricKey('sheet', inputs.args.slice(1), inputs.ctx, inputs.realm, level);
}

/**
 * Fingerprint of the build a sheet describes: the preset's engine inputs (bar the base residual),
 * realm and character level. Stored as `sheet.inputsKey` when a sheet is entered or confirmed.
 * @returns {string}
 */
export function sheetInputsKey(character, presetId, { realm = 'base' } = {}) {
  return inputsKeyOf(buildPresetInputs(character, presetId, { realm }), character?.level);
}

// data-model.md §6 sheet status. `foreign`: an Oblivion sheet owned by another preset.
function statusOf(sheet, presetId, key) {
  if (!sheet) return { status: 'none', foreign: false };
  if (sheet.presetId && sheet.presetId !== presetId) return { status: 'stale', foreign: true };
  if (!sheet.inputsKey) return { status: 'unverified', foreign: false };
  return { status: sheet.inputsKey === key ? 'fresh' : 'stale', foreign: false };
}

const WARN = {
  foreign: 'These Oblivion stats were entered for another preset, so the numbers from the app are used here.',
  stale: 'Your in-game stats are out of date (the build changed since you typed them), so the numbers from the app are used.',
  unverified: 'Your in-game stats have not been confirmed to match this build.',
};

/**
 * Overlay sheet values on computed stats. Keys the sheet lacks keep their computed value. A computed
 * `raw*` the sheet omits is kept only while the computed total equals the sheet's (it then describes
 * the same total, #17); otherwise it is dropped. Dominion always comes from the pipeline: it is
 * derived, never entered.
 */
export function overlaySheet(computed, values) {
  const out = { ...computed };
  for (const [key, v] of Object.entries(values)) {
    out[key] = v;
    const meta = sheetKeyMeta(key);
    if (meta?.rawKey && !(meta.rawKey in values) && !(Math.abs(computed[key] - v) < 1e-9)) delete out[meta.rawKey];
  }
  out.totalDominion = computed.totalDominion;
  return out;
}

/**
 * Stats of one preset.
 * @param {Object} character  a normalised v2 Character
 * @param {string} [presetId]  default: the active preset
 * @param {{realm?: 'base'|'oblivion'}} [opts]
 * @returns {{
 *   effective: import('../engine/types.js').ComputedStats,
 *   computed: import('../engine/types.js').ComputedStats,
 *   exact: Object,
 *   sheet: {values: Object<string, number>, enteredAt: string|null, inputsKey: string|null, presetId?: string|null}|null,
 *   sheetStatus: 'fresh'|'stale'|'unverified'|'none',
 *   inputsKey: string|null,
 *   residual: Object<string, number>,
 *   source: 'sheet'|'computed',
 *   ctx: {playerClass: string, formConfig: Object|null, activeSpec: string|null},
 *   preset: Object, spec: string|null, realm: string, formKind: 'BEAR'|'WOLF'|null,
 *   ancientDropped: boolean, warnings: string[],
 * }}
 *   `sheet` is the stored sheet whatever its status (for display and re-entry). It is overlaid, and
 *   a residual taken, only when `source` is 'sheet' (status fresh or unverified). `exact` is the
 *   computed pipeline's unrounded split (anchoredDelta's `ctx.exact`); `inputsKey` the current
 *   build's fingerprint (null when there is no sheet).
 */
export function computePresetStats(character, presetId, { realm = 'base' } = {}) {
  const inputs = buildPresetInputs(character, presetId, { realm });
  const { stats: computed, exact } = calculateTotalStatsExact(...inputs.args, inputs.ctx);
  const raw = sheetFor(character, inputs.preset, realm);
  const values = raw ? sheetValuesOf(raw) : {};
  const stored = Object.keys(values).length > 0 ? raw : null;
  // Only fingerprinted when a sheet exists: optimiser candidates (sheets cleared) skip the hashing.
  const inputsKey = stored ? inputsKeyOf(inputs, character?.level) : null;
  const { status, foreign } = statusOf(stored, inputs.preset?.id, inputsKey);
  const applied = status === 'fresh' || status === 'unverified';
  const warnings = [...inputs.warnings];
  if (status !== 'fresh' && status !== 'none') warnings.push(WARN[foreign ? 'foreign' : status]);
  let sheet = null;
  if (stored) {
    sheet = { values, enteredAt: stored.enteredAt ?? null, inputsKey: stored.inputsKey ?? null };
    if ('presetId' in stored) sheet.presetId = stored.presetId ?? null;
  }
  return {
    effective: applied ? overlaySheet(computed, values) : computed,
    computed,
    exact,
    sheet,
    sheetStatus: status,
    inputsKey,
    residual: applied ? computeResidual(computed, values, { playerClass: character.class }) : {},
    source: applied ? 'sheet' : 'computed',
    ctx: inputs.ctx,
    preset: inputs.preset,
    spec: inputs.spec,
    realm,
    formKind: inputs.formKind,
    ancientDropped: inputs.ancientDropped,
    warnings,
  };
}
