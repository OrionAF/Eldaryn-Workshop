<script>
  /**
   * PendingScreen.svelte - placeholder body for a screen the rebuild has not
   * delivered yet (rebuild-plan §7.3). Each screens/<Name>Screen.svelte wraps
   * this until its owning slice replaces the file.
   */
  let { title } = $props();
</script>

<section class="pending-screen">
  <h2>{title}</h2>
  <p class="muted">This screen is being rebuilt on the 2.7.0 client model.</p>
</section>

<style>
  .pending-screen {
    padding-top: var(--space-4);
  }
  .muted {
    color: var(--color-muted);
    max-width: 32rem;
  }
</style>
