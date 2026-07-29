<script>
  /**
   * StoneForm.svelte - the dual-mode left-column panel for Socketed Stones
   * (docs/Reference/Notes/socketed-stones-design.md §4/§6). Two modes, switched purely by
   * whether `selectedStoneId` resolves to a real stone in the inventory:
   *
   *   Add mode (default, nothing selected in StoneGrid): pick a type, fill in
   *   that type's bonus-stat rows (fixed PVP rows autofilled for Eldaryn/
   *   Mythic, a PVP-attack-XOR-defense picker for Azure, free dropdowns
   *   everywhere else - see stonesData.js's STONE_TYPES) + Quality, then Add.
   *
   *   Details mode (a StoneGrid tile is selected): shows that stone's type/
   *   rolled stats read-only (type + which stats were rolled are locked in at
   *   creation - only Quality and each value can be edited), plus Save,
   *   Remove, and Socket Stone/Unsocket (targets whichever slot is currently
   *   selected in the silhouette above this panel).
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { STAT_FIELDS, SLOTS, fieldsForTab } from '../lib/constants.js';
  import { formatStat, parseStat } from '../lib/format.js';
  import { STONE_TYPES, stoneTypeDef } from '../lib/stonesData.js';
  import ConfirmButton from './ConfirmButton.svelte';

  let { character, loadoutIndex, selectedSlot, selectedStoneId, onDeselect } = $props();

  const PVP_KEYS = ['pvp_attack', 'pvp_defense'];
  const CORE_KEYS = ['attack', 'health']; // never a stone's free bonus stat (their % variants are allowed)

  function statLabel(key) {
    return STAT_FIELDS.find((f) => f.key === key)?.label ?? key;
  }

  /** "L1: Head | L2: No" - positionally Loadout 1 | Loadout 2 (same format as StoneGrid). */
  function socketStatus(stoneId) {
    return character.loadouts
      .map((l, i) => `L${i + 1}: ${SLOTS.find((slot) => l.socketedStones[slot] === stoneId) || 'No'}`)
      .join(' | ');
  }

  const selectedStone = $derived(character.stoneInventory.find((s) => s.id === selectedStoneId) || null);
  const isSocketedHere = $derived(selectedStone && character.loadouts[loadoutIndex].socketedStones[selectedSlot] === selectedStone.id);

  // --- Add mode state ---
  let newType = $state(STONE_TYPES[0].key);
  const newDef = $derived(stoneTypeDef(newType));
  let newQuality = $state('');
  let newAzureChoice = $state('pvp_attack');
  let newAzureChoiceValue = $state('');
  let newPvpAttackValue = $state('');
  let newPvpDefenseValue = $state('');
  let newFreeKeys = $state([]);
  let newFreeValues = $state([]);

  // Resets the free/fixed drafts whenever the chosen type changes - a different
  // type's row shape (fixed-row count, free-row count) makes stale drafts meaningless.
  $effect(() => {
    newFreeKeys = Array(newDef.freeCount).fill('');
    newFreeValues = Array(newDef.freeCount).fill('');
    newPvpAttackValue = '';
    newPvpDefenseValue = '';
    newAzureChoice = 'pvp_attack';
    newAzureChoiceValue = '';
  });

  function freeOptions(rowIndex) {
    const chosenElsewhere = newFreeKeys.filter((k, i) => i !== rowIndex && k);
    return fieldsForTab('gear', character.class).filter(
      (f) => !PVP_KEYS.includes(f.key) && !CORE_KEYS.includes(f.key) && !chosenElsewhere.includes(f.key)
    );
  }

  const canAdd = $derived(newFreeKeys.every((k) => k));

  function submitAdd() {
    if (!canAdd) return;
    const rolledKeys = [];
    const stats = {};
    if (newDef.fixedChoice) {
      rolledKeys.push(newAzureChoice);
      stats[newAzureChoice] = parseStat(newAzureChoice, newAzureChoiceValue);
    }
    if (newDef.fixedKeys.includes('pvp_attack')) {
      rolledKeys.push('pvp_attack');
      stats.pvp_attack = parseStat('pvp_attack', newPvpAttackValue);
    }
    if (newDef.fixedKeys.includes('pvp_defense')) {
      rolledKeys.push('pvp_defense');
      stats.pvp_defense = parseStat('pvp_defense', newPvpDefenseValue);
    }
    for (let i = 0; i < newDef.freeCount; i++) {
      const key = newFreeKeys[i];
      rolledKeys.push(key);
      stats[key] = parseStat(key, newFreeValues[i]);
    }
    rosterStore.addStone({ type: newType, quality: parseInt(newQuality, 10) || 0, rolledKeys, stats });
    newQuality = '';
  }

  // --- Details mode state ---
  let editQuality = $state('');
  let editValues = $state({});
  let syncedForId = null;

  $effect(() => {
    if (selectedStoneId === syncedForId) return; // resync only when the selection itself changes, not on every stats edit
    syncedForId = selectedStoneId;
    if (!selectedStone) return;
    editQuality = String(selectedStone.quality);
    const vals = {};
    for (const key of selectedStone.rolledKeys) vals[key] = formatStat(key, selectedStone.stats[key]);
    editValues = vals;
  });

  function saveEdit() {
    if (!selectedStone) return;
    const stats = {};
    for (const key of selectedStone.rolledKeys) stats[key] = parseStat(key, editValues[key]);
    rosterStore.updateStone(selectedStone.id, { quality: Math.max(0, parseInt(editQuality, 10) || 0), stats });
  }

  function toggleSocket() {
    if (!selectedStone) return;
    if (isSocketedHere) {
      rosterStore.unsocketStone(loadoutIndex, selectedSlot);
    } else {
      rosterStore.socketStone(loadoutIndex, selectedSlot, selectedStone.id);
    }
  }

  function handleRemove() {
    if (!selectedStone) return;
    rosterStore.removeStone(selectedStone.id);
    onDeselect?.();
  }
