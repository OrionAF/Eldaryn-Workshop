<script>
  /**
   * Sidebar.svelte - the left rail. Replaces TopBar.svelte + the old
   * top-level Tabs strip. Owns navigation (Preset screens + Character
   * screens), character management (switch/add/rename/delete/class),
   * Export/Import, and the hard-reset entry point (was TopBar's ⚙ ->
   * SettingsPanel) - everything that isn't screen content lives here now.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { CLASSES } from '../lib/constants.js';
  import ConfirmButton from './ConfirmButton.svelte';
  import SettingsPanel from './SettingsPanel.svelte';

  let { activeScreen, onSelectScreen, onStatus } = $props();

  const PRESET_NAV = [
    { id: 'presets', label: 'Presets', color: 'presets' },
    { id: 'drop', label: 'Drop Check', color: 'drop' },
    { id: 'gear', label: 'Gear Loadouts', color: 'gear' },
    { id: 'talents', label: 'Talent Sets', color: 'talents' },
    { id: 'pets', label: 'Pets', color: 'pets' },
    { id: 'relics', label: 'Relics', color: 'relics' },
  ];

  const CHARACTER_NAV = [
    { id: 'mounts', label: 'Mount & Glyphs', color: 'mounts' },
    { id: 'awakening', label: 'Awakening', color: 'awakening' },
    { id: 'transcendence', label: 'Transcendence', color: 'transcendence' },
  ];

  const CHOOSE_CLASS_VALUE = '__none__';

  let charPickerOpen = $state(false);
  let newCharacterOpen = $state(false);
  let newCharacterName = $state('');
  let editingCharacterId = $state(null);
  let editName = $state('');
  let importError = $state('');
  let fileInput = $state();
  let settingsOpen = $state(false);

  function openCharacterEdit(c) {
    editingCharacterId = c.id;
    editName = c.name;
  }

  function confirmRename() {
    rosterStore.renameCharacter(editingCharacterId, editName);
    editingCharacterId = null;
  }

  function onClassChange(id, e) {
    const value = e.target.value;
    rosterStore.setCharacterClass(id, value === CHOOSE_CLASS_VALUE ? null : value);
  }

  function deleteCharacter(id) {
    rosterStore.deleteCharacter(id);
    editingCharacterId = null;
  }

  function selectCharacter(id) {
    rosterStore.selectCharacter(id);
    charPickerOpen = false;
    editingCharacterId = null;
    onStatus?.(`Switched to ${rosterStore.current.name}`);
  }

  function confirmNewCharacter() {
    if (newCharacterName.trim()) {
      rosterStore.addCharacter(newCharacterName.trim());
    }
    newCharacterOpen = false;
    newCharacterName = '';
  }

  function onExport() {
    rosterStore.exportDownload();
  }

  function onImportClick() {
    importError = '';
    fileInput?.click();
  }

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
    e.target.value = '';
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      rosterStore.importFromJson(text);
      importError = '';
    } catch {
      importError = 'Import failed: not a valid roster file.';
    }
  }

  function selectScreen(id) {
    onSelectScreen(id);
  }
</script>

<nav class="sidebar" aria-label="Main navigation">
  <div class="brand">ELDARYN<br />WORKSHOP</div>

  <div class="nav-group">
    <div class="group-label">Preset</div>
    {#each PRESET_NAV as item (item.id)}
      <button
        type="button"
        class="nav-item"
        class:active={activeScreen === item.id}
        style={`--item-color: var(--nav-${item.color}); --item-color-light: var(--nav-${item.color}-light); --item-color-tint: var(--nav-${item.color}-tint)`}
        onclick={() => selectScreen(item.id)}
      >
        <span class="dot"></span>
        {item.label}
      </button>
    {/each}
  </div>

  <div class="nav-group">
    <div class="group-label">Character</div>
    {#each CHARACTER_NAV as item (item.id)}
      <button
        type="button"
        class="nav-item"
        class:active={activeScreen === item.id}
        style={`--item-color: var(--nav-${item.color}); --item-color-light: var(--nav-${item.color}-light); --item-color-tint: var(--nav-${item.color}-tint)`}
        onclick={() => selectScreen(item.id)}
      >
        <span class="dot"></span>
        {item.label}
      </button>
    {/each}
  </div>

  <div class="sidebar-bottom">
    <button type="button" class="change-character" onclick={() => (charPickerOpen = !charPickerOpen)}>
      ⇄ Change character
    </button>

    {#if charPickerOpen}
      <div class="character-picker" role="group" aria-label="Characters">
        {#each rosterStore.roster.characters as c (c.id)}
          <div class="character-row">
            <button
              type="button"
              class="character-button"
              class:active={c.id === rosterStore.current.id}
              onclick={() => selectCharacter(c.id)}
            >
              <span class="character-name">{c.name}</span>
              <span class="character-sub">{c.class || 'No class'} · {c.presets.length} preset{c.presets.length === 1 ? '' : 's'}</span>
            </button>
            <button type="button" class="edit-btn" aria-label={`Edit ${c.name}`} onclick={() => openCharacterEdit(c)}>✎</button>
          </div>
          {#if editingCharacterId === c.id}
            <div class="edit-panel">
              <input type="text" bind:value={editName} />
              <button type="button" onclick={confirmRename}>Rename</button>
              <label class="class-select">
                Class
                <select value={c.class ?? CHOOSE_CLASS_VALUE} onchange={(e) => onClassChange(c.id, e)}>
                  <option value={CHOOSE_CLASS_VALUE}>Choose class...</option>
                  {#each CLASSES as cls (cls)}<option value={cls}>{cls}</option>{/each}
                </select>
              </label>
              <ConfirmButton
                label="Delete"
                confirmLabel="Confirm delete"
                prompt={`Delete "${c.name}"?`}
                disabled={rosterStore.roster.characters.length <= 1}
                onConfirm={() => deleteCharacter(c.id)}
              />
              <button type="button" onclick={() => (editingCharacterId = null)}>Close</button>
            </div>
          {/if}
        {/each}

        {#if !newCharacterOpen}
          <button type="button" class="new-character-btn" onclick={() => (newCharacterOpen = true)}>+ New Character</button>
        {:else}
          <div class="edit-panel">
            <input type="text" placeholder="Character name" bind:value={newCharacterName} />
            <button type="button" onclick={confirmNewCharacter}>Create</button>
            <button type="button" onclick={() => (newCharacterOpen = false)}>Cancel</button>
          </div>
        {/if}
      </div>
    {/if}

    <div class="io-row">
      <button type="button" onclick={onExport}>Export</button>
      <button type="button" onclick={onImportClick}>Import</button>
      <input type="file" accept="application/json" bind:this={fileInput} onchange={onImportFile} hidden />
    </div>
    {#if importError}
      <p class="import-error" role="alert">{importError}</p>
    {/if}

    <button type="button" class="reset-toggle" onclick={() => (settingsOpen = !settingsOpen)}>Reset all data</button>
    <SettingsPanel open={settingsOpen} onClose={() => (settingsOpen = false)} />
  </div>
</nav>

<style>
  .sidebar {
    width: 212px;
    background: var(--color-rail);
    border-right: 1px solid var(--color-border-hairline);
    padding: 18px 12px;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    height: 100%;
    overflow-y: auto;
  }
  .brand {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.18em;
    color: var(--color-gold-light);
    line-height: 1.4;
    padding: 0 var(--space-2);
  }
  .nav-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group-label {
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-dim);
    padding: 0 var(--space-2);
    margin-bottom: 4px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    text-align: left;
    padding: 8px 10px;
    border-radius: 7px;
    border: none;
    border-left: 3px solid transparent;
    background: transparent;
    color: var(--color-muted);
    font-size: 12.5px;
    font-weight: 500;
  }
  .nav-item .dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--item-color);
    flex-shrink: 0;
  }
  .nav-item:hover {
    color: var(--item-color-light);
  }
  .nav-item.active {
    border-left-color: var(--item-color);
    background: var(--item-color-tint);
    color: var(--item-color-light);
    font-weight: 600;
  }
  .sidebar-bottom {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .change-character {
    width: 100%;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--color-gold-light);
    border: 1px solid var(--color-border-strong);
    border-radius: 7px;
    background: transparent;
  }
  .character-picker {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: 40vh;
    overflow-y: auto;
  }
  .character-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .character-button {
    flex: 1;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-radius: 7px;
    border: 1px solid var(--color-border);
    background: var(--color-field);
    padding: 6px 8px;
  }
  .character-button.active {
    border-color: var(--color-gold);
    background: var(--color-gold-tint);
  }
  .character-name {
    font-size: 12px;
    font-weight: 600;
  }
  .character-sub {
    font-size: 10.5px;
    color: var(--color-muted);
  }
  .edit-btn {
    flex-shrink: 0;
    padding: 0.3rem 0.5rem;
  }
  .edit-panel {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    align-items: center;
  }
  .edit-panel input[type='text'] {
    flex: 1;
    min-width: 6rem;
  }
  .class-select {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--color-muted);
  }
  .new-character-btn {
    width: 100%;
  }
  .io-row {
    display: flex;
    gap: var(--space-2);
  }
  .io-row button {
    flex: 1;
    font-size: 11px;
    color: var(--color-muted);
    border-color: var(--color-border);
  }
  .import-error {
    color: var(--color-danger);
    font-size: 0.75rem;
    margin: 0;
  }
  .reset-toggle {
    font-size: 11px;
    color: var(--color-downgrade);
    border-color: var(--color-border);
    background: transparent;
  }
</style>
