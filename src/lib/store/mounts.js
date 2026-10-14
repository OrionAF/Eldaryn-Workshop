// store/mounts.js - owned by B4. Mutators for mounts and the glyph inventory (model/mounts.js, model/glyphs.js).
// Every mutator edits through ctx.edit (which persists) and reconciles first, so removing a glyph or a mount also
// clears the sockets / preset.mountId that pointed at it. Which mount a preset rides: presets store `setPresetMount`.
import { MOUNT_GLYPH_SOCKETS, glyphSocketable, newMount, normaliseMount } from '../model/mounts.js';
import { glyphTier, newGlyph, normaliseGlyph } from '../model/glyphs.js';

const fail = (reason) => ({ ok: false, reason });

export function createMountsStore(ctx) {
  /** @returns {string|null} the new mount's id; null when the species is unknown. */
  function addMount(fields) {
    return ctx.edit((c) => {
      const m = newMount(fields);
      if (!m) return null;
      c.mounts.push(m);
      return m.id;
    });
  }

  /** Patch level / baseHp / baseAtk. The species (and so the rarity) cannot change. */
  function updateMount(mountId, patch = {}) {
    ctx.edit((c) => {
      const i = c.mounts.findIndex((m) => m.id === mountId);
      if (i === -1) return;
      const cur = c.mounts[i];
      const next = normaliseMount({
        ...cur,
        ...(patch.level !== undefined && { level: patch.level }),
        ...(patch.baseHp !== undefined && { baseHp: patch.baseHp }),
        ...(patch.baseAtk !== undefined && { baseAtk: patch.baseAtk }),
      });
      if (next) c.mounts[i] = next;
    });
  }

  function removeMount(mountId) {
    ctx.edit((c) => {
      c.mounts = c.mounts.filter((m) => m.id !== mountId);
      ctx.reconcile(c);
    });
  }

  /**
   * Put a glyph in (or, with glyphId null, take it out of) socket `index` of `tier`. A glyph instance fits one
   * socket, so socketing one that sits elsewhere moves it. Refused (nothing changes) for a sealed glyph, a glyph of
   * another tier, a major that is not usable by the class/talent specs, or a bad index.
   * @returns {{ok: true} | {ok: false, reason: string}}
   */
  function setMountSocket(mountId, tier, index, glyphId) {
    return ctx.edit((c) => {
      const mount = c.mounts.find((m) => m.id === mountId);
      if (!mount) return fail('no such mount');
      if (!(tier in MOUNT_GLYPH_SOCKETS)) return fail('unknown socket tier');
      if (!Number.isInteger(index) || index < 0 || index >= MOUNT_GLYPH_SOCKETS[tier]) return fail('no such socket');
      if (glyphId == null) {
        mount.glyphs[tier][index] = null;
        return { ok: true };
      }
      const glyph = c.glyphs.find((g) => g.id === glyphId);
      if (!glyph) return fail('no such glyph');
      if (glyph.sealed) return fail('sealed glyphs cannot be socketed');
      if (glyphTier(glyph.glyphType) !== tier) return fail('wrong socket tier');
      if (!glyphSocketable(c, glyph, tier)) return fail('this major glyph is not usable by your class or spec');
      for (const m of c.mounts) for (const t of Object.keys(m.glyphs)) m.glyphs[t] = m.glyphs[t].map((id) => (id === glyphId ? null : id));
      mount.glyphs[tier][index] = glyphId;
      return { ok: true };
    });
  }

  /** @returns {string|null} the new glyph's id; null when the type is unknown or a major of another class. */
  function addGlyph(fields) {
    return ctx.edit((c) => {
      const g = newGlyph(fields, { class: c.class });
      if (!g) return null;
      c.glyphs.push(g);
      return g.id;
    });
  }

  /** Patch rarity / sealed / secondary ({stat, quality}|null). Sealing a glyph also empties its socket (reconcile). */
  function updateGlyph(glyphId, patch = {}) {
    ctx.edit((c) => {
      const i = c.glyphs.findIndex((g) => g.id === glyphId);
      if (i === -1) return;
      const next = normaliseGlyph({ ...c.glyphs[i], ...patch, id: glyphId, glyphType: c.glyphs[i].glyphType }, { class: c.class });
      if (next) c.glyphs[i] = next;
      ctx.reconcile(c);
    });
  }

  function removeGlyph(glyphId) {
    ctx.edit((c) => {
      c.glyphs = c.glyphs.filter((g) => g.id !== glyphId);
      ctx.reconcile(c);
    });
  }

  return { addMount, updateMount, removeMount, setMountSocket, addGlyph, updateGlyph, removeGlyph };
}
