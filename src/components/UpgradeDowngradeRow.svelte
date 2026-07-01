<script>
  /**
   * UpgradeDowngradeRow.svelte - per-loadout DPS/HPS delta from applying the
   * current drop, each with its own Apply button, plus one shared Discard
   * (there is only ever one drop - see CONTEXT.md "Drop"). Only rendered by
   * GearPanelTab in Compare mode.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { resolveEffectiveTotals } from '../lib/totals.js';
  import { compareSwap } from '../lib/dps.js';

  let drop = $derived(rosterStore.roster.drop);
  let results = $derived.by(() => {
    if (!drop) return [];
    // resolveEffectiveTotals (manual or Calculated, per loadout) - Profile
    // Stats and Gear Panel must never disagree about a loadout's current totals.
    return rosterStore.current.loadouts.map((loadout, i) =>
      compareSwap(resolveEffectiveTotals(rosterStore.current, i), loadout.gear[drop.slot], drop.piece)
    );
  });

  function pct(n) {
    if (!Number.isFinite(n)) return '—';
    return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
  }
</script>

{#if drop}
  <div class="upgrade-downgrade-row">
    {#each rosterStore.current.loadouts as loadout, i (loadout.name)}
      <div class="result-card" class:upgrade={results[i].verdict === 'upgrade'} class:downgrade={results[i].verdict === 'downgrade'}>
        <h3>{loadout.name}: Upgrade/Downgrade</h3>
        <div class="deltas">
          <span>DPS <strong>{results[i].new_dps.toFixed(1)}</strong> ({pct(results[i].pct_change)})</span>
          <span>HPS <strong>{results[i].new_hps.toFixed(1)}</strong> ({pct(results[i].hps_pct_change)})</span>
        </div>
        <p class="footer-line">
          DPS {results[i].current_dps.toFixed(1)} -&gt; {results[i].new_dps.toFixed(1)} · HPS {results[i].current_hps.toFixed(1)} -&gt; {results[i].new_hps.toFixed(1)}
        </p>
        <button type="button" onclick={() => rosterStore.applyDropToLoadout(i)}>Apply to {loadout.name}</button>
      </div>
    {/each}
  </div>
  <button type="button" class="discard" onclick={() => rosterStore.clearDrop()}>Discard this drop</button>
{/if}

<style>
  .upgrade-downgrade-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-top: 1rem;
  }
  @media (max-width: 640px) {
    .upgrade-downgrade-row {
      grid-template-columns: 1fr;
      gap: var(--space-4, 1rem);
    }
  }
  .result-card {
    background: var(--color-surface, none);
    border: 1px solid var(--color-border, #444);
    border-left-width: 4px;
    border-radius: var(--radius, 4px);
    padding: var(--space-3, 0.75rem);
  }
  .result-card.upgrade {
    border-left-color: var(--color-upgrade, #4caf7d);
    background: var(--color-upgrade-soft, none);
  }
  .result-card.downgrade {
    border-left-color: var(--color-downgrade, #e05252);
    background: var(--color-downgrade-soft, none);
  }
  .deltas {
    display: flex;
    gap: 1rem;
  }
  .footer-line {
    color: var(--color-muted, #999);
    font-size: 0.85rem;
  }
  .discard {
    display: block;
    margin: 0.75rem auto 0;
  }
</style>
