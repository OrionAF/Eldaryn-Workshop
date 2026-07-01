<script>
  import TopBar from './components/TopBar.svelte';
  import Tabs from './components/Tabs.svelte';
  import ProfileStatsTab from './components/ProfileStatsTab.svelte';
  import GearPanelTab from './components/GearPanelTab.svelte';
  import SourcesTab from './components/SourcesTab.svelte';
  import { rosterStore } from './lib/rosterStore.svelte.js';

  const TABS = [
    { id: 'profile', label: 'Profile Stats' },
    { id: 'gear', label: 'Gear Panel' },
    { id: 'sources', label: 'Sources' },
  ];

  // View-only, not persisted - which tab is showing.
  let activeTab = $state('profile');

  // Minimize interaction until there's a class to build a profile against -
  // every field below (Profile Stats, Gear Panel, Talents) either reads or
  // is gated by the character's class.
  const profileReady = $derived(!!rosterStore.current.class);
</script>

<main>
  <h1>Eldaryn Workshop</h1>
  <div class="top-bar-wrap">
    <TopBar />
  </div>
  {#if !profileReady}
    <p class="onboarding-hint">
      To begin, create a profile for this character: choose a class above (the ✎ edit icon next
      to the character selector).
    </p>
  {:else}
    <Tabs tabs={TABS} active={activeTab} onSelect={(id) => (activeTab = id)} />
    <div class="tab-content">
      {#if activeTab === 'profile'}
        <ProfileStatsTab />
      {:else if activeTab === 'gear'}
        <GearPanelTab />
      {:else}
        <SourcesTab />
      {/if}
    </div>
  {/if}
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
  .onboarding-hint {
    color: var(--color-muted, #999);
    padding-top: var(--space-6);
  }
</style>
