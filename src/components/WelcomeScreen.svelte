<script>
  /**
   * WelcomeScreen.svelte - first-run landing page. Shown by App.svelte
   * whenever the roster has no characters yet (true first visit, after
   * "Reset all data", or an imported file with zero characters) instead of
   * silently seeding a default "Character 1". Asks for name + class up
   * front so the created character is immediately profileReady - no trip
   * to the sidebar's edit panel required.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { CLASSES } from '../lib/constants.js';

  const CHOOSE_CLASS_VALUE = '__none__';

  let name = $state('');
  let selectedClass = $state(CHOOSE_CLASS_VALUE);
  let importError = $state('');
  let fileInput = $state();

  const canCreate = $derived(name.trim().length > 0 && selectedClass !== CHOOSE_CLASS_VALUE);

  function createCharacter() {
    if (!canCreate) return;
    const id = rosterStore.addCharacter(name.trim());
    rosterStore.setCharacterClass(id, selectedClass);
  }

  function onKeydown(e) {
    if (e.key === 'Enter') createCharacter();
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
</script>

<div class="welcome-shell">
  <div class="welcome-card">
    <div class="brand">ELDARYN<br />WORKSHOP</div>
    <h1>Welcome</h1>
    <p class="subtitle">Create your first character to get started.</p>

    <label class="field">
      Character name
      <input
        type="text"
        placeholder="Character name"
        bind:value={name}
        onkeydown={onKeydown}
      />
    </label>

    <label class="field">
      Class
      <select bind:value={selectedClass}>
        <option value={CHOOSE_CLASS_VALUE}>Choose class...</option>
        {#each CLASSES as cls (cls)}<option value={cls}>{cls}</option>{/each}
      </select>
    </label>

    <button type="button" class="cta" disabled={!canCreate} onclick={createCharacter}>
      Get started
    </button>

    <div class="divider"><span>or</span></div>

    <button type="button" class="import-btn" onclick={onImportClick}>Import from file</button>
    <input type="file" accept="application/json" bind:this={fileInput} onchange={onImportFile} hidden />
    {#if importError}
      <p class="import-error" role="alert">{importError}</p>
    {/if}
    <p class="import-hint">Coming from another device? Import the roster file you exported there.</p>

    <p class="privacy-note">
      🔒 100% local — everything runs in your browser and saves to this device only. No data or
      telemetry is ever sent to a server.
    </p>
  </div>
</div>

<style>
  .welcome-shell {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
  }
  .welcome-card {
    width: 100%;
    max-width: 22rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-field);
  }
  .brand {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.18em;
    color: var(--color-gold);
    line-height: 1.4;
  }
  h1 {
    margin: 0;
    font-size: 20px;
  }
  .subtitle {
    margin: 0;
    font-size: 12.5px;
    color: var(--color-muted);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 11.5px;
    color: var(--color-muted);
  }
  .field input,
  .field select {
    min-height: 44px;
  }
  .cta {
    min-height: 44px;
    font-weight: 600;
    color: var(--color-gold-light);
    border: 1px solid var(--color-gold);
    background: var(--color-gold-tint);
  }
  .cta:disabled {
    opacity: 0.5;
  }
  .divider {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: calc(var(--space-2) * -1) 0;
    font-size: 10.5px;
    color: var(--color-dim);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }
  .import-btn {
    min-height: 44px;
    font-weight: 600;
    font-size: 12.5px;
    color: var(--color-muted);
    border: 1px solid var(--color-border-strong);
    background: transparent;
  }
  .import-error {
    margin: 0;
    color: var(--color-danger);
    font-size: 11px;
    text-align: center;
  }
  .import-hint {
    margin: 0;
    font-size: 10.5px;
    color: var(--color-muted);
    text-align: center;
  }
  .privacy-note {
    margin: 0;
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--color-dim);
    text-align: center;
  }
</style>
