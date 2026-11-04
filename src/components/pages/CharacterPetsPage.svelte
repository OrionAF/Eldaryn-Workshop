<script>
  /**
   * CharacterPetsPage.svelte (C6) - the character's Pet Cores (Pets V2, client 2.9.1) and the one Core Altar
   * that levels and tiers every core. A preset picks which core it uses, here (each card's "Used in" menu) or on the Presets screen.
   *
   * Changing the altar TIER wipes the collection (the game's evolve, Game/pet-cores.md §4) and clears every
   * preset's pet, so it sits behind a dialog that names the cores and presets it will clear (build/usage.js
   * tierChangeLosses).
   *
   * Each card shows the altar-scaled ATK/HP and secondaries next to the base values (read-only,
   * computed by engine/sources/petCore.js).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { PET_MAX_TIER, PET_MAX_LEVEL, MAX_OWNED_CORES, CORE_RARITY_NAMES, secondaryTypesFor } from '../../lib/model/pets.js';
  import Slider from '../Slider.svelte';
  import Panel from '../ui/Panel.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Select from '../ui/Select.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Button from '../ui/Button.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import Modal from '../Modal.svelte';
  import { tierChangeLosses } from '../../lib/build/usage.js';
  import PetCard from '../pets/PetCard.svelte';
  import { orderStats } from '../../lib/ui/statOrder.js';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const altar = $derived(character.pets.altar);
  const owned = $derived(character.pets.cores);
  const types = $derived(orderStats(secondaryTypesFor(character.class), character.class));
  const rarityOptions = CORE_RARITY_NAMES.map((r) => ({ value: r, label: r }));

  let newRarity = $state(CORE_RARITY_NAMES[0]);
  let pendingTier = $state(null); // null = follows the altar
  let wipeOpen = $state(false);
  const losses = $derived(tierChangeLosses(character));
  let levelDraft = $derived(altar.level);
  let editingIds = $state(new Set());
  const tierChoice = $derived(pendingTier ?? altar.tier);
  const tierOptions = Array.from({ length: PET_MAX_TIER }, (_, i) => ({ value: i + 1, label: `Tier ${i + 1}` }));

  const usedBy = (petId) => character.presets.filter((p) => p.petId === petId).map((p) => p.name);

  function usePet(presetId, petId) {
    const on = character.presets.find((p) => p.id === presetId)?.petId === petId;
    rosterStore.setPresetPet(presetId, on ? null : petId);
  }
  function addCore() {
    const id = rosterStore.addCore(newRarity);
    if (id) editingIds = new Set([...editingIds, id]);
    else setStatus(`Collection is full (${MAX_OWNED_CORES} cores).`);
  }
  function toggleEdit(id) {
    const next = new Set(editingIds);
    if (!next.delete(id)) next.add(id);
    editingIds = next;
  }
  function removeCore(id) {
    rosterStore.removeCore(id);
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
    setStatus(`Core Altar set to tier ${t}; collection cleared.`);
  }
</script>

<div class="page">
<Panel title="Core Altar" scope="character">
  {#snippet meta()}<span class="sub">the altar levels and tiers every core together · a preset picks which core it uses</span>{/snippet}
  <div class="altar-row">
    <div class="altar-group">
      <div class="level-row">
        <NumberField
          label="Core altar level (1-{PET_MAX_LEVEL})"
          bind:value={levelDraft}
          min={1}
          max={PET_MAX_LEVEL}
          onchange={(v) => rosterStore.setPetAltarLevel(v)}
        />
        <Stepper label="Altar level" value={altar.level} min={1} max={PET_MAX_LEVEL} onchange={(n) => rosterStore.setPetAltarLevel(n)} />
      </div>
      <div class="level-slider">
        <Slider min={1} max={PET_MAX_LEVEL} step={1} value={altar.level} ariaLabel="Core altar level" oninput={(v) => rosterStore.setPetAltarLevel(v)} />
        <span class="hint">Level <span class="num" data-testid="altar-level">{altar.level}</span> of {PET_MAX_LEVEL}. The slider is a quick way to get close; type the exact level in the field.</span>
      </div>
    </div>

    <div class="altar-group">
      <div class="tier-row">
        <Select label="Core altar tier" options={tierOptions} value={tierChoice} onchange={(v) => (pendingTier = Number(v))} />
        {#if tierChoice !== altar.tier}
          <Button variant="danger" onclick={() => (wipeOpen = true)}>Change tier</Button>
          <Button variant="ghost" onclick={() => (pendingTier = null)}>Keep tier {altar.tier}</Button>
        {/if}
      </div>
    </div>
  </div>
</Panel>

{#if wipeOpen}
  <Modal bind:open={wipeOpen} title="Change the Core Altar to tier {tierChoice}?">
    <p>The game wipes the collection when the altar tier changes.</p>
    <p class="losses-head">Cores removed ({losses.pets.length})</p>
    <ul class="losses" aria-label="Cores removed">
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
  {#snippet meta()}<span class="sub num" data-testid="pet-count">{owned.length}/{MAX_OWNED_CORES}</span>{/snippet}
  <div class="add-row">
    <Select label="Core rarity to add" options={rarityOptions} bind:value={newRarity} />
    <Button variant="primary" disabled={owned.length >= MAX_OWNED_CORES} onclick={addCore}>+ Add core</Button>
  </div>

  {#if !owned.length}
    <EmptyState title="No Pet Cores yet" text="Since the 2.9.1 rework a pet's stats come from its core, so pets saved before it were removed. Add your cores to start." />
  {/if}

  <div class="pet-grid">
  {#each owned as pet (pet.id)}
    <PetCard
      {pet}
      {types}
      altarLevel={altar.level}
      altarTier={altar.tier}
      usedBy={usedBy(pet.id)}
      presets={character.presets}
      onUse={(presetId) => usePet(presetId, pet.id)}
      editing={editingIds.has(pet.id)}
      onRarity={(r) => rosterStore.setCoreRarity(pet.id, r)}
      onBase={(stat, v) => rosterStore.setCoreBase(pet.id, stat, v)}
      onType={(i, t) => rosterStore.setCoreSecondaryType(pet.id, i, t)}
      onValue={(i, v) => rosterStore.setCoreSecondaryValue(pet.id, i, v)}
      onDropSecondary={(i) => rosterStore.removeCoreSecondary(pet.id, i)}
      onToggleEdit={() => toggleEdit(pet.id)}
      onRemove={() => removeCore(pet.id)}
    />
  {/each}
  </div>
</Panel>
</div>

<style>
  /* The panels size to their own width, never to the grids inside them: an auto-fill grid under a max-width is
     measured as that many columns, which pushed the page past the viewport (min-width: 0 stops it). */
  .page { display: grid; gap: var(--sp-4); min-width: 0; overflow-x: auto; }
  .sub { color: var(--text-muted); font-size: var(--fs-12); }
  .hint { color: var(--text-muted); font-size: var(--fs-12); }
  .altar-row { display: flex; gap: var(--sp-5); flex-wrap: wrap; }
  .altar-group { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; }
  .level-row, .tier-row { display: flex; align-items: flex-end; gap: var(--sp-3); flex-wrap: wrap; }
  .level-row :global(.field) { width: 12rem; }
  .level-slider { width: 260px; max-width: 100%; display: grid; gap: var(--sp-1); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  .add-row { display: flex; align-items: flex-end; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-4); }
  .add-row :global(.field) { min-width: min(16rem, 100%); }
  .pet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); gap: var(--sp-3); min-width: 0; }
  .losses-head { margin: var(--sp-3) 0 var(--sp-1); font-weight: var(--fw-bold); }
  .losses { margin: 0; padding-left: var(--sp-5); }
  .losses .none { color: var(--text-muted); list-style: none; margin-left: calc(-1 * var(--sp-5)); }
</style>
