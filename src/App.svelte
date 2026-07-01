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
  <TopBar />
  <Tabs tabs={TABS} active={activeTab} onSelect={(id) => (activeTab = id)} />
  {#if activeTab === 'profile'}
    <ProfileStatsTab />
  {:else}
    <GearPanelTab />
  {/if}
</main>
