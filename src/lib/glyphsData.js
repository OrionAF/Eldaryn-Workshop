/**
 * glyphsData.js - the static catalogue of MAJOR mount glyphs (game content,
 * not persisted user state - same principle as sigilsData.js/mountsData.js).
 *
 * A major glyph doesn't grant stats: it retunes ONE parameter of ONE sigil's
 * ability. Minor glyphs are the ones that roll a secondary stat, and they stay
 * free-form user entries.
 *
 * The derivation - why values are ABSOLUTE rather than deltas, the rarity
 * line `value(rarity) = from + step * rank`, and how `from` is chosen - is in
 * docs/Reference/Notes/big-rework-v1-notes.md ("Major glyphs"). Not restated
 * here. glyphsData.test.js checks the law against the source CSV.
 *
 * TWO THINGS TO KNOW WHILE EDITING THIS TABLE:
 *  - `observedRarities` is an allow-list of the rarities actually SEEN in the
 *    scrape. Anything outside it is projected from the rarity line, and the UI
 *    labels it "estimated". Adding a real observation means adding the rarity
 *    here, not just changing a number.
 *  - A major glyph is inert unless its sigil is equipped AND the glyph sits on
 *    the ridden mount (data-model.md §2 - glyph equip state is per-mount).
 */

import { GLYPH_RARITIES } from './constants.js';

/** 1-based rank of a glyph rarity (Common = 1 ... Legendary = 5). */
export function glyphRarityRank(rarity) {
  return GLYPH_RARITIES.indexOf(rarity) + 1;
}

/**
 * The un-glyphed bleed damage per tick, as a percentage. The scrape reports
 * the GLYPHED figure (Common Emberhoard = 44%), while the simulation scales
 * the tick damage the user actually entered - so the catalogue keeps the
 * absolute percentage and the sim uses the ratio against this base.
 */
export const GLYPH_TICK_BASE_PCT = 40;

/**
 * Major glyph families. `effects` maps an effect kind to its rarity line.
 * `{ flat: n }` is a value that doesn't move with rarity.
 *
 * Effect kinds:
 *   cooldownSec               the sigil's new cooldown (lower is better)
 *   maxStacks                 new stack ceiling for a stacking DoT
 *   tickDamagePct             new bleed-per-tick %, against GLYPH_TICK_BASE_PCT
 *   stackDecaySec             stacks shed per second on a mark (lower is better)
 *   thornsPerStackPct         thorns granted per stack
 *   paralyzeSec               paralyze duration on the sigil's own hit
 *   paralyzeOnHitSec          paralyze added to every landing hit
 *   attackSpeedWhileActivePct attack speed while the sigil's buff is up
 *   reflectWhileActivePct     damage reflected while the sigil's buff is up
 */
