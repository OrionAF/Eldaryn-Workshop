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
   * Also the tree-authoring surface: "+ Add Talent" per tier and "+ Add
   * Tier" at the end create scaffold content directly in roster.talentTrees
   * (shared across every character/loadout using this spec); each talent's
   * "Edit" toggle opens name/stat/per-rank-value fields inline.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { STAT_FIELDS } from '../lib/constants.js';

  let { specKey, loadoutIndex } = $props();

  const PCT_FIELDS = STAT_FIELDS.filter((f) => f.kind === 'pct');

  let editingTalentId = $state(null);
  let newTierThreshold = $state(0);

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

  function addTalent(tierId) {
    const id = rosterStore.addTalent(specKey, tierId, 'New Talent', PCT_FIELDS[0].key);
    editingTalentId = id;
  }

  function addTier() {
    rosterStore.addTalentTier(specKey, Number(newTierThreshold) || 0);
    newTierThreshold = 0;
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
        <label class="threshold-edit">
          Threshold
          <input
            type="number"
            min="0"
            value={tier.threshold}
            onblur={(e) => rosterStore.updateTalentTier(specKey, tier.id, 'threshold', Number(e.target.value) || 0)}
          />
        </label>
      {/if}
      <button type="button" class="remove-tier" onclick={() => rosterStore.removeTalentTier(specKey, tier.id)}>
        Remove Tier
      </button>
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
        <button
          type="button"
          class="edit-toggle"
          onclick={() => (editingTalentId = editingTalentId === talent.id ? null : talent.id)}
        >
          {editingTalentId === talent.id ? 'Done' : 'Edit'}
        </button>
        <button type="button" onclick={() => rosterStore.removeTalent(specKey, talent.id)}>Remove</button>
      </div>

      {#if editingTalentId === talent.id}
        <div class="talent-editor">
          <label>
            Name
            <input
              type="text"
              value={talent.name}
              onblur={(e) => rosterStore.updateTalent(specKey, talent.id, 'name', e.target.value)}
            />
          </label>
          <label>
            Stat
            <select value={talent.statKey} onchange={(e) => rosterStore.updateTalent(specKey, talent.id, 'statKey', e.target.value)}>
              {#each PCT_FIELDS as f (f.key)}<option value={f.key}>{f.label}</option>{/each}
            </select>
          </label>
          <div class="rank-values">
            {#each talent.ranks as rankValue, i (i)}
              <label class="rank-value">
                Rank {i + 1}
                <input
                  type="number"
                  step="any"
                  value={rankValue}
                  onblur={(e) => rosterStore.setTalentRankValue(specKey, talent.id, i, Number(e.target.value) || 0)}
                />
              </label>
            {/each}
            <button type="button" onclick={() => rosterStore.addTalentRank(specKey, talent.id)}>+ Add Rank</button>
            <button
              type="button"
              disabled={talent.ranks.length <= 1}
              onclick={() => rosterStore.removeTalentRank(specKey, talent.id)}
            >
              Remove Last Rank
            </button>
          </div>
        </div>
      {/if}
    {/each}

    <button type="button" class="add-talent" onclick={() => addTalent(tier.id)}>+ Add Talent</button>
  </div>
{/each}

<div class="add-tier-form">
  <label>
    New tier threshold (points needed in earlier tiers)
    <input type="number" min="0" bind:value={newTierThreshold} />
  </label>
  <button type="button" onclick={addTier}>+ Add Tier</button>
</div>

<style>
  .tier-section {
    margin-bottom: var(--space-4, 1rem);
  }
  .tier-header {
    display: flex;
    align-items: center;
    gap: var(--space-2, 0.5rem);
    margin-bottom: var(--space-2, 0.5rem);
    flex-wrap: wrap;
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
  .threshold-edit,
  .rank-value {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--color-muted, #999);
  }
  .threshold-edit input,
  .rank-value input {
    width: 4rem;
  }
  .remove-tier {
    margin-left: auto;
    font-size: 0.75rem;
  }
  .talent-row {
    display: flex;
    align-items: center;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-2, 0.4rem);
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius, 4px);
    margin-bottom: var(--space-1, 0.25rem);
    flex-wrap: wrap;
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
  .edit-toggle,
  .talent-row > button:last-child {
    font-size: 0.75rem;
  }
  .empty-hint {
    color: var(--color-muted, #999);
    font-size: 0.85rem;
  }
  .talent-editor {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-2, 0.5rem);
    margin: 0 0 var(--space-2, 0.5rem);
    border: 1px dashed var(--color-border, #444);
    border-radius: var(--radius, 4px);
    font-size: 0.85rem;
  }
  .talent-editor label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .rank-values {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem;
  }
  .add-talent {
    font-size: 0.85rem;
  }
  .add-tier-form {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2, 0.5rem);
    margin-top: var(--space-4, 1rem);
  }
  .add-tier-form label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.8rem;
    color: var(--color-muted, #999);
  }
</style>
