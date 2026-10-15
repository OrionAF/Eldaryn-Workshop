<script>
  /**
   * RunEstimate.svelte - "About N min on this device (estimate)" under a tool's Effort control, from the
   * speed calibration (lib/calibration.js) and the run's expected fights by kind. Without a calibration it
   * links to Settings instead. A figure from another CPU profile or build is shown with that said.
   * fights: {dummy?, dungeon?, duel?}; bound: 'about' | 'upper' (a run that can stop early).
   */
  import { prefs } from '../../lib/prefs.svelte.js';
  import { estimateText, staleReason } from '../../lib/calibration.js';

  let { fights, bound = 'about' } = $props();

  const cal = $derived(prefs.calibration);
  const text = $derived(cal ? estimateText(cal, fights, { bound, stale: staleReason(cal, { profile: prefs.cpuProfile }) }) : null);
</script>

{#if cal}
  {#if text}<p class="run-estimate" data-testid="run-estimate">{text}</p>{/if}
{:else}
  <p class="run-estimate" data-testid="run-estimate"><a href="#/settings">Calibrate speed</a> to see run-time estimates.</p>
{/if}

<style>
  .run-estimate { margin: 0; font-size: var(--fs-12); color: var(--text-muted); }
</style>
