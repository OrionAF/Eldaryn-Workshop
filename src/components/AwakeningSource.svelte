<script>
  /**
   * AwakeningSource.svelte - path choice (Shadow / Radiant) + a single
   * point allocator (0-15, shared by both loadouts - not per-Set like
   * Talents). Radiant's per-point stats depend on the character's class,
   * resolved live via resolveAwakeningPerPoint.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { STAT_FIELDS } from '../lib/constants.js';
  import { AWAKENING_PATHS, AWAKENING_TOTAL_POINTS, resolveAwakeningPerPoint } from '../lib/awakeningData.js';

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

<div class="path-selector">
  {#each Object.entries(AWAKENING_PATHS) as [key, path] (key)}
    <button
      type="button"
      class="path-card"
      class:active={awakening.path === key}
      onclick={() => rosterStore.setAwakeningPath(key)}
    >
      {path.label}
    </button>
  {/each}
</div>

{#if !awakening.path}
  <p class="empty-hint">Choose a path above to begin allocating Awakening points.</p>
{:else}
  <div class="points-row">
    <span>{awakening.points} / {AWAKENING_TOTAL_POINTS} points</span>
    <div class="rank-controls">
      <button type="button" disabled={awakening.points <= 0} onclick={() => changePoints(-1)}>&minus;</button>
      <button type="button" disabled={awakening.points >= AWAKENING_TOTAL_POINTS} onclick={() => changePoints(1)}>
        +
      </button>
    </div>
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

  <button type="button" class="reset-button" onclick={() => rosterStore.resetAwakening()}>Reset Awakening</button>
{/if}

<style>
  .path-selector {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4, 1rem);
    margin-bottom: var(--space-3, 0.75rem);
  }
  .path-card {
    padding: var(--space-2, 0.5rem);
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius, 4px);
    font-weight: 600;
  }
  .path-card.active {
    border-color: var(--color-accent, #7aa2f7);
    color: var(--color-accent, #7aa2f7);
  }
  .empty-hint {
    color: var(--color-muted, #999);
  }
  .points-row {
    display: flex;
    align-items: center;
    gap: var(--space-3, 0.75rem);
    margin-bottom: var(--space-4, 1rem);
  }
  .rank-controls {
    display: flex;
    gap: var(--space-1, 0.25rem);
  }
  .rank-controls button {
    width: 1.75rem;
    padding: 0.1rem 0;
  }
  .bonus-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: var(--space-4, 1rem);
  }
  .bonus-row {
    display: flex;
    justify-content: space-between;
    padding: var(--space-2, 0.4rem);
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius, 4px);
  }
  .bonus-label {
    color: var(--color-muted, #999);
    font-size: 0.85rem;
  }
  .bonus-value {
    color: var(--color-accent, #7aa2f7);
  }
  .per-point {
    color: var(--color-muted, #999);
    font-size: 0.75rem;
  }
  .reset-button {
    display: block;
    margin: 0 auto;
  }
</style>