export const MAJOR_GLYPH_FAMILIES = [
  {
    key: 'warhaste-emblem',
    name: 'Warhaste Emblem',
    sigilId: 'warborn-fury',
    effects: { cooldownSec: { from: 15, step: -1 } },
    observedRarities: ['Common', 'Uncommon', 'Rare'],
  },
  {
    key: 'cataclysmic-cadence',
    name: 'Cataclysmic Cadence',
    sigilId: 'cataclysm',
    effects: { cooldownSec: { from: 10, step: -1 } },
    observedRarities: ['Common', 'Uncommon'],
  },
  {
    key: 'ironclad-tempo',
    name: 'Ironclad Tempo',
    sigilId: 'iron-bastion',
    effects: { cooldownSec: { from: 28, step: -1.5 } },
    observedRarities: ['Common', 'Uncommon'],
  },
  {
    key: 'umbral-cadence',
    name: 'Umbral Cadence',
    sigilId: 'blinding-mark',
    effects: { cooldownSec: { from: 12, step: -0.5 } },
    observedRarities: ['Rare'],
  },
  {
    key: 'venomous-alacrity',
    name: 'Venomous Alacrity',
    sigilId: 'venom-wound',
    effects: { cooldownSec: { from: 13, step: -1 } },
    observedRarities: ['Common'],
  },
  {
    key: 'withering-alacrity',
    name: 'Withering Alacrity',
    sigilId: 'withering-touch',
    effects: { cooldownSec: { from: 15, step: -1 } },
    observedRarities: ['Uncommon'],
  },
  {
    key: 'voltaic-tempo',
    name: 'Voltaic Tempo',
    sigilId: 'thunderbind',
    effects: { cooldownSec: { from: 12, step: -0.5 } },
    observedRarities: ['Common'],
  },
  {
    key: 'cinderquick-cadence',
    name: 'Cinderquick Cadence',
    sigilId: 'ember-curse',
    effects: { cooldownSec: { from: 10, step: -1 } },
    observedRarities: ['Common'],
  },
  {
    key: 'bramblethorn-crest',
    name: 'Bramblethorn Crest',
    sigilId: 'bulwark-of-thorns',
    effects: { thornsPerStackPct: { from: 4, step: 0.2 } },
    observedRarities: ['Common', 'Uncommon', 'Rare'],
  },
  {
    key: 'enduring-brand',
    name: 'Enduring Brand',
    sigilId: 'sunder-mark',
    // The line's intercept (1.8) sits just above the sigil's own 1.75/s shed
    // rate; four observed rarities pin it exactly.
    effects: { stackDecaySec: { from: 1.8, step: -0.1 } },
    observedRarities: ['Common', 'Uncommon', 'Rare', 'Epic'],
  },
  {
    key: 'relentless-brand',
    name: 'Relentless Brand',
    sigilId: 'siegebreaker-mark',
    effects: { stackDecaySec: { from: 1.8, step: -0.1 } },
    observedRarities: ['Common', 'Uncommon', 'Rare', 'Epic'],
  },
  {
    key: 'emberhoard-sigil',
    name: 'Emberhoard Sigil',
    sigilId: 'ember-curse',
    // Hemorrhagic Excess shows 9 stacks at BOTH Common and Uncommon, so the
    // stack ceiling is flat and only the tick damage scales.
    effects: { maxStacks: { flat: 9 }, tickDamagePct: { from: GLYPH_TICK_BASE_PCT, step: 4 } },
    observedRarities: ['Common'],
  },
  {
    key: 'hemorrhagic-excess',
    name: 'Hemorrhagic Excess',
    sigilId: 'hemorrhage',
    effects: { maxStacks: { flat: 9 }, tickDamagePct: { from: GLYPH_TICK_BASE_PCT, step: 4 } },
    observedRarities: ['Common', 'Uncommon'],
  },
  {
    key: 'thunderclasp-binding',
    name: 'Thunderclasp Binding',
    sigilId: 'thunderbind',
    effects: { paralyzeSec: { from: 2, step: 0.4 } },
    observedRarities: ['Uncommon'],
  },
  {
    key: 'duskrunner-haste',
    name: 'Duskrunner Haste',
    sigilId: 'blinding-mark',
    // Blinding Mark grants no attack speed on its own, so the line starts at 0.
    effects: { attackSpeedWhileActivePct: { from: 0, step: 3 } },
    observedRarities: ['Rare'],
  },
  {
    key: 'numbing-sear',
    name: 'Numbing Sear',
    sigilId: 'withering-touch',
    // Source text reads "O.4s"/"O.6s" - a capital O for a zero.
    effects: { paralyzeOnHitSec: { from: 0, step: 0.2 } },
    observedRarities: ['Uncommon', 'Rare'],
  },
  {
    key: 'thornmail-aegis',
    name: 'Thornmail Aegis',
    sigilId: 'iron-bastion',
    effects: { reflectWhileActivePct: { from: 0, step: 2 } },
    observedRarities: ['Common', 'Rare'],
  },
];

/** Rounds away the float noise from `from + step * rank` (e.g. 4.6000000000000005). */
function tidy(n) {
  return Math.round(n * 1000) / 1000;
}

function resolveEffects(family, rarity) {
  const rank = glyphRarityRank(rarity);
  const out = {};
  for (const [kind, spec] of Object.entries(family.effects)) {
    out[kind] = spec.flat != null ? spec.flat : tidy(spec.from + spec.step * rank);
  }
  return out;
}

