// harness/baseline.js (H3): a random character made fit to be an optimiser baseline. Test support only.
import { normaliseCharacter } from '../model/index.js';

/**
 * The character with its level-locked links cleared (mount below 40, board link below 58, second talent
 * set below 38), so a low generated level never leaves the baseline preset itself breaking a game gate.
 */
export function withLegalBaseline(character) {
  const raw = structuredClone(character);
  for (const p of raw.presets) {
    if (raw.level < 40) p.mountId = null;
    if (raw.level < 58) p.transcendencePresetId = null;
    if (raw.level < 38) p.talentSet = 0;
  }
  return normaliseCharacter(raw);
}
