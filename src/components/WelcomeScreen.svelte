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

  const canCreate = $derived(name.trim().length > 0 && selectedClass !== CHOOSE_CLASS_VALUE);

  function createCharacter() {
    if (!canCreate) return;
    const id = rosterStore.addCharacter(name.trim());
    rosterStore.setCharacterClass(id, selectedClass);
  }

  function onKeydown(e) {
    if (e.key === 'Enter') createCharacter();
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
</style>
