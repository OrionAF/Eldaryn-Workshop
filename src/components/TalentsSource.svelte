<script>
  /**
   * TalentsSource.svelte - Talents (Dual Spec = Set A/B = Loadout 1/Loadout 2).
   * Set A/Set B cards assign a spec (scoped to the character's class) to
   * each loadout independently - "either one of each, or two of one".
   * Tier/talent display + rank allocation (build step 21) and tree-authoring
   * (build step 22) render below the selected Set, once a spec is assigned.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { SPECS_BY_CLASS, TALENT_TOTAL_POINTS } from '../lib/constants.js';

  const SET_LABELS = ['Set A', 'Set B'];

  // View-only, not persisted - which Set's tree is shown below.
  let selectedSet = $state(0);

  const character = $derived(rosterStore.current);
  const specs = $derived(SPECS_BY_CLASS[character.class] || []);

  function pointsSpent(loadoutIndex) {
    return Object.values(character.loadouts[loadoutIndex].talentAllocation || {}).reduce((sum, r) => sum + r, 0);
  }
</script>

{#if !character.class}
  <p class="empty-hint">
    Choose a class for this character (the ✎ edit icon next to the character selector) before
    assigning talent specializations.
  </p>
{:else}
  <div class="set-selector">
    {#each character.loadouts as loadout, i (loadout.name)}
      <div class="set-card" class:active={selectedSet === i}>
        <button type="button" class="set-label" onclick={() => (selectedSet = i)}>
          {SET_LABELS[i]}
        </button>
        <select
          value={loadout.spec ?? ''}
          onchange={(e) => rosterStore.setLoadoutSpec(i, e.target.value || null)}
        >
          <option value="">Choose a spec...</option>
          {#each specs as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
        </select>
      </div>
    {/each}
  </div>

  <div class="points-readout">
    {pointsSpent(selectedSet)} / {TALENT_TOTAL_POINTS} points spent
  </div>

  {#if !character.loadouts[selectedSet].spec}
    <p class="empty-hint">Choose a specialization above for {SET_LABELS[selectedSet]} to see its talent tree.</p>
  {/if}
{/if}

<style>
  .set-selector {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4, 1rem);
    margin-bottom: var(--space-3, 0.75rem);
  }
  .set-card {
    display: flex;
    align-items: center;
    gap: var(--space-2, 0.5rem);
    padding: var(--space-2, 0.5rem);
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius, 4px);
  }
  .set-card.active {
    border-color: var(--color-accent, #7aa2f7);
  }
  .set-label {
    font-weight: 600;
  }
  .set-card select {
    flex: 1;
  }
  .points-readout {
    color: var(--color-muted, #999);
    margin-bottom: var(--space-4, 1rem);
  }
  .empty-hint {
    color: var(--color-muted, #999);
  }
</style>
