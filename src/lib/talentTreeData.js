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
 *                points required spent in ALL previous tiers combined to
 *                unlock this tier. A tier can hold multiple talents (see the
 *                screenshots in docs/Talent Screenshots/ - Tier 1 had three:
 *                Sharp Aim, Hunter's Drain, Quick Draw).
 *   Talent     = { id, name, statKey, ranks: number[] }  // ranks[i] = the
 *                assigned (not computed) value AT rank i+1
 *
 * Each spec below is one placeholder tier with one placeholder talent - a
 * starting point to build the real tree from, not a guessed structure. Add
 * more tiers to a spec's `tiers` array and more talents to a tier's
 * `talents` array as needed; every spec's tier count/thresholds/talents are
 * independent of the others.
 */

export const TALENT_TREES = {
  fury: {
    description: '',
    tiers: [
      {
        id: 'fury-tier-1',
        threshold: 0,
        talents: [{ id: 'fury-placeholder', name: 'Placeholder Talent', statKey: 'attack_pct', ranks: [0] }],
      },
    ],
  },

  protection: {
    description: '',
    tiers: [
      {
        id: 'protection-tier-1',
        threshold: 0,
        talents: [{ id: 'protection-placeholder', name: 'Placeholder Talent', statKey: 'attack_pct', ranks: [0] }],
      },
    ],
  },

  marksmanship: {
    description: '',
    tiers: [
      {
        id: 'marksmanship-tier-1',
        threshold: 0,
        talents: [{ id: 'marksmanship-placeholder', name: 'Placeholder Talent', statKey: 'attack_pct', ranks: [0] }],
      },
    ],
  },

  disruption: {
    description: '',
    tiers: [
      {
        id: 'disruption-tier-1',
        threshold: 0,
        talents: [{ id: 'disruption-placeholder', name: 'Placeholder Talent', statKey: 'attack_pct', ranks: [0] }],
      },
    ],
  },
};
