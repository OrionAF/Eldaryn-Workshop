// build/contribution.js (U7/B3): how much each stat source adds to a preset's computed totals.
// A source's contribution is its marginal one: the total with everything, minus the total with that one
// source left out of the same pipeline run. The pipeline is not additive (percent buckets multiply,
// soft caps bend), so the rows do not sum to the total; `rest` is the interaction remainder.
// Relics ride in the stones argument (presetInputs), so the stones row is measured without them.
import { calculateTotalStats } from '../engine/pipeline/totals.js';
import { buildPresetInputs } from './presetInputs.js';

/** Source rows in display order. `arg` indexes presetInputs `args`; relics share args[5] with the stones. */
export const CONTRIBUTION_SOURCES = [
  { id: 'base', label: 'Base stats and the gap from the game', arg: 0 },
  { id: 'gear', label: 'Gear set', arg: 1 },
  { id: 'stones', label: 'Enchant stones', arg: 5 },
  { id: 'relics', label: 'Relics (assumed to add up like enchant stones)', relics: true },
  { id: 'talents', label: 'Talents', arg: 2 },
  { id: 'pet', label: 'Pet', arg: 3 },
  { id: 'mount', label: 'Mount and glyphs', arg: 10 },
  { id: 'sigils', label: 'Sigils', arg: 4 },
  { id: 'awakening', label: 'Awakening', arg: 6 },
  { id: 'transcendence', label: 'Transcendence', arg: 9 },
  { id: 'fortress', label: 'Fortress', arg: 8 },
];

const EMPTY_BASE = { attack: 0, hp: 0, attackSpeed: 0, critChance: 0, critDamage: 0 };

const totals = (args, ctx) => calculateTotalStats(...args, ctx);

function withoutRelics(character, preset, realm) {
  const bare = { ...character, presets: character.presets.map((p) => (p.id === preset.id ? { ...p, relicIds: [] } : p)) };
  return buildPresetInputs(bare, preset.id, { realm });
}

/**
 * @param {Object} character  a normalised v2 Character
 * @param {string} [presetId]
 * @param {{realm?: 'base'|'oblivion'}} [opts]
 * @returns {{total: Object, sources: {id: string, label: string, delta: Object<string, number>}[]}}
 *   `delta` maps every numeric total key to (total - total without the source). Always the computed
 *   pipeline, never the entered sheet.
 */
export function sourceContributions(character, presetId, { realm = 'base' } = {}) {
  const inputs = buildPresetInputs(character, presetId, { realm });
  const total = totals(inputs.args, inputs.ctx);
  const hasRelics = (inputs.preset?.relicIds?.length ?? 0) > 0;
  const bare = hasRelics ? withoutRelics(character, inputs.preset, realm) : inputs;
  const bareTotal = hasRelics ? totals(bare.args, bare.ctx) : total;
  const sources = [];
  for (const src of CONTRIBUTION_SOURCES) {
    let full = total;
    let without;
    if (src.relics) {
      if (!hasRelics) continue;
      without = bareTotal;
    } else if (src.id === 'stones') {
      full = bareTotal;
      const args = [...bare.args];
      args[5] = null;
      without = totals(args, bare.ctx);
    } else {
      const args = [...inputs.args];
      args[src.arg] = src.arg === 0 ? EMPTY_BASE : src.arg === 1 ? {} : null;
      without = totals(args, inputs.ctx);
    }
    const delta = {};
    for (const k of Object.keys(full)) {
      if (typeof full[k] === 'number' && typeof without[k] === 'number') delta[k] = full[k] - without[k];
    }
    sources.push({ id: src.id, label: src.label, delta });
  }
  return { total, sources };
}

/** One stat's rows: each source's delta and the interaction remainder `total - sum(deltas)`. */
export function contributionRows(contrib, key) {
  const rows = contrib.sources.map((s) => ({ id: s.id, label: s.label, value: s.delta[key] ?? 0 }));
  const sum = rows.reduce((a, r) => a + r.value, 0);
  const total = contrib.total[key] ?? 0;
  return { rows, rest: total - sum, total };
}
