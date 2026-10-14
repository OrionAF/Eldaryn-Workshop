// Awakening source. Bundles come from the L1 catalogue.
// See docs/Reference/Game/awakening.md §3-§4.
import { AWAKENING_PATHS, AWAKENING_KEYS } from '../../game/awakening.js';

const SPELL_KEYS = ['spellResistFlat', 'spellDamageFlat', 'spellCritChanceFlat', 'spellVampFlat'];

/** All-zero 17-key bundle (L1221995-1221997). */
export function zeroAwakening() {
  const o = {};
  for (const k of AWAKENING_KEYS) o[k] = 0;
  return o;
}

// port of getAwakeningBonusPerLevel L1222046-1222121
/** Spec override, then class override, then path default; an override replaces the whole bundle. */
export function awakeningBonusPerLevel(path, playerClass = 'WARRIOR', spec = null) {
  const p = AWAKENING_PATHS[path];
  if (!p) return undefined;
  return (
    (spec ? p.specOverrides?.[spec]?.bonusPerLevel : undefined) ??
    p.classOverrides?.[playerClass]?.bonusPerLevel ??
    p.bonusPerLevel
  );
}

// port of calculateAwakeningBonuses L1221780-1221985
/**
 * @param {{path: string|null, level: number}} awakening
 * @param {string} [playerClass='WARRIOR']
 * @param {string|null} [spec]
 * @returns {import('../types.js').AwakeningBonuses}
 */
export function calculateAwakeningBonuses(awakening, playerClass = 'WARRIOR', spec = null) {
  if (!awakening?.path || !(awakening.level > 0)) return zeroAwakening();
  const per = awakeningBonusPerLevel(awakening.path, playerClass, spec);
  if (!per) return zeroAwakening();
  const out = {};
  for (const k of AWAKENING_KEYS) {
    const v = SPELL_KEYS.includes(k) ? (per[k] ?? 0) : per[k];
    out[k] = parseFloat((v * awakening.level).toFixed(k === 'attackSpeedFlat' ? 2 : 1));
  }
  return out;
}
