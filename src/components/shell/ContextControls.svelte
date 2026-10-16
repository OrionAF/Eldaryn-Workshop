<script>
  /**
   * ContextControls.svelte - G2 (ia.md §2.1): the one place the active preset and the realm are
   * changed. Both are character-wide and persisted. The realm control is enabled only once Oblivion
   * is unlocked. Changes are announced in a polite live region.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import Select from '../ui/Select.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import Tooltip from '../ui/Tooltip.svelte';

  const character = $derived(rosterStore.current);
  const unlocked = $derived(character.oblivion?.unlocked === true);
  const realm = $derived(unlocked && character.oblivion?.activeRealm === 'oblivion' ? 'oblivion' : 'base');
  const presetOptions = $derived(character.presets.map((p) => ({ value: p.id, label: p.name })));

  let announcement = $state('');

  function pickPreset(id) {
    rosterStore.setActivePreset(id);
    announcement = `Active preset: ${character.presets.find((p) => p.id === id)?.name ?? ''}`;
  }

  function pickRealm(value) {
    if (rosterStore.setActiveRealm(value)) announcement = `Realm: ${value === 'oblivion' ? 'Oblivion' : 'Base'}`;
  }
</script>

<div class="context">
  <div class="preset" id="context-preset">
    <Select label="Preset" options={presetOptions} value={character.activePresetId} onchange={pickPreset} />
  </div>
  <div class="realm">
    <span class="micro-label">Realm</span>
    {#if unlocked}
      <SegmentedControl
        label="Realm"
        value={realm}
        options={[{ value: 'base', label: 'Base' }, { value: 'oblivion', label: 'Oblivion' }]}
        onchange={pickRealm}
      />
    {:else}
      <Tooltip text="Unlock Oblivion on Overview">
        <SegmentedControl
          label="Realm"
          value="base"
          options={[{ value: 'base', label: 'Base' }, { value: 'oblivion', label: 'Oblivion', disabled: true }]}
        />
      </Tooltip>
    {/if}
  </div>
  <span class="sr-only" role="status" aria-live="polite">{announcement}</span>
</div>

<style>
  .context { display: flex; align-items: end; gap: var(--sp-4); min-width: 0; }
  .preset { min-width: 160px; max-width: 240px; }
  .realm { display: grid; gap: 4px; }
  .realm .micro-label { font-size: var(--fs-12); letter-spacing: 0; text-transform: none; }
  .sr-only { position: absolute; top: 0; left: 0; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @media (max-width: 700px) {
    .realm .micro-label { display: none; }
    /* the labels go (the controls keep their accessible names) so both fit one 44px row under the first */
    .preset :global(label) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .context { align-items: center; }
    /* the preset name must stay readable: a floor wide enough for a few characters, then it grows */
    .context { flex: 1 1 auto; }
    .preset { min-width: 7rem; flex: 1 1 7rem; max-width: none; }
  }
</style>
