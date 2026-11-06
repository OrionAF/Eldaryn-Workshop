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
   * computed by engine/sources/petCore.js). A core is edited in the right-hand drawer (CoreEditor), one at a
   * time, so opening an editor never resizes the grid; its card is outlined and updates as you type.
   *
   * Each card is scored for a spec of the character's class (features/coreScore.js): its rolls plus
   * how its secondaries rank in that spec's leaderboard keep rates (Tools > Stat Priorities), at the
   * character's level bracket. The data loads on first visit, shared with that page; the chosen
   * spec is per-device view state (uiState.js coreScoreSpec).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { PET_MAX_TIER, PET_MAX_LEVEL, MAX_OWNED_CORES, CORE_RARITY_NAMES, secondaryTypesFor, coreName } from '../../lib/model/pets.js';
  import Slider from '../Slider.svelte';
  import Panel from '../ui/Panel.svelte';
  import Select from '../ui/Select.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Button from '../ui/Button.svelte';
  import Drawer from '../ui/Drawer.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import Modal from '../Modal.svelte';
  import { tierChangeLosses } from '../../lib/build/usage.js';
  import PetCard from '../pets/PetCard.svelte';
  import CoreEditor from '../pets/CoreEditor.svelte';
  import { viewCores, SORT_OPTIONS, SHOW_OPTIONS } from '../pets/petView.js';
  import { orderStats } from '../../lib/ui/statOrder.js';
  import { coreScore, coreScoreBasis } from '../../lib/features/coreScore.js';
  import { loadUi, saveUi } from '../../lib/uiState.js';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const altar = $derived(character.pets.altar);
  const owned = $derived(character.pets.cores);
  const types = $derived(orderStats(secondaryTypesFor(character.class), character.class));
  const rarityOptions = CORE_RARITY_NAMES.map((r) => ({ value: r, label: r }));

  let priorityData = $state.raw(null);
  import('../../data/statPriority.json').then(
    (m) => (priorityData = m.default),
    () => {}, // no data: cards show the roll only
  );
  let scoreSpec = $state(loadUi().coreScoreSpec);
  const basis = $derived(priorityData ? coreScoreBasis(priorityData, character.class, character.level, scoreSpec) : null);
  const specOptions = $derived(basis ? basis.specs.map((s) => ({ value: s.spec, label: s.specName })) : []);
  const scores = $derived(new Map(owned.map((c) => [c.id, coreScore(c, basis?.weights ?? null)])));
  const scoreValues = $derived(new Map([...scores].map(([id, s]) => [id, s?.score ?? s?.roll ?? -1])));
  function pickSpec(v) {
    scoreSpec = v;
    saveUi({ coreScoreSpec: v });
  }

  let sortMode = $state('added');
  let showMode = $state('all');
  const usedIds = $derived(new Set(character.presets.map((p) => p.petId).filter(Boolean)));
  const shown = $derived(viewCores(owned, sortMode, showMode, usedIds, scoreValues));
  let newRarity = $state(CORE_RARITY_NAMES[0]);
  let pendingTier = $state(null); // null = follows the altar
  let wipeOpen = $state(false);
  const losses = $derived(tierChangeLosses(character));
  let editingId = $state(null);
  let drawerOpen = $state(false);
  const editingPet = $derived(editingId ? (owned.find((c) => c.id === editingId) ?? null) : null);
  const tierChoice = $derived(pendingTier ?? altar.tier);
  const tierOptions = Array.from({ length: PET_MAX_TIER }, (_, i) => ({ value: i + 1, label: `Tier ${i + 1}` }));

  function usePet(presetId, petId) {
    const on = character.presets.find((p) => p.id === presetId)?.petId === petId;
    rosterStore.setPresetPet(presetId, on ? null : petId);
  }
  function edit(id) {
    editingId = id;
    drawerOpen = true;
  }
  function closeEditor() {
    drawerOpen = false;
    editingId = null;
  }
  function addCore() {
    const id = rosterStore.addCore(newRarity);
    if (id) edit(id);
    else setStatus(`Collection is full (${MAX_OWNED_CORES} cores).`);
  }
  function duplicateCore(id) {
    const copy = rosterStore.duplicateCore(id);
    if (copy) edit(copy);
    else setStatus(`Collection is full (${MAX_OWNED_CORES} cores).`);
  }
  // the card's Edit opens its editor, or closes it when it is the one open
  function toggleEdit(id) {
    if (drawerOpen && editingId === id) closeEditor();
    else edit(id);
  }
  function removeCore(id) {
    rosterStore.removeCore(id);
    if (editingId === id) closeEditor();
  }
  function confirmTier() {
    const t = Number(tierChoice);
    rosterStore.setPetAltarTier(t);
    pendingTier = null;
    wipeOpen = false;
    closeEditor();
    setStatus(`Core Altar set to tier ${t}; collection cleared.`);
  }
</script>

