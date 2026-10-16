<script>
  /**
   * PowerGuard.svelte - the optional Combat Power floor in Optimiser setup step IV (simulation.md §Build
   * space, "Combat Power guard"). `floor` is bindable: null (off) or a whole number; builds below it are
   * never tried. `currentPower` is the preset's Power (build/power.js), offered as the first quick pick.
   * Turning the guard on starts at the highest Crusade gate the preset meets (backlog §10 item 2), else
   * at its current Power.
   */
  import Checkbox from '../ui/Checkbox.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Select from '../ui/Select.svelte';
  import { powerFloorPicks, currentCrusadeGate } from '../../lib/ui/optimiserSetup.js';
  import { formatFlat } from '../../lib/format.js';

  let { floor = $bindable(null), currentPower = null } = $props();

  const on = $derived(floor != null);
  const picks = $derived(powerFloorPicks(currentPower));
  const pickOptions = $derived([{ value: '', label: 'Choose…' }, ...picks.map((p) => ({ value: String(p.value), label: p.label }))]);
  const set = (v) => (floor = Number.isFinite(v) && v >= 1 ? Math.round(v) : null);

  function toggle(checked) {
    floor = checked ? (currentCrusadeGate(currentPower)?.value ?? Math.max(1, Math.round(currentPower ?? picks[0]?.value ?? 1))) : null;
  }
</script>

<div class="guard" data-testid="power-guard">
  <Checkbox checked={on} label="Keep Combat Power at or above a minimum" onchange={toggle} />
  {#if on}
    <div class="fields">
      <NumberField label="Minimum Combat Power" flat min={1} value={floor} onchange={set} />
      <Select label="Quick pick" options={pickOptions} value="" onchange={(v) => v && set(Number(v))} />
    </div>
    <span class="hint" data-testid="power-guard-explain">
      Builds below <span class="num">{formatFlat(floor)}</span> are skipped, so a suggestion cannot drop you below a Crusade gate.
      {#if currentPower != null}This preset has <span class="num">{formatFlat(currentPower)}</span>.{/if}
    </span>
  {/if}
</div>

<style>
  .guard { display: grid; gap: var(--sp-2); }
  .fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--sp-2); }
  @media (max-width: 700px) { .fields { grid-template-columns: minmax(0, 1fr); } }
  .hint { color: var(--text-muted); font-size: var(--fs-12); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
</style>
