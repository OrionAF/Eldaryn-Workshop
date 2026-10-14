// L1 catalogue: the 14 account skills, effect/cost lookups, Oblivion extra level.
// Lookups only, no game logic beyond indexing. Sources: Game/skills.md §1-§3; data/skills.json.
import skillsData from '../../data/game/skills.json';

export const SKILL_OBLIVION_POINT_COST = skillsData.oblivionPointCost;
export const SKILL_INITIAL_GEMS = skillsData.initialGems;
export const SKILL_RESET_COST = skillsData.resetCost;
export const SKILLS_UNLOCK_LEVEL = skillsData.unlockLevel;

export const SKILLS = skillsData.skills;
export const SKILL_IDS = SKILLS.map((s) => s.id);

export function skillById(id) {
  return SKILLS.find((s) => s.id === id) ?? null;
}

// skills.md §2. The Oblivion point sits one level above maxLevel.
export function skillLevelCap(skill, oblivionUnlocked = false) {
  return skill.maxLevel + (skill.oblivionPoint && oblivionUnlocked ? 1 : 0);
}

// skills.md §2. Effect at level L is effects[L-1]; the Oblivion level returns its own effect.
export function skillEffect(skill, level, fallback = 0) {
  if (skill.oblivionPoint && level === skill.maxLevel + 1) return skill.oblivionPoint.effect;
  return skill.effects[level - 1] ?? fallback;
}

// skills.md §1. Gems to go from level L to L+1; the Oblivion step costs oblivionPoint.cost.
export function skillUpgradeCost(skill, level) {
  if (level < 1 || level > skill.maxLevel) return null;
  if (level === skill.maxLevel) return skill.oblivionPoint ? skill.oblivionPoint.cost : null;
  return skill.costs[level - 1];
}
