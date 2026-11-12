<script>
  /**
   * SlotSilhouette.svelte - the gear slot layout (adapted from the v1 silhouette):
   *            [Head]
   *            [Shoulders]
   * [Weapon]   [Chest]      [Off-hand]
   * [Ring]     [Legs]       [Trinket]
   *            [Boots]
   * and, for the Oblivion realm, a fourth row: [Belt] [Gloves] [Rift Core].
   * A filled slot shows the item's game art (assets/gear.js gearImage) framed in its rarity colour,
   * its item level bottom-right and, from `grades` (slot -> letter, features/gearScore.js), its grade
   * bottom-left; an empty slot shows its name. Selection state is owned by the parent. `stoneColors`
   * maps a slot to the CSS colour of the stone socketed there (top-left dot); the top-right gold dot
   * marks the selected slot.
   */
  import { slotsForRealm } from '../../lib/game/gear.js';
  import { gearImage } from '../../lib/assets/gear.js';
  import { slotLabel, rarityColor } from './gearFormat.js';

  let { items, realm = 'base', cls = null, selectedSlot, onSelect, label = 'Gear', stoneColors = {}, grades = {} } = $props();

  const slots = $derived(slotsForRealm(realm));
</script>

<div class="silhouette" class:oblivion={realm === 'oblivion'} role="group" aria-label={`${label} gear slots`}>
  {#each slots as slot (slot)}
    {@const item = items?.[slot] ?? null}
    {@const art = gearImage(item, slot, cls)}
    <button
      type="button"
      class="slot"
      class:selected={selectedSlot === slot}
      class:filled={!!item}
      class:has-art={!!art}
      style="grid-area: {slot.toLowerCase()}; --slot-rarity: {rarityColor(item?.rarity)}"
      data-slot={slot}
      title={slotLabel(cls, slot)}
      onclick={() => onSelect(slot)}
      aria-pressed={selectedSlot === slot}
    >
      {#if art}<img class="slot-art" src={art} alt="" loading="lazy" draggable="false" />{/if}
      {#if stoneColors[slot]}
        <span class="stone-dot" style="background-color: {stoneColors[slot]}"></span>
      {/if}
      <span class="slot-name" class:visually-hidden={!!art}>{slotLabel(cls, slot)}</span>
      {#if grades[slot]}<span class="slot-grade roll-grade grade-{grades[slot]}" aria-label="grade {grades[slot]}">{grades[slot]}</span>{/if}
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
    gap: var(--sp-2);
    max-width: 17rem;
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
    justify-content: center;
    gap: 2px;
    aspect-ratio: 1;
    padding: 4px;
    border: 1px solid var(--line-rule);
    background: var(--surface-1);
    cursor: pointer;
    font-size: 11px;
    color: var(--text-muted);
    border-radius: var(--r-2);
    overflow: hidden;
  }
  .slot.filled {
    background: var(--surface-3);
    color: var(--text-soft);
    border-color: var(--slot-rarity);
  }
  /* A soft glow of the rarity colour behind the art, like the game's item frame. */
  .slot.has-art {
    background: radial-gradient(circle at 50% 55%, color-mix(in srgb, var(--slot-rarity) 22%, transparent), var(--surface-1) 72%);
  }
  .slot-art {
    position: absolute;
    inset: 8%;
    width: 84%;
    height: 84%;
    object-fit: contain;
    pointer-events: none;
  }
  .slot-level,
  .slot-grade {
    position: absolute;
    bottom: 2px;
    padding: 0 3px;
    border-radius: var(--r-1);
    background: color-mix(in srgb, var(--surface-0) 70%, transparent);
    line-height: 1.3;
  }
  .slot-level {
    right: 2px;
    font-size: 10px;
    color: var(--text-soft);
  }
  .slot-grade {
    left: 2px;
    font-size: 11px;
  }
  /* The selected slot "sockets" a gold dot, like a gem set into the gear. */
  .slot.selected {
    border-color: var(--brass-400);
    color: var(--brass-200);
    box-shadow: inset 0 0 0 1px var(--brass-400);
  }
  .slot.selected::after {
    content: '';
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--brass-400);
  }
  .stone-dot {
    position: absolute;
    top: 0.3rem;
    left: 0.3rem;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    z-index: 1;
  }
</style>
