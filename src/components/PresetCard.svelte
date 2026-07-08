<script>
  import { resolveEffectiveTotals } from '../lib/totals.js';
  import { computeDps, computeHps } from '../lib/dps.js';
  import { formatFlat } from '../lib/format.js';
  import { talentSetLabel } from '../lib/model.js';

  let { preset, character, editing, onSelect } = $props();

  const totals = $derived(resolveEffectiveTotals(character, preset));
  const dps = $derived(computeDps(totals));
  const hps = $derived(computeHps(totals).total_hps);
  const loadout = $derived(character.loadouts[preset.loadout]);
  const pet = $derived(character.pets.find((p) => p.id === preset.petId));
</script>

<button type="button" class="preset-card" class:editing onclick={onSelect}>
  <div class="card-header">
    <span class="preset-name">{preset.name}</span>
    {#if editing}
      <span class="badge">EDITING</span>
    {:else}
      <span class="edit-pill">edit</span>
    {/if}
  </div>
  <div class="numbers">
    <span class="dps"><span class="value">{formatFlat(dps)}</span><span class="unit">DPS</span></span>
    <span class="hps"><span class="value">{formatFlat(hps)}</span><span class="unit">HPS</span></span>
  </div>
  <div class="chip-row">
    <span class="mini-chip">{loadout.name}</span>
    <span class="mini-chip">{talentSetLabel(preset.talentSet)}</span>
    <span class="mini-chip">{pet ? pet.name : 'No pet'}</span>
    <span class="mini-chip">{preset.relicIds.length} relic{preset.relicIds.length === 1 ? '' : 's'}</span>
    <span class="mini-chip">{preset.sigilIds.length} sigil{preset.sigilIds.length === 1 ? '' : 's'}</span>
    <span class="mini-chip mode" class:calculated={!preset.manualTotals}>{preset.manualTotals ? 'manual' : 'calculated'}</span>
  </div>
</button>

<style>
  .preset-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    text-align: left;
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    padding: 16px 18px;
  }
  .preset-card.editing {
    border-color: var(--color-gold);
    box-shadow: var(--color-gold-glow);
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .preset-name {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 13px;
    color: var(--color-muted);
  }
  .preset-card.editing .preset-name {
    color: var(--color-gold-light);
  }
  .badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: var(--color-gold);
    color: var(--color-bg);
    border-radius: var(--radius-pill);
    padding: 2px 8px;
  }
  .edit-pill {
    font-size: 10.5px;
    color: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    padding: 2px 8px;
  }
  .numbers {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
  }
  .dps,
  .hps {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
  }
  .dps .value {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 24px;
    font-weight: 600;
    color: var(--color-dps-dim);
  }
  .hps .value {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 17px;
    font-weight: 600;
    color: var(--color-hps-dim);
  }
  .dps .unit,
  .hps .unit {
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
  .preset-card.editing .dps .value {
    color: var(--color-dps);
  }
  .preset-card.editing .hps .value {
    color: var(--color-hps);
  }
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .mini-chip {
    font-size: 10.5px;
    color: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-mini-chip);
    padding: 2px 6px;
  }
  .preset-card.editing .mini-chip {
    background: var(--color-field);
    color: var(--color-soft);
  }
  .mini-chip.mode.calculated {
    border-color: rgba(84, 208, 255, 0.4);
    color: var(--color-dps);
  }
</style>
