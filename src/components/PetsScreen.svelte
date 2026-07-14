<script>
  /**
   * PetsScreen.svelte - the shared pet collection. A preset picks which pet
   * contributes (Presets screen); every pet levels together (character-wide
   * petLevel, informational only - level never scales the math, matching
   * pre-redesign behavior).
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { RARITIES, STAT_FIELDS, fieldsForTab } from '../lib/constants.js';
  import { summarizeStats, parseFlat } from '../lib/format.js';
  import StatsFields from './StatsFields.svelte';
  import ConfirmButton from './ConfirmButton.svelte';
  import AddPetModal from './AddPetModal.svelte';

  const fields = fieldsForTab('gear'); // full CORE + bonus field set, unscoped to a wearer

  let selectedPetId = $state(null);
  let showAddModal = $state(false);

  const character = $derived(rosterStore.current);
  const selectedPet = $derived(character.pets.find((p) => p.id === selectedPetId) || null);

  function addPet({ name, rarity, stats }) {
    const id = rosterStore.addPet(name, rarity, stats);
    selectedPetId = id;
    showAddModal = false;
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
    <span class="pet-level-label">PET LEVEL</span>
    <input
      type="text"
      inputmode="numeric"
      value={character.petLevel}
      onblur={(e) => rosterStore.setPetLevel(parseFlat(e.target.value) || 1)}
    />
  </label>
</div>

<div class="add-form">
  <button type="button" class="btn-gold" onclick={() => (showAddModal = true)}>Add Pet</button>
</div>

{#if showAddModal}
  <AddPetModal onSave={addPet} onClose={() => (showAddModal = false)} />
{/if}

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
        <button type="button" class="btn-ghost" onclick={() => (selectedPetId = pet.id === selectedPetId ? null : pet.id)}>
          {selectedPetId === pet.id ? 'Hide stats' : 'Edit stats'}
        </button>
        <ConfirmButton class="btn-danger" label="Remove" confirmLabel="Confirm remove" prompt={`Remove "${pet.name}"?`} onConfirm={() => removePet(pet.id)} />
      </li>
    {/each}
  </ul>
{/if}

{#if selectedPet}
  <div class="pet-editor">
    <p class="micro-label">{selectedPet.name.toUpperCase()} — STAT CONTRIBUTION</p>
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
    align-items: center;
    gap: 7px;
  }
  .pet-level-label {
    font-size: 10px;
    letter-spacing: 0.12em;
    color: var(--color-muted);
    font-weight: 700;
  }
  .pet-level input {
    width: 64px;
    text-align: right;
    font-family: var(--font-data);
    font-size: 12.5px;
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
    padding: 8px 10px;
    background: var(--color-inset);
    border: 1px solid var(--color-border);
    border-radius: 7px;
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
    font-size: 10.5px;
    color: var(--color-muted);
  }
  .used-by {
    font-family: var(--font-data);
    font-size: 10.5px;
    color: var(--color-muted);
    min-width: 110px;
    white-space: nowrap;
  }
  .empty-hint {
    color: var(--color-muted);
  }
  .pet-editor {
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 16px 18px;
  }
  .pet-editor .micro-label {
    margin: 0 0 10px;
  }
  @media (min-width: 900px) {
    .pet-editor :global(.stats-fields) {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 26px;
    }
  }
</style>
