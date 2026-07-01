<script>
  /**
   * SettingsPanel.svelte - the Speed/CritMult additive vs. multiplicative
   * stacking toggle (handoff open question §10). Shown via TopBar's header
   * trigger.
   */
  import { settingsStore } from '../lib/settingsStore.svelte.js';

  let { open, onClose } = $props();
</script>

{#if open}
  <div class="inline-panel settings-panel" role="group" aria-label="Settings">
    <label>
      <input
        type="checkbox"
        checked={settingsStore.speedCritMultMultiplicative}
        onchange={(e) => settingsStore.setMultiplicative(e.target.checked)}
      />
      Speed / Crit Mult stack multiplicatively (default: additive)
    </label>
    <button type="button" onclick={onClose}>Close</button>
  </div>
{/if}

<style>
  .settings-panel {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
</style>
