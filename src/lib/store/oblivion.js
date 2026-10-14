// store/oblivion.js (F4): realm toggle and Oblivion Level. Every mutator ends with persist() via ctx.edit.
// `activeRealm` is what other screens read to decide which realm they show.
export function createOblivionStore(ctx) {
  /** Switch realm; 'oblivion' only while the Oblivion hero is unlocked. Returns whether it changed. */
  function setActiveRealm(realm) {
    if (realm !== 'base' && realm !== 'oblivion') return false;
    return (
      ctx.edit((c) => {
        if (realm === 'oblivion' && c.oblivion.unlocked !== true) return false;
        c.oblivion.activeRealm = realm;
        return true;
      }) === true
    );
  }

  /** Oblivion Level, clamped to 0..100 (non-finite input is ignored). */
  function setOblivionLevel(level) {
    const n = Math.floor(Number(level));
    if (!Number.isFinite(n)) return false;
    ctx.edit((c) => {
      c.oblivion.level = Math.min(100, Math.max(0, n));
    });
    return true;
  }

  return { setActiveRealm, setOblivionLevel };
}
