/**
 * talentTreeData.js - hardcoded talent tree content (arms, Protection,
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
  arms: {
    description: 'A RELENTLESS FIGHTER WHO OVERWHELMS ENEMIES WITH RAW POWER AND SPEED.',
    tiers: [
      {
        id: 'arms-tier-1',
        threshold: 0,
        talents: [
          { id: 'arms_t1_sharpened_blade', name: 'Sharpened Blade', statKey: 'attack_pct', ranks: [2, 4, 6, 8, 10] },
          { id: 'arms_t1_quick_strikes', name: 'Quick Strikes', statKey: 'speed', ranks: [2, 4, 6] },
          { id: 'arms_t1_precision', name: 'Precision', statKey: 'crit', ranks: [1, 2, 3]}
        ],
      },
      {
        id: 'arms-tier-2',
        threshold: 5,
        talents: [
          { id: 'arms_t2_brutality', name: 'Brutality', statKey: 'attack_pct', ranks: [2, 4, 6, 8, 10] },
          { id: 'arms_t2_keen_edge', name: 'Keen Edge', statKey: 'crit', ranks: [1.5, 3, 4.5] },
          { id: 'arms_t2_combat_frenzy', name: 'Combat Frenzy', statKey: 'speed', ranks: [3, 5, 8]}
        ],
      },
      {
        id: 'arms-tier-3',
        threshold: 10,
        talents: [
          { id: 'arms_t3_savage_blows', name: 'Savage Blows', statKey: 'crit_mult', ranks: [8, 16, 24] },
          { id: 'arms_t3_relentless_assault', name: 'Relentless Assault', statKey: 'speed', ranks: [3, 6, 9, 12, 15] },
          { id: 'arms_t3_vampiric_strikes', name: 'Vampiric Strikes', statKey: 'lifesteal', ranks: [0.5, 1, 1.5]}
        ],
      },
      {
        id: 'arms-tier-4',
        threshold: 15,
        talents: [
          { id: 'arms_t4_executioner', name: 'Executioner', statKey: 'crit_mult', ranks: [10, 20, 30, 40, 50] },
          { id: 'arms_t4_swift_fury', name: 'Swift Fury', statKey: 'speed', ranks: [3, 6, 9] }
        ],
      },
      {
        id: 'arms-tier-5',
        threshold: 20,
        talents: [
          { id: 'arms_t5_lethality', name: 'Lethality', statKey: 'crit', ranks: [2, 4, 6] },
          { id: 'arms_t5_berserkers_might', name: 'Berserker\'s Might', statKey: 'attack_pct', ranks: [4, 8, 12] }
        ],
      },
      {
        id: 'arms-tier-6',
        threshold: 25,
        talents: [
          { id: 'arms_t6_warlords_fury', name: 'Warlord\'s Fury', statKey: 'attack_pct', ranks: [5, 10, 15] }
        ],
      },
    ],
  },

  protection: {
    description: 'A STALWART DEFENDER WHO ABSORBS PUNISHMENT AND OUTLASTS ANY FOE.',
    tiers: [
      {
        id: 'protection-tier-1',
        threshold: 0,
        talents: [
          { id: 'protection_t1_fortitude', name: 'Fortitude', statKey: 'health_pct', ranks: [2, 4, 6, 8, 10] },
          { id: 'protection_t1_thick_skin', name: 'Thick Skin', statKey: 'dmg_reduction', ranks: [1, 2, 3] },
          { id: 'protection_t1_vitality', name: 'Vitality', statKey: 'hp_regen', ranks: [0.5, 1, 1.5]}
        ],
      },
      {
        id: 'protection-tier-2',
        threshold: 5,
        talents: [
          { id: 'protection_t2_iron_will', name: 'Iron Will', statKey: 'health_pct', ranks: [2, 4, 6, 8, 10] },
          { id: 'protection_t2_shield_mastery', name: 'Shield Mastery', statKey: 'block_chance', ranks: [2, 4, 6] },
          { id: 'protection_t2_blood_pact', name: 'Blood Pact', statKey: 'lifesteal', ranks: [0.5, 1, 1.5]}
        ],
      },
      {
        id: 'protection-tier-3',
        threshold: 10,
        talents: [
          { id: 'protection_t3_unbreakable', name: 'Unbreakable', statKey: 'dmg_reduction', ranks: [2, 4, 6] },
          { id: 'protection_t3_regeneration', name: 'Regeneration', statKey: 'hp_regen', ranks: [0.5, 1, 1.5, 2, 2.5] },
          { id: 'protection_t3_guardians_might', name: 'Guardian\'s Might', statKey: 'attack_pct', ranks: [3, 6, 9]}
        ],
      },
      {
        id: 'protection-tier-4',
        threshold: 15,
        talents: [
          { id: 'protection_t4_fortress', name: 'Fortress', statKey: 'health_pct', ranks: [3, 6, 9, 12, 15] },
          { id: 'protection_t4_siphon_life', name: 'Siphon Life', statKey: 'lifesteal', ranks: [1, 2, 3] }
        ],
      },
      {
        id: 'protection-tier-5',
        threshold: 20,
        talents: [
          { id: 'protection_t5_bulwark_stance', name: 'Bulwark Stance', statKey: 'block_chance', ranks: [3, 6, 9] },
          { id: 'protection_t5_enduring_presence', name: 'Enduring Presence', statKey: 'hp_regen', ranks: [1, 2, 3] }
        ],
      },
      {
        id: 'protection-tier-6',
        threshold: 25,
        talents: [
          { id: 'protection_t6_immortal_bulwark', name: 'Immortal Bulwark', statKey: 'dmg_reduction', ranks: [2, 4, 6] }
        ],
      },
    ],
  },

  marksmanship: {
    description: 'A RELENTLESS HUNTER WHO DRAINS FOES WITH RAPID, LETHAL STRIKES.',
    tiers: [
      {
        id: 'marksmanship-tier-1',
        threshold: 0,
        talents: [
          { id: 'marksmanship_t1_sharp_aim', name: 'Sharp Aim', statKey: 'attack_pct', ranks: [2, 4, 6, 8, 10] },
          { id: 'marksmanship_t1_hunters_drain', name: 'Hunter\'s Drain', statKey: 'lifesteal', ranks: [0.5, 1, 1.5] },
          { id: 'marksmanship_t1_quick_draw', name: 'Quick Draw', statKey: 'speed', ranks: [2, 4, 6]}
        ],
      },
      {
        id: 'marksmanship-tier-2',
        threshold: 5,
        talents: [
          { id: 'marksmanship_t2_rapid_nocking', name: 'Rapid Nocking', statKey: 'speed', ranks: [3, 5, 8] },
          { id: 'marksmanship_t2_keen_eye', name: 'Keen Eye', statKey: 'crit', ranks: [1.5, 3, 4.5] },
          { id: 'marksmanship_t2_blood_mark', name: 'Blood Mark', statKey: 'lifesteal', ranks: [0.5, 1, 1.5]}
        ],
      },
      {
        id: 'marksmanship-tier-3',
        threshold: 10,
        talents: [
          { id: 'marksmanship_t3_predators_leech', name: 'Predator\'s Leech', statKey: 'lifesteal', ranks: [1, 2, 3] },
          { id: 'marksmanship_t3_flurry_shot', name: 'Flurry Shot', statKey: 'speed', ranks: [3, 5, 8] },
          { id: 'marksmanship_t3_deadeye_focus', name: 'Deadeye Focus', statKey: 'attack_pct', ranks: [3, 6, 9, 12, 15]}
        ],
      },
      {
        id: 'marksmanship-tier-4',
        threshold: 15,
        talents: [
          { id: 'marksmanship_t4_weak_spot', name: 'Weak Spot', statKey: 'crit', ranks: [2, 4, 6] },
          { id: 'marksmanship_t4_piercing_precision', name: 'Piercing Precision', statKey: 'crit_mult', ranks: [10, 20, 30, 40, 50] }
        ],
      },
      {
        id: 'marksmanship-tier-5',
        threshold: 20,
        talents: [
          { id: 'marksmanship_t5_sanguine_arrow', name: 'Sanguine Arrow', statKey: 'lifesteal', ranks: [1, 2, 3] },
          { id: 'marksmanship_t5_relentless_volley', name: 'Relentless Volley', statKey: 'speed', ranks: [3, 6, 9] }
        ],
      },
      {
        id: 'marksmanship-tier-6',
        threshold: 25,
        talents: [
          { id: 'marksmanship_t6_deathmark', name: 'Deathmark', statKey: 'attack_pct', ranks: [5, 10, 15] }
        ],
      },
    ],
  },

  disruption: {
    description: 'AN ELUSIVE CONTROLLER WHO BLINDS FOES AND SLIPTS THEIR BLOWS TO LOCK DOWN THE FIGHT.',
    tiers: [
      {
        id: 'disruption-tier-1',
        threshold: 0,
        talents: [
          { id: 'disruption_t1_phantom_step', name: 'Phantom Step', statKey: 'miss_chance', ranks: [1, 2, 3, 4, 5] },
          { id: 'disruption_t1_blinding_shot', name: 'Blinding Shot', statKey: 'blind_chance', ranks: [0.6, 1.2, 1.8, 2.4, 3] },
          { id: 'disruption_t1_nerve_shot', name: 'Nerve Shot', statKey: 'paralyze_chance', ranks: [0.3, 0.6, 0.9]}
        ],
      },
      {
        id: 'disruption-tier-2',
        threshold: 5,
        talents: [
          { id: 'disruption_t2_quick_reflexes', name: 'Quick Reflexes', statKey: 'speed', ranks: [2, 4, 6] },
          { id: 'disruption_t2_ghosting_stance', name: 'Ghosting Stance', statKey: 'miss_chance', ranks: [1.5, 3, 4.5] },
          { id: 'disruption_t2_disruptive_force', name: 'Disruptive Force', statKey: 'attack_pct', ranks: [2, 4, 6, 8, 10]}
        ],
      },
      {
        id: 'disruption-tier-3',
        threshold: 10,
        talents: [
          { id: 'disruption_t3_vital_draw', name: 'Vital Draw', statKey: 'lifesteal', ranks: [0.5, 1, 1.5] },
          { id: 'disruption_t3_sightbreaker', name: 'Sightbreaker', statKey: 'blind_chance', ranks: [0.8, 1.6, 2.4] },
          { id: 'disruption_t3_punishing_volley', name: 'Punishing Volley', statKey: 'attack_pct', ranks: [3, 6, 9, 12, 15]}
        ],
      },
      {
        id: 'disruption-tier-4',
        threshold: 15,
        talents: [
          { id: 'disruption_t4_nerve_lock', name: 'Nerve Lock', statKey: 'paralyze_chance', ranks: [0.4, 0.8, 1.2] },
          { id: 'disruption_t4_mirage_cloak', name: 'Mirage Cloak', statKey: 'miss_chance', ranks: [2, 4, 6, 8, 10] },
          { id: 'disruption_t4_rapid_disruption', name: 'Rapid Disruption', statKey: 'speed', ranks: [3, 5, 8] }
        ],
      },
      {
        id: 'disruption-tier-5',
        threshold: 20,
        talents: [
          { id: 'disruption_t5_untouchable_mark', name: 'Untouchable Mark', statKey: 'miss_chance', ranks: [2, 4, 6] },
          { id: 'disruption_t5_blackout_arrow', name: 'Blackout Arrow', statKey: 'blind_chance', ranks: [1, 2, 3] }
        ],
      },
      {
        id: 'disruption-tier-6',
        threshold: 25,
        talents: [
          { id: 'disruption_t6_neural_shutdown', name: 'Neural Shutdown', statKey: 'paralyze_chance', ranks: [0.6, 1.2, 1.8] }
        ],
      },
    ],
  },
};
