<script>
  /**
   * Tabs.svelte - controlled tab strip. Purely presentational: the active
   * tab is owned by the parent (App.svelte), not persisted - it's UI-only
   * view state, not part of the Roster.
   */
  let { tabs, active, onSelect } = $props();
</script>

<div class="tabs" role="tablist">
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      role="tab"
      aria-selected={active === tab.id}
      class:active={active === tab.id}
      onclick={() => onSelect(tab.id)}
    >
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--color-border, #444);
  }
  .tabs button {
    padding: 0.5rem 1rem;
    border: none;
    background: none;
    cursor: pointer;
    border-bottom: 2px solid transparent;
  }
  .tabs button.active {
    border-bottom-color: var(--color-accent, #7aa2f7);
    font-weight: 600;
  }
</style>
