<script>
  /**
   * TalentTierList.svelte - tiers + talent rows for one spec/loadout,
   * mirroring the screenshot's display logic (minus icons):
   *   rank 0        -> "NEXT: +Y%" only
   *   rank == max   -> "+X% CURRENT" only
   *   in between    -> both, current then next
   * A tier is unlocked when the cumulative points spent in ALL earlier
   * tiers (combined) meets its threshold - see rosterStore's
   * isTierUnlocked (same logic, kept in sync manually since one lives in
   * the store for mutation-time enforcement and this one drives display).
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { STAT_FIELDS } from '../lib/constants.js';

  let { specKey, loadoutIndex } = $props();

  const tree = $derived(rosterStore.roster.talentTrees[specKey]);
  const allocation = $derived(rosterStore.current.loadouts[loadoutIndex].talentAllocation);

  function pointsSpentInTier(tier) {
    return tier.talents.reduce((sum, t) => sum + (allocation[t.id] || 0), 0);
  }

  function isUnlocked(tierIndex) {
    if (tierIndex === 0) return true;
    let spent = 0;
    for (let i = 0; i < tierIndex; i++) spent += pointsSpentInTier(tree.tiers[i]);
    return spent >= tree.tiers[tierIndex].threshold;
  }

  function rankOf(talent) {
    return allocation[talent.id] || 0;
  }

  function statLabel(key) {
    return STAT_FIELDS.find((f) => f.key === key)?.label ?? key;
  }

  function changeRank(talent, delta) {
    rosterStore.setTalentRank(loadoutIndex, talent.id, rankOf(talent) + delta);
  }
</script>

{#each tree.tiers as tier, tierIndex (tier.id)}
  {@const unlocked = isUnlocked(tierIndex)}
  <div class="tier-section">
    <div class="tier-header">
      <span class="tier-title">Tier {tierIndex + 1}</span>
      {#if tierIndex > 0}
        <span class="tier-badge" class:unlocked>
          {unlocked ? 'Unlocked' : `Locked - needs ${tier.threshold} pts in earlier tiers`}
        </span>
      {/if}
    </div>

    {#if tier.talents.length === 0}
      <p class="empty-hint">No talents in this tier yet.</p>
    {/if}

    {#each tier.talents as talent (talent.id)}
      {@const rank = rankOf(talent)}
      {@const maxRank = talent.ranks.length}
      <div class="talent-row" class:locked={!unlocked}>
        <span class="talent-name">{talent.name}</span>
        <span class="talent-rank-badge">{rank}/{maxRank}</span>
        <div class="rank-controls">
          <button type="button" disabled={!unlocked || rank <= 0} onclick={() => changeRank(talent, -1)}>
            &minus;
          </button>
          <button type="button" disabled={!unlocked || rank >= maxRank} onclick={() => changeRank(talent, 1)}>
            +
          </button>
        </div>
        <span class="talent-value">
          {#if rank > 0}
            <strong>+{talent.ranks[rank - 1]}% CURRENT</strong>
            <span class="stat-name">({statLabel(talent.statKey)})</span>
          {/if}
          {#if rank < maxRank}
            {#if rank > 0}&middot;{/if}
            NEXT: +{talent.ranks[rank]}%
          {/if}
        </span>
      </div>
    {/each}
  </div>
{/each}

<style>
  .tier-section {
    margin-bottom: var(--space-4, 1rem);
  }
  .tier-header {
    display: flex;
    align-items: center;
    gap: var(--space-2, 0.5rem);
    margin-bottom: var(--space-2, 0.5rem);
  }
  .tier-title {
    font-weight: 600;
  }
  .tier-badge {
    font-size: 0.75rem;
    padding: 0.1rem 0.5rem;
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius, 4px);
    color: var(--color-muted, #999);
  }
  .tier-badge.unlocked {
    border-color: var(--color-accent, #7aa2f7);
    color: var(--color-accent, #7aa2f7);
  }
  .talent-row {
    display: flex;
    align-items: center;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-2, 0.4rem);
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius, 4px);
    margin-bottom: var(--space-1, 0.25rem);
  }
  .talent-row.locked {
    opacity: 0.5;
  }
  .talent-name {
    flex: 1;
    font-weight: 600;
  }
  .talent-rank-badge {
    font-family: var(--font-data, monospace);
    color: var(--color-muted, #999);
  }
  .rank-controls {
    display: flex;
    gap: 0.25rem;
  }
  .rank-controls button {
    width: 1.75rem;
    padding: 0.1rem 0;
  }
  .talent-value {
    min-width: 12rem;
    text-align: right;
    color: var(--color-muted, #999);
    font-size: 0.85rem;
  }
  .talent-value strong {
    color: var(--color-accent, #7aa2f7);
  }
  .stat-name {
    font-size: 0.75rem;
  }
  .empty-hint {
    color: var(--color-muted, #999);
    font-size: 0.85rem;
  }
</style>
