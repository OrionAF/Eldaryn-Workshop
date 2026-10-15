<script>
  /**
   * ActivityDrawer.svelte - G5 (ia.md §1): every status message of the session, newest first, with
   * the time. Opening it marks everything read. Not persisted.
   */
  import { notifications, markAllRead } from '../../lib/notify.svelte.js';
  import Drawer from '../ui/Drawer.svelte';
  import EmptyState from '../ui/EmptyState.svelte';

  let { open = $bindable(false) } = $props();

  const GLYPH = { info: 'ⓘ', success: '✓', warn: '⚠', error: '✕' };
  const entries = $derived([...notifications.log].reverse());

  $effect(() => {
    if (open) markAllRead();
  });
</script>

<Drawer bind:open title="Activity">
  {#snippet children()}
    {#if entries.length === 0}
      <EmptyState title="Nothing yet" text="Messages from this session (saves, imports, run results) are listed here." />
    {:else}
      <ol class="log" aria-label="Session activity">
        {#each entries as e (e.id)}
          <li data-kind={e.kind}>
            <span class="glyph" aria-hidden="true">{GLYPH[e.kind]}</span>
            <span class="msg">{e.message}</span>
            <time class="when num" datetime={e.at.toISOString()}>{e.at.toLocaleTimeString()}</time>
          </li>
        {/each}
      </ol>
    {/if}
  {/snippet}
</Drawer>

<style>
  .log { list-style: none; margin: 0; padding: 0; display: grid; }
  li {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    gap: var(--sp-2);
    padding: var(--sp-2) 0;
    border-bottom: 1px solid var(--line-rule);
    font-size: var(--fs-13);
    color: var(--text-soft);
  }
  .glyph { color: var(--status-info); }
  li[data-kind='warn'] .glyph { color: var(--status-warn); }
  li[data-kind='error'] .glyph { color: var(--verdict-down); }
  li[data-kind='success'] .glyph { color: var(--verdict-up); }
  .msg { overflow-wrap: anywhere; }
  .when { color: var(--text-muted); font-size: var(--fs-12); }
</style>
