<script>
  import TopBar from './components/TopBar.svelte';
  import Tabs from './components/Tabs.svelte';
  import ProfileStatsTab from './components/ProfileStatsTab.svelte';
  import GearPanelTab from './components/GearPanelTab.svelte';

  const TABS = [
    { id: 'profile', label: 'Profile Stats' },
    { id: 'gear', label: 'Gear Panel' },
  ];

  // View-only, not persisted - which tab is showing.
  let activeTab = $state('profile');
</script>

<main>
  <h1>Eldaryn Gear Optimiser</h1>
  <div class="top-bar-wrap">
    <TopBar />
  </div>
  <Tabs tabs={TABS} active={activeTab} onSelect={(id) => (activeTab = id)} />
  <div class="tab-content">
    {#if activeTab === 'profile'}
      <ProfileStatsTab />
    {:else}
      <GearPanelTab />
    {/if}
  </div>
</main>

<style>
  .top-bar-wrap {
    margin-bottom: var(--space-6);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }
  .tab-content {
    padding-top: var(--space-6);
  }
</style>
