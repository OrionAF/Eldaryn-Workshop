// model/fortress.js - owned by B6b (rebuild-plan §7.3). Persisted character field: fortress.
// Shape: rebuild-plan §3 fortress (+ migration contract step 5); rules: Game/clan-fortress.md.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER:
//   defaultFortress(), normaliseFortress(rawCharacter, ctx) (idempotent),
//   migrateFortressFromV1(v1Character) -> { value, idMap }, reconcileFortress(character).
// `server` is the character's game server (a whole number, else null): it sets the Fortress boss shield's
// clan cap (Game/clan-fortress.md §3.1). owned is unique and in canonical order (TOP, BOTTOM, CORE); TOP and BOTTOM are mutually exclusive
// (TOP wins on corrupt data). No preset references this domain.

export const FORTRESS_GROUPS = ['TOP', 'BOTTOM', 'CORE'];

export function defaultFortress() {
  return { fortress: { owned: [] }, server: null };
}

function canonical(list) {
  const set = new Set(Array.isArray(list) ? list : []);
  const out = FORTRESS_GROUPS.filter((g) => set.has(g));
  return out.includes('TOP') ? out.filter((g) => g !== 'BOTTOM') : out;
}

// eslint-disable-next-line no-unused-vars
export function normaliseFortress(rawCharacter, ctx) {
  const s = rawCharacter?.server;
  return { fortress: { owned: canonical(rawCharacter?.fortress?.owned) }, server: Number.isInteger(s) && s >= 0 ? s : null };
}

/** Plan §3 step 5: only the active preset's (else first preset's) fortressBuffs survive. */
export function migrateFortressFromV1(v1Character) {
  const presets = Array.isArray(v1Character?.presets) ? v1Character.presets : [];
  const p = presets.find((x) => x?.id === v1Character?.activePresetId) ?? presets[0];
  const b = p?.fortressBuffs ?? {};
  const owned = canonical([b.top === true && 'TOP', b.bottom === true && 'BOTTOM', b.core === true && 'CORE']);
  return { value: { fortress: { owned }, server: null }, idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileFortress(character) {}
