<script>
  /**
   * App.svelte - the shell (ia.md §2, plan U1): top bar, grouped rail, context header, the routed
   * page, the inspector region and the notification stack. The page is the hash route
   * (lib/router.svelte.js); each route mounts one file from components/pages/, which for now
   * adapts the pre-redesign screen. An empty roster shows the Welcome page instead.
   */
  import WelcomeScreen from './components/WelcomeScreen.svelte';
  import TopBar from './components/shell/TopBar.svelte';
  import Rail from './components/shell/Rail.svelte';
  import ContextHeader from './components/shell/ContextHeader.svelte';
  import NotificationStack from './components/shell/NotificationStack.svelte';
  import ImportFile from './components/shell/ImportFile.svelte';
  import SettingsPage from './components/pages/SettingsPage.svelte';
  import { PAGE_COMPONENTS } from './components/pages/index.js';
  import EmptyState from './components/ui/EmptyState.svelte';
  import Button from './components/ui/Button.svelte';
  import { rosterStore } from './lib/rosterStore.svelte.js';
  import { router, go } from './lib/router.svelte.js';
  import { statusMessage } from './lib/notify.svelte.js';
  import { AFTER_IMPORT_PAGE_ID, DEFAULT_PAGE_ID, pageById } from './lib/routes.js';

  const empty = $derived(rosterStore.roster.characters.length === 0);
  const character = $derived(rosterStore.current);
  const route = $derived(router.route);
  const page = $derived(route.kind === 'page' ? pageById(route.id) : null);
  const Page = $derived(route.kind === 'page' ? PAGE_COMPONENTS[route.id] : null);
  const classBlocked = $derived(!!page?.needsClass && !character?.class);

  let importer = $state(null);
  const openImport = () => importer?.open();

  // Old screens still call setStatus(msg) / onNavigate(id); both are app services now.
  const setStatus = (msg) => statusMessage(msg);
  const onNavigate = (target) => go(target);

  // Empty roster -> Welcome (G0); the first character created or imported opens Overview (C1).
  let wasEmpty = null;
  $effect(() => {
    if (empty) {
      if (route.kind !== 'welcome') go('welcome', { replace: true });
    } else {
      if (wasEmpty === true) go(AFTER_IMPORT_PAGE_ID, { replace: true });
      else if (route.kind === 'welcome') go(DEFAULT_PAGE_ID, { replace: true });
    }
    wasEmpty = empty;
  });
</script>

{#if empty}
  <WelcomeScreen />
{:else}
  <div class="app">
    <TopBar onImport={openImport} />
    <div class="body">
      <Rail {route} {character} onImport={openImport} />
      <div class="content">
        <ContextHeader {route} {character} />
        <div class="page">
          <main id="main" tabindex="-1">
            {#if route.kind === 'settings'}
              <SettingsPage {setStatus} />
            {:else if page}
              {#if classBlocked}
                <EmptyState title="Choose a class first" text="This page depends on the character's class. Pick one on Overview.">
                  {#snippet action()}
                    <Button variant="secondary" onclick={() => go(AFTER_IMPORT_PAGE_ID)}>Open Overview</Button>
                  {/snippet}
                </EmptyState>
              {:else}
                {#key route.id}
                  <Page {setStatus} {onNavigate} tab={route.tab} />
                {/key}
              {/if}
            {/if}
          </main>
          <aside id="shell-inspector" class="inspector" aria-label="Inspector"></aside>
        </div>
      </div>
    </div>
  </div>
{/if}

<ImportFile bind:this={importer} />
<NotificationStack />

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  .body {
    display: grid;
    grid-template-columns: var(--rail-w) minmax(0, 1fr);
    flex: 1;
  }
  .content {
    min-width: 0;
  }
  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-4);
    max-width: var(--content-max);
    margin: 0 auto;
    padding: var(--page-pad);
  }
  main {
    min-width: 0;
  }
  main:focus-visible {
    outline: none;
  }
  /* Pages render their selection detail here; an empty region takes no space. */
  .inspector {
    width: var(--inspector-w);
    min-width: 0;
  }
  .inspector:empty {
    display: none;
  }
  @media (max-width: 1279px) {
    .body {
      grid-template-columns: var(--rail-w-icon) minmax(0, 1fr);
    }
  }
  @media (max-width: 1100px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
    }
    .inspector {
      width: auto;
    }
  }
  @media (max-width: 700px) {
    .body {
      grid-template-columns: minmax(0, 1fr);
    }
    .page {
      padding: var(--page-pad-phone) var(--page-pad-phone) calc(56px + var(--sp-6) + env(safe-area-inset-bottom, 0px));
    }
  }
</style>
