<script>
  /**
   * PetsScreen.svelte - the shared pet collection. A preset picks which pet
   * contributes (Presets screen); every pet levels together (character-wide
   * petLevel, informational only - level never scales the math, matching
   * pre-redesign behavior).
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { RARITIES, STAT_FIELDS, fieldsForTab } from '../lib/constants.js';
  import { summarizeStats } from '../lib/format.js';
  import StatsFields from './StatsFields.svelte';
  import ConfirmButton from './ConfirmButton.svelte';

  const fields = fieldsForTab('gear'); // full CORE + bonus field set, unscoped to a wearer

  let newName = $state('');
  let newRarity = $state(RARITIES[0]);
  let selectedPetId = $state(null);

  const character = $derived(rosterStore.current);
  const selectedPet = $derived(character.pets.find((p) => p.id === selectedPetId) || null);

  function addPet() {
    const id = rosterStore.addPet(newName.trim() || 'New Pet', newRarity);
    selectedPetId = id;
    newName = '';
  }

  function removePet(id) {
    rosterStore.removePet(id);
    if (selectedPetId === id) selectedPetId = null;
  }

  function usedBy(petId) {
    return character.presets.filter((p) => p.petId === petId).map((p) => p.name);
  }

  function petSummary(pet) {
    return summarizeStats(pet.stats, STAT_FIELDS);
  }
</script>

<div class="header-row">
  <div>
    <h2>Pets</h2>
    <p class="hint">a preset picks which pet contributes · all pets level together</p>
  </div>
  <label class="pet-level">
    PET LEVEL
    <input
      type="number"
      min="1"
      value={character.petLevel}
      onblur={(e) => rosterStore.setPetLevel(Number(e.target.value) || 1)}
    />
  </label>
</div>

<div class="add-form">
  <input type="text" placeholder="Pet name" aria-label="Pet name" bind:value={newName} />
  <select aria-label="Rarity" bind:value={newRarity}>
    {#each RARITIES as r (r)}<option value={r}>{r}</option>{/each}
  </select>
  <button type="button" onclick={addPet}>Add Pet</button>
</div>

{#if character.pets.length === 0}
  <p class="empty-hint">No pets added yet.</p>
{:else}
  <ul class="entry-list">
    {#each character.pets as pet (pet.id)}
      {@const used = usedBy(pet.id)}
      <li class:selected={pet.id === selectedPetId}>
        <input
          type="text"
          class="row-name"
          value={pet.name}
          onblur={(e) => rosterStore.updatePetField(pet.id, 'name', e.target.value)}
        />
        <select value={pet.rarity} onchange={(e) => rosterStore.updatePetField(pet.id, 'rarity', e.target.value)}>
          {#each RARITIES as r (r)}<option value={r}>{r}</option>{/each}
        </select>
        <span class="summary">{petSummary(pet)}</span>
        <span class="used-by">{used.length ? `used by ${used.join(', ')}` : 'unused'}</span>
        <button type="button" onclick={() => (selectedPetId = pet.id === selectedPetId ? null : pet.id)}>
          {selectedPetId === pet.id ? 'Hide stats' : 'Edit stats'}
        </button>
        <ConfirmButton label="Remove" confirmLabel="Confirm remove" prompt={`Remove "${pet.name}"?`} onConfirm={() => removePet(pet.id)} />
      </li>
    {/each}
  </ul>
{/if}

{#if selectedPet}
  <div class="pet-editor">
    <h3>{selectedPet.name} - stat contribution</h3>
    <StatsFields values={selectedPet.stats} {fields} onChange={(key, value) => rosterStore.updatePetStat(selectedPet.id, key, value)} />
  </div>
{/if}

<style>
  .header-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
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
  .pet-level {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-dim);
  }
  .pet-level input {
    width: 5rem;
  }
  .add-form {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    flex-wrap: wrap;
  }
  .entry-list {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .entry-list li {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--color-inset);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
  }
  .entry-list li.selected {
    border-color: var(--color-gold);
  }
  .row-name {
    flex: 1;
    min-width: 6rem;
  }
  .summary {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    color: var(--color-muted);
  }
  .used-by {
    font-size: 11px;
    color: var(--color-dim);
    white-space: nowrap;
  }
  .empty-hint {
    color: var(--color-muted);
  }
  .pet-editor {
    border-top: 1px solid var(--color-border-hairline);
    padding-top: var(--space-4);
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
