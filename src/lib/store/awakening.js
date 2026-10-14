// store/awakening.js - Awakening mutators (character-wide).
import { normaliseAwakening } from '../model/awakening.js';

export function createAwakeningStore(ctx) {
  const make = (path, level) => normaliseAwakening({ awakening: { path, level } }).awakening;

  /** Choosing a different path resets the points; null clears. */
  function setAwakeningPath(path) {
    ctx.edit((c) => {
      const next = make(path, 0);
      if (next.path !== c.awakening.path) c.awakening = next;
    });
  }

  function setAwakeningLevel(level) {
    ctx.edit((c) => {
      c.awakening = make(c.awakening.path, level);
    });
  }

  function resetAwakening() {
    ctx.edit((c) => {
      c.awakening = make(null, 0);
    });
  }

  return { setAwakeningPath, setAwakeningLevel, resetAwakening };
}
