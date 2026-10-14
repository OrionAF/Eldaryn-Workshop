// model/talents.js - STUB from M1, owned by B2 from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: talentSets. Shape: rebuild-plan §3 TalentSet.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultTalents()                       -> fresh partial
//   normaliseTalents(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migrateTalentsFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcileTalents(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.

export function defaultTalents() {
  return { talentSets: [{ spec: null, allocation: {} }, { spec: null, allocation: {} }] };
}

// eslint-disable-next-line no-unused-vars
export function normaliseTalents(rawCharacter, ctx) {
  return defaultTalents();
}

// eslint-disable-next-line no-unused-vars
export function migrateTalentsFromV1(v1Character) {
  return { value: defaultTalents(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileTalents(character) {}
