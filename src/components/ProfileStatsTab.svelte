<script>
  /**
   * ProfileStatsTab.svelte - the full per-loadout totals editor (handoff's
   * original "Profile totals input" feature), two columns.
   *
   * Phase 1: each loadout has a Manual/Calculated toggle (Loadout.manualTotals,
   * wired up here for the first time - was hardcoded true in Phase 0). Manual
   * keeps the original directly-editable behavior. Calculated shows
   * totals.js's computeCalculatedTotals() read-only instead - the manual
   * values are preserved underneath untouched, so switching back loses
   * nothing. Both the display totals and the DPS/HPS readout use
   * resolveEffectiveTotals() (manual or calculated, whichever is active) so
   * this tab and the Gear Panel tab can never disagree about a loadout's
   * current stats.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { fieldsForTab } from '../lib/constants.js';
  import { resolveEffectiveTotals } from '../lib/totals.js';
  import StatsFields from './StatsFields.svelte';
  import DpsHpsReadout from './DpsHpsReadout.svelte';

  const fields = $derived(fieldsForTab('profile', rosterStore.current.class));

  function effective(i) {
    return resolveEffectiveTotals(rosterStore.current, i);
  }
</script>

<section aria-label="Profile Stats">
  <div class="loadout-columns">
    {#each rosterStore.current.loadouts as loadout, i (loadout.name)}
      <div class="loadout-column">
        <div class="loadout-header">
          <h2>{loadout.name}</h2>
          <span class="totals-toggle" role="group" aria-label="Totals mode">
            Totals:
            <button
              type="button"
              class:active={loadout.manualTotals}
              onclick={() => rosterStore.setLoadoutTotalsMode(i, 'manual')}
            >
              Manual
            </button>
            <button
              type="button"
              class:active={!loadout.manualTotals}
              onclick={() => rosterStore.setLoadoutTotalsMode(i, 'calculated')}
            >
              Calculated
            </button>
          </span>
        </div>
        <DpsHpsReadout profile={effective(i)} />
        <StatsFields
          values={effective(i)}
          otherValues={effective(1 - i)}
          {fields}
          readOnly={!loadout.manualTotals}
          onChange={(key, value) => rosterStore.setProfileField(i, key, value)}
        />
      </div>
    {/each}
  </div>
</section>

<style>
  .loadout-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }
  /* Two full stat-field columns side by side is unreadable below ~640px
     (a phone in portrait) - stack instead of crushing both. */
  @media (max-width: 640px) {
    .loadout-columns {
      grid-template-columns: 1fr;
      gap: var(--space-6, 1.5rem);
    }
  }
  .loadout-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  .totals-toggle button {
    border: 1px solid var(--color-border, #444);
    background: none;
    color: inherit;
    padding: 0.15rem 0.5rem;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .totals-toggle button.active {
    border-color: var(--color-accent, #7aa2f7);
    font-weight: 600;
  }
</style>
