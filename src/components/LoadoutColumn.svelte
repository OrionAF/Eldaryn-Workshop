<script>
  /**
   * LoadoutColumn.svelte - one flanking column in Drop Check: a loadout
   * panel (per-slot core-stat summary, click a row to pick that slot) and a
   * bonus-stats panel below it for whichever slot is selected.
   */
  import { SLOTS, fieldsForTab } from '../lib/constants.js';
  import { formatFlat, formatPct } from '../lib/format.js';

  let { loadout, loadoutIndex, character, selectedSlot, onSelectSlot } = $props();

  const CORE_KEYS = ['attack', 'attack_pct', 'health', 'health_pct'];

  const usedBy = $derived(character.presets.filter((p) => p.loadout === loadoutIndex).map((p) => p.name));

  function hasAnyStat(piece) {
    return Object.values(piece).some((v) => v !== 0);
  }

  /** "12.664 +6.2% ATK" (both), "12.664 ATK" (flat only), "+6.2% ATK" (pct only) - never a leading "0" when the flat part is unset. */
  function statBit(flat, pct, unit) {
    if (!flat && !pct) return null;
    const flatPart = flat ? formatFlat(flat) : '';
    const pctPart = pct ? `+${formatPct(pct)}%` : '';
    return `${[flatPart, pctPart].filter(Boolean).join(' ')} ${unit}`;
  }

  function coreSummary(piece) {
    const bits = [statBit(piece.attack, piece.attack_pct, 'ATK'), statBit(piece.health, piece.health_pct, 'HP')].filter(Boolean);
    if (bits.length) return bits.join(' · ');
    return hasAnyStat(piece) ? 'bonus only' : 'empty';
  }

  const bonusFields = $derived(fieldsForTab('gear', character.class).filter((f) => !CORE_KEYS.includes(f.key)));
  const bonusStats = $derived(bonusFields.filter((f) => (loadout.gear[selectedSlot]?.[f.key] || 0) !== 0));
</script>

<div class="loadout-panel">
  <h3 class:primary={loadoutIndex === 0}>{loadout.name}</h3>
  {#if usedBy.length}
    <p class="used-by">used by {usedBy.join(', ')}</p>
  {:else}
    <p class="used-by">No presets use this loadout yet.</p>
  {/if}
  <div class="section-label">CORE STATS PER SLOT</div>
  <ul class="slot-rows">
    {#each SLOTS as slot (slot)}
      <li>
        <button type="button" class="slot-row" class:selected={selectedSlot === slot} onclick={() => onSelectSlot(slot)}>
          <span class="slot-label">{slot}</span>
          <span class="slot-summary">{coreSummary(loadout.gear[slot])}</span>
        </button>
      </li>
    {/each}
  </ul>
</div>

<div class="bonus-panel">
  <div class="section-label">BONUS STATS — {selectedSlot}</div>
  {#if bonusStats.length}
    <ul class="bonus-list">
      {#each bonusStats as f (f.key)}
        <li>
          <span class="bonus-label">{f.label}</span>
          <span class="bonus-value">+{formatPct(loadout.gear[selectedSlot][f.key])}{f.kind === 'pct' ? '%' : ''}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty-note">No bonus stats on this piece.</p>
  {/if}
</div>

<style>
  .loadout-panel,
  .bonus-panel {
    background: var(--color-inset);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    padding: 12px 14px;
  }
  .loadout-panel h3 {
    margin: 0 0 2px;
    font-family: var(--font-heading);
    color: var(--color-muted);
  }
  .loadout-panel h3.primary {
    color: var(--nav-gear);
  }
  .used-by {
    font-size: 11px;
    color: var(--color-muted);
    margin: 0 0 var(--space-3);
  }
  .section-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--color-dim);
    margin-bottom: 6px;
  }
  .slot-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .slot-row {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    background: var(--color-field);
    border: 1px solid transparent;
    border-radius: var(--radius-field);
    padding: 6px 8px;
    text-align: left;
  }
  .slot-row.selected {
    border-color: var(--color-gold);
    background: var(--color-gold-tint);
  }
  .slot-label {
    font-size: 11px;
    font-weight: 600;
  }
  .slot-summary {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 10.5px;
    color: var(--color-muted);
  }
  .bonus-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bonus-list li {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
  .bonus-value {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--color-ink);
  }
  .empty-note {
    color: var(--color-muted);
    font-size: 11px;
    margin: 0;
  }
</style>
