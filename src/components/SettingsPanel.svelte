<script>
  /**
   * SettingsPanel.svelte - the Settings card, shown via Sidebar's "Settings"
   * trigger. Currently the Danger Zone and nothing else - it exists as a home
   * for destructive actions that should not sit in the nav rail:
   *  - Reset all data: two-step, type the exact word RESET - a plain
   *    "are you sure?" click is too easy to fat-finger for something this
   *    destructive and irreversible (wipes every character, no undo).
   *  - Reset initial linking simulations: two-click confirm (ConfirmButton
   *    bar - destructive but narrow); clears the current character's
   *    linking-simulation outcome so the Dashboard's setup section returns.
   */
  import { clearAllData } from '../lib/storage.js';
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import ConfirmButton from './ConfirmButton.svelte';

  let { open, onClose, onStatus } = $props();

  let confirming = $state(false);
  let confirmText = $state('');

  const RESET_WORD = 'RESET';

  function startReset() {
    confirming = true;
    confirmText = '';
  }

  function cancelReset() {
    confirming = false;
    confirmText = '';
  }

  function doReset() {
    if (confirmText !== RESET_WORD) return;
    clearAllData();
    location.reload();
  }

  function onConfirmKeydown(e) {
    if (e.key === 'Enter') doReset();
  }

  function resetLinkingSim() {
    rosterStore.resetLinkingSim();
    onStatus?.(`Linking simulations reset for ${rosterStore.current.name} — the Dashboard setup returns`);
  }

  function close() {
    confirming = false;
    confirmText = '';
    onClose();
  }
</script>

{#if open}
  <div class="inline-panel settings-panel" role="group" aria-label="Settings">
    <div class="settings-head">
      <span class="micro-label">Settings</span>
      <button type="button" onclick={close}>Close</button>
    </div>
    <p class="placeholder">More settings coming soon.</p>

    <div class="danger-zone" role="group" aria-label="Danger Zone">
      <span class="micro-label danger-label">Danger Zone</span>

      <div class="danger-row">
        <ConfirmButton
          label="Reset initial linking simulations"
          confirmLabel="Confirm reset"
          prompt="Clears this character's linking-simulation outcome"
          onConfirm={resetLinkingSim}
          class="btn-danger"
        />
      </div>

      <div class="danger-row">
        {#if !confirming}
          <button type="button" class="reset-trigger" onclick={startReset}>Reset all data</button>
        {:else}
          <span class="reset-warning">
            This permanently deletes every character, gear, and talent build. Type {RESET_WORD} to confirm:
          </span>
          <input
            type="text"
            placeholder={RESET_WORD}
            bind:value={confirmText}
            onkeydown={onConfirmKeydown}
            aria-label="Type RESET to confirm"
          />
          <button type="button" onclick={doReset} disabled={confirmText !== RESET_WORD}>Confirm reset</button>
          <button type="button" onclick={cancelReset}>Cancel</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-top: 0.5rem;
  }
  .settings-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }
  .placeholder {
    color: var(--color-muted);
    font-size: 0.8rem;
    margin: 0;
  }
  .danger-zone {
    border: 1px solid var(--color-danger, #e05252);
    border-radius: var(--radius-panel, 8px);
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .danger-label {
    color: var(--color-danger, #e05252);
  }
  .danger-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .reset-trigger {
    color: var(--color-danger, #e05252);
  }
  .reset-warning {
    color: var(--color-danger, #e05252);
    font-size: 0.85rem;
    max-width: 24rem;
  }
</style>
