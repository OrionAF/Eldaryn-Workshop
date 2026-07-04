<script>
  /**
   * StoneGrid.svelte - the "Socketed Stones" inventory: an auto-expanding
   * grid of tiles (not a list), one per Character.stoneInventory entry,
   * color-coded by stonesData.js's STONE_TYPES. Clicking a tile selects it
   * (clicking the already-selected tile deselects) - the parent
   * (GearLoadoutsScreen) uses that selection to drive StoneForm's Details
   * mode and the socketing flow. This component is purely a picker/summary;
   * add/edit/remove/socket actions all live in StoneForm.
   */
  import { STAT_FIELDS, SLOTS } from '../lib/constants.js';
  import { summarizeStats } from '../lib/format.js';
  import { stoneTypeDef } from '../lib/stonesData.js';

  let { stoneInventory, loadouts, selectedStoneId, onSelect } = $props();

  /** Which slot (if any) this stone occupies in one loadout - "No" if none. */
  function socketedSlot(loadout, stoneId) {
    return SLOTS.find((slot) => loadout.socketedStones[slot] === stoneId) || 'No';
  }

  /** "Head | No" - positionally Loadout 1 | Loadout 2, per the design doc's display format. */
  function socketStatus(stoneId) {
    return loadouts.map((l) => socketedSlot(l, stoneId)).join(' | ');
  }
</script>

<div class="stone-grid">
  {#if stoneInventory.length === 0}
    <p class="empty-hint">No stones added yet.</p>
  {:else}
    {#each stoneInventory as stone (stone.id)}
      {@const def = stoneTypeDef(stone.type)}
      <button
        type="button"
        class="stone-tile"
        class:selected={selectedStoneId === stone.id}
        style="--tile-color: {def?.color}; --tile-tint: {def?.tint}"
        onclick={() => onSelect(selectedStoneId === stone.id ? null : stone.id)}
        aria-pressed={selectedStoneId === stone.id}
      >
        {#if selectedStoneId === stone.id}
          <span class="selected-dot"></span>
        {/if}
        <span class="stone-type">{def?.label ?? stone.type}</span>
        <span class="stone-quality">Q{stone.quality}</span>
        <span class="stone-summary">{summarizeStats(stone.stats, STAT_FIELDS, 4)}</span>
        <span class="stone-socketed">Socketed: {socketStatus(stone.id)}</span>
      </button>
    {/each}
  {/if}
</div>

<style>
  .stone-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-2);
  }
  .stone-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: var(--space-2);
    background: var(--color-inset);
    border: 1px solid var(--tile-color, var(--color-border));
    border-radius: var(--radius-field, 7px);
    text-align: left;
    color: var(--color-soft);
    min-width: 0;
  }
  .stone-tile:hover {
    background: var(--tile-tint, var(--color-field));
  }
  .stone-tile.selected {
    background: var(--tile-tint, var(--color-field));
    box-shadow: 0 0 0 1px var(--tile-color, var(--color-gold));
  }
  /* Which tile is currently selected - separate from the type-colored border
     above, so "selected" reads clearly even for the greener/bluer stone types. */
  .selected-dot {
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: #facc15;
  }
  .stone-type {
    font-weight: 600;
    font-size: 11.5px;
    color: var(--tile-color, var(--color-soft));
  }
  .stone-quality {
    font-family: var(--font-data);
    font-size: 11px;
    color: var(--color-muted);
  }
  .stone-summary {
    font-family: var(--font-data);
    font-size: 10.5px;
    color: var(--color-dim);
    overflow-wrap: anywhere;
  }
  .stone-socketed {
    font-size: 10px;
    color: var(--color-dim);
  }
  .empty-hint {
    color: var(--color-muted);
  }
</style>
