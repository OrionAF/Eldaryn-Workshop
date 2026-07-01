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
    gap: var(--space-2, 0.5rem);
    max-width: 16rem;
  }
  .slot {
    position: relative;
    padding: var(--space-2, 0.5rem) var(--space-1, 0.25rem);
    border: 1px solid var(--color-border, #444);
    background: var(--color-surface, none);
    cursor: pointer;
    font-size: 0.75rem;
    color: inherit;
    border-radius: var(--radius, 4px);
  }
  .slot.filled {
    background: var(--color-surface-raised, rgba(122, 162, 247, 0.1));
  }
  /* Signature: the selected slot "sockets" - an ember dot, like a gem set
     into the gear, rather than just a heavier border. */
  .slot.selected {
    border-color: var(--color-accent, #7aa2f7);
  }
  .slot.selected::after {
    content: '';
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--color-accent, #7aa2f7);
  }
</style>
