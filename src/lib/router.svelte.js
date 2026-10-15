/**
 * router.svelte.js - hash routing for the shell (ia.md §1, §5.1). `router.route` is the parsed
 * current hash; `go(target)` navigates (pushing history, so Back/Forward work); a reload returns to
 * the same page because the page is in the URL. The last page per area is kept in the per-device UI
 * key (uiState.js) so a bare URL, or an area tab, reopens where the user was.
 *
 * An unknown or incomplete hash is rewritten in place (no history entry) to its canonical spelling,
 * or to the last-used page, or to Presets (B1). The empty-roster case (G0 Welcome) is the shell's
 * call, not the router's.
 */
import { DEFAULT_PAGE_ID, areaFirstPage, formatHash, pageById, parseHash, resolveTarget } from './routes.js';
import { loadUi, saveUi } from './uiState.js';

function fallbackHash() {
  const last = parseHash(loadUi().lastHash);
  return last.kind === 'page' ? last.hash : formatHash(DEFAULT_PAGE_ID);
}

function currentLocationHash() {
  return typeof location === 'undefined' ? '' : location.hash;
}

let hash = $state('');
const route = $derived(parseHash(hash));

/** Adopt a location hash: canonicalise it in place when needed, remember pages in the UI key. */
function adopt(raw) {
  const parsed = parseHash(raw);
  const canonical = parsed.kind === 'unknown' ? fallbackHash() : parsed.hash;
  if (canonical !== raw && typeof history !== 'undefined') history.replaceState(null, '', canonical);
  hash = canonical;
  const page = parseHash(canonical);
  if (page.kind === 'page') saveUi({ lastHash: canonical, areaLast: { [page.area]: page.id } });
}

/**
 * Navigate. `target` is a hash, a route path, a page id, `settings`, `welcome` or a legacy screen id
 * (see resolveTarget). Unresolvable targets are ignored. `replace` swaps the current history entry.
 */
export function go(target, { replace = false } = {}) {
  const next = resolveTarget(target);
  if (next === null || typeof location === 'undefined') return;
  if (replace) history.replaceState(null, '', next);
  else if (location.hash !== next) location.hash = next;
  adopt(next);
}

export function back() {
  if (typeof history !== 'undefined') history.back();
}

/** The hash an area tab should open: that area's last-used page, else its first. */
export function areaHash(areaId) {
  const last = pageById(loadUi().areaLast[areaId]);
  const page = last?.area === areaId ? last : areaFirstPage(areaId);
  return page ? formatHash(page.id) : formatHash(DEFAULT_PAGE_ID);
}

/** Re-read the location (used at start-up and by tests). */
export function syncRouter() {
  adopt(currentLocationHash());
}

if (typeof window !== 'undefined') {
  syncRouter();
  window.addEventListener('hashchange', () => adopt(location.hash));
}

export const router = {
  get route() {
    return route;
  },
  get hash() {
    return hash;
  },
};

