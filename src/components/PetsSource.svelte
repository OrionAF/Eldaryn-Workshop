<script>
  /**
   * PetsSource.svelte - Pets collection (character-scoped, one active/
   * equipped pet at a time). Every owned pet is listed with inline-editable
   * name/rarity/level; clicking a row opens its full stat block below via
   * StatsFields.svelte (the same component/field set used by the Gear Panel).
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { RARITIES, fieldsForTab } from '../lib/constants.js';
  import StatsFields from './StatsFields.svelte';

  const fields = fieldsForTab('gear'); // full CORE + bonus field set

  let newName = $state('');
  let newRarity = $state(RARITIES[0]);
  let newLevel = $state(1);
  let selectedPetId = $state(null);

  const pets = $derived(rosterStore.current.sources.pets);
  const selectedPet = $derived(pets.entries.find((p) => p.id === selectedPetId) || null);

  function addPet() {
    const id = rosterStore.addPet(newName.trim() || 'New Pet', newRarity, Number(newLevel) || 1);
    selectedPetId = id;
    newName = '';
    newLevel = 1;
  }

  function removePet(id) {
    rosterStore.removePet(id);
    if (selectedPetId === id) selectedPetId = null;
  }
</script>

<div class="pets-source">
  <div class="add-form">
    <input type="text" placeholder="Pet name" bind:value={newName} />
    <select bind:value={newRarity}>
      {#each RARITIES as r (r)}<option value={r}>{r}</option>{/each}
    </select>
    <input type="number" placeholder="Level" bind:value={newLevel} min="1" />
    <button type="button" onclick={addPet}>Add Pet</button>
  </div>

  {#if pets.entries.length === 0}
    <p class="empty-hint">No pets added yet.</p>
  {:else}
    <ul class="entry-list">
      {#each pets.entries as pet (pet.id)}
        <li class:selected={pet.id === selectedPetId}>
          <label class="active-radio">
            <input
              type="radio"
              name="active-pet"
              checked={pets.activeId === pet.id}
              onchange={() => rosterStore.setActivePet(pet.id)}
            />
            Active
          </label>
          <input
            type="text"
            class="row-name"
            value={pet.name}
            onblur={(e) => rosterStore.updatePetField(pet.id, 'name', e.target.value)}
          />
          <select value={pet.rarity} onchange={(e) => rosterStore.updatePetField(pet.id, 'rarity', e.target.value)}>
            {#each RARITIES as r (r)}<option value={r}>{r}</option>{/each}
          </select>
          <input
            type="number"
            class="row-level"
            value={pet.level}
            min="1"
            onblur={(e) => rosterStore.updatePetField(pet.id, 'level', Number(e.target.value) || 1)}
          />
          <button type="button" onclick={() => (selectedPetId = pet.id)}>
            {selectedPetId === pet.id ? 'Hide stats' : 'Edit stats'}
          </button>
          <button type="button" onclick={() => removePet(pet.id)}>Remove</button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if selectedPet}
    <div class="pet-editor">
      <h3>{selectedPet.name} - stat contribution</h3>
      <StatsFields
        values={selectedPet.stats}
        {fields}
        onChange={(key, value) => rosterStore.updatePetStat(selectedPet.id, key, value)}
      />
    </div>
  {/if}
</div>

<style>
  .add-form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .entry-list {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .entry-list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem;
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius, 4px);
  }
  .entry-list li.selected {
    border-color: var(--color-accent, #7aa2f7);
  }
  .active-radio {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    color: var(--color-muted, #999);
    white-space: nowrap;
  }
  .row-name {
    flex: 1;
    min-width: 6rem;
  }
  .row-level {
    width: 4rem;
  }
  .empty-hint {
    color: var(--color-muted, #999);
  }
  .pet-editor {
    border-top: 1px solid var(--color-border, #444);
    padding-top: 1rem;
  }
  .pet-editor :global(.stats-fields) {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 1rem;
  }
  .pet-editor :global(.stats-fields label) {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
  }
</style>
