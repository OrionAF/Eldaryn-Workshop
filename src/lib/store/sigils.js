// store/sigils.js - sigil ownership and the Altar (B5). Which sigils a PRESET equips is
// setPresetSigils / setPresetSigilCondition in store/presets.js (M1); their legality is enforced by
// model/sigils.js reconcile, which ctx.editPreset and every edit here run.
// Every mutator ends with persist() through ctx.edit.
import { sigilBySpecies } from '../game/sigils.js';
import { sigilForClass, clampSigilLevel, MAX_ALTAR_TIER, EVOLVE_TIER_CAP } from '../model/sigils.js';

export function createSigilsStore(ctx) {
  /**
   * Set an owned sigil's level (1..30; Ancients stay 1). level < 1 (or junk) removes ownership, which
   * also unequips it everywhere. Species the class cannot own are ignored.
   */
  function setSigilLevel(species, level) {
    ctx.edit((c) => {
      if (!sigilForClass(species, c.class)) return;
      const n = Number(level);
      if (!Number.isFinite(n) || n < 1) delete c.sigils.owned[species];
      else c.sigils.owned[species] = { level: clampSigilLevel(species, n) };
      ctx.reconcile(c);
    });
  }

  /** Mark a sigil owned at level 1 / not owned. Convenience over setSigilLevel (used for Ancients). */
  function setSigilOwned(species, owned) {
    if (!sigilBySpecies(species)) return;
    setSigilLevel(species, owned ? 1 : 0);
  }

  /** Correct the recorded Altar tier without touching the collection (data entry). */
  function setSigilAltarTier(tier) {
    ctx.edit((c) => {
      const n = Number(tier);
      if (!Number.isFinite(n)) return;
      c.sigils.altarTier = Math.min(MAX_ALTAR_TIER, Math.max(1, Math.trunc(n)));
    });
  }

  /**
   * Evolve the Altar (sigils.md §3): tier + 1 (capped), every owned sigil destroyed except the unique
   * Ancients. The UI confirms first. Returns false when already at the cap.
   */
  function evolveSigilAltar() {
    return ctx.edit((c) => {
      if (c.sigils.altarTier >= EVOLVE_TIER_CAP) return false;
      c.sigils.altarTier += 1;
      for (const sp of Object.keys(c.sigils.owned)) {
        if (sigilBySpecies(sp)?.rarity !== 'Ancient') delete c.sigils.owned[sp];
      }
      ctx.reconcile(c);
      return true;
    });
  }

  return { setSigilLevel, setSigilOwned, setSigilAltarTier, evolveSigilAltar };
}
