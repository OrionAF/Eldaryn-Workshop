// model/pets.js - STUB from M1, owned by B3 from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: pets. Shape: rebuild-plan §3 pets.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultPets()                       -> fresh partial
//   normalisePets(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migratePetsFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcilePets(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.

export function defaultPets() {
  return { pets: { altar: { level: 1, tier: 1 }, owned: [] } };
}

// eslint-disable-next-line no-unused-vars
export function normalisePets(rawCharacter, ctx) {
  return defaultPets();
}

// eslint-disable-next-line no-unused-vars
export function migratePetsFromV1(v1Character) {
  return { value: defaultPets(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcilePets(character) {}
