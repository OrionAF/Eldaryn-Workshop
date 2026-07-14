/**
 * buildConfig.js - display-ready description of the full build an optimizer
 * candidate resolves to, one { label, value } line per dimension, for the
 * Simulation screen's Saved Results rail.
 *
 * Snapshots must stay readable after the live build changes (a saved result
 * outlives renames, deletions, even class changes), so every name is
 * resolved HERE at save time and stored as plain text - nothing in a saved
 * entry is re-resolved against the character or static data at render time.
 *
 * Works for both save paths: the current build (candidateFromCurrent) and
 * an optimizer recommendation (result.best.candidate) - same candidate
 * shape, same labels as SimulatedPresetCard.
 */
import { TALENT_TREES } from './talentTreeData.js';
import { SPECS_BY_CLASS, SLOTS } from './constants.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { SIGILS_BY_CLASS } from './sigilsData.js';
import { AWAKENING_PATHS } from './awakeningData.js';
import { petLabel, stoneLabel } from './optimizer.js';

export function describeBuildConfig(character, candidate) {
  const lines = [];
  const p = candidate.preset;

  const loadout = character.loadouts?.[p.loadout];
  lines.push({ label: 'Gear Loadout', value: loadout?.name || `Loadout ${(p.loadout ?? 0) + 1}` });

  const stones = SLOTS.filter((s) => candidate.socketedStones?.[s]).map(
    (s) => `${s}: ${stoneLabel(character, candidate.socketedStones[s])}`
  );
  lines.push({ label: 'Socketed Stones', value: stones.length ? stones.join(' · ') : 'None' });

  const spec = candidate.talentSpec
    ? (SPECS_BY_CLASS[character.class] || []).find((s) => s.key === candidate.talentSpec)?.label || candidate.talentSpec
    : 'No spec';
  const tree = TALENT_TREES[candidate.talentSpec];
  const talents = [];
  if (tree) {
    for (const tier of tree.tiers) {
      for (const t of tier.talents) {
        const rank = candidate.talentAllocation?.[t.id] || 0;
        if (rank > 0) talents.push(`${t.name} ${rank}/${t.ranks.length}`);
      }
    }
  }
  lines.push({ label: 'Talents', value: talents.length ? `${spec} — ${talents.join(', ')}` : spec });

  lines.push({ label: 'Pet', value: p.petId ? petLabel(character, p.petId) : 'None' });

  const relicNames = (p.relicIds || []).map(
    (id) => (RELICS_BY_CLASS[character.class] || []).find((d) => d.id === id)?.name || id
  );
  lines.push({ label: 'Relics', value: relicNames.length ? relicNames.join(', ') : 'None' });

  const sigilNames = (p.sigilIds || []).map(
    (id) => (SIGILS_BY_CLASS[character.class] || []).find((d) => d.id === id)?.name || id
  );
  lines.push({ label: 'Sigils', value: sigilNames.length ? sigilNames.join(', ') : 'None' });

  const mountName = p.mountId
    ? (character.mounts?.entries || []).find((m) => m.id === p.mountId)?.name || 'Unknown'
    : 'None';
  lines.push({ label: 'Mount', value: mountName });

  const glyphs = (candidate.glyphEquippedIds || []).map((id) => {
    const g = (character.glyphs?.entries || []).find((e) => e.id === id);
    return g ? `${g.tier} ${g.statKey} +${g.value}` : id;
  });
  lines.push({ label: 'Mount Glyphs', value: glyphs.length ? glyphs.join(', ') : 'None' });

  const awakeningPoints = Number(character.awakening?.points) || 0;
  lines.push({
    label: 'Awakening',
    value: candidate.awakeningPath
      ? `${AWAKENING_PATHS[candidate.awakeningPath]?.label || candidate.awakeningPath}${awakeningPoints ? ` · ${awakeningPoints} pts` : ''}`
      : 'No path',
  });

  const nodes = candidate.transcendenceUnlocked || [];
  lines.push({
    label: 'Transcendence',
    value: nodes.length ? `${nodes.length} nodes: ${[...nodes].sort().join(', ')}` : 'None',
  });

  const buffs = ['top', 'bottom', 'core'].filter((k) => p.fortressBuffs?.[k]);
  lines.push({ label: 'Fortress Buffs', value: buffs.length ? buffs.join(' + ') : 'None' });

  return lines;
}
