<script>
  /**
   * GearLoadoutsScreen.svelte - direct gear editing for a loadout/slot (the
   * old Gear Panel's Edit mode; Compare mode moved entirely into Drop Check).
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { fieldsForTab } from '../lib/constants.js';
  import Chip from './Chip.svelte';
  import SlotSilhouette from './SlotSilhouette.svelte';
  import StatsFields from './StatsFields.svelte';

  const character = $derived(rosterStore.current);

  let loadoutIndex = $state(0);
  let selectedSlot = $state('Weapon');

  const loadout = $derived(character.loadouts[loadoutIndex]);
  const fields = $derived(fieldsForTab('gear', character.class));
  const usedBy = $derived(character.presets.filter((p) => p.loadout === loadoutIndex).map((p) => p.name));
</script>

<div class="header-row">
  <h2>Gear Loadouts</h2>
  <div class="chip-list">
    {#each character.loadouts as l, i (i)}
      <Chip label={l.name} selected={loadoutIndex === i} onClick={() => (loadoutIndex = i)} />
    {/each}
  </div>
</div>

<div class="layout">
  <div class="silhouette-col">
    <SlotSilhouette gear={loadout.gear} {selectedSlot} onSelect={(slot) => (selectedSlot = slot)} loadoutLabel={loadout.name} />
    {#if usedBy.length}
      <p class="used-by">This loadout is used by: {usedBy.join(', ')}</p>
    {:else}
      <p class="used-by">No presets use this loadout yet.</p>
    {/if}
  </div>

  <div class="field-col">
    <p class="micro-label">{loadout.name} — {selectedSlot}</p>
    <StatsFields
      values={loadout.gear[selectedSlot]}
      {fields}
      onChange={(key, value) => rosterStore.setGearField(selectedSlot, loadoutIndex, key, value)}
    />
  </div>
</div>

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
  .layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: var(--space-6);
  }
  @media (max-width: 640px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .silhouette-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
  }
  .used-by {
    font-size: 11px;
    color: var(--color-dim);
    margin-top: var(--space-3);
  }
  .field-col {
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 16px 18px;
  }
  .field-col .micro-label {
    margin: 0 0 10px;
  }
  @media (min-width: 900px) {
    .field-col :global(.stats-fields) {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 26px;
    }
  }
</style>
