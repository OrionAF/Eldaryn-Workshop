<script>
  /**
   * TalentSetsScreen.svelte - Set A/Set B (character.talentSets), each an
   * independent spec + rank allocation a preset can point at. Set names are
   * fixed (not renamable) - talentSetLabel(i) is the only source of the
   * "Set A"/"Set B" label.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { SPECS_BY_CLASS, TALENT_TOTAL_POINTS } from '../lib/constants.js';
  import { talentSetLabel } from '../lib/model.js';
  import Chip from './Chip.svelte';
  import ConfirmButton from './ConfirmButton.svelte';
  import TalentTierList from './TalentTierList.svelte';

  const character = $derived(rosterStore.current);
  const specs = $derived(SPECS_BY_CLASS[character.class] || []);

  let selectedSet = $state(0);

  function pointsSpent(i) {
    return Object.values(character.talentSets[i].allocation || {}).reduce((sum, r) => sum + r, 0);
  }

  const usedBy = $derived(character.presets.filter((p) => p.talentSet === selectedSet).map((p) => p.name));
</script>

{#if !character.class}
  <p class="empty-hint">Choose a class for this character before assigning talent specializations.</p>
{:else}
  <div class="header-row">
    <h2>Talent Sets</h2>
    <div class="chip-list">
      {#each character.talentSets as _, i (i)}
        <Chip label={talentSetLabel(i)} selected={selectedSet === i} onClick={() => (selectedSet = i)} />
      {/each}
    </div>
  </div>

  <div class="controls-row">
    <select
      aria-label={`Specialization for ${talentSetLabel(selectedSet)}`}
      value={character.talentSets[selectedSet].spec ?? ''}
      onchange={(e) => rosterStore.setTalentSetSpec(selectedSet, e.target.value || null)}
    >
      <option value="">Choose a spec...</option>
      {#each specs as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
    </select>
    <span class="points-readout">{pointsSpent(selectedSet)} / {TALENT_TOTAL_POINTS} pts</span>
    <span class="used-by">{usedBy.length ? `used by ${usedBy.join(', ')}` : 'unused'}</span>
    <ConfirmButton
      class="reset-btn"
      label={`Reset ${talentSetLabel(selectedSet)}`}
      confirmLabel="Confirm reset"
      prompt={`Reset all points spent in ${talentSetLabel(selectedSet)}?`}
      onConfirm={() => rosterStore.resetTalentSet(selectedSet)}
    />
  </div>

  {#if !character.talentSets[selectedSet].spec}
    <p class="empty-hint">Choose a specialization above for {talentSetLabel(selectedSet)} to see its talent tree.</p>
  {:else}
    <TalentTierList specKey={character.talentSets[selectedSet].spec} talentSetIndex={selectedSet} />
  {/if}
{/if}

<style>
  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }
  .header-row h2 {
    margin: 0;
  }
  .chip-list {
    display: flex;
    gap: 6px;
  }
  .controls-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
  }
  .points-readout {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--color-muted);
  }
  .used-by {
    font-size: 11px;
    color: var(--color-muted);
  }
  :global(.reset-btn) {
    margin-left: auto;
  }
  .empty-hint {
    color: var(--color-muted);
  }
</style>
