/**
 * rosterStore.svelte.js - the single reactive store (Svelte 5 runes), as a FACADE over the
 * per-domain store files in ./store/ (rebuild-plan §2.1 L6, §7.3 M1).
 *
 * The `$state` roster lives here and nowhere else; each store file is a plain-JS factory
 * `createXStore(ctx)` returning its mutators, and this file spreads them all into one object
 * (mergeStores throws on a duplicate mutator name). Every mutator ends with an explicit
 * persist() rather than a background $effect, so save timing is deterministic around character
 * switches and downloads. Persisted shape and normalisation: ./model/index.js.
 */
import { loadRoster, saveRoster } from './storage.js';
import { getCurrent } from './model/index.js';
import { createContext, mergeStores } from './store/context.js';
import { createCharactersStore } from './store/characters.js';
import { createPresetsStore } from './store/presets.js';
import { createSheetsStore } from './store/sheets.js';
import { createGearStore } from './store/gear.js';
import { createStonesStore } from './store/stones.js';
import { createTalentsStore } from './store/talents.js';
import { createPetsStore } from './store/pets.js';
import { createMountsStore } from './store/mounts.js';
import { createSigilsStore } from './store/sigils.js';
import { createRelicsStore } from './store/relics.js';
import { createAwakeningStore } from './store/awakening.js';
import { createTranscendenceStore } from './store/transcendence.js';
import { createCharacterExtrasStore } from './store/character-extras.js';
import { createDropStore } from './store/drop.js';
import { createPvpStore } from './store/pvp.js';
import { createOblivionStore } from './store/oblivion.js';
import { createRunsStore } from './store/runs.js';
import { createApplyStore } from './store/apply.js';

function createRosterStore() {
  let roster = $state(loadRoster());
  const current = $derived(getCurrent(roster));
  let saveState = $state({ ok: true, error: null, at: null, trimmed: 0, dropped: 0 });

  const ctx = createContext({
    getRoster: () => roster,
    setRoster: (r) => {
      roster = r;
    },
    persist: () => {
      const res = saveRoster(roster);
      saveState = { ok: res.ok, error: res.error, at: res.ok ? new Date().toISOString() : saveState.at, trimmed: res.trimmed, dropped: res.dropped };
    },
  });

  return mergeStores(
    {
      /** Outcome of the last save: {ok, error, at (last good save), trimmed/dropped run history}. */
      get saveState() {
        return saveState;
      },
      get roster() {
        return roster;
      },
      get current() {
        return current;
      },
    },
    createCharactersStore(ctx),
    createPresetsStore(ctx),
    createSheetsStore(ctx),
    createGearStore(ctx),
    createStonesStore(ctx),
    createTalentsStore(ctx),
    createPetsStore(ctx),
    createMountsStore(ctx),
    createSigilsStore(ctx),
    createRelicsStore(ctx),
    createAwakeningStore(ctx),
    createTranscendenceStore(ctx),
    createCharacterExtrasStore(ctx),
    createDropStore(ctx),
    createPvpStore(ctx),
    createOblivionStore(ctx),
    createRunsStore(ctx),
    createApplyStore(ctx),
  );
}

export const rosterStore = createRosterStore();
