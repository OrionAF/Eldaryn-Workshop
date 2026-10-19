// store/apply.js (A2): the one mutator that writes an optimiser candidate (redesign plan A.11).
// search/patch.js applyCandidate does the write; this normalises (which reconciles) and persists.
// A full apply is refused when the candidate is not legal (search/legality.js), so a suggestion is
// written exactly as it was scored; an apply with groups excluded relies on reconcile for the rest.
import { normaliseCharacter } from '../model/index.js';
import { applyCandidate as writeCandidate, SCOPES } from '../search/patch.js';
import { legalityOf } from '../search/legality.js';
import { relicLevelViolations } from '../search/relicProgression.js';
import { boardAllocationViolations } from '../search/boardAllocation.js';
import { awakeningViolations } from '../search/awakeningChoices.js';
import { ancientActive, effectiveTranscendencePreset } from '../model/legality.js';

export function createApplyStore(ctx) {
  /**
   * Write `cand` onto preset `presetId` of the current character.
   * @param {string} presetId
   * @param {Object} cand  a Candidate (search/space.js)
   * @param {{include?: string[]}} [opts]  scopes to write ('preset', 'character', 'mount'); default all
   * @returns {{ok: boolean, violations: Array<{gate: string, field: string, detail: string}>}}
   */
  function applyCandidate(presetId, cand, { include = SCOPES } = {}) {
    const c = ctx.current();
    if (!c || !ctx.findPreset(presetId, c)) return { ok: false, violations: [{ gate: 'structural', field: 'presetId', detail: `Unknown preset ${presetId}` }] };
    const plain = JSON.parse(JSON.stringify(c)); // the roster is a reactive proxy
    if (SCOPES.every((s) => include.includes(s))) {
      const r = legalityOf(plain, presetId, cand);
      if (!r.ok) return { ok: false, violations: r.violations };
    }
    if (include.includes('character')) {
      const errors = [
        ...relicLevelViolations(plain, cand).map((detail) => ({ gate: 'relics', field: 'relicLevels', detail })),
        ...boardAllocationViolations(plain, cand).map((detail) => ({ gate: 'boardAllocation', field: 'boardAllocation', detail })),
        ...awakeningViolations(plain, cand).map((detail) => ({ gate: 'awakening', field: 'awakening', detail })),
      ];
      if (errors.length) return { ok: false, violations: errors };
    }
    const written = writeCandidate(plain, presetId, cand, { include });
    const selected = written.presets.find((p) => p.id === presetId);
    if ((include.includes('preset') || cand.boardAllocation) && selected.ancientSigilSpecies && !ancientActive(selected.ancientSigilSpecies, effectiveTranscendencePreset(written, selected))) {
      return { ok: false, violations: [{ gate: 'ancientBoard', field: 'boardAllocation', detail: 'The equipped Ancient sigil requires its node on the selected board.' }] };
    }
    if (include.includes('preset') && cand.relicIds.some((id) => !(written.relics?.[id] > 0))) {
      return { ok: false, violations: [{ gate: 'relics', field: 'relicIds', detail: 'Apply a relic purchase together with its equipment change.' }] };
    }
    const next = normaliseCharacter(written);
    const roster = ctx.roster();
    const i = roster.characters.findIndex((x) => x.id === c.id);
    roster.characters[i] = next;
    ctx.persist();
    return { ok: true, violations: [] };
  }

  return { applyCandidate };
}
