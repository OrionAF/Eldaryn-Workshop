<script>
  /**
   * SourcesTab.svelte - the Sources tab (Phase 1): sub-navigation for each
   * built source. Reuses Tabs.svelte recursively (a tab-of-tabs), same as
   * MountsSource does for its own Mount Selection / Glyph Inventory split.
   */
  import Tabs from './Tabs.svelte';
  import PetsSource from './PetsSource.svelte';
  import MountsSource from './MountsSource.svelte';
  import TalentsSource from './TalentsSource.svelte';
  import AwakeningSource from './AwakeningSource.svelte';
  import RelicsSource from './RelicsSource.svelte';

  const SUB_TABS = [
    { id: 'pets', label: 'Pets' },
    { id: 'mounts', label: 'Mounts' },
    { id: 'talents', label: 'Talents' },
    { id: 'awakening', label: 'Awakening' },
    { id: 'relics', label: 'Relics' },
  ];

  let activeSubTab = $state('pets');
</script>

<section aria-label="Sources">
  <Tabs tabs={SUB_TABS} active={activeSubTab} onSelect={(id) => (activeSubTab = id)} />
  <div class="sub-tab-content">
    {#if activeSubTab === 'pets'}
      <PetsSource />
    {:else if activeSubTab === 'mounts'}
      <MountsSource />
    {:else if activeSubTab === 'talents'}
      <TalentsSource />
    {:else if activeSubTab === 'awakening'}
      <AwakeningSource />
    {:else}
      <RelicsSource />
    {/if}
  </div>
</section>

<style>
  .sub-tab-content {
    padding-top: var(--space-4, 1rem);
  }
</style>
