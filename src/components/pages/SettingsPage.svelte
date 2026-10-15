<script>
  /**
   * SettingsPage.svelte - G6 route (`#/settings`): Data (export, the one-step undo of "Update <name>",
   * where the data lives), Preferences (per device, lib/prefs.svelte.js) and the Danger zone. ia.md §5.3, §5.4.
   */
  import Panel from '../ui/Panel.svelte';
  import Button from '../ui/Button.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import Select from '../ui/Select.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import DangerZone from '../settings/DangerZone.svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { importFlow, undoLastUpdate, openImport } from '../../lib/importFlow.svelte.js';
  import { prefs, setPrefs } from '../../lib/prefs.svelte.js';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {} } = $props();

  const current = $derived(rosterStore.current);
</script>

<div class="settings">
  <Panel title="Data">
    <p class="note">
      Your characters are saved in this browser only (local storage). Export keeps a copy you can restore on any device.
    </p>
    <div class="row">
      <Button variant="secondary" onclick={() => rosterStore.exportDownload()}>Export all characters</Button>
      <Button
        variant="secondary"
        disabled={!current}
        reason={current ? '' : 'There is no character to export'}
        onclick={() => rosterStore.exportCharacterDownload()}
      >
        {current ? `Export ${current.name}` : 'Export this character'}
      </Button>
      <Button variant="ghost" onclick={openImport}>Import a file</Button>
    </div>
    {#if importFlow.undo}
      <div class="undo" role="status">
        <span>{importFlow.undo.name} was updated from a game profile.</span>
        <Button variant="ghost" onclick={undoLastUpdate}>Undo update</Button>
      </div>
    {/if}
    {#if !rosterStore.saveState.ok}
      <p class="warn" role="alert">Not saved: {rosterStore.saveState.error}. Export your characters to keep them.</p>
    {/if}
  </Panel>

  <Panel title="Preferences" scopeLabel="This device">
    <div class="prefs">
      <SegmentedControl
        label="Density"
        value={prefs.density}
        options={[
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'compact', label: 'Compact' },
        ]}
        onchange={(v) => setPrefs({ density: v })}
      />
      <Checkbox switch checked={prefs.reduceMotion} label="Reduce motion" onchange={(on) => setPrefs({ reduceMotion: on })} />
      <Select
        label="Default effort for new searches"
        value={prefs.defaultEffort}
        hint="Effort sets only the precision a comparison is resolved to, never a time limit."
        options={[
          { value: 'quick', label: 'Quick' },
          { value: 'standard', label: 'Standard' },
          { value: 'thorough', label: 'Thorough' },
        ]}
        onchange={(v) => setPrefs({ defaultEffort: v })}
      />
    </div>
  </Panel>

  <DangerZone />

  <p class="privacy">100% local: everything runs in your browser and saves to this device only. Nothing is sent to a server.</p>
</div>

<style>
  .settings { display: grid; gap: var(--sp-4); max-width: 44rem; }
  .row { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .note { margin: 0 0 var(--sp-3); font-size: var(--fs-13); color: var(--text-soft); }
  .undo { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); font-size: var(--fs-13); }
  .warn { margin: var(--sp-3) 0 0; font-size: var(--fs-13); color: var(--verdict-down); }
  .prefs { display: grid; gap: var(--sp-4); }
  .privacy { margin: 0; font-size: var(--fs-12); color: var(--text-muted); }
</style>
