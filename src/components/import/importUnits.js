// The import report's "<n> <unit>" counts: importPlan.js names units in the plural; one reads as singular.
const SINGULAR = {
  items: 'item',
  stones: 'stone',
  points: 'point',
  pets: 'pet',
  mounts: 'mount',
  glyphs: 'glyph',
  sigils: 'sigil',
  relics: 'relic',
  presets: 'preset',
};

/** @param {number} count @param {string} unit plural unit name @returns {string} */
export const unitFor = (count, unit) => (count === 1 ? (SINGULAR[unit] ?? unit) : unit);
