// Per-item state of the rail (ia.md §1 removals, §5.1). Pure: takes plain objects so it is testable
// without the store. Every page is always listed; nothing is hidden. Oblivion Floors is shown locked
// until the character unlocks Oblivion (its page carries the inline unlock), and pages that cannot
// work without a class say "needs class" instead of going blank.
import { AREAS, PAGES, pagesOfArea } from '../lib/routes.js';

/** Oblivion Floors is the one page gated on the character (unlocked is exactly `true`). */
export function isLocked(pageId, character) {
  return pageId === 'tools/oblivion' && character?.oblivion?.unlocked !== true;
}

export function needsClass(page, character) {
  return page.needsClass === true && !character?.class;
}

/** @returns {{page: import('../lib/routes.js').PageDef, locked: boolean, needsClass: boolean}} */
export function navItem(page, character) {
  return { page, locked: isLocked(page.id, character), needsClass: needsClass(page, character) };
}

/** The rail: three groups of items in route-table order. */
export function navGroups(character) {
  return AREAS.map((area) => ({ area, items: pagesOfArea(area.id).map((p) => navItem(p, character)) }));
}

export const NAV_ITEM_COUNT = PAGES.length;
