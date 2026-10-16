// search/fill.js: free fills, a minimised build's empty glyph sockets filled with owned glyphs that act for
// it (simulation.md §Minimise and confirm, Free fills). Pure: which glyphs go where; minimise.js measures.
import { socketsOf, savedSockets, activeMajorIds, runningSigils } from './space.js';
import { canonicalise } from './effect.js';
import { glyphSocketable, MOUNT_GLYPH_SOCKETS } from '../model/mounts.js';
import { GLYPH_RARITY_LADDER, glyphSecondaryValue } from '../model/glyphs.js';

/** Socket tiers a fill may use, with the build-space block that must be on for it. Mythic glyphs are not modelled. */
export const FILL_TIERS = Object.freeze([['major', 'majorGlyphs'], ['minor', 'minorGlyphs']]);

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const rarityRank = (g) => GLYPH_RARITY_LADDER.indexOf(g.rarity);

/**
 * Owned glyphs that may go into an empty `tier` socket of `cand`'s mount, best first: unsealed and socketable,
 * not already on this mount; a major only when it acts for the candidate's spec and running sigils and its type
 * is not on the mount yet (two of a type never stack, mounts-glyphs.md §10); a minor only with a rolled stat.
 * Order: a glyph in `first` (the baseline's own on this mount, so putting it back is no change), then higher
 * rarity, then (minor) the larger rolled value, then the id.
 */
export function fillCandidates(space, cand, tier, first = new Set()) {
  const { character } = space;
  const cur = socketsOf(character, cand);
  if (!cur) return [];
  const byId = new Map((character.glyphs ?? []).map((g) => [g.id, g]));
  const onMount = new Set([...cur.minor, ...cur.major, ...cur.mythic].filter(Boolean));
  let pool = (character.glyphs ?? []).filter((g) => !onMount.has(g.id) && glyphSocketable(character, g, tier));
  if (tier === 'major') {
    const types = new Set(cur.major.filter(Boolean).map((id) => byId.get(id)?.glyphType));
    const spec = space.specOf(cand);
    const running = runningSigils(character, cand);
    pool = pool.filter((g) => !types.has(g.glyphType) && activeMajorIds(character, [g.id], spec, running).size > 0);
  } else {
    pool = pool.filter((g) => g.secondary);
  }
  const value = (g) => (tier === 'minor' ? glyphSecondaryValue(g.secondary) : 0);
  const own = (g) => (first.has(g.id) ? 0 : 1);
  return pool.sort((a, b) => own(a) - own(b) || rarityRank(b) - rarityRank(a) || value(b) - value(a) || byString(a.id, b.id));
}

/**
 * `F` (a minimised candidate) with every empty major and minor socket of its mount filled, one socket at a
 * time with the first fill candidate that lands in the legal build and changes the engine inputs (an inert
 * glyph is no fill). The baseline's own glyphs on the mount go back first: they return to their saved sockets
 * and leave the free ones for new glyphs. A placement that would move a new glyph into a socket the baseline
 * holds (canonical order can shuffle F's own new glyphs) is skipped: that socket would read as a replaced glyph,
 * not a fill. Tiers whose block is off under Allowed to change stay as they are.
 * @returns {{candidate: Object, glyphs: string[]}}  `glyphs`: the glyph ids added (none: `candidate` is F)
 */
export function fillEmptySockets(space, B, F) {
  const { character } = space;
  let X = F;
  const glyphs = [];
  if (!X.mountId) return { candidate: X, glyphs };
  const before = B.mountId === X.mountId ? socketsOf(character, B) : savedSockets(character, X.mountId);
  const own = new Set(Object.values(before ?? {}).flat().filter(Boolean));
  const start = socketsOf(character, F);
  // every socket the baseline holds keeps F's glyph or gets the baseline's own back
  const steady = (rows) => Object.entries(before ?? {}).every(([t, row]) => (row ?? []).every((h, i) => h == null || rows?.[t]?.[i] === start?.[t]?.[i] || rows?.[t]?.[i] === h));
  for (const [tier, block] of FILL_TIERS) {
    if (space.toggles?.[block] === false) continue;
    for (let left = MOUNT_GLYPH_SOCKETS[tier]; left > 0; left--) {
      const cur = socketsOf(character, X);
      const free = Array.from({ length: MOUNT_GLYPH_SOCKETS[tier] }, (_, i) => i).find((i) => (cur[tier]?.[i] ?? null) === null);
      if (free === undefined) break;
      let placed = null;
      for (const g of fillCandidates(space, X, tier, own)) {
        const row = Array.from({ length: MOUNT_GLYPH_SOCKETS[tier] }, (_, i) => cur[tier]?.[i] ?? null);
        row[free] = g.id;
        const Y = space.legalise({ ...X, mountGlyphs: { ...cur, [tier]: row } });
        if (!socketsOf(character, Y)?.[tier]?.includes(g.id)) continue;
        // canonicalise reverts what leaves the engine inputs unchanged: an inert fill comes straight back out
        const { candidate } = canonicalise(space, B, Y);
        const rows = socketsOf(character, candidate);
        if (!rows?.[tier]?.includes(g.id) || !steady(rows)) continue;
        placed = { candidate, id: g.id };
        break;
      }
      if (!placed) break;
      X = placed.candidate;
      glyphs.push(placed.id);
    }
  }
  return { candidate: X, glyphs };
}
