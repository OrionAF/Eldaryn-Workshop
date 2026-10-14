// model/fortress.js - owned by B6b (rebuild-plan §7.3). Persisted character field: fortress.
// Shape: rebuild-plan §3 fortress (+ migration contract step 5); rules: Game/clan-fortress.md.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER:
//   defaultFortress(), normaliseFortress(rawCharacter, ctx) (idempotent),
//   migrateFortressFromV1(v1Character) -> { value, idMap }, reconcileFortress(character).
// owned is unique and in canonical order (TOP, BOTTOM, CORE); TOP and BOTTOM are mutually exclusive
// (TOP wins on corrupt data). No preset references this domain.

export const FORTRESS_GROUPS = ['TOP', 'BOTTOM', 'CORE'];

export function defaultFortress() {
  return { fortress: { owned: [] } };
}

function canonical(list) {
  const set = new Set(Array.isArray(list) ? list : []);
  const out = FORTRESS_GROUPS.filter((g) => set.has(g));
  return out.includes('TOP') ? out.filter((g) => g !== 'BOTTOM') : out;
}

// eslint-disable-next-line no-unused-vars
export function normaliseFortress(rawCharacter, ctx) {
  return { fortress: { owned: canonical(rawCharacter?.fortress?.owned) } };
}

/** Plan §3 step 5: only the active preset's (else first preset's) fortressBuffs survive. */
export function migrateFortressFromV1(v1Character) {
  const presets = Array.isArray(v1Character?.presets) ? v1Character.presets : [];
  const p = presets.find((x) => x?.id === v1Character?.activePresetId) ?? presets[0];
  const b = p?.fortressBuffs ?? {};
  const owned = canonical([b.top === true && 'TOP', b.bottom === true && 'BOTTOM', b.core === true && 'CORE']);
  return { value: { fortress: { owned } }, idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileFortress(character) {}
