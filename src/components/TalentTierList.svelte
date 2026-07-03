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
   *
   * Tree content (tiers/talents/values) is static code data
   * (talentTreeData.js) - the same tree for every player, so there's no
   * authoring UI here, only rank allocation (+/- buttons).
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { STAT_FIELDS } from '../lib/constants.js';
  import { TALENT_TREES } from '../lib/talentTreeData.js';

  let { specKey, talentSetIndex } = $props();

  const tree = $derived(TALENT_TREES[specKey]);
  const allocation = $derived(rosterStore.current.talentSets[talentSetIndex].allocation);

  function pointsSpentInTier(tier) {
    return tier.talents.reduce((sum, t) => sum + (allocation[t.id] || 0), 0);
  }

  /** Total points spent across every tier before tierIndex (combined, per the unlock rule). */
  function pointsSpentBeforeTier(tierIndex) {
    let spent = 0;
    for (let i = 0; i < tierIndex; i++) spent += pointsSpentInTier(tree.tiers[i]);
    return spent;
  }

  function isUnlocked(tierIndex) {
    if (tierIndex === 0) return true;
    return pointsSpentBeforeTier(tierIndex) >= tree.tiers[tierIndex].threshold;
  }

  /** How many more points (in earlier tiers) are needed to unlock this tier. */
  function pointsRemainingToUnlock(tierIndex) {
    return Math.max(0, tree.tiers[tierIndex].threshold - pointsSpentBeforeTier(tierIndex));
  }

  function rankOf(talent) {
    return allocation[talent.id] || 0;
  }

  function statLabel(key) {
    return STAT_FIELDS.find((f) => f.key === key)?.label ?? key;
  }

  function changeRank(talent, delta) {
    rosterStore.setTalentSetRank(talentSetIndex, talent.id, rankOf(talent) + delta);
  }
</script>

{#each tree.tiers as tier, tierIndex (tier.id)}
  {@const unlocked = isUnlocked(tierIndex)}
  <div class="tier-section">
    <div class="tier-header">
      <span class="tier-title subheading">Tier {tierIndex + 1}</span>
      {#if tierIndex > 0}
        <span class="tier-badge" class:unlocked>
          {unlocked ? 'Unlocked' : `Locked - needs ${pointsRemainingToUnlock(tierIndex)} more pts in earlier tiers`}
        </span>
      {/if}
    </div>

    {#each tier.talents as talent (talent.id)}
      {@const rank = rankOf(talent)}
      {@const maxRank = talent.ranks.length}
      <div class="talent-row" class:locked={!unlocked}>
        <div class="talent-title">
          <span class="talent-name">{talent.name}</span>
          <span class="stat-name-label">({statLabel(talent.statKey)})</span>
        </div>
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
            <strong>+{talent.ranks[rank - 1]}% NOW</strong>
          {/if}
          {#if rank < maxRank}
            {#if rank > 0}&middot;{/if}
            NEXT +{talent.ranks[rank]}%
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
  .tier-badge {
    font-size: 10px;
    padding: 1px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-dim, var(--color-muted));
  }
  .tier-badge.unlocked {
    border-color: var(--color-gold);
    color: var(--color-gold-light);
  }
  .talent-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 7px 10px;
    background: var(--color-inset);
    border: 1px solid var(--color-border);
    border-radius: 7px;
    margin-bottom: var(--space-1);
    flex-wrap: wrap;
  }
  .talent-row.locked {
    opacity: 0.5;
  }
  .talent-title {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }
  .talent-name {
    font-size: 13px;
    font-weight: 600;
  }
  .talent-rank-badge {
    font-family: var(--font-data);
    font-size: 12px;
    color: var(--color-muted);
  }
  .rank-controls {
    display: flex;
    gap: var(--space-1);
  }
  .talent-value {
    font-family: var(--font-data);
    font-size: 11.5px;
    min-width: 180px;
    text-align: right;
    color: var(--color-muted);
  }
  .talent-value strong {
    color: var(--color-gold-light);
  }
  .stat-name-label {
    font-size: 11px;
    font-weight: normal;
    color: var(--color-dim);
  }
</style>
