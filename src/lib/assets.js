/**
 * assets.js - barrel for the scraped game-icon lookups.
 *
 * The base lookup (assetUrl, key aliases, the Vite glob) lives in assets/base.js;
 * each domain's helper lives in assets/<domain>.js so the domain slices own their
 * own file. Import from here or from the domain file - both work.
 */
export * from './assets/base.js';
export * from './assets/mounts.js';
export * from './assets/pets.js';
export * from './assets/sigils.js';
export * from './assets/glyphs.js';
