<script>
  /**
   * ProfileStatsTab.svelte - the full per-loadout totals editor (handoff's
   * original "Profile totals input" feature), two columns. Always directly
   * editable - Phase 0 totals are manual input, no mode toggle here (that's
   * a Gear Panel tab concept).
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { fieldsForTab } from '../lib/constants.js';
  import StatsFields from './StatsFields.svelte';
  import DpsHpsReadout from './DpsHpsReadout.svelte';

  const fields = fieldsForTab('profile');
</script>

<section aria-label="Profile Stats">
  <div class="loadout-columns">
    {#each rosterStore.current.loadouts as loadout, i (loadout.name)}
      <div class="loadout-column">
        <h2>{loadout.name}</h2>
        <DpsHpsReadout profile={loadout.profileTotals} />
        <StatsFields
          values={loadout.profileTotals}
          otherValues={rosterStore.current.loadouts[1 - i].profileTotals}
          {fields}
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
</style>
