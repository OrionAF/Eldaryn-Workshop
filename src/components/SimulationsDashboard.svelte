<script>
  /**
   * SimulationsDashboard.svelte - the Simulations page's default tab.
   * Two zones (goals/linking redesign):
   *  - Setup section (DashboardSetupCard): visible only while the linking
   *    simulation has never completed (character.linkingSim === null).
   *  - Statistics hub (RunHistoryPanel): always visible - the auto-saved
   *    run history with charts, breakdowns, and timelines.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import DashboardSetupCard from './DashboardSetupCard.svelte';
  import LinkingReportCard from './LinkingReportCard.svelte';
  import RunHistoryPanel from './RunHistoryPanel.svelte';

  let { setStatus } = $props();

  const character = $derived(rosterStore.current);
</script>

<div class="dashboard">
  {#if character.linkingSim === null}
    <DashboardSetupCard {setStatus} />
  {:else}
    <LinkingReportCard {setStatus} />
  {/if}
  <RunHistoryPanel {setStatus} />
</div>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-width: 860px;
  }
</style>
