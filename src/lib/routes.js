// Route table and hash parsing for the app shell (redesign ia.md §1, §5.1). Pure: no DOM, no store.
// A page is addressed `#/<area>/<slug>[/<tab>]`; `#/settings` and `#/welcome` are the two global pages.
// The route key doubles as the page id used by the shell (rail, context header, page registry).

export const AREAS = [
  { id: 'character', label: 'Character' },
  { id: 'builds', label: 'Builds' },
  { id: 'tools', label: 'Tools' },
];

/**
 * @typedef {object} PageDef
 * @property {string} id         `<area>/<slug>`
 * @property {string} area
 * @property {string} slug
 * @property {string} label      rail label
 * @property {string} title      page heading
 * @property {string} glyph      decorative one-character icon
 * @property {'character'|'preset'|'tool'|'oblivion'} scope
 * @property {string} sentence   one-line scope sentence under the heading ({n} = preset count)
 * @property {boolean} needsClass  true when the page cannot work for a classless character
 * @property {boolean} usesPreset  true when the page depends on the active preset (context chip)
 * @property {string} [legacy]   id of the pre-redesign screen this page replaces (onNavigate callers)
 */

const CH = 'Shared by all {n} presets.';
const BU = 'Only this preset. Collections are edited in Character.';
const TO = 'Reads your character; changes it only through an explicit Apply.';

/** @type {PageDef[]} */
export const PAGES = [
  { id: 'character/overview', label: 'Overview', title: 'Overview', glyph: '◈', scope: 'character', sentence: CH, needsClass: false, usesPreset: false, legacy: 'character' },
  { id: 'character/skills', label: 'Skills & Clan', title: 'Skills & Clan', glyph: '✦', scope: 'character', sentence: CH, needsClass: true, usesPreset: false },
  { id: 'character/gear', label: 'Gear', title: 'Gear', glyph: '⚔', scope: 'character', sentence: CH, needsClass: true, usesPreset: true, legacy: 'gear' },
  { id: 'character/talents', label: 'Talents', title: 'Talents', glyph: '❖', scope: 'character', sentence: CH, needsClass: true, usesPreset: true, legacy: 'talents' },
  { id: 'character/sigils', label: 'Sigils', title: 'Sigils', glyph: '◇', scope: 'character', sentence: CH, needsClass: true, usesPreset: true, legacy: 'sigils' },
  { id: 'character/pets', label: 'Pets', title: 'Pets', glyph: '❀', scope: 'character', sentence: CH, needsClass: true, usesPreset: false, legacy: 'pets' },
  { id: 'character/mounts', label: 'Mounts & Glyphs', title: 'Mounts & Glyphs', glyph: '♞', scope: 'character', sentence: CH, needsClass: true, usesPreset: true, legacy: 'mounts' },
  { id: 'character/relics', label: 'Relics', title: 'Relics', glyph: '✧', scope: 'character', sentence: CH, needsClass: true, usesPreset: true, legacy: 'relics' },
  { id: 'character/awakening', label: 'Awakening', title: 'Awakening', glyph: '☀', scope: 'character', sentence: CH, needsClass: true, usesPreset: true, legacy: 'awakening' },
  { id: 'character/transcendence', label: 'Transcendence', title: 'Transcendence', glyph: '✵', scope: 'character', sentence: CH, needsClass: true, usesPreset: true, legacy: 'transcendence' },
  { id: 'builds/presets', label: 'Presets', title: 'Presets', glyph: '▤', scope: 'preset', sentence: BU, needsClass: true, usesPreset: false, legacy: 'presets' },
  { id: 'builds/loadout', label: 'Loadout', title: 'Loadout', glyph: '▥', scope: 'preset', sentence: BU, needsClass: true, usesPreset: false },
  { id: 'builds/sheet', label: 'Stat Sheet', title: 'Stat Sheet', glyph: '▦', scope: 'preset', sentence: BU, needsClass: true, usesPreset: false },
  { id: 'tools/drop', label: 'Drop Check', title: 'Drop Check', glyph: '⬡', scope: 'tool', sentence: TO, needsClass: true, usesPreset: false, legacy: 'drop' },
  { id: 'tools/optimiser', label: 'Optimiser', title: 'Optimiser', glyph: '⟳', scope: 'tool', sentence: TO, needsClass: true, usesPreset: false, legacy: 'optimiser' },
  { id: 'tools/duel', label: 'Duel', title: 'Duel', glyph: '⚡', scope: 'tool', sentence: TO, needsClass: true, usesPreset: false, legacy: 'duel' },
  { id: 'tools/opponents', label: 'Opponents', title: 'Opponents', glyph: '☗', scope: 'tool', sentence: TO, needsClass: true, usesPreset: false },
  { id: 'tools/spec-guide', label: 'Spec Guide', title: 'Stat priority', glyph: '⚖', scope: 'tool', sentence: 'Which stats each spec should look for on gear.', needsClass: false, usesPreset: false },
  { id: 'tools/oblivion', label: 'Oblivion Floors', title: 'Oblivion Floors', glyph: '◐', scope: 'oblivion', sentence: TO, needsClass: true, usesPreset: false, legacy: 'oblivion' },
].map((p) => {
  const [area, slug] = p.id.split('/');
  return { ...p, area, slug };
});

