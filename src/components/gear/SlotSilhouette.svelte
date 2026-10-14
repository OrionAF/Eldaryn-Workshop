<script>
  /**
   * SlotSilhouette.svelte - the gear slot layout (adapted from the v1 silhouette):
   *            [Head]
   *            [Shoulders]
   * [Weapon]   [Chest]      [Off-hand]
   * [Ring]     [Legs]       [Amulet]
   *            [Boots]
   * and, for the Oblivion realm, a fourth row: [Belt] [Gloves] [Rift Core].
   * Selection state is owned by the parent. `stoneColors` maps a slot to the CSS colour of the stone
   * socketed there (top-left dot); the top-right gold dot marks the selected slot.
   */
  import { slotsForRealm } from '../../lib/game/gear.js';
  import { slotLabel, rarityColor } from './gearFormat.js';

  let { items, realm = 'base', cls = null, selectedSlot, onSelect, label = 'Gear', stoneColors = {} } = $props();

  const slots = $derived(slotsForRealm(realm));
</script>

<div class="silhouette" class:oblivion={realm === 'oblivion'} role="group" aria-label={`${label} gear slots`}>
  {#each slots as slot (slot)}
    {@const item = items?.[slot] ?? null}
    <button
      type="button"
      class="slot"
      class:selected={selectedSlot === slot}
      class:filled={!!item}
      style="grid-area: {slot.toLowerCase()}; --slot-rarity: {rarityColor(item?.rarity)}"
      data-slot={slot}
      onclick={() => onSelect(slot)}
      aria-pressed={selectedSlot === slot}
    >
      {#if stoneColors[slot]}
        <span class="stone-dot" style="background-color: {stoneColors[slot]}"></span>
      {/if}
      <span class="slot-name">{slotLabel(cls, slot)}</span>
      {#if item?.itemLevel}<span class="slot-level mono">{item.itemLevel}</span>{/if}
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
    gap: var(--space-2);
    max-width: 16rem;
  }
  .silhouette.oblivion {
    grid-template-areas:
      '.      head      .'
      '.      shoulders .'
      'weapon chest     offhand'
      'ring   leggings  trinket'
      '.      boots     .'
      'belt   gloves    rift_core';
  }
  .slot {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 4px;
    border: 1px solid var(--color-border);
    background: var(--color-inset);
    cursor: pointer;
    font-size: 11px;
    color: var(--color-dim);
    border-radius: 7px;
  }
  .slot.filled {
    background: var(--color-field);
    color: var(--color-soft);
    border-color: var(--slot-rarity);
  }
  .slot-level {
    font-size: 10px;
    color: var(--color-muted);
  }
  /* The selected slot "sockets" a gold dot, like a gem set into the gear. */
  .slot.selected {
    border-color: var(--color-gold);
    color: var(--color-gold-light);
  }
  .slot.selected::after {
    content: '';
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--color-gold);
  }
  .stone-dot {
    position: absolute;
    top: 0.3rem;
    left: 0.3rem;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
  }
</style>
