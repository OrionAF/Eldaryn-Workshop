<script>
  /**
   * StatsSummaryRow.svelte - the selected slot's currently-equipped stats,
   * per loadout. Compare mode: read-only baseline. Edit mode: directly
   * editable - this is the only way a slot's "currently equipped" data
   * gets in (see CONTEXT.md "Mode: Compare vs. Edit").
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { fieldsForTab, DEFENSIVE_STAT_KEYS } from '../lib/constants.js';
  import StatsFields from './StatsFields.svelte';

  let { selectedSlot, mode } = $props();

  // Compare mode: drop a defensive/bonus field entirely if it's 0 for BOTH
  // loadouts at this slot - most pieces don't touch most of them, and a long
  // tail of zeroes is noise. Keep both columns showing the same row set (hide
  // by "either loadout has it", not independently) so rows stay aligned for
  // comparison. Edit mode always shows every field - you need to be able to
  // type into a currently-zero one.
  const fields = $derived.by(() => {
    const allFields = fieldsForTab('gear', rosterStore.current.class);
    if (mode === 'edit') return allFields;
    const [a, b] = rosterStore.current.loadouts;
    return allFields.filter((f) => {
      if (!DEFENSIVE_STAT_KEYS.includes(f.key)) return true;
      return (a.gear[selectedSlot][f.key] || 0) !== 0 || (b.gear[selectedSlot][f.key] || 0) !== 0;
    });
  });
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
  @media (max-width: 640px) {
    .stats-summary-row {
      grid-template-columns: 1fr;
      gap: var(--space-6, 1.5rem);
    }
  }
</style>