<div class="page">
<Panel title="Core Altar" scope="character">
  {#snippet meta()}<span class="sub">the altar levels and tiers every core together · a preset picks which core it uses</span>{/snippet}
  <div class="field-row altar-row">
    <div class="altar-level">
      <span class="field-label">Core altar level</span>
      <div class="level-line">
        <Stepper label="Altar level" value={altar.level} min={1} max={PET_MAX_LEVEL} onchange={(n) => rosterStore.setPetAltarLevel(n)} />
        <div class="level-slider">
          <Slider min={1} max={PET_MAX_LEVEL} step={1} value={altar.level} ariaLabel="Core altar level" oninput={(v) => rosterStore.setPetAltarLevel(v)} />
        </div>
        <span class="of">of <span class="num">{PET_MAX_LEVEL}</span></span>
      </div>
    </div>

    <div class="tier-field">
      <Select label="Core altar tier" options={tierOptions} value={tierChoice} hint="Changing it wipes every core" onchange={(v) => (pendingTier = Number(v))} />
    </div>
    {#if tierChoice !== altar.tier}
      <div class="control-align tier-actions">
        <Button variant="danger" onclick={() => (wipeOpen = true)}>Change tier</Button>
        <Button variant="ghost" onclick={() => (pendingTier = null)}>Keep tier {altar.tier}</Button>
      </div>
    {/if}
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
  <div class="field-row toolbar">
    {#if owned.length}
      <div class="tool sort"><Select label="Sort" options={SORT_OPTIONS} bind:value={sortMode} /></div>
      <div class="tool show"><Select label="Show" options={SHOW_OPTIONS} bind:value={showMode} /></div>
      {#if specOptions.length}
        <div class="tool spec"><Select label="Score for" options={specOptions} value={basis.spec.spec} onchange={pickSpec} /></div>
      {/if}
    {/if}
    <span class="grow"></span>
    <div class="tool rarity"><Select label="Core rarity to add" options={rarityOptions} bind:value={newRarity} /></div>
    <div class="control-align"><Button variant="primary" disabled={owned.length >= MAX_OWNED_CORES} onclick={addCore}>+ Add core</Button></div>
  </div>

  {#if !owned.length}
    <EmptyState title="No Pet Cores yet" text="Since the 2.9.1 rework a pet's stats come from its core, so pets saved before it were removed. Add your cores to start." />
  {:else}
    {#if basis?.bracket}
      <p class="hint score-hint">Scored for {basis.spec.specName} on leaderboard stat priorities, levels <span class="num">{basis.bracket.key}</span>. Gold secondaries are high priority, faded ones low; the bar under each is its roll.</p>
    {:else if basis}
      <p class="hint score-hint">No leaderboard stat priorities for {basis.spec.specName} yet, so cards show the roll only.</p>
    {/if}
    {#if !shown.length}<p class="hint">No cores match this filter.</p>{/if}
  {/if}

  <div class="pet-grid">
  {#each shown as pet (pet.id)}
    <PetCard
      {pet}
      altarLevel={altar.level}
      altarTier={altar.tier}
      presets={character.presets}
      score={scores.get(pet.id)}
      specName={basis?.spec.specName ?? ''}
      editing={drawerOpen && editingId === pet.id}
      onUse={(presetId) => usePet(presetId, pet.id)}
      onEdit={() => toggleEdit(pet.id)}
    />
  {/each}
  </div>
</Panel>

<Drawer bind:open={drawerOpen} title={editingPet ? `Edit ${coreName(editingPet)}` : 'Edit core'} onclose={closeEditor}>
  {#snippet meta()}<span class="sub">Changes save as you edit</span>{/snippet}
  {#if editingPet}
    <CoreEditor
      pet={editingPet}
      {types}
      onRarity={(r) => rosterStore.setCoreRarity(editingPet.id, r)}
      onBase={(stat, v) => rosterStore.setCoreBase(editingPet.id, stat, v)}
      onType={(i, t) => rosterStore.setCoreSecondaryType(editingPet.id, i, t)}
      onValue={(i, v) => rosterStore.setCoreSecondaryValue(editingPet.id, i, v)}
      onDropSecondary={(i) => rosterStore.removeCoreSecondary(editingPet.id, i)}
    />
  {/if}
  {#snippet footer()}
    {#if editingPet}
      <Button variant="ghost" size="small" disabled={owned.length >= MAX_OWNED_CORES} onclick={() => duplicateCore(editingPet.id)}>Duplicate</Button>
      <ConfirmButton variant="danger" size="small" label="Remove" confirmLabel="Confirm remove" onConfirm={() => removeCore(editingPet.id)} />
    {/if}
    <span class="grow"></span>
    <Button variant="primary" onclick={closeEditor}>Done</Button>
  {/snippet}
</Drawer>
</div>

<style>
  /* The panels size to their own width, never to the grids inside them: an auto-fill grid under a max-width is
     measured as that many columns, which pushed the page past the viewport (min-width: 0 stops it). */
  .page { display: grid; gap: var(--sp-4); min-width: 0; overflow-x: auto; }
  .sub { color: var(--text-muted); font-size: var(--fs-12); }
  .hint { color: var(--text-muted); font-size: var(--fs-12); }
  .altar-row { gap: var(--sp-3) var(--sp-6); }
  .altar-level { display: grid; gap: var(--field-gap); min-width: 0; }
  .field-label { font-size: var(--fs-12); line-height: var(--field-label-h); font-weight: var(--fw-bold); color: var(--text-soft); }
  .level-line { display: flex; align-items: center; gap: var(--sp-3); height: var(--control-h); }
  /* the slider is the part that gives way on a phone, so "of 50" always stays on screen */
  .level-slider { flex: 1 1 14rem; min-width: 4rem; max-width: 14rem; }
  .of { font-size: var(--fs-12); color: var(--text-muted); white-space: nowrap; }
  .tier-field { width: 12rem; }
  .tier-actions { display: flex; gap: var(--sp-2); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  .toolbar { margin-bottom: var(--sp-3); }
  .tool.sort { width: 10rem; }
  .tool.show { width: 9rem; }
  .tool.spec { width: 12rem; }
  .tool.rarity { width: 10rem; }
  .grow { flex: 1; }
  .score-hint { margin: 0 0 var(--sp-3); }
  .pet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); gap: var(--sp-3); min-width: 0; }
  .losses-head { margin: var(--sp-3) 0 var(--sp-1); font-weight: var(--fw-bold); }
  .losses { margin: 0; padding-left: var(--sp-5); }
  .losses .none { color: var(--text-muted); list-style: none; margin-left: calc(-1 * var(--sp-5)); }
</style>
