<script>
  /** Skeleton.svelte - placeholder bars (design-system §4.37). Pulse only when motion is allowed. */
  let { lines = 1, width = '100%', height = '1em' } = $props();
</script>

<span class="skeletons" aria-hidden="true" data-skeleton>
  {#each Array(lines) as _, i (i)}
    <span class="skeleton" style="width:{i === lines - 1 && lines > 1 ? '60%' : width};height:{height}"></span>
  {/each}
</span>

<style>
  .skeletons { display: grid; gap: var(--sp-2); }
  .skeleton { display: block; background: var(--surface-3); border-radius: 2px; }
  @media (prefers-reduced-motion: no-preference) {
    .skeleton { animation: skeleton-pulse 1.4s ease-in-out infinite; }
  }
  @keyframes skeleton-pulse { 50% { opacity: 0.55; } }
</style>
