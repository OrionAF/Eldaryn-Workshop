<script>
  /**
   * PresetCard.svelte - one preset in the Presets grid: its effective headline stats (the entered sheet
   * when there is one, else the computed totals) and chips naming what it references.
   */
  import { computePresetStats } from '../../lib/build/stats.js';
  import { toDisplay } from '../../lib/engine/pipeline/sheet.js';
  import { formatFlat, formatPct } from '../../lib/format.js';
  import { SET_LABELS, petLabel, mountLabel, talentSetLabel } from './presetLabels.js';

  let { preset, character, editing = false, onSelect } = $props();

  const stats = $derived(computePresetStats(character, preset.id));
  const eff = $derived(stats.effective);
  const pet = $derived(petLabel(character, preset.petId));
  const mount = $derived(mountLabel(character, preset.mountId));
  const sigilCount = $derived(
    preset.sigilSpecies.length + (preset.utilitySigilSpecies ? 1 : 0) + (preset.ancientSigilSpecies ? 1 : 0),
  );
</script>

<button type="button" class="preset-card" class:editing onclick={onSelect} data-preset-id={preset.id}>
  <div class="card-header">
    <span class="preset-name">{preset.name}</span>
    {#if editing}
      <span class="badge">EDITING</span>
    {:else}
      <span class="edit-pill">edit</span>
    {/if}
  </div>
  <div class="numbers">
    <span class="stat"><span class="value mono">{formatFlat(eff.totalAttack)}</span><span class="unit">ATK</span></span>
    <span class="stat"><span class="value mono">{formatFlat(eff.totalHp)}</span><span class="unit">HP</span></span>
  </div>
  <div class="subnumbers mono">
    <span>{formatPct(toDisplay('totalAttackSpeed', eff.totalAttackSpeed))}% spd</span>
    <span>{formatPct(eff.totalCritChance)}% crit</span>
  </div>
  <div class="chip-row">
    <span class="mini-chip source" class:sheet={stats.source === 'sheet'} data-testid="source-chip">
      {stats.source === 'sheet' ? 'sheet' : 'computed'}
    </span>
    <span class="mini-chip">{SET_LABELS[preset.equipmentSet]}</span>
    <span class="mini-chip">{talentSetLabel(character, preset.talentSet)}</span>
    <span class="mini-chip">{pet ?? 'No pet'}</span>
    <span class="mini-chip">{mount ?? 'No mount'}</span>
    <span class="mini-chip">{preset.relicIds.length} relic{preset.relicIds.length === 1 ? '' : 's'}</span>
    <span class="mini-chip">{sigilCount} sigil{sigilCount === 1 ? '' : 's'}</span>
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
  .preset-card.editing { border-color: var(--color-gold); box-shadow: var(--color-gold-glow); }
  .card-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
  .preset-name { font-family: var(--font-heading); font-weight: 700; font-size: 13px; color: var(--color-muted); }
  .preset-card.editing .preset-name { color: var(--color-gold-light); }
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
  .numbers { display: flex; align-items: baseline; gap: var(--space-4); flex-wrap: wrap; }
  .stat { display: inline-flex; align-items: baseline; gap: 5px; }
  .stat .value { font-size: 20px; font-weight: 600; color: var(--color-dps-dim); }
  .preset-card.editing .stat .value { color: var(--color-dps); }
  .stat .unit { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-muted); }
  .subnumbers { display: flex; gap: var(--space-4); font-size: 11.5px; color: var(--color-muted); }
  .chip-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .mini-chip {
    font-size: 10.5px;
    color: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-mini-chip);
    padding: 2px 6px;
  }
  .preset-card.editing .mini-chip { background: var(--color-field); color: var(--color-soft); }
  .mini-chip.source.sheet { color: var(--color-upgrade); border-color: var(--color-upgrade-border); }
</style>
