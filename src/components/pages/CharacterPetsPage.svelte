<script>
  /**
   * CharacterPetsPage.svelte (C6) - the character's pet collection and the one Pet Altar that levels and tiers
   * every pet. A preset picks which pet it uses (Presets screen).
   *
   * Changing the altar TIER wipes the collection (the game's behaviour) and clears every preset's
   * pet, so it sits behind a dialog that names the pets and presets it will clear (build/usage.js
   * tierChangeLosses). From tier 2 the pets show their evolved names.
   *
   * Each card shows the altar-scaled ATK/HP and secondaries next to the base values (read-only,
   * computed by engine/sources/pet.js).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { RARITY_ORDER } from '../../lib/format.js';
  import { PET_SPECIES } from '../../lib/game/pets.js';
  import { PET_MAX_TIER, PET_MAX_LEVEL, MAX_OWNED_PETS, secondaryTypesFor } from '../../lib/model/pets.js';
  import Slider from '../Slider.svelte';
  import Panel from '../ui/Panel.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import Modal from '../Modal.svelte';
  import { tierChangeLosses } from '../../lib/build/usage.js';
  import PetCard from '../pets/PetCard.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const altar = $derived(character.pets.altar);
  const owned = $derived(character.pets.owned);
  const evolved = $derived(altar.tier >= 2);
  const types = $derived(secondaryTypesFor(character.class));
  const species = PET_SPECIES.toSorted((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name));

  let newSpecies = $state(species[0].id);
  let pendingTier = $state(null); // null = follows the altar
  let wipeOpen = $state(false);
  const losses = $derived(tierChangeLosses(character));
  let levelDraft = $derived(altar.level);
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
    wipeOpen = false;
    editingIds = new Set();
    setStatus(`Pet Altar set to tier ${t}; collection cleared.`);
  }
</script>

<Panel title="Pet Altar" scope="character">
  {#snippet meta()}<span class="sub">the altar levels and tiers every pet together · a preset picks which pet it uses</span>{/snippet}
  <div class="altar-row">
    <div class="altar-group">
      <div class="level-row">
        <NumberField
          label="Pet altar level (1-{PET_MAX_LEVEL})"
          bind:value={levelDraft}
          min={1}
          max={PET_MAX_LEVEL}
          onchange={(v) => rosterStore.setPetAltarLevel(v)}
        />
        <div class="rank-controls">
          <button type="button" disabled={altar.level <= 1} aria-label="Lower altar level" onclick={() => rosterStore.setPetAltarLevel(altar.level - 1)}>−</button>
          <span class="rank-value" data-testid="altar-level">{altar.level}</span>
          <button type="button" disabled={altar.level >= PET_MAX_LEVEL} aria-label="Raise altar level" onclick={() => rosterStore.setPetAltarLevel(altar.level + 1)}>+</button>
        </div>
      </div>
      <div class="level-slider">
        <Slider min={1} max={PET_MAX_LEVEL} step={1} value={altar.level} ariaLabel="Pet altar level" oninput={(v) => rosterStore.setPetAltarLevel(v)} />
        <span class="hint">The slider is a quick way to get close; type the exact level in the field.</span>
      </div>
    </div>

    <div class="altar-group">
      <div class="tier-row">
        <label class="tier-label">
          <span class="field-label">Pet altar tier</span>
          <select value={tierChoice} aria-label="Pet altar tier" onchange={(e) => (pendingTier = Number(e.target.value))}>
            {#each Array.from({ length: PET_MAX_TIER }, (_, i) => i + 1) as t (t)}<option value={t}>Tier {t}</option>{/each}
          </select>
        </label>
        {#if tierChoice !== altar.tier}
          <Button variant="danger" onclick={() => (wipeOpen = true)}>Change tier</Button>
          <Button variant="ghost" onclick={() => (pendingTier = null)}>Keep tier {altar.tier}</Button>
        {/if}
      </div>
    </div>
  </div>
</Panel>

{#if wipeOpen}
  <Modal bind:open={wipeOpen} title="Change the pet altar to tier {tierChoice}?">
    <p>The game wipes the collection when the altar tier changes.</p>
    <p class="losses-head">Pets removed ({losses.pets.length})</p>
    <ul class="losses" aria-label="Pets removed">
      {#each losses.pets as p (p.id)}<li>{p.name}</li>{:else}<li class="none">none, the collection is empty</li>{/each}
    </ul>
    <p class="losses-head">Presets whose pet is cleared ({losses.presets.length})</p>
    <ul class="losses" aria-label="Presets that lose their pet">
      {#each losses.presets as name (name)}<li>{name}</li>{:else}<li class="none">none</li>{/each}
    </ul>
    {#snippet footer()}
      <Button variant="ghost" onclick={() => (wipeOpen = false)}>Keep tier {altar.tier}</Button>
      <Button variant="danger" onclick={confirmTier}>Wipe collection</Button>
    {/snippet}
  </Modal>
{/if}

<Panel title="Collection" scope="character">
  {#snippet meta()}<span class="sub num" data-testid="pet-count">{owned.length}/{MAX_OWNED_PETS}</span>{/snippet}
  <div class="add-row">
    <Select label="Species to add" options={species.map((s) => ({ value: s.id, label: `${evolved ? s.evolvedName : s.name} · ${s.rarity}` }))} bind:value={newSpecies} />
    <Button variant="primary" disabled={owned.length >= MAX_OWNED_PETS} onclick={addPet}>+ Add pet</Button>
  </div>

  {#if !owned.length}
    <EmptyState title="No pets yet" text="Add one to start." />
  {/if}

<div class="pet-grid">
  {#each owned as pet (pet.id)}
    <PetCard
      {pet}
      {species}
      {types}
      {evolved}
      altarLevel={altar.level}
      altarTier={altar.tier}
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
</Panel>

<style>
  .sub { color: var(--text-muted); font-size: var(--fs-12); }
  .hint { color: var(--text-muted); font-size: var(--fs-12); }
  .altar-row { display: flex; gap: var(--sp-5); flex-wrap: wrap; }
  .altar-group { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; }
  .level-row, .tier-row { display: flex; align-items: flex-end; gap: var(--sp-3); flex-wrap: wrap; }
  .level-row :global(.field) { width: 12rem; }
  .level-slider { width: 260px; max-width: 100%; display: grid; gap: var(--sp-1); }
  .tier-label { display: grid; gap: 4px; }
  .field-label { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .rank-controls { display: flex; align-items: center; gap: 4px; }
  .rank-value { min-width: 26px; text-align: center; font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .add-row { display: flex; align-items: flex-end; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-4); }
  .add-row :global(.field) { min-width: 16rem; }
  .pet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: var(--sp-3); max-width: calc(4 * 300px); }
  .losses-head { margin: var(--sp-3) 0 var(--sp-1); font-weight: var(--fw-bold); }
  .losses { margin: 0; padding-left: var(--sp-5); }
  .losses .none { color: var(--text-muted); list-style: none; margin-left: calc(-1 * var(--sp-5)); }
  @media (max-width: 700px) { .pet-grid { grid-template-columns: 1fr; } }
</style>
