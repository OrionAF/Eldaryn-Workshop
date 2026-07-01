<script>
  /**
   * StatsSummaryRow.svelte - the selected slot's currently-equipped stats,
   * per loadout. Compare mode: read-only baseline. Edit mode: directly
   * editable - this is the only way a slot's "currently equipped" data
   * gets in (see CONTEXT.md "Mode: Compare vs. Edit").
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { fieldsForTab } from '../lib/constants.js';
  import StatsFields from './StatsFields.svelte';

  let { selectedSlot, mode } = $props();
  const fields = fieldsForTab('gear');
</script>

<div class="stats-summary-row">
  {#each rosterStore.current.loadouts as loadout, i (loadout.name)}
    <div class="stats-summary-column">
      <h3>{loadout.name}</h3>
      <StatsFields
        values={loadout.gear[selectedSlot]}
        otherValues={rosterStore.current.loadouts[1 - i].gear[selectedSlot]}
        {fields}
        readOnly={mode !== 'edit'}
        onChange={(key, value) => rosterStore.setGearField(selectedSlot, i, key, value)}
      />
    </div>
  {/each}
</div>

<style>
  .stats-summary-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-top: 1rem;
  }
</style>
