<script>
  /**
   * GearPanelTab.svelte - slot silhouette + selection (build step 6) plus
   * the Compare/Edit workflow (build step 7).
   *
   * Compare mode: Stats Summary Row (read-only) + Item Stat Input Form +
   * Upgrade/Downgrade Result row. Edit mode: Stats Summary Row only
   * (editable), the other two hidden (grilled decision - see CONTEXT.md).
   *
   * The candidate drop always tracks the currently selected slot: entering
   * Compare mode, or changing the selected slot while in Compare mode,
   * (re)starts a fresh drop for that slot via rosterStore.startDrop. This
   * wasn't explicitly grilled (the wireframe didn't cover switching slots
   * mid-comparison) - the alternative (silently reattributing a candidate's
   * stats to a different slot) seemed more likely to surprise a user, so a
   * fresh-per-slot candidate was chosen instead.
   *
   * The effect below deliberately reads roster.drop via untrack(): it must
   * NOT be a reactive dependency, or Apply/Discard (which set roster.drop to
   * null) would immediately retrigger this same effect to refill it,
   * defeating "Apply/Discard clears the drop" - and since startDrop() writes
   * the very state a tracked read would depend on, that combination is
   * exactly Svelte's effect_update_depth_exceeded anti-pattern. Depending
   * only on mode/selectedSlot means the drop is (re)synced at the specific
   * moments that should trigger it - mount, slot change, mode change - and
   * stays however Apply/Discard left it the rest of the time.
   */
  import { untrack } from 'svelte';
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { SLOTS } from '../lib/constants.js';
  import SlotSilhouette from './SlotSilhouette.svelte';
  import SelectionStatusRow from './SelectionStatusRow.svelte';
  import StatsSummaryRow from './StatsSummaryRow.svelte';
  import ItemStatInputForm from './ItemStatInputForm.svelte';
  import UpgradeDowngradeRow from './UpgradeDowngradeRow.svelte';

  // Shared across both loadouts' silhouettes and both are view-only, not persisted.
  let selectedSlot = $state(SLOTS[0]);
  let mode = $state('compare');

  $effect(() => {
    if (mode !== 'compare') return;
    const drop = untrack(() => rosterStore.roster.drop);
    if (!drop || drop.slot !== selectedSlot) {
      rosterStore.startDrop(selectedSlot);
    }
  });
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

  <StatsSummaryRow {selectedSlot} {mode} />

  {#if mode === 'compare'}
    <ItemStatInputForm />
    <UpgradeDowngradeRow />
  {/if}
</section>

<style>
  .silhouette-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    justify-items: center;
  }
  @media (max-width: 640px) {
    .silhouette-columns {
      grid-template-columns: 1fr;
      gap: var(--space-6, 1.5rem);
    }
  }
  .caption {
    text-align: center;
    color: var(--color-muted, #999);
    font-size: 0.85rem;
  }
</style>
