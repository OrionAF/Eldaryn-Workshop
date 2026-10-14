<script>
  /**
   * RelicsScreen.svelte - the character class's relics, tier-sectioned. Levels are character-wide
   * (stepper); equip is per preset, 4 slots (2 base + 2 extra, relics.md §4), toggled for the active preset.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { relicsForClass, RELIC_BASE_SLOTS, RELIC_MAX_EXTRA_SLOTS } from '../../lib/game/relics.js';
  import { relicStatAt, relicStatLabel, formatRelicStat } from '../../lib/model/relics.js';
  import { classLabel } from '../../lib/game/classes.js';

  const TIERS = [
    ['bronze', 'Bronze'],
    ['silver', 'Silver'],
    ['gold', 'Gold'],
  ];
  const SLOTS = RELIC_BASE_SLOTS + RELIC_MAX_EXTRA_SLOTS;

  const character = $derived(rosterStore.current);
  const defs = $derived(character?.class ? relicsForClass(character.class) : []);
  const preset = $derived(character?.presets.find((p) => p.id === character.activePresetId) ?? character?.presets[0]);

  const levelOf = (id) => character.relics[id] ?? 0;
  const usedBy = (id) => character.presets.filter((p) => p.relicIds.includes(id)).map((p) => p.name);
</script>

{#if !character?.class}
  <p class="empty-hint">Choose a class for this character before managing relics.</p>
{:else}
  <div class="header-row">
    <h2>Relics</h2>
    <p class="hint">{classLabel(character.class)} · levels are character-wide · {preset.name} equips {preset.relicIds.length}/{SLOTS}</p>
  </div>

  {#each TIERS as [tier, label] (tier)}
    <div class="tier-section">
      <h3 class="subheading">{label}</h3>
      {#each defs.filter((d) => d.tier === tier) as def (def.id)}
        {@const level = levelOf(def.id)}
        {@const used = usedBy(def.id)}
        {@const equipped = preset.relicIds.includes(def.id)}
        <div class="relic-row" data-relic={def.id}>
          <div class="relic-title">
            <span class="relic-name">{def.name}</span>
            <span class="relic-level-badge">LV {level}/{def.maxLevel}</span>
          </div>
          <div class="rank-controls">
            <button type="button" aria-label="Lower {def.name}" disabled={level <= 0} onclick={() => rosterStore.setRelicLevel(def.id, level - 1)}>&minus;</button>
            <button type="button" aria-label="Raise {def.name}" disabled={level >= def.maxLevel} onclick={() => rosterStore.setRelicLevel(def.id, level + 1)}>+</button>
          </div>
          <span class="relic-stats">
            {#each def.bonuses as b (b.stat)}
              <span class="relic-stat">{formatRelicStat(b.stat, relicStatAt(b, Math.max(level, 1), def.maxLevel))} {relicStatLabel(b.stat)}</span>
            {/each}
          </span>
          <button
            type="button"
            class="btn-ghost equip-btn"
            class:is-on={equipped}
            aria-pressed={equipped}
            disabled={!equipped && preset.relicIds.length >= SLOTS}
            onclick={() => rosterStore.togglePresetRelic(preset.id, def.id)}>{equipped ? 'Equipped' : 'Equip'}</button>
          <span class="used-by">{used.length ? `in ${used.join(', ')}` : '—'}</span>
        </div>
      {/each}
    </div>
  {/each}
{/if}

<style>
  .header-row { margin-bottom: var(--space-4); }
  .header-row h2 { margin: 0; }
  .hint { font-size: 11px; color: var(--color-muted); margin: 2px 0 0; }
  .empty-hint { color: var(--color-muted); }
  .tier-section { margin-bottom: var(--space-4); }
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
  .relic-title { flex: 1; display: flex; align-items: baseline; gap: 0.35rem; min-width: 8rem; }
  .relic-name { font-size: 13px; font-weight: 600; }
  .relic-level-badge { font-family: var(--font-data); color: var(--color-muted); font-size: 11px; }
  .rank-controls { display: flex; gap: var(--space-1); }
  .relic-stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 180px;
    text-align: right;
    color: var(--tier-gold);
    font-size: 11.5px;
    font-family: var(--font-data);
  }
  .equip-btn.is-on { color: var(--color-gold-light); border-color: var(--color-gold); }
  .used-by { font-size: 10.5px; color: var(--color-muted); min-width: 110px; text-align: right; }
</style>
