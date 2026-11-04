// oblivionSetup.svelte.js - the Oblivion Floors scan setup (from, to, win chance, effort, output cut), kept per
// character for the session so leaving the page and coming back finds it as it was. View state: never persisted.
const kept = $state({});

/** @returns {{from: number, to: number, threshold: number, effort: string, applyOutputCut: boolean}|null} */
export function getOblivionSetup(characterId) {
  return kept[characterId] ?? null;
}

export function setOblivionSetup(characterId, setup) {
  kept[characterId] = { ...setup };
}

/** Tests: forget every kept setup. */
export function resetOblivionSetup() {
  for (const k of Object.keys(kept)) delete kept[k];
}