const BY_ID = new Map(PAGES.map((p) => [p.id, p]));
const LEGACY = new Map(PAGES.filter((p) => p.legacy).map((p) => [p.legacy, p.id]));

export const DEFAULT_PAGE_ID = 'builds/presets';
/** Where a fresh import lands (ia.md §5.1: default after import is C1). */
export const AFTER_IMPORT_PAGE_ID = 'character/overview';

export const pageById = (id) => BY_ID.get(id) ?? null;
export const pagesOfArea = (areaId) => PAGES.filter((p) => p.area === areaId);
export const areaFirstPage = (areaId) => pagesOfArea(areaId)[0] ?? null;

const SEGMENT = /^[a-z0-9-]+$/;

/** `#/area/slug[/tab]` for a page id (tab optional). */
export function formatHash(pageId, tab = null) {
  return `#/${pageId}${tab && SEGMENT.test(tab) ? `/${tab}` : ''}`;
}

/**
 * Parse a location hash.
 * @returns {{kind:'page', id:string, area:string, slug:string, tab:string|null, hash:string}
 *   | {kind:'settings', hash:string} | {kind:'welcome', hash:string} | {kind:'unknown', hash:null}}
 * `hash` is the canonical spelling: an area alone (`#/tools`) resolves to its first page, case and
 * trailing slashes are normalised, and anything unrecognised is `unknown` (the router falls back).
 */
export function parseHash(raw) {
  const text = String(raw ?? '').replace(/^#/, '').replace(/\/+$/, '').toLowerCase();
  const parts = text.split('/').filter((s, i) => i > 0 || s !== '');
  if (parts.length === 1 && parts[0] === 'settings') return { kind: 'settings', hash: '#/settings' };
  if (parts.length === 1 && parts[0] === 'welcome') return { kind: 'welcome', hash: '#/welcome' };
  const [area, slug, tab, ...rest] = parts;
  if (!AREAS.some((a) => a.id === area) || rest.length > 0) return { kind: 'unknown', hash: null };
  const page = slug === undefined ? areaFirstPage(area) : BY_ID.get(`${area}/${slug}`);
  if (!page) return { kind: 'unknown', hash: null };
  if (tab !== undefined && !SEGMENT.test(tab)) return { kind: 'unknown', hash: null };
  const t = tab ?? null;
  return { kind: 'page', id: page.id, area: page.area, slug: page.slug, tab: t, hash: formatHash(page.id, t) };
}

/**
 * Turn anything a caller may pass to `go()` into a canonical hash, or null.
 * Accepts a hash (`#/tools/duel`), a route path (`tools/duel/verify`), a page id, a legacy screen id
 * (`duel`, `presets`: the `onNavigate` argument of the old screens), `settings` or `welcome`.
 */
export function resolveTarget(target) {
  if (typeof target !== 'string' || target === '') return null;
  if (LEGACY.has(target)) return formatHash(LEGACY.get(target));
  if (target === 'settings' || target === 'welcome') return `#/${target}`;
  const parsed = parseHash(target.startsWith('#') ? target : `#/${target.replace(/^\//, '')}`);
  return parsed.kind === 'unknown' ? null : parsed.hash;
}
