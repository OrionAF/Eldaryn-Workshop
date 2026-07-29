/**
 * mountsData.js - the fixed catalogue of Mounts that exist in the game.
 * Like relicsData.js this is static domain data, not persisted state: every
 * character always has exactly these mounts (name/rarity fixed), and only the
 * ridden mount's chosen star level + the two rolled bonus values are saved.
 * Ordered by rarity progression as the in-game stable lists them.
 *
 * Each mount's HP%/ATK% bonus is NOT a fixed number: it's a roll within an
 * observed range that widens by star level (derived from the scraped
 * `mounts` table in EldarynTracker/eldaryn.db). `stars` lists, per star, the
 * observed [min, max] envelope for each bonus - the UI exposes these as two
 * bounded sliders so the user dials in their exact roll. mountStarRange()
 * looks up a star's ranges (falling back to the nearest available star).
 */

export const MOUNT_DEFS = [
  { id: 'night_wolf', name: 'Night Wolf', rarity: 'Common', stars: [{ star: 1, hp: [6, 9], atk: [6, 8] }, { star: 2, hp: [7, 10], atk: [7, 9] }] },
  { id: 'frostfang_wolf', name: 'Frostfang Wolf', rarity: 'Common', stars: [{ star: 1, hp: [9, 11], atk: [4, 6] }, { star: 2, hp: [10, 12], atk: [4, 7] }] },
  { id: 'thundermaw', name: 'Thundermaw', rarity: 'Uncommon', stars: [{ star: 1, hp: [14, 19], atk: [10, 13] }, { star: 2, hp: [15, 21], atk: [11, 14] }] },
  { id: 'crystal_beast', name: 'Crystal Beast', rarity: 'Uncommon', stars: [{ star: 1, hp: [17, 19], atk: [10, 12] }, { star: 2, hp: [19, 21], atk: [11, 13] }] },
  { id: 'scorpion_hound', name: 'Scorpion Hound', rarity: 'Uncommon', stars: [{ star: 1, hp: [14, 17], atk: [12, 13] }, { star: 2, hp: [15, 19], atk: [13, 14] }] },
  { id: 'abyss_crawler', name: 'Abyss Crawler', rarity: 'Rare', stars: [{ star: 1, hp: [27, 29], atk: [17, 19] }, { star: 2, hp: [30, 32], atk: [19, 21] }] },
  { id: 'infernal_hellhound', name: 'Infernal Hellhound', rarity: 'Rare', stars: [{ star: 1, hp: [24, 27], atk: [19, 20] }, { star: 2, hp: [28, 30], atk: [21, 22] }] },
  { id: 'bonecrawler', name: 'Bonecrawler', rarity: 'Rare', stars: [{ star: 1, hp: [27, 29], atk: [17, 19] }, { star: 2, hp: [30, 32], atk: [20, 21] }] },
  { id: 'void_stalker', name: 'Void Stalker', rarity: 'Rare', stars: [{ star: 1, hp: [24, 27], atk: [19, 20] }, { star: 2, hp: [26, 30], atk: [21, 22] }] },
  { id: 'storm_roc', name: 'Storm Roc', rarity: 'Epic', stars: [{ star: 1, hp: [35, 37], atk: [27, 27] }, { star: 2, hp: [37, 41], atk: [29, 30] }, { star: 3, hp: [43, 44], atk: [31, 32] }] },
  { id: 'crystal_drake', name: 'Crystal Drake', rarity: 'Epic', stars: [{ star: 1, hp: [37, 39], atk: [24, 26] }, { star: 2, hp: [41, 43], atk: [28, 29] }, { star: 3, hp: [46, 47], atk: [29, 30] }] },
];

const MOUNT_BY_ID = new Map(MOUNT_DEFS.map((d) => [d.id, d]));

/** Look up a mount def by id (null if unknown). */
export function mountById(id) {
  return MOUNT_BY_ID.get(id) || null;
}

/** Star levels available for a mount (e.g. [1, 2] or [1, 2, 3]). */
export function mountStarLevels(def) {
  return (def?.stars || []).map((s) => s.star);
}

/**
 * The observed HP%/ATK% ranges for a mount at a given star.
 * Returns `{ hp: [min, max], atk: [min, max] }`, falling back to the nearest
 * available star if the exact one isn't in the data. Null if the mount has no
 * star data at all.
 */
export function mountStarRange(def, star) {
  const stars = def?.stars;
  if (!stars || stars.length === 0) return null;
  let best = stars[0];
  for (const s of stars) {
    if (Math.abs(s.star - star) < Math.abs(best.star - star)) best = s;
    else if (s.star === star) { best = s; break; }
  }
  const exact = stars.find((s) => s.star === star);
  const chosen = exact || best;
  return { hp: [chosen.hp[0], chosen.hp[1]], atk: [chosen.atk[0], chosen.atk[1]] };
}
