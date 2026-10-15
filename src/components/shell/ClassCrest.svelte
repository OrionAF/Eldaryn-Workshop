<script>
  /** ClassCrest.svelte - the round class mark in the top bar (swords, bow, star, skull; hatched when classless). */
  let { cls = null, size = 32 } = $props();
  const ICON = { WARRIOR: 'swords', SENTINEL: 'bow', MYSTIC: 'star', NECROMANCER: 'skull' };
  const icon = $derived(ICON[cls] ?? null);
</script>

<span class="crest" class:blank={!icon} style="--size: {size}px" aria-hidden="true">
  {#if icon === 'swords'}
    <svg viewBox="0 0 24 24">
      <path d="M19.5 3 9.5 13M4.5 3 14.5 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <path d="M6.5 10 12 15.5M17.5 10 12 15.5M9.5 13 5.5 17M14.5 13 18.5 17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <circle cx="4.5" cy="18.5" r="1.1" fill="currentColor" />
      <circle cx="19.5" cy="18.5" r="1.1" fill="currentColor" />
    </svg>
  {:else if icon === 'bow'}
    <svg viewBox="0 0 24 24">
      <path d="M8 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <path d="M8 3 13 12 8 21" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M13 12h8M18.5 9 21 12 18.5 15M13 12 10.5 10.5M13 12 10.5 13.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  {:else if icon === 'star'}
    <svg viewBox="0 0 24 24">
      <path d="M12 2.5 14 10 21.5 12 14 14 12 21.5 10 14 2.5 12 10 10Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  {:else if icon === 'skull'}
    <svg viewBox="0 0 24 24">
      <path d="M12 3c-4.4 0-7.5 3-7.5 7 0 2.4 1.1 4.2 2.8 5.2V19h9.4v-3.8c1.7-1 2.8-2.8 2.8-5.2 0-4-3.1-7-7.5-7Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
      <circle cx="9.2" cy="11" r="1.5" fill="currentColor" />
      <circle cx="14.8" cy="11" r="1.5" fill="currentColor" />
      <path d="M10.5 19v-2M13.5 19v-2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
    </svg>
  {/if}
</span>

<style>
  .crest {
    flex: none;
    width: var(--size);
    height: var(--size);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--brass-500);
    border-radius: 50%;
    color: var(--brass-200);
    background: var(--surface-3);
  }
  .crest.blank {
    background: repeating-linear-gradient(45deg, var(--surface-3), var(--surface-3) 4px, var(--surface-2) 4px, var(--surface-2) 8px);
  }
  svg {
    width: 62%;
    height: 62%;
  }
</style>