/** Human-readable one-liner for a resolved effect set, e.g. "Cooldown -> 14s". */
function describeEffects(effects) {
  const bits = [];
  if (effects.cooldownSec != null) bits.push(`Cooldown -> ${effects.cooldownSec}s`);
  if (effects.maxStacks != null) bits.push(`Max stacks -> ${effects.maxStacks}`);
  if (effects.tickDamagePct != null) bits.push(`Bleed damage per tick -> ${effects.tickDamagePct}%`);
  if (effects.stackDecaySec != null) bits.push(`Stack decay -> ${effects.stackDecaySec}/s`);
  if (effects.thornsPerStackPct != null) bits.push(`Thorns per stack -> ${effects.thornsPerStackPct}%`);
  if (effects.paralyzeSec != null) bits.push(`Paralyze -> ${effects.paralyzeSec}s`);
  if (effects.paralyzeOnHitSec != null) bits.push(`Paralyzes on hit for ${effects.paralyzeOnHitSec}s`);
  if (effects.attackSpeedWhileActivePct != null) bits.push(`Attack speed while active -> +${effects.attackSpeedWhileActivePct}%`);
  if (effects.reflectWhileActivePct != null) bits.push(`Reflects ${effects.reflectWhileActivePct}% of damage taken while active`);
  return bits.join(' · ');
}

/**
 * Every (family x rarity) combination as a flat, stably-identified list.
 *
 * The id is `<key>:<rarity-lowercase>`, which keeps a glyph a single opaque
 * string everywhere it's referenced (inventory entries, the PVP opponent's
 * loadout, optimizer candidates) instead of forcing a key+rarity pair through
 * all of them.
 */
export const MAJOR_GLYPHS = MAJOR_GLYPH_FAMILIES.flatMap((family) =>
  GLYPH_RARITIES.map((rarity) => {
    const effects = resolveEffects(family, rarity);
    return {
      id: `${family.key}:${rarity.toLowerCase()}`,
      key: family.key,
      name: family.name,
      rarity,
      tier: 'major',
      sigilId: family.sigilId,
      effects,
      /** False when this rarity was extrapolated rather than observed. */
      observed: family.observedRarities.includes(rarity),
      description: describeEffects(effects),
    };
  }),
);

const MAJOR_GLYPH_BY_ID = new Map(MAJOR_GLYPHS.map((g) => [g.id, g]));

/** Look up a major glyph variant by its `<key>:<rarity>` id (null if unknown). */
export function majorGlyphById(id) {
  return MAJOR_GLYPH_BY_ID.get(id) || null;
}

/** Every variant of one family, in rarity order. */
export function majorGlyphVariants(key) {
  return MAJOR_GLYPHS.filter((g) => g.key === key);
}

/**
 * The tick-damage multiplier a glyph applies, relative to the un-glyphed 40%
 * baseline - the simulation scales the tick damage the user entered rather
 * than recomputing it from a percentage.
 */
export function glyphTickDamageMult(glyph) {
  const pct = glyph?.effects?.tickDamagePct;
  return pct == null ? 1 : pct / GLYPH_TICK_BASE_PCT;
}

/**
 * Legacy id remap. Before the catalogue existed there was exactly one special
 * glyph, hand-modelled as "+1 stack, x1.1 tick damage" on Ember Curse - which
 * is precisely Common Emberhoard Sigil (8 -> 9 stacks, 40% -> 44% per tick).
 */
export const LEGACY_GLYPH_IDS = {
  'ember-curse-glyph': 'emberhoard-sigil:common',
};

/** Resolves a possibly-legacy glyph id to a current catalogue id, or null. */
export function resolveGlyphId(id) {
  if (!id) return null;
  const mapped = LEGACY_GLYPH_IDS[id] ?? id;
  return MAJOR_GLYPH_BY_ID.has(mapped) ? mapped : null;
}

/**
 * Lookup that also accepts a legacy id. Normalisation rewrites persisted ids,
 * but ids also arrive from places that never went through it (a PVP opponent
 * assembled in code, an in-flight optimizer candidate), and a stale id
 * silently doing nothing is the worst failure mode - so resolve on read too.
 */
export function resolveMajorGlyph(id) {
  return majorGlyphById(resolveGlyphId(id));
}
