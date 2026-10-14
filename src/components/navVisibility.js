// Final navigation (rebuild-plan §2.5) and per-item visibility. Pure: takes
// plain objects so it is testable without the store.

/** @type {{id:string,label:string,color:string,mobileMain?:boolean}[]} */
export const NAV_ITEMS = [
  { id: 'character', label: 'Character', color: 'character' },
  { id: 'presets', label: 'Presets', color: 'presets', mobileMain: true },
  { id: 'drop', label: 'Drop Check', color: 'drop', mobileMain: true },
  { id: 'gear', label: 'Gear', color: 'gear' },
  { id: 'talents', label: 'Talents', color: 'talents' },
  { id: 'sigils', label: 'Sigils', color: 'sigils' },
  { id: 'pets', label: 'Pets', color: 'pets' },
  { id: 'mounts', label: 'Mounts', color: 'mounts' },
  { id: 'relics', label: 'Relics', color: 'relics' },
  { id: 'awakening', label: 'Awakening', color: 'awakening' },
  { id: 'transcendence', label: 'Transcendence', color: 'transcendence' },
  { id: 'optimiser', label: 'Optimiser', color: 'optimiser', mobileMain: true },
  { id: 'duel', label: 'Duel', color: 'duel', mobileMain: true },
  { id: 'oblivion', label: 'Oblivion', color: 'oblivion' },
];

/** Oblivion shows only once the character has unlocked it (false on the v1 store). */
export function isNavVisible(id, character) {
  if (id === 'oblivion') return character?.oblivion?.unlocked === true;
  return true;
}

export function visibleNav(character) {
  return NAV_ITEMS.filter((i) => isNavVisible(i.id, character));
}
