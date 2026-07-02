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

  const allFields = $derived(fieldsForTab('gear', rosterStore.current.class));

  // Compare mode: drop a field from a column entirely if it's 0 for THAT
  // loadout - independent per column, so each side only shows what its own
  // piece actually grants. The two columns can end up with different row
  // sets (a stat non-zero in one loadout but not the other only shows on
  // the one that has it). Edit mode always shows every field - you need to
  // be able to type into a currently-zero one.
  function fieldsFor(loadout) {
    if (mode === 'edit') return allFields;
    return allFields.filter((f) => (loadout.gear[selectedSlot][f.key] || 0) !== 0);
  }
</script>

<div class="stats-summary-row">
  {#each rosterStore.current.loadouts as loadout, i (loadout.name)}
    <div class="stats-summary-column">
      <h3>{loadout.name}</h3>
      <StatsFields
        values={loadout.gear[selectedSlot]}
        otherValues={rosterStore.current.loadouts[1 - i].gear[selectedSlot]}
        fields={fieldsFor(loadout)}
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
  @media (max-width: 640px) {
    .stats-summary-row {
      grid-template-columns: 1fr;
      gap: var(--space-6, 1.5rem);
    }
  }
</style>
