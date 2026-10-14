<script>
  /**
   * TalentsScreen.svelte - Set A / Set B (character.talentSets), each an independent spec + rank
   * allocation that presets point at. Trees come from the L1 catalogue (game/talents.js).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { talentSpecsForClass, talentSpec } from '../../lib/game/talents.js';
  import { pointsSpent, TALENT_POINT_CAP } from '../../lib/model/talents.js';
  import Chip from '../Chip.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import TalentTierList from '../talents/TalentTierList.svelte';

  let { setStatus = () => {}, onNavigate = () => {} } = $props(); // eslint-disable-line no-unused-vars

  const character = $derived(rosterStore.current);
  const specKeys = $derived(talentSpecsForClass(character?.class));
  const label = (i) => (i === 0 ? 'Set A' : 'Set B');

  let selectedSet = $state(0);
  const set = $derived(character.talentSets[selectedSet]);
  const usedBy = $derived(character.presets.filter((p) => p.talentSet === selectedSet).map((p) => p.name));
</script>

{#if !character.class}
  <p class="empty-hint">Choose a class for this character before assigning talent specializations.</p>
{:else}
  <div class="header-row">
    <h2>Talents</h2>
    <div class="chip-list">
      {#each character.talentSets as _, i (i)}
        <Chip label={label(i)} selected={selectedSet === i} onClick={() => (selectedSet = i)} />
      {/each}
    </div>
  </div>

  <div class="controls-row">
    <select
      aria-label={`Specialization for ${label(selectedSet)}`}
      value={set.spec ?? ''}
      onchange={(e) => rosterStore.setTalentSetSpec(selectedSet, e.target.value || null)}
    >
      <option value="">Choose a spec...</option>
      {#each specKeys as k (k)}<option value={k}>{talentSpec(k).name}</option>{/each}
    </select>
    <span class="points-readout">{pointsSpent(set.allocation)} / {TALENT_POINT_CAP} pts</span>
    <span class="used-by">{usedBy.length ? `used by ${usedBy.join(', ')}` : 'unused'}</span>
    <ConfirmButton
      class="reset-btn"
      label={`Reset ${label(selectedSet)}`}
      confirmLabel="Confirm reset"
      prompt={`Reset all points spent in ${label(selectedSet)}?`}
      onConfirm={() => rosterStore.resetTalentSet(selectedSet)}
    />
  </div>

  {#if !set.spec}
    <p class="empty-hint">Choose a specialization above for {label(selectedSet)} to see its talent tree.</p>
  {:else}
    <TalentTierList specKey={set.spec} talentSetIndex={selectedSet} />
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
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: var(--color-muted);
  }
  .used-by {
    font-size: 11px;
    color: var(--color-dim);
  }
  :global(.reset-btn) {
    margin-left: auto;
  }
  .empty-hint {
    color: var(--color-muted);
  }
</style>
