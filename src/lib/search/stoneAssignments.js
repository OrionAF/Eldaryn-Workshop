// Owned-stone assignment neighbours; see simulation.md §Stone assignment search.
import { BASE_SLOTS } from '../game/gear.js';

export const stoneSetKey = (cand, realm = 'base') => realm === 'oblivion' ? 'oblivion' : `set${cand.equipmentSet === 2 ? 2 : 1}`;
export const stonePool = (character, setKey) => (setKey === 'oblivion' ? character.oblivionEnchantStones : character.enchantStones) ?? [];
export const stoneSlots = (character, cand, setKey) => cand.stoneAssignment?.setKey === setKey
  ? cand.stoneAssignment.slots : character.equipment?.[setKey]?.enchantSlots ?? {};

export function canonicalStoneAssignment(character, assignment) {
  if (!assignment) return null;
  const slots = Object.fromEntries(BASE_SLOTS.map((slot) => [slot, assignment.slots?.[slot] ?? null]));
  const saved = character.equipment?.[assignment.setKey]?.enchantSlots ?? {};
  if (BASE_SLOTS.every((slot) => slots[slot] === (saved[slot] ?? null))) return null;
  return { setKey: assignment.setKey, slots };
}

export function stoneAssignmentNeighbours(character, cand, realm = 'base') {
  const setKey = stoneSetKey(cand, realm);
  const current = stoneSlots(character, cand, setKey);
  const ids = stonePool(character, setKey).filter((s) => s.activated !== false).map((s) => s.id);
  const out = [];
  for (const slot of BASE_SLOTS) {
    for (const id of [null, ...ids]) {
      if ((current[slot] ?? null) === id) continue;
      const slots = Object.fromEntries(BASE_SLOTS.map((key) => [key, current[key] ?? null]));
      const previous = slots[slot];
      const occupied = id == null ? null : BASE_SLOTS.find((key) => slots[key] === id);
      if (occupied) slots[occupied] = previous;
      slots[slot] = id;
      out.push({ ...cand, stoneAssignment: { setKey, slots } });
    }
  }
  return out;
}

export function stoneAssignmentViolations(character, assignment) {
  if (assignment == null) return [];
  if (!assignment || typeof assignment !== 'object' || !['set1', 'set2', 'oblivion'].includes(assignment.setKey)
      || !assignment.slots || typeof assignment.slots !== 'object' || Array.isArray(assignment.slots)) {
    return ['Must identify one equipment set and its stone sockets'];
  }
  const errors = [];
  const pool = new Set(stonePool(character, assignment.setKey).map((s) => s.id));
  const used = new Set();
  for (const slot of Object.keys(assignment.slots)) if (!BASE_SLOTS.includes(slot)) errors.push(`Unknown socket ${slot}`);
  for (const slot of BASE_SLOTS) {
    const id = assignment.slots[slot] ?? null;
    if (id === null) continue;
    if (typeof id !== 'string' || !pool.has(id)) errors.push(`Stone for ${slot} is not in this realm's owned pool`);
    if (used.has(id)) errors.push('A stone cannot occupy two sockets in the same set');
    used.add(id);
  }
  return errors;
}
