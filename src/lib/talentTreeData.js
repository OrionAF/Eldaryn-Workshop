/**
 * talentTreeData.js - hardcoded talent tree content (Fury, Protection,
 * Marksmanship, Disruption). Trees are the same for every player - not
 * user-authored data, so they live in code (like STAT_FIELDS/RARITIES in
 * constants.js) rather than the persisted Roster. The in-app UI only lets a
 * player pick a spec and allocate points; there's no tree-building UI.
 *
 * Deliberately self-contained (no imports from model.js) to avoid a circular
 * import - model.js reads TALENT_TREES from here for normalisation.
 *
 * IDs are stable, hand-chosen strings - NOT the runtime newId() used for
 * user-created entities (Pets/Mounts/Characters). A loadout's
 * talentAllocation persists {talentId: rank} to localStorage, so the same
 * talent must resolve to the same id on every page load; a regenerated id
 * would silently orphan a player's saved allocation.
 *
 * Shape (matches model.js's TalentTree/Tier/Talent):
 *   TalentTree = { description: string, tiers: Tier[] }
 *   Tier       = { id, threshold: number, talents: Talent[] }  // threshold =
 *                points required spent in ALL previous tiers combined
 *   Talent     = { id, name, statKey, ranks: number[] }  // ranks[i] = the
 *                assigned (not computed) value AT rank i+1
 *
 * PLACEHOLDER DATA: every tier currently holds one placeholder talent and a
 * placeholder threshold (a simple +3-per-tier guess, not the real game's
 * thresholds). Replace name/statKey/ranks/threshold and add more
 * tiers/talents as real data is confirmed - see the screenshots in
 * docs/Talent Screenshots/ for the reference UI (tiers 1, 2, 5, 6 were seen
 * unlocked, implying at least 6 tiers exist per tree).
 */

function placeholderTiers(specKey, count = 6) {
  const tiers = [];
  for (let i = 0; i < count; i++) {
    const tierNumber = i + 1;
    tiers.push({
      id: `${specKey}-tier-${tierNumber}`,
      threshold: i * 3, // PLACEHOLDER: guessed +3/tier, not confirmed
      talents: [
        {
          id: `${specKey}-tier-${tierNumber}-placeholder`,
          name: `Placeholder Talent (Tier ${tierNumber})`,
          statKey: 'attack_pct',
          ranks: [0],
        },
      ],
    });
  }
  return tiers;
}

export const TALENT_TREES = {
  fury: { description: '', tiers: placeholderTiers('fury') },
  protection: { description: '', tiers: placeholderTiers('protection') },
  marksmanship: { description: '', tiers: placeholderTiers('marksmanship') },
  disruption: { description: '', tiers: placeholderTiers('disruption') },
};
