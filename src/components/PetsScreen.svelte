<script>
  /**
   * PetsScreen.svelte - the shared pet collection. A preset picks which pet
   * contributes (Presets screen).
   *
   * Reworked in BigReworkV1: the Pet Altar tiers and levels EVERY pet at once,
   * so tier/level are one character-wide pair rather than per-pet fields, and
   * rarity is catalogue data (it decides the secondary-slot count) rather than
   * something you choose.
   *
   * Changing the altar TIER wipes the collection - that is how the game works,
   * because the tier decides which pets exist at all (tier-1 pets can't be
   * obtained once the altar moves past tier 1). It's behind a two-step confirm.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { fieldsForTab } from '../lib/constants.js';
  import {
    COMPANION_MAX_TIER,
    COMPANION_MAX_LEVEL,
    companionsForAltarTier,
    petStats,
  } from '../lib/petsData.js';
  import { summarizeStats } from '../lib/format.js';
  import StatsFields from './StatsFields.svelte';
  import PetCard from './PetCard.svelte';

  const customFields = fieldsForTab('gear'); // full field set for hand-entered (custom) pets

  /** Cards freshly added open in edit mode; Save just flips this back. */
  let editingIds = $state(new Set());
  let confirmingTier = $state(null); // the pending altar tier awaiting confirmation

  const character = $derived(rosterStore.current);
  const altar = $derived(character.petAltar);
  const available = $derived(companionsForAltarTier(altar.tier));
  const customPets = $derived(character.pets.filter((p) => !p.companionId));
  const cataloguePets = $derived(character.pets.filter((p) => p.companionId));

  function addPet() {
    const first = available[0];
    const id = rosterStore.addPet({ companionId: first?.id ?? null });
    editingIds = new Set([...editingIds, id]);
  }

  function toggleEdit(id) {
    const next = new Set(editingIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    editingIds = next;
  }

  function removePet(id) {
    rosterStore.removePet(id);
    const next = new Set(editingIds);
    next.delete(id);
    editingIds = next;
  }

  function usedBy(petId) {
    return character.presets.filter((p) => p.petId === petId).map((p) => p.name);
  }

  function requestTier(tier) {
    if (tier < 1 || tier > COMPANION_MAX_TIER || tier === altar.tier) return;
    // No pets to lose - just do it.
    if (character.pets.length === 0) {
      rosterStore.setPetAltarTier(tier);
      return;
    }
    confirmingTier = tier;
  }

  function confirmTier() {
    rosterStore.setPetAltarTier(confirmingTier);
    confirmingTier = null;
    editingIds = new Set();
  }
</script>

<div class="header-row">
  <h2>Pets</h2>
  <p class="hint">the altar tiers and levels every pet together · a preset picks which pet it uses</p>
</div>

<div class="altar-row">
  <div class="stepper-group">
    <span class="micro-label">PET ALTAR TIER</span>
    <div class="rank-controls">
      <button type="button" disabled={altar.tier <= 1} aria-label="Lower altar tier" onclick={() => requestTier(altar.tier - 1)}>−</button>
      <span class="rank-value" data-testid="altar-tier">{altar.tier}</span>
      <button type="button" disabled={altar.tier >= COMPANION_MAX_TIER} aria-label="Raise altar tier" onclick={() => requestTier(altar.tier + 1)}>+</button>
    </div>
  </div>

  <div class="stepper-group">
    <span class="micro-label">PET ALTAR LEVEL</span>
    <div class="rank-controls">
      <button type="button" disabled={altar.level <= 1} aria-label="Lower altar level" onclick={() => rosterStore.setPetAltarLevel(altar.level - 1)}>−</button>
      <input
        class="level-input"
        type="text"
        inputmode="numeric"
        value={altar.level}
        aria-label="Pet altar level"
        onchange={(e) => rosterStore.setPetAltarLevel(e.target.value)}
      />
      <button type="button" disabled={altar.level >= COMPANION_MAX_LEVEL} aria-label="Raise altar level" onclick={() => rosterStore.setPetAltarLevel(altar.level + 1)}>+</button>
    </div>
  </div>

  <button type="button" class="btn-gold" onclick={addPet} disabled={!available.length}>Add Pet</button>
</div>

{#if confirmingTier !== null}
  <div class="tier-warning" role="alert">
    <p>
      Changing the Pet Altar to tier {confirmingTier} <strong>removes all {character.pets.length} pets</strong> —
      tier {altar.tier} pets can't be kept once the altar moves. Any preset using one will have no pet.
    </p>
    <div class="warning-actions">
      <button type="button" class="btn-danger is-confirming" onclick={confirmTier}>Confirm — wipe collection</button>
      <button type="button" class="btn-ghost" onclick={() => (confirmingTier = null)}>Cancel</button>
    </div>
  </div>
{/if}

{#if !character.pets.length}
  <p class="empty-hint">No pets yet — add one to start.</p>
{/if}

<div class="pet-grid">
  {#each cataloguePets as pet (pet.id)}
    <PetCard
      {pet}
      {altar}
      companions={available}
      usedBy={usedBy(pet.id)}
      editing={editingIds.has(pet.id)}
      onCompanion={(companionId) => rosterStore.setPetCompanion(pet.id, companionId)}
      onSecondaryKey={(i, statKey) => rosterStore.setPetSecondaryKey(pet.id, i, statKey)}
      onSecondaryValue={(i, value) => rosterStore.setPetSecondaryValue(pet.id, i, value)}
      onToggleEdit={() => toggleEdit(pet.id)}
      onRemove={() => removePet(pet.id)}
    />
  {/each}
</div>

{#if customPets.length}
  <h3 class="subheading custom-heading">Custom pets</h3>
  <p class="hint">hand-entered stats from before the companion catalogue — the altar doesn't scale these</p>
  {#each customPets as pet (pet.id)}
    <div class="custom-pet">
      <div class="custom-head">
        <span class="custom-name">{pet.name}</span>
        <span class="custom-summary">{summarizeStats(petStats(pet, altar), customFields)}</span>
        <button type="button" class="btn-danger" onclick={() => removePet(pet.id)}>Remove</button>
      </div>
      <StatsFields
        values={pet.stats}
        fields={customFields}
        onChange={(key, value) => rosterStore.updatePetStat(pet.id, key, value)}
      />
    </div>
  {/each}
{/if}

<style>
  .header-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-3);
  }
  h2 {
    font-family: var(--font-heading);
    margin: 0;
  }
  .hint {
    color: var(--color-muted);
    font-size: 12px;
    margin: 0;
  }
  .empty-hint {
    color: var(--color-muted);
    font-size: 12px;
  }

  .altar-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex-wrap: wrap;
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-4);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
  }
  .stepper-group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .rank-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .rank-value {
    min-width: 26px;
    text-align: center;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  .level-input {
    width: 52px;
    text-align: center;
  }

  .tier-warning {
    border: 1px solid var(--color-downgrade-border);
    background: var(--color-downgrade-soft);
    border-radius: var(--radius-panel);
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-4);
  }
  .tier-warning p {
    margin: 0 0 var(--space-2);
    font-size: 12px;
    color: var(--color-soft);
  }
  .warning-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .pet-grid {
    display: grid;
    /* Max 4 columns on wide screens (BigReworkV1). */
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: var(--space-3);
    max-width: calc(4 * 300px);
  }

  .custom-heading {
    margin: var(--space-6) 0 var(--space-1);
  }
  .custom-pet {
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    padding: var(--space-3);
    margin-top: var(--space-2);
  }
  .custom-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-2);
  }
  .custom-name {
    font-weight: 600;
  }
  .custom-summary {
    flex: 1;
    font-size: 11.5px;
    color: var(--color-muted);
  }

  @media (max-width: 700px) {
    .pet-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
