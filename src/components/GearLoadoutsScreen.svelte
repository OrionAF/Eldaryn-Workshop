<script>
  /**
   * GearLoadoutsScreen.svelte - direct gear editing for a loadout/slot (the
   * old Gear Panel's Edit mode; Compare mode moved entirely into Drop Check).
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { fieldsForTab, SLOTS } from '../lib/constants.js';
  import { stoneTypeDef } from '../lib/stonesData.js';
  import Chip from './Chip.svelte';
  import SlotSilhouette from './SlotSilhouette.svelte';
  import StatsFields from './StatsFields.svelte';
  import StoneForm from './StoneForm.svelte';
  import StoneGrid from './StoneGrid.svelte';

  const character = $derived(rosterStore.current);

  let loadoutIndex = $state(0);
  let selectedSlot = $state('Weapon');
  let selectedStoneId = $state(null);

  const loadout = $derived(character.loadouts[loadoutIndex]);
  const fields = $derived(fieldsForTab('gear', character.class));
  const usedBy = $derived(character.presets.filter((p) => p.loadout === loadoutIndex).map((p) => p.name));

  /** Slot -> socketed stone's type color, for SlotSilhouette's indicator dot (this loadout only). */
  const stoneColors = $derived.by(() => {
    const colors = {};
    for (const slot of SLOTS) {
      const stone = character.stoneInventory.find((s) => s.id === loadout.socketedStones[slot]);
      colors[slot] = stone ? stoneTypeDef(stone.type)?.color : null;
    }
    return colors;
  });
</script>

<div class="header-row">
  <h2>Gear Loadouts</h2>
  <div class="chip-list">
    {#each character.loadouts as l, i (i)}
      <Chip
        label={l.name}
        selected={loadoutIndex === i}
        onClick={() => {
          loadoutIndex = i;
          selectedStoneId = null;
        }}
      />
    {/each}
  </div>
</div>

<div class="layout">
  <div class="silhouette-col">
    <SlotSilhouette
      gear={loadout.gear}
      {selectedSlot}
      onSelect={(slot) => {
        selectedSlot = slot;
        selectedStoneId = null;
      }}
      loadoutLabel={loadout.name}
      {stoneColors}
    />
    {#if usedBy.length}
      <p class="used-by">This loadout is used by: {usedBy.join(', ')}</p>
    {:else}
      <p class="used-by">No presets use this loadout yet.</p>
    {/if}
    <StoneForm {character} {loadoutIndex} {selectedSlot} {selectedStoneId} onDeselect={() => (selectedStoneId = null)} />
  </div>

  <div class="field-col">
    <p class="micro-label">{loadout.name} — {selectedSlot}</p>
    <StatsFields
      values={loadout.gear[selectedSlot]}
      {fields}
      onChange={(key, value) => rosterStore.setGearField(selectedSlot, loadoutIndex, key, value)}
    />
    <h3 class="subheading stones-heading">Socketed Stones</h3>
    <StoneGrid
      stoneInventory={character.stoneInventory}
      loadouts={character.loadouts}
      {selectedStoneId}
      onSelect={(id) => (selectedStoneId = id)}
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
  .stones-heading {
    margin: var(--space-4) 0 var(--space-2);
  }
  @media (min-width: 900px) {
    .field-col :global(.stats-fields) {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 26px;
    }
  }
</style>
