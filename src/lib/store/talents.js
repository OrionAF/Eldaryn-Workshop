// store/talents.js - mutators for character.talentSets (B2). Every mutator persists via ctx.edit.
import { talentSpec, talentById } from '../game/talents.js';
import { normaliseCharacter } from '../model/index.js';
import { sanitiseAllocation, emptyTalentSet } from '../model/talents.js';
import { talentPointsForLevel, dualTalentsUnlocked } from '../model/legality.js';

const validIndex = (i) => i === 0 || i === 1;

/** Would this allocation survive normalisation unchanged (tier gating, ranks, the level's point cap)? */
function isValid(allocation, specKey, cap) {
  const clean = sanitiseAllocation(allocation, specKey, cap);
  const keys = Object.keys(allocation);
  return keys.length === Object.keys(clean).length && keys.every((k) => clean[k] === allocation[k]);
}

export function createTalentsStore(ctx) {
  // the active preset's spec feeds other domains' gating (ctx.spec), so re-normalise when its set changes
  function renormaliseIfActive(c, index) {
    const active = c.presets.find((p) => p.id === c.activePresetId) ?? c.presets[0];
    if (active?.talentSet !== index) return;
    const roster = ctx.roster();
    const i = roster.characters.findIndex((x) => x.id === c.id);
    if (i !== -1) roster.characters[i] = normaliseCharacter(JSON.parse(JSON.stringify(c)));
  }

  /** Choose (or clear) a set's spec. Switching spec clears its allocation; a wrong-class spec is refused. */
  function setTalentSetSpec(index, specKey) {
    if (!validIndex(index)) return false;
    const c0 = ctx.current();
    if (!c0) return false;
    if (specKey != null && talentSpec(specKey)?.class !== c0.class) return false;
    if (c0.talentSets[index].spec === (specKey ?? null)) return true;
    ctx.edit((c) => {
      c.talentSets[index] = { ...emptyTalentSet(), spec: specKey ?? null };
      renormaliseIfActive(c, index);
    });
    return true;
  }

  /**
   * Set one talent's rank. Refused (returns false) when its tier is locked, the cap would be exceeded,
   * or lowering it would lock a later tier that holds points.
   */
  function setTalentSetRank(index, talentId, rank) {
    if (!validIndex(index)) return false;
    const set = ctx.current()?.talentSets[index];
    const talent = talentById(talentId);
    if (!set?.spec || !talent || talent.specKey !== set.spec) return false;
    const next = Math.max(0, Math.min(Math.floor(Number(rank)) || 0, talent.maxRank));
    const allocation = { ...set.allocation };
    if (next > 0) allocation[talentId] = next;
    else delete allocation[talentId];
    if (!isValid(allocation, set.spec, talentPointsForLevel(ctx.current().level))) return false;
    ctx.edit((c) => {
      c.talentSets[index].allocation = allocation;
    });
    return true;
  }

  function resetTalentSet(index) {
    if (!validIndex(index)) return;
    ctx.edit((c) => {
      c.talentSets[index].allocation = {};
    });
  }

  /** Copy one set's spec and allocation onto the other. Refused when the source has no spec or Set B is locked. */
  function copyTalentSet(from, to) {
    if (!validIndex(from) || !validIndex(to) || from === to) return false;
    const c0 = ctx.current();
    const src = c0?.talentSets[from];
    if (!src?.spec || !dualTalentsUnlocked(c0.level)) return false;
    const allocation = sanitiseAllocation({ ...src.allocation }, src.spec, talentPointsForLevel(c0.level));
    ctx.edit((c) => {
      c.talentSets[to] = { spec: src.spec, allocation };
      renormaliseIfActive(c, to);
    });
    return true;
  }

  return { setTalentSetSpec, setTalentSetRank, resetTalentSet, copyTalentSet };
}
