<script>
  /**
   * TalentTierList.svelte - tiers + talent rows for one set's spec (from the v1 list). Unlock rule
   * (talents.md §4): a tier opens once the points spent in all earlier tiers meet its threshold.
   * Values: total at rank r = valuePerRank * r (talents.json valueUnits).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { talentTiers, tierPointsRequired } from '../../lib/game/talents.js';
  import { tierPointsSpent } from '../../lib/model/talents.js';

  let { specKey, talentSetIndex, pointsLeft = Infinity } = $props();

  const tiers = $derived(talentTiers(specKey));
  const allocation = $derived(rosterStore.current.talentSets[talentSetIndex].allocation);

  function spentBefore(tierIndex) {
    let spent = 0;
    for (let i = 0; i < tierIndex; i++) spent += tierPointsSpent(tiers[i], allocation);
    return spent;
  }
  const remaining = (i) => Math.max(0, tierPointsRequired(tiers[i].tier) - spentBefore(i));
  const rankOf = (t) => allocation[t.id] || 0;

  const PERCENT_FRACTION = new Set(['attackSpeedFlat', 'minionAttackSpeedFlat']);
  function valueAt(t, rank) {
    const v = t.bonusPerRank.valuePerRank * rank * (PERCENT_FRACTION.has(t.bonusPerRank.stat) ? 100 : 1);
    return Math.round(v * 1000) / 1000;
  }
  function describe(t, rank) {
    return t.description.replace('{value}', valueAt(t, rank));
  }
</script>

{#each tiers as tier, i (tier.tier)}
  {@const unlocked = remaining(i) === 0}
  <div class="tier-section">
    <div class="tier-header">
      <span class="tier-title subheading">Tier {tier.tier}</span>
      {#if i > 0}
        <span class="tier-badge" class:unlocked>
          {unlocked ? 'Unlocked' : `Locked - needs ${remaining(i)} more pts in earlier tiers`}
        </span>
      {/if}
    </div>

    {#each tier.talents as talent (talent.id)}
      {@const rank = rankOf(talent)}
      <div class="talent-row" class:locked={!unlocked}>
        <div class="talent-title">
          <span class="talent-name">{talent.name}</span>
        </div>
        <span class="talent-rank-badge">{rank}/{talent.maxRank}</span>
        <div class="rank-controls">
          <button
            type="button"
            aria-label={`Lower ${talent.name}`}
            disabled={!unlocked || rank <= 0}
            onclick={() => rosterStore.setTalentSetRank(talentSetIndex, talent.id, rank - 1)}>&minus;</button
          >
          <button
            type="button"
            aria-label={`Raise ${talent.name}`}
            disabled={!unlocked || rank >= talent.maxRank || pointsLeft <= 0}
            title={unlocked && rank < talent.maxRank && pointsLeft <= 0 ? 'No talent points left at this level' : undefined}
            onclick={() => rosterStore.setTalentSetRank(talentSetIndex, talent.id, rank + 1)}>+</button
          >
        </div>
        <span class="talent-value">
          {#if rank > 0}<strong>{describe(talent, rank)}</strong>{/if}
          {#if rank > 0 && rank < talent.maxRank}&middot;{/if}
          {#if rank < talent.maxRank}NEXT: {describe(talent, rank + 1)}{/if}
        </span>
      </div>
    {/each}
  </div>
{/each}

<style>
  .tier-section {
    margin-bottom: var(--space-4);
  }
  .tier-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .tier-badge {
    font-size: 10px;
    padding: 1px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-dim);
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
    min-width: 120px;
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
    font-size: 11.5px;
    min-width: 200px;
    text-align: right;
    color: var(--color-muted);
  }
  .talent-value strong {
    color: var(--color-gold-light);
  }
</style>
