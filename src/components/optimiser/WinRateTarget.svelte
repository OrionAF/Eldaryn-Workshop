<script>
  /**
   * WinRateTarget.svelte - the PVE win-rate goal's "Target" field (backlog §4, simulation.md §Win rate).
   * `objective` is the bindable plain spec `{kind: 'win-rate', target?}`; target is stored as a fraction,
   * shown as a percent in [50, 100] (default 95, `WIN_RATE_TARGET`).
   */
  import NumberField from '../ui/NumberField.svelte';
  import { WIN_RATE_TARGET } from '../../lib/search/objectives.js';

  let { objective = $bindable() } = $props();

  const percent = $derived(Math.round((objective.target ?? WIN_RATE_TARGET.default) * 100));
  const clamp = (v) => Math.min(WIN_RATE_TARGET.max * 100, Math.max(WIN_RATE_TARGET.min * 100, Math.round(v ?? WIN_RATE_TARGET.default * 100)));
  const set = (v) => (objective = { kind: 'win-rate', target: clamp(v) / 100 });
</script>

<div class="goal" data-testid="win-rate-target">
  <NumberField label="Target" unit="%" min={WIN_RATE_TARGET.min * 100} max={WIN_RATE_TARGET.max * 100} value={percent} onchange={set} />
  <span class="hint" data-testid="win-rate-explain">
    Finds the build with the fewest changes that clears this at least {percent}% of the time. Speed does not matter.
  </span>
</div>

<style>
  .goal { display: grid; gap: var(--sp-1); }
  .hint { color: var(--text-muted); font-size: var(--fs-12); }
</style>
