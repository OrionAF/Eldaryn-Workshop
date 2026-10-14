// model/skills.js - owned by B6b (rebuild-plan §7.3). Persisted character fields: skills, attunementBans.
// Shape: rebuild-plan §3 skills; game rules: Game/skills.md §1-§5.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER:
//   defaultSkills()                       -> fresh partial
//   normaliseSkills(rawCharacter, ctx)    -> partial; ctx = { class, spec }; idempotent
//   migrateSkillsFromV1(v1Character)      -> { value: partial, idMap }  (v1 had no skills)
//   reconcileSkills(character)            -> void; re-clamps in place
// Skill level 0/absent = not bought; cap = skillLevelCap(skill, oblivion.unlocked). Bans are secondary
// stat types the class can roll, at most attunementMaxBans. No preset references this domain.
import { SKILLS, skillById, skillLevelCap } from '../game/skills.js';
import { SECONDARY_STAT_POOL } from '../game/gear.js';
import { available, attunementBonus } from '../game/classes.js';

export function defaultSkills() {
  return { skills: {}, attunementBans: [] };
}

/** skills.md §5: ban slots = attunement effect at max(1, level) + class bonus. */
export function attunementMaxBans(skills, cls) {
  const att = skillById('attunement');
  const lvl = Math.min(att.maxLevel, Math.max(1, Math.floor(Number(skills?.attunement)) || 0));
  return (att.effects[lvl - 1] ?? 0) + attunementBonus(cls);
}

/** Secondary stats the class can roll (and so can ban). */
export function bannableStats(cls) {
  return SECONDARY_STAT_POOL.filter((s) => available(s.type, cls ?? 'WARRIOR'));
}

/** Clamp one level to 0..cap; non-numbers are 0. */
export function clampSkillLevel(skill, level, oblivionUnlocked) {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, skillLevelCap(skill, oblivionUnlocked));
}

function cleanBans(rawBans, skills, cls) {
  const ok = new Set(bannableStats(cls).map((s) => s.type));
  const out = [];
  for (const t of Array.isArray(rawBans) ? rawBans : []) {
    if (ok.has(t) && !out.includes(t)) out.push(t);
  }
  return out.slice(0, attunementMaxBans(skills, cls));
}

export function normaliseSkills(rawCharacter, ctx) {
  const unlocked = rawCharacter?.oblivion?.unlocked === true;
  const raw = rawCharacter?.skills && typeof rawCharacter.skills === 'object' ? rawCharacter.skills : {};
  const skills = {};
  for (const s of SKILLS) {
    const lvl = clampSkillLevel(s, raw[s.id], unlocked);
    if (lvl > 0) skills[s.id] = lvl;
  }
  const cls = ctx?.class ?? rawCharacter?.class ?? null;
  return { skills, attunementBans: cleanBans(rawCharacter?.attunementBans, skills, cls) };
}

// eslint-disable-next-line no-unused-vars
export function migrateSkillsFromV1(v1Character) {
  return { value: defaultSkills(), idMap: {} };
}

/** Re-clamp after the Oblivion lock or a class change (the Oblivion level needs the unlock). */
export function reconcileSkills(character) {
  const n = normaliseSkills(character, { class: character.class });
  character.skills = n.skills;
  character.attunementBans = n.attunementBans;
}
