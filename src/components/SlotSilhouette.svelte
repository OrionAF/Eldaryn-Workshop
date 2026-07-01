<script>
  /**
   * SlotSilhouette.svelte - the 9-slot gear layout in the grilled fixed
   * arrangement (handoff-adjacent, but this specific silhouette shape was
   * given directly by the user during grilling, not the original handoff):
   *            [Head]
   *            [Shoulder]
   * [Weapon]   [Chest]      [Off-hand]
   * [Ring]     [Legs]       [Trinket]
   *            [Boots]
   * Selection state is owned by the parent (GearPanelTab) and shared across
   * both loadouts' silhouettes - selecting a slot in either selects it in both.
   */
  import { SLOTS } from '../lib/constants.js';

  let { gear, selectedSlot, onSelect, loadoutLabel } = $props();

  function hasData(slot) {
    const stats = gear[slot];
    return stats && Object.values(stats).some((v) => v !== 0);
  }
</script>

<div class="silhouette" role="group" aria-label={`${loadoutLabel} gear slots`}>
  {#each SLOTS as slot (slot)}
    <button
      type="button"
      class="slot"
      class:selected={selectedSlot === slot}
      class:filled={hasData(slot)}
      style="grid-area: {slot.toLowerCase()}"
      onclick={() => onSelect(slot)}
      aria-pressed={selectedSlot === slot}
    >
      {slot}
    </button>
  {/each}
</div>

<style>
  .silhouette {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-areas:
      '.      head      .'
      '.      shoulders .'
      'weapon chest     offhand'
      'ring   leggings  trinket'
      '.      boots     .';
    gap: 0.4rem;
    max-width: 16rem;
  }
  .slot {
    padding: 0.5rem 0.25rem;
    border: 1px solid var(--color-border, #444);
    background: none;
    cursor: pointer;
    font-size: 0.75rem;
    color: inherit;
  }
  .slot.selected {
    border-color: var(--color-accent, #7aa2f7);
    border-width: 2px;
  }
  .slot.filled {
    background: rgba(122, 162, 247, 0.1);
  }
</style>
