// model/oblivion.js - M1 SHAPE, owned by F4 from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character field: oblivion. Shape: rebuild-plan §3 `oblivion` and §2.5.
// Unlike the other domain stubs this one normalises for real, because the nav gate
// (`character.oblivion.unlocked`) and the `setOblivionUnlocked` mutator depend on it from M1 on.
// Contract: see model/pets.js header (partial-character functions).
import { normaliseSheet } from './character.js';

export function defaultOblivion() {
  return { oblivion: { unlocked: false, level: 0, activeRealm: 'base', sheet: null } };
}

// eslint-disable-next-line no-unused-vars
export function normaliseOblivion(rawCharacter, ctx) {
  const r = rawCharacter?.oblivion && typeof rawCharacter.oblivion === 'object' ? rawCharacter.oblivion : {};
  const unlocked = r.unlocked === true;
  const lvl = Math.floor(Number(r.level));
  return {
    oblivion: {
      unlocked,
      level: Number.isFinite(lvl) ? Math.min(100, Math.max(0, lvl)) : 0,
      // A locked realm can never be the active one.
      activeRealm: unlocked && r.activeRealm === 'oblivion' ? 'oblivion' : 'base',
      sheet: normaliseSheet(r.sheet),
    },
  };
}

// eslint-disable-next-line no-unused-vars
export function migrateOblivionFromV1(v1Character) {
  return { value: defaultOblivion(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileOblivion(character) {}
