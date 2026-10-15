<script>
  /**
   * SaveState.svelte - top-bar save indicator (design-system §4.1). Bound to `rosterStore.saveState`:
   * "Saved" with the last good save time on hover, or "Not saved" (sticky, down colour) with the
   * storage error when `saveRoster` failed. Persisting is synchronous, so there is no "Saving..." state.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';

  const state = $derived(rosterStore.saveState);
  const when = $derived(state.at ? new Date(state.at).toLocaleTimeString() : null);
  const title = $derived(
    state.ok
      ? when
        ? `Last saved ${when}${state.trimmed || state.dropped ? ` (older run history was trimmed: ${state.trimmed + state.dropped})` : ''}`
        : 'Changes save to this device as you edit'
      : `Storage unavailable: ${state.error ?? 'unknown error'}${when ? `. Last good save ${when}` : ''}`,
  );
</script>

<span class="save" class:bad={!state.ok} role="status" {title} data-testid="save-state">
  <span class="dot" aria-hidden="true"></span>
  <span class="word">{state.ok ? 'Saved' : 'Not saved'}</span>
</span>

<style>
  .save { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-12); color: var(--text-soft); white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--verdict-up); }
  .bad { color: var(--verdict-down); font-weight: var(--fw-bold); }
  .bad .dot { background: var(--verdict-down); }
  @media (max-width: 1100px) {
    .word { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .bad .word { position: static; width: auto; height: auto; clip-path: none; }
  }
</style>
