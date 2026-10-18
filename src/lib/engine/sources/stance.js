// 2.7.4 getEquippedStanceConfig; see Game/sigils.md §15.
import { sigilBySpecies } from '../../game/sigils.js';
import { getSigilSpellScaled } from './sigilScale.js';

export function getEquippedStanceConfig(state, playerClass) {
  if (playerClass !== 'WARRIOR') return null;
  const owned = state?.ownedSigils?.find((s) => s.species === state.utilitySlotSpecies);
  const def = owned && sigilBySpecies(owned.species);
  if (def?.spellType !== 'STANCE') return null;
  const s = getSigilSpellScaled(def.spell, owned.level, 'STANCE');
  return {
    species: def.species, stance: s.stance, attackMult: s.attackMult,
    hpPercent: s.hpPercent ?? 0, spellResist: s.spellResist ?? 0,
    dazeChance: s.daze?.chancePercent ?? 0, dazeDurationMs: s.daze?.durationMs ?? 0,
    dazePenFactor: s.daze?.penFactor ?? 0,
    shieldBashChance: s.shieldBash?.chancePercent ?? 0, shieldBashStunMs: s.shieldBash?.stunMs ?? 0,
  };
}

export function stanceRuntimeFields(config) {
  if (!config) return {};
  const out = {};
  if (config.dazeChance > 0) Object.assign(out, {
    stanceDazeChance: config.dazeChance, stanceDazeDurationMs: config.dazeDurationMs,
    stanceDazePenFactor: config.dazePenFactor,
  });
  if (config.shieldBashChance > 0) Object.assign(out, {
    stanceShieldBashChance: config.shieldBashChance, stanceShieldBashStunMs: config.shieldBashStunMs,
  });
  return out;
}
