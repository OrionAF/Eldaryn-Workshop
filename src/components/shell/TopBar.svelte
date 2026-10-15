<script>
  /**
   * TopBar.svelte - the global chrome (ia.md §2.1, design-system §4.1): brand, G1 character switcher,
   * G2 preset + realm, the Jobs pill slot (filled by the job store slice), save state, G5 activity
   * bell, G6 settings and the G3 Import button. Sticky, one row; collapses by CSS only.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { notifications } from '../../lib/notify.svelte.js';
  import CharacterSwitcher from './CharacterSwitcher.svelte';
  import ContextControls from './ContextControls.svelte';
  import SaveState from './SaveState.svelte';
  import ActivityDrawer from './ActivityDrawer.svelte';
  import Button from '../ui/Button.svelte';

  let { onImport = () => {}, jobs } = $props();

  let activityOpen = $state(false);
  const unread = $derived(notifications.unread);
  const brandHref = $derived(rosterStore.current.presets.length > 0 ? '#/builds/presets' : '#/character/overview');
</script>

<header class="topbar">
  <a class="brand" href={brandHref}>
    <span class="mark" aria-hidden="true">◆</span>
    <span class="word">Eldaryn Workshop</span>
  </a>
  <CharacterSwitcher />
  <ContextControls />
  <span class="spacer"></span>
  <div class="jobs-slot" data-slot="jobs">{@render jobs?.()}</div>
  <SaveState />
  <button
    type="button"
    class="icon-btn"
    aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    aria-expanded={activityOpen}
    onclick={() => (activityOpen = !activityOpen)}
  >
    <span aria-hidden="true">◉</span>
    {#if unread > 0}<span class="unread" aria-hidden="true"></span>{/if}
  </button>
  <a class="icon-btn" href="#/settings" aria-label="Data and settings"><span aria-hidden="true">⚙</span></a>
  <Button variant="primary" onclick={onImport} aria-label="Import">
    <span aria-hidden="true">⇪</span><span class="import-label">Import</span>
  </Button>
</header>

<ActivityDrawer bind:open={activityOpen} />

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: var(--z-topbar);
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    height: var(--topbar-h);
    padding: 0 var(--sp-4);
    background: var(--surface-1);
    border-bottom: 1px solid var(--brass-700);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--fs-16);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--brass-200);
    text-decoration: none;
    white-space: nowrap;
  }
  .mark { color: var(--ember-500); }
  .spacer { flex: 1; }
  .jobs-slot:empty { display: none; }
  .icon-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--control-h);
    height: var(--control-h);
    padding: 0;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--r-1);
    color: var(--text-soft);
    text-decoration: none;
    cursor: pointer;
  }
  .icon-btn:hover { background: var(--surface-3); border-color: var(--line-control-hover); color: var(--text-ink); }
  .unread { position: absolute; top: 4px; right: 4px; width: 8px; height: 8px; border-radius: 50%; background: var(--ember-500); }

  @media (max-width: 1100px) {
    .topbar { gap: var(--sp-3); }
  }
  @media (max-width: 1023px) {
    .word, .import-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  }
  @media (max-width: 700px) {
    .topbar { height: var(--topbar-h-phone); padding: 0 var(--sp-3); gap: var(--sp-2); }
    .brand { display: none; }
    .spacer { display: none; }
    /* the Import action lives in the bottom tab bar */
    .topbar :global(.btn-primary) { display: none; }
  }
</style>
