// store/relics.js - relic level mutators (character-wide), purchased slots and per-preset equip.
import { relicById } from '../game/relics.js';
import { relicSlotCap } from '../model/legality.js';
import { normaliseExtraRelicSlots } from '../model/relics.js';

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
      ctx.reconcile(c); // a relic at level 0 is not owned: it leaves every preset
    });
  }

  /** Equip/unequip one relic on a preset; an unowned relic or one beyond the slot cap is refused (returns false). */
  function togglePresetRelic(presetId, relicId) {
    return ctx.editPreset(presetId, (p, c) => {
      if (p.relicIds.includes(relicId)) {
        p.relicIds = p.relicIds.filter((id) => id !== relicId);
        return true;
      }
      if (!relicById(relicId) || !(c.relics[relicId] > 0) || p.relicIds.length >= relicSlotCap(c.level, c.extraRelicSlots)) return false;
      p.relicIds = [...p.relicIds, relicId];
      return true;
    });
  }

  /** Relic slots bought beyond the base 2 (0-2); lowering it trims presets through reconcile. */
  function setExtraRelicSlots(n) {
    ctx.edit((c) => {
      c.extraRelicSlots = normaliseExtraRelicSlots(n);
      ctx.reconcile(c);
    });
  }

  // setPresetRelics (bulk replace) lives in store/presets.js.
  return { setRelicLevel, setExtraRelicSlots, togglePresetRelic };
}
