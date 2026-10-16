<script>
  /**
   * WelcomeScreen.svelte - G0, the first-run page (ia.md §3.1): shown whenever the roster has no
   * character (first visit, after Reset all data, or a backup with none). "Start manually" (name and
   * class required, level optional) is here; restoring a backup (and, while it is switched on, game-data
   * import) is a link to Settings (`#/settings` works with an empty roster).
   */
  import Panel from './ui/Panel.svelte';
  import Select from './ui/Select.svelte';
  import NumberField from './ui/NumberField.svelte';
  import Button from './ui/Button.svelte';
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { CLASSES, classLabel, MAX_PLAYER_LEVEL } from '../lib/game/classes.js';
  import { requestImportFocus } from '../lib/importFlow.svelte.js';
  import { prefs } from '../lib/prefs.svelte.js';

  let name = $state('');
  let selectedClass = $state('');
  let level = $state(null);

  const missing = $derived([name.trim() ? null : 'a name', selectedClass ? null : 'a class'].filter(Boolean));
  const need = $derived(`Add ${missing.join(' and ')}`);
  const canCreate = $derived(missing.length === 0);

  function createCharacter() {
    if (!canCreate) return;
    rosterStore.addCharacter(name.trim(), selectedClass);
    if (level != null) rosterStore.setCharacterLevel(level);
  }

  function onSubmit(e) {
    e.preventDefault();
    createCharacter();
  }
</script>

<main id="main" class="welcome-shell" tabindex="-1">
  <div class="welcome-card">
    <header class="hero">
      <div class="brand">ELDARYN<br />WORKSHOP</div>
      <h1>Welcome</h1>
      <p class="subtitle">{prefs.showImport ? 'Bring in your character, or start from scratch.' : 'Create your character to get started.'} Everything stays on this device.</p>
    </header>

    <p class="import-link" data-testid="welcome-import-link">
      {#if prefs.showImport}
        Have a game profile or a backup? <a href="#/settings" onclick={requestImportFocus}>Import it in Settings → Advanced</a>.
      {:else}
        Have a backup from this app? <a href="#/settings" onclick={requestImportFocus}>Restore it in Settings</a>.
      {/if}
    </p>

    <div class="secondary">
      <Panel title="Start manually">
        <form class="manual" onsubmit={onSubmit} aria-label="New character">
          <label class="field">
            <span>Character name</span>
            <input type="text" placeholder="Character name" bind:value={name} />
          </label>
          <Select
            label="Class"
            bind:value={selectedClass}
            options={[{ value: '', label: 'Choose class...' }, ...CLASSES.map((c) => ({ value: c, label: classLabel(c) }))]}
          />
          <NumberField label="Level (optional)" bind:value={level} nullable min={1} max={MAX_PLAYER_LEVEL} />
          <Button variant="primary" type="submit" disabled={!canCreate} reason={canCreate ? '' : need}>
            {canCreate ? 'Get started' : need}
          </Button>
        </form>
      </Panel>
    </div>

    <p class="privacy-note">
      100% local: everything runs in your browser and saves to this device only. No data or telemetry is ever sent to a server.
    </p>
  </div>
</main>

<style>
  .welcome-shell {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-6);
    background: var(--surface-0);
  }
  .welcome-card {
    width: 100%;
    max-width: 44rem;
    display: grid;
    gap: var(--sp-4);
  }
  .hero { display: grid; gap: var(--sp-2); }
  .brand {
    font-family: var(--font-display);
    font-weight: var(--fw-bold);
    font-size: var(--fs-12);
    letter-spacing: 0.18em;
    color: var(--brass-400);
    line-height: 1.4;
  }
  h1 { margin: 0; font-family: var(--font-display); font-size: var(--fs-28, 28px); }
  .subtitle { margin: 0; font-size: var(--fs-13); color: var(--text-soft); }
  .secondary { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: var(--sp-4); }
  .manual { display: grid; gap: var(--sp-3); }
  .field { display: grid; gap: 4px; font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .field input { min-height: var(--control-h); }
  .import-link { margin: 0; font-size: var(--fs-13); color: var(--text-soft); }
  .muted { margin: 0 0 var(--sp-3); font-size: var(--fs-12); color: var(--text-muted); }
  .privacy-note { margin: 0; font-size: var(--fs-12); color: var(--text-muted); text-align: center; }
</style>
