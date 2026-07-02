<script>
  /**
   * MountSelection.svelte - owned Mounts (character-scoped, one active/
   * "riding" at a time). Each mount card contributes only Base HP%/Base
   * ATK% - all other stats come from equipped Mount Glyphs (GlyphInventory),
   * not the mount itself (confirmed from in-game screenshots).
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { RARITIES } from '../lib/constants.js';
  import { formatPct, parsePct } from '../lib/format.js';
  import ConfirmButton from './ConfirmButton.svelte';

  let newName = $state('');
  let newRarity = $state(RARITIES[0]);

  const mounts = $derived(rosterStore.current.sources.mounts);

  function addMount() {
    rosterStore.addMount(newName.trim() || 'New Mount', newRarity);
    newName = '';
  }
</script>

<div class="mount-selection">
  <div class="add-form">
    <input type="text" placeholder="Mount name" aria-label="Mount name" bind:value={newName} />
    <select aria-label="Rarity" bind:value={newRarity}>
      {#each RARITIES as r (r)}<option value={r}>{r}</option>{/each}
    </select>
    <button type="button" onclick={addMount}>Add Mount</button>
  </div>

  {#if mounts.entries.length === 0}
    <p class="empty-hint">No mounts added yet.</p>
  {:else}
    <ul class="entry-list">
      {#each mounts.entries as mount (mount.id)}
        <li class:selected={mounts.activeId === mount.id}>
          <label class="active-radio">
            <input
              type="radio"
              name="active-mount"
              checked={mounts.activeId === mount.id}
              onchange={() => rosterStore.setActiveMount(mount.id)}
            />
            Riding
          </label>
          <input
            type="text"
            class="row-name"
            value={mount.name}
            onblur={(e) => rosterStore.updateMount(mount.id, 'name', e.target.value)}
          />
          <select value={mount.rarity} onchange={(e) => rosterStore.updateMount(mount.id, 'rarity', e.target.value)}>
            {#each RARITIES as r (r)}<option value={r}>{r}</option>{/each}
          </select>
          <label class="base-stat">
            Base HP%
            <input
              type="text"
              value={formatPct(mount.baseHpPct)}
              onblur={(e) => rosterStore.updateMount(mount.id, 'baseHpPct', parsePct(e.target.value))}
            />
          </label>
          <label class="base-stat">
            Base ATK%
            <input
              type="text"
              value={formatPct(mount.baseAtkPct)}
              onblur={(e) => rosterStore.updateMount(mount.id, 'baseAtkPct', parsePct(e.target.value))}
            />
          </label>
          <ConfirmButton
            label="Remove"
            confirmLabel="Confirm remove"
            prompt={`Remove "${mount.name}"?`}
            onConfirm={() => rosterStore.removeMount(mount.id)}
          />
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .add-form {
    display: flex;
    gap: var(--space-2, 0.5rem);
    margin-bottom: var(--space-4, 1rem);
    flex-wrap: wrap;
  }
  .entry-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 0.4rem);
  }
  .entry-list li {
    display: flex;
    align-items: center;
    gap: var(--space-2, 0.5rem);
    padding: var(--space-2, 0.4rem);
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius, 4px);
    flex-wrap: wrap;
  }
  .entry-list li.selected {
    border-color: var(--color-accent, #7aa2f7);
  }
  .active-radio {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    color: var(--color-muted, #999);
    white-space: nowrap;
  }
  .row-name {
    flex: 1;
    min-width: 6rem;
  }
  .base-stat {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    color: var(--color-muted, #999);
  }
  .base-stat input {
    width: 4rem;
  }
  .empty-hint {
    color: var(--color-muted, #999);
  }
</style>
