// model/glyphs.js - STUB from M1, owned by B4 from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: glyphs. Shape: rebuild-plan §3 glyphs.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultGlyphs()                       -> fresh partial
//   normaliseGlyphs(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migrateGlyphsFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcileGlyphs(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.

export function defaultGlyphs() {
  return { glyphs: [] };
}

// eslint-disable-next-line no-unused-vars
export function normaliseGlyphs(rawCharacter, ctx) {
  return defaultGlyphs();
}

// eslint-disable-next-line no-unused-vars
export function migrateGlyphsFromV1(v1Character) {
  return { value: defaultGlyphs(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileGlyphs(character) {}
