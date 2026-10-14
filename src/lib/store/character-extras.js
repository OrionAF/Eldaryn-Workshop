// store/character-extras.js (B6b): skills, attunement bans and fortress mutators. Each ends with persist().
import { skillById } from '../game/skills.js';
import { clampSkillLevel, reconcileSkills, attunementMaxBans, bannableStats } from '../model/skills.js';
import { FORTRESS_GROUPS, normaliseFortress } from '../model/fortress.js';

export function createCharacterExtrasStore(ctx) {
  /** Level 0 = not bought. Clamped to the skill's cap (the Oblivion level needs the unlock). */
  function setSkillLevel(skillId, level) {
    const skill = skillById(skillId);
    if (!skill) return;
    ctx.edit((c) => {
      const lvl = clampSkillLevel(skill, level, c.oblivion?.unlocked === true);
      if (lvl > 0) c.skills[skillId] = lvl;
      else delete c.skills[skillId];
      reconcileSkills(c); // lowering Attunement frees fewer ban slots
    });
  }

  /** Re-clamp skills; call after setOblivionUnlocked (which does not know about skills). */
  function reconcileSkillLevels() {
    ctx.edit((c) => reconcileSkills(c));
  }

  function toggleAttunementBan(statType) {
    ctx.edit((c) => {
      if (!bannableStats(c.class).some((s) => s.type === statType)) return;
      const i = c.attunementBans.indexOf(statType);
      if (i >= 0) c.attunementBans.splice(i, 1);
      else if (c.attunementBans.length < attunementMaxBans(c.skills, c.class)) c.attunementBans.push(statType);
    });
  }

  /** Toggle a fortress group; owning TOP drops BOTTOM and vice versa. */
  function toggleFortress(group) {
    if (!FORTRESS_GROUPS.includes(group)) return;
    ctx.edit((c) => {
      const owned = new Set(c.fortress.owned);
      if (owned.has(group)) owned.delete(group);
      else {
        owned.add(group);
        if (group === 'TOP') owned.delete('BOTTOM');
        if (group === 'BOTTOM') owned.delete('TOP');
      }
      c.fortress = normaliseFortress({ fortress: { owned: [...owned] } }).fortress;
    });
  }

  return { setSkillLevel, reconcileSkillLevels, toggleAttunementBan, toggleFortress };
}
