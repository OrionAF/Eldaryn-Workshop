// duelSetup.svelte.js - the Duel page's setup (preset, opponent, seat, effort), kept per character for the
// session so leaving the page and coming back finds it as it was. View state: never persisted.
const kept = $state({});

/** @returns {{presetPick: string|null, opponentPick: string|null, seat: string, effort: string}|null} */
export function getDuelSetup(characterId) {
  return kept[characterId] ?? null;
}

export function setDuelSetup(characterId, setup) {
  kept[characterId] = { ...setup };
}

/** Tests: forget every kept setup. */
export function resetDuelSetup() {
  for (const k of Object.keys(kept)) delete kept[k];
}
