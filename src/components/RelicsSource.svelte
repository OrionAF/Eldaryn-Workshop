<script>
  /**
   * RelicsSource.svelte - Relics (Dual Spec-style: Set A/B = Loadout 1/2,
   * fully independent per loadout - mirrors TalentsSource, not Awakening's
   * shared model). Every relic for the character's class is always listed
   * (tier-sectioned Bronze/Silver/Gold); level +/- and the Equip checkbox
   * write straight through rosterStore, no separate "add to collection"
   * step. Relic identity/stats/tiers are static code data (relicsData.js).
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { STAT_FIELDS } from '../lib/constants.js';
  import { RELICS_BY_CLASS, RELIC_TIERS, RELIC_TIER_LABELS, RELIC_EQUIP_CAP, relicLevelValue } from '../lib/relicsData.js';

  const SET_NAMES = ['Set A', 'Set B'];

  // "Set A (Loadout 1)" - reads the loadout's actual name rather than
  // hardcoding it, matching TalentsSource's convention.
  function setLabel(i, loadout) {
    return `${SET_NAMES[i]} (${loadout.name})`;
  }

  // View-only, not persisted - which Set's relics are shown/edited below.
  let selectedSet = $state(0);
  let equipError = $state('');

  const character = $derived(rosterStore.current);
  const relicDefs = $derived(RELICS_BY_CLASS[character.class] || []);
  const loadout = $derived(character.loadouts[selectedSet]);
  const entries = $derived(loadout.relics.entries);
  const equippedCount = $derived(entries.filter((e) => e.equipped).length);

  function entryFor(defId) {
    return entries.find((e) => e.defId === defId) || { defId, level: 1, equipped: false };
  }

  function statField(key) {
    return STAT_FIELDS.find((f) => f.key === key);
  }

  function changeLevel(def, delta) {
    const entry = entryFor(def.id);
    rosterStore.setRelicLevel(selectedSet, def.id, entry.level + delta);
  }

  function toggleEquip(def, checked) {
    equipError = '';
    const ok = rosterStore.setRelicEquipped(selectedSet, def.id, checked);
    if (!ok) {
      equipError = `Already have ${RELIC_EQUIP_CAP} relics equipped in ${setLabel(selectedSet, loadout)} - unequip one first.`;
    }
  }
</script>

{#if !character.class}
  <p class="empty-hint">
    Choose a class for this character (the ✎ edit icon next to the character selector) before
    managing relics.
  </p>
{:else}
  <div class="set-selector">
    {#each character.loadouts as l, i (l.name)}
      <button type="button" class="set-card" class:active={selectedSet === i} onclick={() => (selectedSet = i)}>
        {setLabel(i, l)}
      </button>
    {/each}
  </div>

  <div class="equip-readout">Equipped: {equippedCount} / {RELIC_EQUIP_CAP}</div>

  {#if equipError}
    <p class="equip-error" role="alert">{equipError}</p>
  {/if}

  {#each RELIC_TIERS as tier (tier)}
    <div class="tier-section">
      <h3>{RELIC_TIER_LABELS[tier]}</h3>
      {#each relicDefs.filter((d) => d.tier === tier) as def (def.id)}
        {@const entry = entryFor(def.id)}
        <div class="relic-row" class:equipped={entry.equipped}>
          <div class="relic-title">
            <span class="relic-name">{def.name}</span>
            <span class="relic-level-badge">LV {entry.level}/{def.maxLevel}</span>
          </div>
          <div class="rank-controls">
            <button type="button" disabled={entry.level <= 1} onclick={() => changeLevel(def, -1)}>&minus;</button>
            <button type="button" disabled={entry.level >= def.maxLevel} onclick={() => changeLevel(def, 1)}>
              +
            </button>
          </div>
          <span class="relic-stats">
            {#each def.stats as s (s.statKey)}
              {@const field = statField(s.statKey)}
              <span class="relic-stat">
                +{relicLevelValue(s.min, s.max, entry.level, def.maxLevel).toFixed(1)}{field?.kind === 'pct' ? '%' : ''}
                {field?.label ?? s.statKey}
              </span>
            {/each}
          </span>
          <label class="equip-checkbox">
            <input type="checkbox" checked={entry.equipped} onchange={(e) => toggleEquip(def, e.target.checked)} />
            Equipped
          </label>
        </div>
      {/each}
    </div>
  {/each}
{/if}

<style>
  .set-selector {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4, 1rem);
    margin-bottom: var(--space-3, 0.75rem);
  }
  @media (max-width: 640px) {
    .set-selector {
      grid-template-columns: 1fr;
    }
  }
  .set-card {
    padding: var(--space-2, 0.5rem);
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius, 4px);
    font-weight: 600;
  }
  .set-card.active {
    border-color: var(--color-accent, #7aa2f7);
    color: var(--color-accent, #7aa2f7);
  }
  .equip-readout {
    color: var(--color-muted, #999);
    margin-bottom: var(--space-3, 0.75rem);
  }
  .equip-error {
    color: var(--color-danger, #c1594f);
    margin-bottom: var(--space-3, 0.75rem);
  }
  .empty-hint {
    color: var(--color-muted, #999);
  }
  .tier-section {
    margin-bottom: var(--space-4, 1rem);
  }
  .relic-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-2, 0.4rem);
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius, 4px);
    margin-bottom: var(--space-1, 0.25rem);
  }
  .relic-row.equipped {
    border-color: var(--color-accent, #7aa2f7);
  }
  .relic-title {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    min-width: 8rem;
  }
  .relic-name {
    font-weight: 600;
  }
  .relic-level-badge {
    font-family: var(--font-data, monospace);
    color: var(--color-muted, #999);
    font-size: 0.8rem;
  }
  .rank-controls {
    display: flex;
    gap: var(--space-1, 0.25rem);
  }
  .rank-controls button {
    width: 1.75rem;
    padding: 0.1rem 0;
  }
  .relic-stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 10rem;
    text-align: right;
    color: var(--color-accent, #7aa2f7);
    font-size: 0.85rem;
  }
  .equip-checkbox {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    white-space: nowrap;
  }
</style>
