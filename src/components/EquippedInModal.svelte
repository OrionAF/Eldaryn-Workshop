<script>
  /**
   * EquippedInModal.svelte - the reverse lookup from a glyph card: which
   * mounts is this glyph currently on? Doubles as an equip control, since the
   * same glyph may sit on any number of mounts at once and toggling from here
   * is quicker than opening each mount's picker.
   *
   * Only owned mounts (star > 0) are listed - an unowned mount has no glyph
   * slots on its card.
   */
  import { rarityClass } from '../lib/constants.js';
  import { mountImage } from '../lib/assets.js';
  import Modal from './Modal.svelte';

  let { open = $bindable(false), glyph, mounts = [], onToggle } = $props();

  const owned = $derived(mounts.filter((m) => m.star > 0));
</script>

<Modal bind:open title={glyph ? 'Which mounts carry this glyph?' : 'Mounts'}>
  {#snippet children()}
    {#if !owned.length}
      <p class="empty">No mounts owned yet — pick a star level on a mount to give it glyph slots.</p>
    {:else}
      <p class="lead">A glyph can sit on any number of mounts at once. Toggle the ones that carry it.</p>
      <ul class="mount-list">
        {#each owned as mount (mount.id)}
          {@const on = (mount.glyphIds || []).includes(glyph?.id)}
          <li>
            <button
              type="button"
              class="mount-option rarity-card {rarityClass(mount.rarity)}"
              class:on
              aria-pressed={on}
              onclick={() => onToggle(mount.id, !on)}
            >
              {#if mountImage(mount.id)}
                <img src={mountImage(mount.id)} alt="" />
              {/if}
              <span class="mount-name">{mount.name}</span>
              <span class="check" aria-hidden="true">{on ? '✓' : ''}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/snippet}
</Modal>

<style>
  .empty,
  .lead {
    color: var(--color-muted);
    font-size: 12px;
    margin: 0;
  }
  .lead {
    margin-bottom: var(--space-3);
  }
  .mount-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--space-2);
  }
  .mount-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: 6px 8px;
    cursor: pointer;
    text-align: left;
    color: var(--color-ink);
  }
  .mount-option.on {
    outline: 2px solid var(--color-gold);
    outline-offset: -2px;
  }
  .mount-option img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    flex: 0 0 auto;
  }
  .mount-name {
    flex: 1;
    font-size: 11.5px;
    color: var(--rarity-fg-strong, var(--color-soft));
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .check {
    color: var(--color-gold);
    flex: 0 0 auto;
  }
</style>
