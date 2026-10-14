// store/stones.js (B1): enchant-stone pool mutators. `realm` picks the pool: 'base' -> enchantStones,
// 'oblivion' -> oblivionEnchantStones (separate lists, stones.md §4). Every mutator ends with
// persist(); removal runs reconcile so a deleted stone leaves every socket.
import { normaliseStone } from '../model/stones.js';

function poolOf(c, realm) {
  return realm === 'oblivion' ? c.oblivionEnchantStones : c.enchantStones;
}

export function createStonesStore(ctx) {
  /** @returns {string|null} the new stone's id, or null when the stone is invalid (unknown type). */
  function addEnchantStone(realm, stone) {
    return ctx.edit((c) => {
      const pool = poolOf(c, realm);
      const norm = normaliseStone({ ...stone, id: undefined }, new Set(pool.map((s) => s.id)));
      if (!norm) return null;
      pool.push(norm);
      return norm.id;
    });
  }

  /** Merge a partial {quality, amplifyLevel, oblivionLevel, stats} into one stone (type and id are fixed). */
  function updateEnchantStone(realm, stoneId, patch) {
    return ctx.edit((c) => {
      const pool = poolOf(c, realm);
      const i = pool.findIndex((s) => s.id === stoneId);
      if (i === -1) return false;
      const { id, type } = pool[i];
      const others = new Set(pool.filter((s) => s.id !== stoneId).map((s) => s.id));
      pool[i] = normaliseStone({ ...pool[i], ...patch, id, type }, others);
      return true;
    });
  }

  function removeEnchantStone(realm, stoneId) {
    return ctx.edit((c) => {
      const pool = poolOf(c, realm);
      const i = pool.findIndex((s) => s.id === stoneId);
      if (i === -1) return false;
      pool.splice(i, 1);
      ctx.reconcile(c);
      return true;
    });
  }

  return { addEnchantStone, updateEnchantStone, removeEnchantStone };
}
