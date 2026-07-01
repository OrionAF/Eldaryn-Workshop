<script>
  /**
   * ItemStatInputForm.svelte - the candidate/drop item's stats. One row,
   * loadout-agnostic (one candidate tested against both loadouts at once).
   * Only rendered by GearPanelTab in Compare mode.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { fieldsForTab } from '../lib/constants.js';
  import StatsFields from './StatsFields.svelte';

  const fields = fieldsForTab('gear');
</script>

{#if rosterStore.roster.drop}
  <div class="item-stat-input-form">
    <h3>New Drop</h3>
    <StatsFields
      values={rosterStore.roster.drop.piece}
      {fields}
      onChange={(key, value) => rosterStore.setDropField(key, value)}
    />
  </div>
{/if}

<style>
  .item-stat-input-form {
    margin-top: 1rem;
  }
  .item-stat-input-form :global(.stats-fields) {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 1rem;
  }
  .item-stat-input-form :global(.stats-fields label) {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
  }
</style>
