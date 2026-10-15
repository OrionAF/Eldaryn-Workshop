<script>
  /**
   * TalentTierList.svelte - tiers + talent tiles for one set's spec. Unlock rule (talents.md §4): a
   * tier opens once the points spent in all earlier tiers meet its threshold. Values: total at rank r =
   * valuePerRank * r (talents.json valueUnits). Each tile carries the talent's art (assets/talents.js),
   * a placeholder tile when the tree has none, rank pips and the -/+ buttons; the set's totals are in
   * the inspector, not here.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { talentTiers, tierPointsRequired } from '../../lib/game/talents.js';
  import { tierPointsSpent } from '../../lib/model/talents.js';
  import { talentImage } from '../../lib/assets/talents.js';
  import Button from '../ui/Button.svelte';

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
      <h3 class="tier-title">Tier {tier.tier}</h3>
      {#if i > 0}
        <span class="tier-badge" class:unlocked>
          {unlocked ? 'Unlocked' : `Locked - needs ${remaining(i)} more pts in earlier tiers`}
        </span>
      {/if}
    </div>

    <div class="tiles">
      {#each tier.talents as talent (talent.id)}
        {@const rank = rankOf(talent)}
        {@const art = talentImage(specKey, talent.name)}
        {@const noPoints = unlocked && rank < talent.maxRank && pointsLeft <= 0}
        <div class="talent-tile" class:locked={!unlocked} class:maxed={rank >= talent.maxRank} data-talent={talent.id}>
          {#if art}
            <img class="talent-art" src={art} alt="" loading="lazy" />
          {:else}
            <span class="talent-art placeholder" aria-hidden="true">{talent.name.charAt(0)}</span>
          {/if}
          <div class="talent-main">
            <span class="talent-name">{talent.name}</span>
            <span class="pips" aria-hidden="true">
              {#each Array.from({ length: talent.maxRank }, (_, n) => n) as n (n)}<span class="pip" class:on={n < rank}></span>{/each}
            </span>
          </div>
          <span class="talent-rank-badge num">{rank}/{talent.maxRank}</span>
          <div class="talent-controls">
            <Button
              variant="ghost"
              size="small"
              aria-label={`Lower ${talent.name}`}
              disabled={!unlocked || rank <= 0}
              onclick={() => rosterStore.setTalentSetRank(talentSetIndex, talent.id, rank - 1)}>&minus;</Button
            >
            <Button
              variant="ghost"
              size="small"
              aria-label={`Raise ${talent.name}`}
              disabled={!unlocked || rank >= talent.maxRank || pointsLeft <= 0}
              reason={noPoints ? 'No talent points left at this level' : ''}
              onclick={() => rosterStore.setTalentSetRank(talentSetIndex, talent.id, rank + 1)}>+</Button
            >
          </div>
          <p class="talent-value">
            {#if rank > 0}<strong>{describe(talent, rank)}</strong>{/if}
            {#if rank > 0 && rank < talent.maxRank}&middot;{/if}
            {#if rank < talent.maxRank}<span class="next">NEXT: {describe(talent, rank + 1)}</span>{/if}
          </p>
        </div>
      {/each}
    </div>
  </div>
{/each}

<style>
  .tier-section { margin-bottom: var(--sp-4); min-width: 0; }
  .tier-header { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-2); }
  .tier-title {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .tier-badge {
    font-size: var(--fs-11);
    padding: 1px var(--sp-2);
    border: 1px dotted var(--line-control);
    border-radius: var(--r-pill);
    color: var(--text-muted);
  }
  .tier-badge.unlocked { border-style: solid; border-color: var(--brass-400); color: var(--brass-200); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(22rem, 100%), 1fr)); gap: var(--sp-2); }
  .talent-tile {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto auto;
    grid-template-areas: 'art main rank controls' 'art value value value';
    align-items: center;
    gap: var(--sp-1) var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    min-width: 0;
    background: var(--surface-3);
    border: 1px solid var(--line-control);
    border-radius: var(--r-2);
  }
  .talent-tile.maxed { border-color: var(--brass-500); }
  .talent-tile.locked { opacity: 0.5; }
  .talent-art { grid-area: art; width: 40px; height: 40px; object-fit: contain; border-radius: var(--r-2); background: var(--surface-1); }
  .talent-art.placeholder {
    display: grid;
    place-items: center;
    border: 1px dashed var(--line-control);
    color: var(--text-muted);
    font-size: var(--fs-14);
  }
  .talent-main { grid-area: main; display: grid; gap: 2px; min-width: 0; }
  .talent-name { font-size: var(--fs-13); font-weight: var(--fw-bold); color: var(--text-ink); }
  .pips { display: flex; gap: 3px; }
  .pip { width: 8px; height: 8px; border: 1px solid var(--line-control); border-radius: var(--r-1); }
  .pip.on { background: var(--brass-400); border-color: var(--brass-400); }
  .talent-rank-badge { grid-area: rank; font-size: var(--fs-12); color: var(--text-muted); white-space: nowrap; }
  .talent-controls { grid-area: controls; display: flex; gap: var(--sp-1); }
  /* Prose in the UI face; only the figures elsewhere are mono. */
  .talent-value { grid-area: value; margin: 0; font-family: var(--font-ui); font-variant-numeric: tabular-nums; font-size: var(--fs-12); color: var(--text-muted); }
  .talent-value strong { color: var(--brass-200); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
</style>
