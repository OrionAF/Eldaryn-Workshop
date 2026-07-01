<script>
  /**
   * GearPanelTab.svelte - slot silhouette + selection (build step 6). The
   * Stats Summary Row / Item Stat Input Form / Upgrade-Downgrade Result row
   * land in build step 7.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { SLOTS } from '../lib/constants.js';
  import SlotSilhouette from './SlotSilhouette.svelte';
  import SelectionStatusRow from './SelectionStatusRow.svelte';

  // Shared across both loadouts' silhouettes and both are view-only, not persisted.
  let selectedSlot = $state(SLOTS[0]);
  let mode = $state('compare');
</script>

<section aria-label="Gear Panel">
  <div class="silhouette-columns">
    {#each rosterStore.current.loadouts as loadout (loadout.name)}
      <div class="silhouette-column">
        <h2>{loadout.name}</h2>
        <SlotSilhouette
          gear={loadout.gear}
          {selectedSlot}
          onSelect={(slot) => (selectedSlot = slot)}
          loadoutLabel={loadout.name}
        />
      </div>
    {/each}
  </div>

  <p class="caption">
    Click a slot above to add/edit/compare gear stats. Selecting a slot in either loadout selects
    the same slot in the other loadout.
  </p>

  <SelectionStatusRow {selectedSlot} {mode} onModeChange={(m) => (mode = m)} />
</section>

<style>
  .silhouette-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    justify-items: center;
  }
  .caption {
    text-align: center;
    color: var(--color-muted, #999);
    font-size: 0.85rem;
  }
</style>
