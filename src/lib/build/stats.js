// build/stats.js (C1a): pick the effective stat sheet for a preset (rebuild-plan §4, three tiers).
//   tier 2  a sheet the user entered (preset.sheet, or oblivion.sheet in the Oblivion realm) is used verbatim;
//   tier 1  otherwise calculateTotalStats on the user's pieces.
//   tier 3  the gap between the two is the `residual` (build/residual.js), carried onto candidates.
import { calculateTotalStats } from '../engine/pipeline/totals.js';
import { sheetKeyMeta } from '../engine/pipeline/sheet.js';
import { buildPresetInputs } from './presetInputs.js';
import { computeResidual, sheetValuesOf } from './residual.js';

/** The Sheet that applies to a preset in a realm, or null. */
export function sheetFor(character, preset, realm = 'base') {
  return (realm === 'oblivion' ? character?.oblivion?.sheet : preset?.sheet) ?? null;
}

/**
 * Overlay sheet values on computed stats. Keys the sheet lacks keep their computed value. A computed
 * `raw*` is dropped when the sheet supplies the total without it (the computed raw would describe a
 * different total), and Dominion always comes from the pipeline: it is derived, never entered.
 */
export function overlaySheet(computed, values) {
  const out = { ...computed };
  for (const [key, v] of Object.entries(values)) {
    out[key] = v;
    const meta = sheetKeyMeta(key);
    if (meta?.rawKey && !(meta.rawKey in values)) delete out[meta.rawKey];
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
 *   sheet: {values: Object<string, number>, enteredAt?: string}|null,
 *   residual: Object<string, number>,
 *   source: 'sheet'|'computed',
 *   ctx: {playerClass: string, formConfig: Object|null, activeSpec: string|null},
 *   preset: Object, spec: string|null, realm: string, formKind: 'BEAR'|'WOLF'|null,
 *   ancientDropped: boolean, warnings: string[],
 * }}
 */
export function computePresetStats(character, presetId, { realm = 'base' } = {}) {
  const inputs = buildPresetInputs(character, presetId, { realm });
  const computed = calculateTotalStats(...inputs.args, inputs.ctx);
  const raw = sheetFor(character, inputs.preset, realm);
  const values = raw ? sheetValuesOf(raw) : {};
  const hasSheet = Object.keys(values).length > 0;
  return {
    effective: hasSheet ? overlaySheet(computed, values) : computed,
    computed,
    sheet: hasSheet ? { values, enteredAt: raw.enteredAt } : null,
    residual: hasSheet ? computeResidual(computed, values, { playerClass: character.class }) : {},
    source: hasSheet ? 'sheet' : 'computed',
    ctx: inputs.ctx,
    preset: inputs.preset,
    spec: inputs.spec,
    realm,
    formKind: inputs.formKind,
    ancientDropped: inputs.ancientDropped,
    warnings: inputs.warnings,
  };
}
