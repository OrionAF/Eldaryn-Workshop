<script>
  /**
   * WinRateTarget.svelte - the "Target" field of the "Reach a win rate" goal and of Push (backlog §4, §10;
   * simulation.md §Win rate, §Push). `objective` is the bindable plain spec `{kind: 'win-rate'|'push',
   * target?}`; target is stored as a fraction, shown as a percent in [1, 100] for a win rate and [10, 100]
   * for Push (default 95, `WIN_RATE_TARGET` / `PUSH_TARGET`). `start` names Push's starting rung; `rung` what a rung is called
   * ('step', or 'level' on the Celestial Trial).
   */
  import NumberField from '../ui/NumberField.svelte';
  import { WIN_RATE_TARGET, PUSH_TARGET } from '../../lib/search/objectives.js';

  let { objective = $bindable(), start = '', rung = 'step' } = $props();
  const isPush = $derived(objective.kind === 'push');
  const bound = $derived(isPush ? PUSH_TARGET : WIN_RATE_TARGET);

  const percent = $derived(Math.round((objective.target ?? bound.default) * 100));
  const clamp = (v) => Math.min(bound.max * 100, Math.max(bound.min * 100, Math.round(v ?? bound.default * 100)));
  const set = (v) => (objective = { kind: objective.kind, target: clamp(v) / 100 });
</script>

<div class="goal" data-testid="win-rate-target">
  <NumberField label="Target" unit="%" min={bound.min * 100} max={bound.max * 100} value={percent} onchange={set} />
  <span class="hint" data-testid="win-rate-explain">
    {#if isPush}
      Climbs from {start || `the chosen ${rung}`} to the deepest {rung} a build clears at least {percent}% of the time, and finds the build with the fewest changes that gets there. Speed does not matter.
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
