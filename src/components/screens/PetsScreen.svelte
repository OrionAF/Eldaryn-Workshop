<script>
  /**
   * PetsScreen.svelte - the character's pet collection and the one Pet Altar that levels and tiers
   * every pet. A preset picks which pet it uses (Presets screen).
   *
   * Changing the altar TIER wipes the collection (the game's behaviour) and clears every preset's
   * pet, so it sits behind a ConfirmButton. From tier 2 the pets show their evolved names.
   *
   * Only base species values are shown. TODO(C1a): once the E2b pet source is wired, show the
   * altar-scaled computed ATK/HP and secondaries per pet here (use its preview, do not re-derive).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { RARITIES } from '../../lib/constants.js';
  import { PET_SPECIES } from '../../lib/game/pets.js';
  import { PET_MAX_TIER, PET_MAX_LEVEL, MAX_OWNED_PETS, secondaryTypesFor } from '../../lib/model/pets.js';
  import Slider from '../Slider.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import PetCard from '../pets/PetCard.svelte';

  let { setStatus = () => {}, onNavigate = () => {} } = $props();

  const character = $derived(rosterStore.current);
  const altar = $derived(character.pets.altar);
  const owned = $derived(character.pets.owned);
  const evolved = $derived(altar.tier >= 2);
  const types = $derived(secondaryTypesFor(character.class));
  const species = PET_SPECIES.toSorted((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.name.localeCompare(b.name));

  let newSpecies = $state(species[0].id);
  let pendingTier = $state(null); // null = follows the altar
  let editingIds = $state(new Set());
  const tierChoice = $derived(pendingTier ?? altar.tier);

  const usedBy = (petId) => character.presets.filter((p) => p.petId === petId).map((p) => p.name);

  function addPet() {
    const id = rosterStore.addPet(newSpecies);
    if (id) editingIds = new Set([...editingIds, id]);
    else setStatus(`Collection is full (${MAX_OWNED_PETS} pets).`);
  }
  function toggleEdit(id) {
    const next = new Set(editingIds);
    if (!next.delete(id)) next.add(id);
    editingIds = next;
  }
  function removePet(id) {
    rosterStore.removePet(id);
    const next = new Set(editingIds);
    next.delete(id);
    editingIds = next;
  }
  function confirmTier() {
    const t = Number(tierChoice);
    rosterStore.setPetAltarTier(t);
    pendingTier = null;
    editingIds = new Set();
    setStatus(`Pet Altar set to tier ${t}; collection cleared.`);
  }
</script>

<div class="header-row">
  <h2>Pets</h2>
  <p class="hint">the altar levels and tiers every pet together · a preset picks which pet it uses</p>
</div>

<div class="altar-row">
  <div class="altar-group">
    <span class="micro-label">PET ALTAR LEVEL</span>
    <div class="level-row">
      <div class="rank-controls">
        <button type="button" disabled={altar.level <= 1} aria-label="Lower altar level" onclick={() => rosterStore.setPetAltarLevel(altar.level - 1)}>−</button>
        <span class="rank-value" data-testid="altar-level">{altar.level}</span>
        <button type="button" disabled={altar.level >= PET_MAX_LEVEL} aria-label="Raise altar level" onclick={() => rosterStore.setPetAltarLevel(altar.level + 1)}>+</button>
      </div>
      <div class="level-slider">
        <Slider min={1} max={PET_MAX_LEVEL} step={1} value={altar.level} ariaLabel="Pet altar level" oninput={(v) => rosterStore.setPetAltarLevel(v)} />
      </div>
    </div>
  </div>

  <div class="altar-group">
    <span class="micro-label">PET ALTAR TIER</span>
    <div class="tier-row">
      <select value={tierChoice} aria-label="Pet altar tier" onchange={(e) => (pendingTier = Number(e.target.value))}>
        {#each Array.from({ length: PET_MAX_TIER }, (_, i) => i + 1) as t (t)}<option value={t}>Tier {t}</option>{/each}
      </select>
      {#if tierChoice !== altar.tier}
        <ConfirmButton
          class="btn-danger"
          label="Change tier"
          confirmLabel="Wipe collection"
          prompt={owned.length ? `Removes all ${owned.length} pets and clears presets' pets.` : 'Collection is empty.'}
          onConfirm={confirmTier}
        />
        <button type="button" class="btn-ghost" onclick={() => (pendingTier = null)}>Keep tier {altar.tier}</button>
      {/if}
    </div>
  </div>
</div>

<div class="add-row">
  <select bind:value={newSpecies} aria-label="Species to add">
    {#each species as s (s.id)}<option value={s.id}>{evolved ? s.evolvedName : s.name} · {s.rarity}</option>{/each}
  </select>
  <button type="button" class="btn-gold" disabled={owned.length >= MAX_OWNED_PETS} onclick={addPet}>Add Pet</button>
  <span class="hint">{owned.length}/{MAX_OWNED_PETS}</span>
</div>

{#if !owned.length}
  <p class="empty-hint">No pets yet. Add one to start.</p>
{/if}

<div class="pet-grid">
  {#each owned as pet (pet.id)}
    <PetCard
      {pet}
      {species}
      {types}
      {evolved}
      usedBy={usedBy(pet.id)}
      editing={editingIds.has(pet.id)}
      onSpecies={(s) => rosterStore.setPetSpecies(pet.id, s)}
      onType={(i, t) => rosterStore.setPetSecondaryType(pet.id, i, t)}
      onValue={(i, v) => rosterStore.setPetSecondaryValue(pet.id, i, v)}
      onDropSecondary={(i) => rosterStore.removePetSecondary(pet.id, i)}
      onToggleEdit={() => toggleEdit(pet.id)}
      onRemove={() => removePet(pet.id)}
    />
  {/each}
</div>

<style>
  .header-row { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
  h2 { font-family: var(--font-heading); margin: 0; }
  .hint { color: var(--color-muted); font-size: 12px; margin: 0; }
  .empty-hint { color: var(--color-muted); font-size: 12px; }
  .altar-row { display: flex; gap: var(--space-4); flex-wrap: wrap; padding: var(--space-3) var(--space-4); margin-bottom: var(--space-3); background: var(--color-panel); border: 1px solid var(--color-border); border-radius: var(--radius-panel); }
  .altar-group { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .level-row, .tier-row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .level-slider { width: 180px; max-width: 100%; }
  .rank-controls { display: flex; align-items: center; gap: 4px; }
  .rank-value { min-width: 26px; text-align: center; font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .add-row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-4); }
  .pet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: var(--space-3); max-width: calc(4 * 300px); }
  @media (max-width: 700px) { .pet-grid { grid-template-columns: 1fr; } }
</style>
