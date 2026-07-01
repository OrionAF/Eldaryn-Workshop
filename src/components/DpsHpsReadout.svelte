<script>
  /**
   * DpsHpsReadout.svelte - live DPS/HPS for a loadout's current totals.
   * Pure display; recomputes via dps.js whenever `profile` changes.
   */
  import { computeDps, computeHps } from '../lib/dps.js';

  let { profile } = $props();

  let dps = $derived(computeDps(profile));
  let hps = $derived(computeHps(profile));
</script>

<div class="dps-hps-readout">
  <span>DPS: <strong>{dps.toFixed(1)}</strong></span>
  <span>HPS: <strong>{hps.total_hps.toFixed(1)}</strong></span>
</div>

<style>
  .dps-hps-readout {
    display: flex;
    gap: 1.5rem;
    font-size: 1.1rem;
    margin-bottom: 0.5rem;
  }
</style>
