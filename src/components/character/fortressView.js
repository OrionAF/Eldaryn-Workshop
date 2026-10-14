// fortressView.js: display helpers for the Character screen's clan fortress cards. Pure; no store.
// Buff stat keys are camelCase (clan-fortress.json `buffs`); labels come from the same pool the gear
// editor uses, so the same stat reads the same everywhere.
import { statLabel } from '../gear/gearFormat.js';
import { statByEnum } from '../../lib/game/stats.js';
import { formatFlat, formatPct } from '../../lib/format.js';

/** `attackPercent` -> `ATTACK_PERCENT`. */
const toEnum = (key) => String(key).replace(/([A-Z])/g, '_$1').toUpperCase();

/** "Attack %", "Dmg Reduction", "PVP Attack" for a fortress buff key. */
export function fortressStatLabel(key) {
  return statLabel(toEnum(key));
}

/**
 * Buff value with its unit: percent points get "%", multiplier stats (Attack Speed 0.03) show as the
 * sheet does (+3%), PvP ratings are plain integers.
 */
export function fortressStatValue(key, value) {
  const meta = statByEnum(toEnum(key));
  if (typeof meta?.unit === 'string' && meta.unit.startsWith('rating')) return `+${formatFlat(value)}`;
  return `+${formatPct(value * (meta?.displayMult ?? 1))}%`;
}
