/**
 * assets.js - the single lookup from a domain object to its scraped game icon.
 *
 * `src/assets/` holds ~220 PNGs pulled from the game files, named on a mostly
 * regular convention:
 *   mount_<mountId>.png                  night_wolf   -> mount_night_wolf.png
 *   pet_<snake_case display name>.png    Dust Mite    -> pet_dust_mite.png
 *   sigils_<class>_<sigilId>.png         cataclysm    -> sigils_warrior_cataclysm.png
 *   glyph_<tier>_<rarity>.png / glyph_mythic.png
 *
 * Vite's import.meta.glob resolves those to hashed, bundled URLs at build time,
 * so nothing here depends on the file layout surviving a build. Unknown keys
 * return null rather than throwing - a missing icon should degrade to "no
 * image", never break a screen. assets.test.js asserts every catalogue entry
 * resolves, so a rename shows up as a failing test instead of a broken card.
 *
 * ALIASES covers the handful of names that don't follow the convention. Each
 * one is a deliberate mapping, not a bug to fix silently:
 *   - the `pet_ryme_wyrm.png` file is misspelled (the pet is "Rime Wyrm");
 *   - the sigil id `berserkt-stance` carries a typo, but it's a PERSISTED key
 *     (character.sigilValues / preset.sigilIds), so renaming it would need a
 *     migration - the display name is fixed in sigilsData.js instead;
 *   - three glyph tier/rarity combinations have no art yet and borrow the
 *     mythic icon (there are no Mythic glyphs in game, so it's unused).
 */

const MODULES = import.meta.glob('../assets/*.png', { eager: true, query: '?url', import: 'default' });

/** { 'mount_night_wolf': '/assets/mount_night_wolf-a1b2c3.png', ... } */
const BY_KEY = new Map(
  Object.entries(MODULES).map(([path, url]) => [path.replace(/^.*\/(.+)\.png$/, '$1'), url]),
);

const ALIASES = {
  pet_rime_wyrm: 'pet_ryme_wyrm',
  sigils_warrior_berserkt_stance: 'sigils_warrior_berserk_stance',
  // Ancient conduit sigils are filed without a class prefix, since Flameborn
  // is shared by both classes.
  sigils_warrior_earthwarden: 'sigils_earthwarden_sigil',
  sigils_warrior_flameborn: 'sigils_flameborn_sigil',
  sigils_sentinel_flameborn: 'sigils_flameborn_sigil',
  sigils_sentinel_stormcaller: 'sigils_stormcaller_sigil',
  glyph_major_epic: 'glyph_mythic',
  glyph_major_legendary: 'glyph_mythic',
  glyph_minor_legendary: 'glyph_mythic',
};

/** Bundled URL for an asset key (no extension), or null when there's no art. */
export function assetUrl(key) {
  if (!key) return null;
  return BY_KEY.get(key) ?? BY_KEY.get(ALIASES[key]) ?? null;
}

/** Snake-cases a display name the way the scraped filenames are spelled. */
function slug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Mount art, keyed by the MOUNT_DEFS id (already snake_case). */
export function mountImage(mountId) {
  return assetUrl(mountId ? `mount_${mountId}` : null);
}

/**
 * Pet art, keyed by DISPLAY NAME - companion ids are unpunctuated
 * ('ancientdrake') while the files are snake_cased ('pet_ancient_drake').
 */
export function petImage(name) {
  return assetUrl(name ? `pet_${slug(name)}` : null);
}

/** Sigil art. Class-scoped, since both classes have their own 12. */
export function sigilImage(characterClass, sigilId) {
  if (!characterClass || !sigilId) return null;
  return assetUrl(`sigils_${slug(characterClass)}_${slug(sigilId)}`);
}

/** Glyph art by tier ('minor' | 'major' | 'mythic') and rarity. */
export function glyphImage(tier, rarity) {
  if (tier === 'mythic') return assetUrl('glyph_mythic');
  if (!tier || !rarity) return null;
  return assetUrl(`glyph_${slug(tier)}_${slug(rarity)}`);
}
