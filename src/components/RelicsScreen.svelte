<script>
  /**
   * RelicsScreen.svelte - every relic for the character's class, tier-
   * sectioned. Levels are character-wide (rosterStore.setRelicLevel); which
   * relics are equipped is decided per-preset in the Presets editor - there
   * is no equip control here anymore.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { STAT_FIELDS } from '../lib/constants.js';
  import { RELICS_BY_CLASS, RELIC_TIERS, RELIC_TIER_LABELS, relicLevelValue } from '../lib/relicsData.js';

  const character = $derived(rosterStore.current);
  const relicDefs = $derived(RELICS_BY_CLASS[character.class] || []);

  function levelOf(defId) {
    return character.relicLevels[defId] || 1;
  }

  function statField(key) {
    return STAT_FIELDS.find((f) => f.key === key);
  }

  function changeLevel(def, delta) {
    rosterStore.setRelicLevel(def.id, levelOf(def.id) + delta);
  }

  function usedBy(defId) {
    return character.presets.filter((p) => p.relicIds.includes(defId)).map((p) => p.name);
  }
</script>

{#if !character.class}
  <p class="empty-hint">Choose a class for this character before managing relics.</p>
{:else}
  <div class="header-row">
    <h2>Relics</h2>
    <p class="hint">levels are character-wide · each preset equips 4</p>
  </div>

  {#each RELIC_TIERS as tier (tier)}
    <div class="tier-section">
      <h3 class="subheading">{RELIC_TIER_LABELS[tier]}</h3>
      {#each relicDefs.filter((d) => d.tier === tier) as def (def.id)}
        {@const level = levelOf(def.id)}
        {@const used = usedBy(def.id)}
        <div class="relic-row">
          <div class="relic-title">
            <span class="relic-name">{def.name}</span>
            <span class="relic-level-badge">LV {level}/{def.maxLevel}</span>
          </div>
          <div class="rank-controls">
            <button type="button" disabled={level <= 1} onclick={() => changeLevel(def, -1)}>&minus;</button>
            <button type="button" disabled={level >= def.maxLevel} onclick={() => changeLevel(def, 1)}>+</button>
          </div>
          <span class="relic-stats">
            {#each def.stats as s (s.statKey)}
              {@const field = statField(s.statKey)}
              <span class="relic-stat">
                +{relicLevelValue(s.min, s.max, level, def.maxLevel).toFixed(1)}{field?.kind === 'pct' ? '%' : ''}
                {field?.label ?? s.statKey}
              </span>
            {/each}
          </span>
          <span class="used-by">{used.length ? `equipped in ${used.join(', ')}` : '—'}</span>
        </div>
      {/each}
    </div>
  {/each}
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
  .empty-hint {
    color: var(--color-muted);
  }
  .tier-section {
    margin-bottom: var(--space-4);
  }
  .relic-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding: 8px 10px;
    background: var(--color-inset);
    border: 1px solid var(--color-border);
    border-radius: 7px;
    margin-bottom: var(--space-1);
  }
  .relic-title {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    min-width: 8rem;
  }
  .relic-name {
    font-size: 13px;
    font-weight: 600;
  }
  .relic-level-badge {
    font-family: var(--font-data);
    color: var(--color-muted);
    font-size: 11px;
  }
  .rank-controls {
    display: flex;
    gap: var(--space-1);
  }
  .relic-stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 180px;
    text-align: right;
    color: var(--tier-gold);
    font-size: 11.5px;
  }
  .used-by {
    font-size: 10.5px;
    color: var(--color-muted);
    min-width: 130px;
    text-align: right;
  }
</style>
