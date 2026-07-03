<script>
  /**
   * AwakeningScreen.svelte - path choice (Shadow / Radiant) + a single point
   * allocator (0-15), character-wide - shared by every preset, not per
   * talent set. Radiant's per-point stats depend on the character's class.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { STAT_FIELDS } from '../lib/constants.js';
  import { AWAKENING_PATHS, AWAKENING_TOTAL_POINTS, resolveAwakeningPerPoint } from '../lib/awakeningData.js';
  import ConfirmButton from './ConfirmButton.svelte';

  const character = $derived(rosterStore.current);
  const awakening = $derived(character.awakening);
  const perPoint = $derived(awakening.path ? resolveAwakeningPerPoint(awakening.path, character.class) : null);

  function statLabel(key) {
    return STAT_FIELDS.find((f) => f.key === key)?.label ?? key;
  }

  function changePoints(delta) {
    rosterStore.setAwakeningPoints(awakening.points + delta);
  }
</script>

<div class="header-row">
  <h2>Awakening</h2>
  <p class="hint">character-wide — one path, shared by all presets</p>
</div>

<div class="path-selector">
  {#each Object.entries(AWAKENING_PATHS) as [key, path] (key)}
    <button type="button" class="path-card" class:active={awakening.path === key} onclick={() => rosterStore.setAwakeningPath(key)}>
      {path.label}
    </button>
  {/each}
</div>

{#if !awakening.path}
  <p class="empty-hint">Choose a path above to begin allocating Awakening points.</p>
{:else}
  <div class="points-row">
    <span class="points-readout">{awakening.points} / {AWAKENING_TOTAL_POINTS} points</span>
    <div class="rank-controls">
      <button type="button" disabled={awakening.points <= 0} onclick={() => changePoints(-1)}>&minus;</button>
      <button type="button" disabled={awakening.points >= AWAKENING_TOTAL_POINTS} onclick={() => changePoints(1)}>+</button>
    </div>
    <ConfirmButton
      class="reset-btn btn-danger"
      label="Reset Awakening"
      confirmLabel="Confirm reset"
      prompt="Reset your path choice and all invested points?"
      onConfirm={() => rosterStore.resetAwakening()}
    />
  </div>

  {#if perPoint}
    <div class="bonus-list">
      {#each Object.entries(perPoint) as [statKey, value] (statKey)}
        <div class="bonus-row">
          <span class="bonus-label">{statLabel(statKey)}</span>
          <span class="bonus-value">
            +{(value * awakening.points).toFixed(1)}%
            <span class="per-point">({value >= 0 ? '+' : ''}{value}%/point)</span>
          </span>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .header-row {
    margin-bottom: var(--space-4);
  }
  .header-row h2 {
    margin: 0;
  }
  .hint {
    font-size: 11px;
    color: var(--color-muted);
    margin: 2px 0 0;
  }
  .path-selector {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
    margin-bottom: var(--space-3);
    max-width: 560px;
  }
  @media (max-width: 640px) {
    .path-selector {
      grid-template-columns: 1fr;
    }
  }
  .path-card {
    padding: 10px;
    border: 1px solid var(--color-border-strong);
    border-radius: 7px;
    font-family: var(--font-heading);
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    background: none;
    color: var(--color-muted);
  }
  .path-card.active {
    background: var(--color-gold-tint);
    border-color: var(--color-gold);
    color: var(--color-gold-light);
  }
  .empty-hint {
    color: var(--color-muted);
  }
  .points-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    max-width: 560px;
  }
  .points-readout {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 13px;
    color: var(--color-soft);
  }
  .rank-controls {
    display: flex;
    gap: var(--space-1);
  }
  :global(.reset-btn) {
    margin-left: auto;
  }
  .bonus-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: var(--space-4);
    max-width: 560px;
  }
  .bonus-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 10px;
    background: var(--color-inset);
    border: 1px solid var(--color-border);
    border-radius: 7px;
  }
  .bonus-label {
    color: var(--color-muted);
    font-size: 12px;
  }
  .bonus-value {
    font-family: var(--font-data);
    font-size: 12.5px;
    color: var(--color-gold-light);
  }
  .per-point {
    color: var(--color-dim);
    font-size: 10.5px;
  }
</style>
