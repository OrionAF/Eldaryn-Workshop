<script>
  /**
   * WinRateTarget.svelte - the "Target" field of the PVE win-rate goal and of Push (backlog §4, §10;
   * simulation.md §Win rate, §Push). `objective` is the bindable plain spec `{kind: 'win-rate'|'push',
   * target?}`; target is stored as a fraction, shown as a percent in [10, 100] (default 95, `WIN_RATE_TARGET`).
   * `start` names Push's starting rung.
   */
  import NumberField from '../ui/NumberField.svelte';
  import { WIN_RATE_TARGET } from '../../lib/search/objectives.js';

  let { objective = $bindable(), start = '' } = $props();
  const isPush = $derived(objective.kind === 'push');

  const percent = $derived(Math.round((objective.target ?? WIN_RATE_TARGET.default) * 100));
  const clamp = (v) => Math.min(WIN_RATE_TARGET.max * 100, Math.max(WIN_RATE_TARGET.min * 100, Math.round(v ?? WIN_RATE_TARGET.default * 100)));
  const set = (v) => (objective = { kind: objective.kind, target: clamp(v) / 100 });
</script>

<div class="goal" data-testid="win-rate-target">
  <NumberField label="Target" unit="%" min={WIN_RATE_TARGET.min * 100} max={WIN_RATE_TARGET.max * 100} value={percent} onchange={set} />
  <span class="hint" data-testid="win-rate-explain">
    {#if isPush}
      Climbs from {start || 'the chosen step'} to the deepest step a build clears at least {percent}% of the time, and finds the build with the fewest changes that gets there. Speed does not matter.
    {:else}
      Finds the build with the fewest changes that clears this at least {percent}% of the time. Speed does not matter.
    {/if}
    A loss usually costs nothing but time (a chapter level restarts; an Oblivion floor keeps its key), so a lower target is fine for content you can retry.
  </span>
</div>

<style>
  .goal { display: grid; gap: var(--sp-1); }
  .hint { color: var(--text-muted); font-size: var(--fs-12); }
</style>
