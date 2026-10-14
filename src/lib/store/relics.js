// store/relics.js - relic level mutators (character-wide) and per-preset equip (<=4).
import { relicById } from '../game/relics.js';
import { PRESET_RELIC_CAP } from '../model/presets.js';

export function createRelicsStore(ctx) {
  /** Set an owned relic's level; 0 removes it. Ignores relics outside the character's class. */
  function setRelicLevel(relicId, level) {
    const def = relicById(relicId);
    if (!def) return;
    ctx.edit((c) => {
      if (def.class.toUpperCase() !== c.class) return;
      const n = Math.max(0, Math.min(def.maxLevel, Math.floor(Number(level)) || 0));
      if (n > 0) c.relics[relicId] = n;
      else delete c.relics[relicId];
    });
  }

  /** Equip/unequip one relic on a preset; equipping beyond the cap is refused (returns false). */
  function togglePresetRelic(presetId, relicId) {
    return ctx.editPreset(presetId, (p) => {
      if (p.relicIds.includes(relicId)) {
        p.relicIds = p.relicIds.filter((id) => id !== relicId);
        return true;
      }
      if (!relicById(relicId) || p.relicIds.length >= PRESET_RELIC_CAP) return false;
      p.relicIds = [...p.relicIds, relicId];
      return true;
    });
  }

  // setPresetRelics (bulk replace) lives in store/presets.js.
  return { setRelicLevel, togglePresetRelic };
}
