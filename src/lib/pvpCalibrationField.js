/**
 * pvpCalibrationField.js - the fields of build shapes both the contract test
 * and the calibration harness rank.
 *
 * NOT APP CODE (see pvpRankAgreement.js's header for why this lives in src/).
 *
 * Two fields, and the distinction matters:
 *
 *  - CONTRACT_FIELD (6 builds, Warrior) is the fixed field the CI contract
 *    test measures. Small, fast, and stable. Do not grow it casually - its
 *    recorded rho is a baseline, and changing the field silently changes what
 *    that number means.
 *
 *  - CALIBRATION_FIELD (16 builds, both classes) is what constants are fitted
 *    against. Bigger and deliberately harder: it spans both classes, includes
 *    the class-gated stats each reference constant is meant to stand in for,
 *    and carries several near-duplicates so a fit cannot win by getting a few
 *    extreme builds right.
 *
 * A constant fitted on the calibration field and then scored on the contract
 * field is being checked against a field it was not fitted to. That is the
 * point of keeping them separate.
 *
 * Shapes carry an Attack/Health split plus effective secondaries; magnitudes
 * come from the budget the caller passes, so every build spends the same
 * resources and a ranking reflects HOW they were spent.
 */

/** Fixed CI field - see the header before editing. Warrior. */
export const CONTRACT_FIELD = [
  { name: 'Berserker', attackShare: 0.8, secondaries: { crit: 45, crit_mult: 240, speed: 190, double_hit: 35 } },
  { name: 'Juggernaut', attackShare: 0.2, secondaries: { dmg_reduction: 50, block_chance: 65, hp_regen: 30, spell_resist: 40 } },
  { name: 'Bruiser', attackShare: 0.5, secondaries: { crit: 30, crit_mult: 200, speed: 150, lifesteal: 25, dmg_reduction: 20 } },
  { name: 'Vampire', attackShare: 0.6, secondaries: { lifesteal: 55, crit: 30, speed: 165, hp_regen: 18 } },
  { name: 'Penetrator', attackShare: 0.7, secondaries: { penetration: 60, crit: 40, crit_mult: 220, speed: 160 } },
  { name: 'Featureless', attackShare: 0.5, secondaries: {} }, // bases only
];

/**
 * The wider fitting field. Class matters here: Block and DMG Reduction are
 * Warrior-only and Miss/Blind/Paralyze are Sentinel-only, and REF_BLOCK /
 * REF_MISS exist precisely to stand in for "half the ladder carries this".
 * A field with only one class cannot test that rule.
 */
export const CALIBRATION_FIELD = [
  // --- Warrior: block / DR / penetration axis ---
  { name: 'W-Berserker', class: 'Warrior', attackShare: 0.85, secondaries: { crit: 50, crit_mult: 250, speed: 190, double_hit: 40 } },
  { name: 'W-Juggernaut', class: 'Warrior', attackShare: 0.2, secondaries: { dmg_reduction: 55, block_chance: 70, hp_regen: 35, spell_resist: 45 } },
  { name: 'W-Blocklord', class: 'Warrior', attackShare: 0.35, secondaries: { block_chance: 78, dmg_reduction: 40, hp_regen: 30, lifesteal: 20 } },
  { name: 'W-Penetrator', class: 'Warrior', attackShare: 0.7, secondaries: { penetration: 62, crit: 45, crit_mult: 230, speed: 160 } },
  { name: 'W-Bruiser', class: 'Warrior', attackShare: 0.5, secondaries: { crit: 30, crit_mult: 200, speed: 150, lifesteal: 25, dmg_reduction: 25 } },
  { name: 'W-Vampire', class: 'Warrior', attackShare: 0.6, secondaries: { lifesteal: 60, crit: 35, speed: 160, hp_regen: 20 } },
  { name: 'W-SpeedDR', class: 'Warrior', attackShare: 0.45, secondaries: { speed: 220, crit: 25, crit_mult: 180, dmg_reduction: 35 } },
  { name: 'W-Plain', class: 'Warrior', attackShare: 0.5, secondaries: { speed: 140, crit: 20, crit_mult: 180 } },

  // --- Sentinel: miss / blind / paralyze axis ---
  { name: 'S-Marksman', class: 'Sentinel', attackShare: 0.85, secondaries: { crit: 50, crit_mult: 250, speed: 200, double_hit: 45 } },
  { name: 'S-Disruptor', class: 'Sentinel', attackShare: 0.5, secondaries: { miss_chance: 55, blind_chance: 35, paralyze_chance: 15, speed: 180 } },
  { name: 'S-Evasion', class: 'Sentinel', attackShare: 0.3, secondaries: { miss_chance: 60, hp_regen: 35, spell_resist: 45, blind_chance: 25 } },
  { name: 'S-LifeBruiser', class: 'Sentinel', attackShare: 0.6, secondaries: { lifesteal: 60, crit: 35, speed: 170, miss_chance: 25 } },
  { name: 'S-CritFisher', class: 'Sentinel', attackShare: 0.75, secondaries: { crit: 50, crit_mult: 320, speed: 150, penetration: 35 } },
  { name: 'S-Paralyzer', class: 'Sentinel', attackShare: 0.55, secondaries: { paralyze_chance: 17, speed: 210, crit: 30, crit_mult: 190 } },
  { name: 'S-Balanced', class: 'Sentinel', attackShare: 0.5, secondaries: { crit: 30, crit_mult: 200, speed: 150, miss_chance: 30, hp_regen: 20 } },
  { name: 'S-Plain', class: 'Sentinel', attackShare: 0.5, secondaries: { speed: 140, crit: 20, crit_mult: 180 } },
];
