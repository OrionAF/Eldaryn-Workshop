// store/context.js - the shared handle every store file receives (M1). Plain JS, no runes: the
// reactive `$state` roster lives in rosterStore.svelte.js and is reached through getRoster().
import { getCurrent, reconcileCharacter } from '../model/index.js';

/**
 * @param {{getRoster: () => object, setRoster: (r: object) => void, persist: () => void}} io
 */
export function createContext({ getRoster, setRoster, persist }) {
  const current = () => getCurrent(getRoster());
  const findCharacter = (id) => getRoster().characters.find((c) => c.id === id) ?? null;
  const findPreset = (presetId, character = current()) => character?.presets.find((p) => p.id === presetId) ?? null;

  return {
    roster: getRoster,
    setRoster,
    persist,
    current,
    findCharacter,
    findPreset,
    /** Repair cross-references after a change (plan §3 reconcile). Defaults to the current character. */
    reconcile(character = current()) {
      if (character) reconcileCharacter(character);
    },
    /** Run `fn(character)` on the current character, then persist. Returns fn's result. */
    edit(fn) {
      const c = current();
      if (!c) return undefined;
      const out = fn(c);
      persist();
      return out;
    },
    /** Run `fn(preset, character)` on one preset of the current character, then reconcile + persist. */
    editPreset(presetId, fn) {
      const c = current();
      const p = findPreset(presetId, c);
      if (!p) return undefined;
      const out = fn(p, c);
      reconcileCharacter(c);
      persist();
      return out;
    },
  };
}

/**
 * Spread several store objects into one. Two store files exporting the same mutator name would
 * silently shadow each other, so a duplicate throws at construction time instead.
 */
export function mergeStores(...parts) {
  const out = {};
  for (const part of parts) {
    // Descriptors, not assignment: the facade's `roster` / `current` are live getters.
    for (const [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(part))) {
      if (key in out) throw new Error(`Duplicate store mutator "${key}" - two store files export it`);
      Object.defineProperty(out, key, { ...desc, enumerable: true });
    }
  }
  return out;
}