</script>

<div class="stone-form">
  {#if selectedStone}
    {@const def = stoneTypeDef(selectedStone.type)}
    <h3 class="subheading" style="color: {def?.color}">{def?.label ?? selectedStone.type}</h3>

    <label class="field">
      <span class="micro-label">Quality</span>
      <input type="text" inputmode="numeric" aria-label="Quality" bind:value={editQuality} />
    </label>

    {#each selectedStone.rolledKeys as key (key)}
      <label class="field">
        <span class="micro-label">{statLabel(key)}</span>
        <input
          type="text"
          inputmode="decimal"
          aria-label={statLabel(key)}
          value={editValues[key] ?? ''}
          oninput={(e) => (editValues[key] = e.target.value)}
        />
      </label>
    {/each}

    <p class="socket-status">Socketed: {socketStatus(selectedStone.id)}</p>

    <div class="actions">
      <button type="button" class="btn-gold" onclick={saveEdit}>Save</button>
      <button type="button" class="btn-ghost" onclick={toggleSocket}>{isSocketedHere ? 'Unsocket' : 'Socket Stone'}</button>
      <ConfirmButton class="btn-danger" label="Remove" confirmLabel="Confirm remove" prompt={`Remove this ${def?.label ?? selectedStone.type}?`} onConfirm={handleRemove} />
    </div>
    <p class="hint">Click this stone again in the inventory to unselect it and add a new stone.</p>
  {:else}
    <h3 class="subheading">Add Stones to Inventory</h3>

    <label class="field">
      <span class="micro-label">Type</span>
      <select aria-label="Stone type" bind:value={newType}>
        {#each STONE_TYPES as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
      </select>
    </label>

    {#if newDef.fixedChoice}
      <label class="field">
        <span class="micro-label">PVP Stat</span>
        <select aria-label="PVP stat" bind:value={newAzureChoice}>
          <option value="pvp_attack">PVP Attack</option>
          <option value="pvp_defense">PVP Defense</option>
        </select>
      </label>
      <label class="field">
        <span class="micro-label">Value</span>
        <input type="text" inputmode="decimal" aria-label="PVP stat value" bind:value={newAzureChoiceValue} />
      </label>
    {/if}

    {#if newDef.fixedKeys.includes('pvp_attack')}
      <label class="field">
        <span class="micro-label">PVP Attack</span>
        <input type="text" inputmode="decimal" aria-label="PVP Attack value" bind:value={newPvpAttackValue} />
      </label>
    {/if}
    {#if newDef.fixedKeys.includes('pvp_defense')}
      <label class="field">
        <span class="micro-label">PVP Defense</span>
        <input type="text" inputmode="decimal" aria-label="PVP Defense value" bind:value={newPvpDefenseValue} />
      </label>
    {/if}

    {#each newFreeKeys as _, i (i)}
      <label class="field">
        <span class="micro-label">Bonus Stat {i + 1}</span>
        <select aria-label={`Bonus stat ${i + 1}`} value={newFreeKeys[i]} onchange={(e) => (newFreeKeys[i] = e.target.value)}>
          <option value="">Select a stat</option>
          {#each freeOptions(i) as f (f.key)}<option value={f.key}>{f.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span class="micro-label">Value</span>
        <input
          type="text"
          inputmode="decimal"
          aria-label={`Bonus stat ${i + 1} value`}
          value={newFreeValues[i]}
          oninput={(e) => (newFreeValues[i] = e.target.value)}
        />
      </label>
    {/each}

    <label class="field">
      <span class="micro-label">Quality</span>
      <input type="text" inputmode="numeric" placeholder="e.g. 34" aria-label="Quality" bind:value={newQuality} />
    </label>

    <button type="button" class="btn-gold" disabled={!canAdd} onclick={submitAdd}>Add to Inventory</button>
  {/if}
</div>

<style>
  .stone-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .field input,
  .field select {
    width: 100%;
  }
  .socket-status {
    font-weight: 700;
    font-size: 10.5px;
    color: var(--color-ink);
    margin: 0;
  }
  .hint {
    font-size: 10.5px;
    color: var(--color-dim);
    margin: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
</style>
