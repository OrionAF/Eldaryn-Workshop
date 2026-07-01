<script>
  /**
   * TopBar.svelte - character dropdown (+ New Character, rename/delete via
   * edit icon) and Export/Import. Grilled decision: Export/Import are the
   * storage.js JSON backup pair, layered on top of (not replacing) the
   * silent auto-save every rosterStore mutator already performs.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { CLASSES } from '../lib/constants.js';
  import SettingsPanel from './SettingsPanel.svelte';
  import ConfirmButton from './ConfirmButton.svelte';

  const CHOOSE_CLASS_VALUE = '__none__';

  const NEW_CHARACTER_VALUE = '__new__';

  let newCharacterOpen = $state(false);
  let newCharacterName = $state('');
  let editOpen = $state(false);
  let editName = $state('');
  let importError = $state('');
  let fileInput = $state();
  let settingsOpen = $state(false);

  function onSelectChange(e) {
    const value = e.target.value;
    if (value === NEW_CHARACTER_VALUE) {
      newCharacterOpen = true;
      newCharacterName = '';
      e.target.value = rosterStore.current.id; // stay on current until confirmed
    } else {
      rosterStore.selectCharacter(value);
    }
  }

  function confirmNewCharacter() {
    if (newCharacterName.trim()) {
      rosterStore.addCharacter(newCharacterName.trim());
    }
    newCharacterOpen = false;
    newCharacterName = '';
  }

  function cancelNewCharacter() {
    newCharacterOpen = false;
    newCharacterName = '';
  }

  function openEdit() {
    editName = rosterStore.current.name;
    editOpen = true;
  }

  function confirmRename() {
    rosterStore.renameCharacter(rosterStore.current.id, editName);
    editOpen = false;
  }

  function onClassChange(e) {
    const value = e.target.value;
    // Changing class resets both loadouts' Talents spec/allocation
    // (rosterStore.setCharacterClass) - a different class's specs don't apply.
    rosterStore.setCharacterClass(rosterStore.current.id, value === CHOOSE_CLASS_VALUE ? null : value);
  }

  function closeEdit() {
    editOpen = false;
  }

  function deleteCurrentCharacter() {
    rosterStore.deleteCharacter(rosterStore.current.id);
    editOpen = false;
  }

  function onExport() {
    rosterStore.exportDownload();
  }

  function onImportClick() {
    importError = '';
    fileInput?.click();
  }

  // FileReader, not Blob/File.text() - broader support (still true in some
  // jsdom/test environments, and no downside in real browsers).
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function onImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      rosterStore.importFromJson(text);
      importError = '';
    } catch {
      importError = 'Import failed: not a valid roster file.';
    }
  }
</script>

<div class="top-bar">
  <div class="character-select">
    <select value={rosterStore.current.id} onchange={onSelectChange} aria-label="Select character">
      {#each rosterStore.roster.characters as c (c.id)}
        <option value={c.id}>{c.name}</option>
      {/each}
      <option value={NEW_CHARACTER_VALUE}>+ New Character</option>
    </select>
    <button type="button" onclick={openEdit} aria-label="Rename or delete character" title="Rename or delete character">✎</button>
  </div>

  <div class="top-bar-actions">
    <button type="button" onclick={onExport}>Export</button>
    <button type="button" onclick={onImportClick}>Import</button>
    <input type="file" accept="application/json" bind:this={fileInput} onchange={onImportFile} hidden />
    <button type="button" onclick={() => (settingsOpen = !settingsOpen)} aria-label="Settings" title="Settings">
      ⚙
    </button>
  </div>
</div>

<SettingsPanel open={settingsOpen} onClose={() => (settingsOpen = false)} />

{#if newCharacterOpen}
  <div class="inline-panel" role="group" aria-label="New character">
    <input type="text" placeholder="Character name" bind:value={newCharacterName} />
    <button type="button" onclick={confirmNewCharacter}>Create</button>
    <button type="button" onclick={cancelNewCharacter}>Cancel</button>
  </div>
{/if}

{#if editOpen}
  <div class="inline-panel" role="group" aria-label="Edit character">
    <input type="text" bind:value={editName} />
    <button type="button" onclick={confirmRename}>Rename</button>
    <label class="class-select">
      Class
      <select value={rosterStore.current.class ?? CHOOSE_CLASS_VALUE} onchange={onClassChange}>
        <option value={CHOOSE_CLASS_VALUE}>Choose class...</option>
        {#each CLASSES as c (c)}<option value={c}>{c}</option>{/each}
      </select>
    </label>
    <ConfirmButton
      label="Delete"
      confirmLabel="Confirm delete"
      prompt={`Delete "${rosterStore.current.name}"?`}
      disabled={rosterStore.roster.characters.length <= 1}
      onConfirm={deleteCurrentCharacter}
    />
    <button type="button" onclick={closeEdit}>Close</button>
  </div>
{/if}

{#if importError}
  <p class="import-error" role="alert">{importError}</p>
{/if}

<style>
  .top-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem 1rem;
  }
  .character-select {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0; /* let the select shrink/wrap instead of forcing row overflow */
  }
  .character-select select {
    flex: 1;
    min-width: 0;
    max-width: 24rem;
  }
  .top-bar-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .inline-panel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .import-error {
    color: var(--color-danger, #e05252);
  }
  .class-select {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    color: var(--color-muted, #999);
    white-space: nowrap;
  }
</style>
