<script>
  /**
   * MountsSource.svelte - Mount Selection / Glyph Inventory sub-tabs, same
   * "reuse Tabs.svelte recursively" pattern as SourcesTab uses for Pets/Mounts.
   */
  import Tabs from './Tabs.svelte';
  import MountSelection from './MountSelection.svelte';
  import GlyphInventory from './GlyphInventory.svelte';

  const SUB_TABS = [
    { id: 'selection', label: 'Mount Selection' },
    { id: 'glyphs', label: 'Glyph Inventory' },
  ];

  let activeSubTab = $state('selection');
</script>

<div class="mounts-source">
  <Tabs tabs={SUB_TABS} active={activeSubTab} onSelect={(id) => (activeSubTab = id)} />
  <div class="sub-tab-content">
    {#if activeSubTab === 'selection'}
      <MountSelection />
    {:else}
      <GlyphInventory />
    {/if}
  </div>
</div>

<style>
  .sub-tab-content {
    padding-top: var(--space-4, 1rem);
  }
</style>
