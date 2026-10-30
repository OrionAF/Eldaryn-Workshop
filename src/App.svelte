<script>
  /**
   * App.svelte - the shell (ia.md §2, plan U1): top bar, grouped rail, context header, the routed
   * page, the inspector region and the notification stack. The page is the hash route
   * (lib/router.svelte.js); each route mounts one file from components/pages/, which for now
   * adapts the pre-redesign screen. An empty roster shows the Welcome page instead.
   */
  import WelcomeScreen from './components/WelcomeScreen.svelte';
  import TopBar from './components/shell/TopBar.svelte';
  import JobsPill from './components/shell/JobsPill.svelte';
  import Rail from './components/shell/Rail.svelte';
  import ContextHeader from './components/shell/ContextHeader.svelte';
  import NotificationStack from './components/shell/NotificationStack.svelte';
  import ImportDialog from './components/import/ImportDialog.svelte';
  import SettingsPage from './components/pages/SettingsPage.svelte';
  import { PAGE_COMPONENTS } from './components/pages/index.js';
  import EmptyState from './components/ui/EmptyState.svelte';
  import Button from './components/ui/Button.svelte';
  import { rosterStore } from './lib/rosterStore.svelte.js';
  import { router, go } from './lib/router.svelte.js';
  import { statusMessage, dismissStale } from './lib/notify.svelte.js';
  import InspectorOutlet from './components/InspectorOutlet.svelte';
  import { AFTER_IMPORT_PAGE_ID, DEFAULT_PAGE_ID, pageById } from './lib/routes.js';

  const empty = $derived(rosterStore.roster.characters.length === 0);
  const character = $derived(rosterStore.current);
  const route = $derived(router.route);
  const page = $derived(route.kind === 'page' ? pageById(route.id) : null);
  const Page = $derived(route.kind === 'page' ? PAGE_COMPONENTS[route.id] : null);
  const classBlocked = $derived(!!page?.needsClass && !character?.class);

  // Old screens still call setStatus(msg) / onNavigate(id); both are app services now.
  const setStatus = (msg) => statusMessage(msg);
  const onNavigate = (target) => go(target);

  // A toast about the page you left must not cover the next one (notify.svelte.js dismissStale).
  let lastRouteKey = null;
  $effect(() => {
    const key = route.kind === 'page' ? route.id : route.kind;
    if (lastRouteKey !== null && key !== lastRouteKey) dismissStale();
    lastRouteKey = key;
  });

  // Empty roster -> Welcome (G0); the first character created or imported opens Overview (C1).
  let wasEmpty = null;
  $effect(() => {
    if (empty) {
      // Settings stays reachable with no character: Settings > Import is the way in for a game file.
      // So do pages that read no character (Stat Priorities).
      if (route.kind !== 'welcome' && route.kind !== 'settings' && !page?.noCharacter) go('welcome', { replace: true });
    } else {
      if (wasEmpty === true) go(AFTER_IMPORT_PAGE_ID, { replace: true });
      else if (route.kind === 'welcome') go(DEFAULT_PAGE_ID, { replace: true });
    }
    wasEmpty = empty;
  });
</script>

<a class="skip-link" href="#main">Skip to content</a>

{#if empty && route.kind === 'settings'}
  <div class="bare">
    <a class="back" href="#/welcome">Back to Welcome</a>
    <main id="main" tabindex="-1"><SettingsPage {setStatus} /></main>
  </div>
{:else if empty && page?.noCharacter}
  <div class="bare">
    <a class="back" href="#/welcome">Back to Welcome</a>
    <main id="main" tabindex="-1">
      <header class="bare-head">
        <h1>{page.title}</h1>
        <p>{page.sentence}</p>
      </header>
      {#key route.id}
        <Page {setStatus} {onNavigate} tab={route.tab} />
      {/key}
    </main>
  </div>
{:else if empty}
  <WelcomeScreen />
{:else}
  <div class="app">
    <TopBar>
      {#snippet jobs()}<JobsPill />{/snippet}
    </TopBar>
    <div class="body">
      <Rail {route} {character} />
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
          <aside id="shell-inspector" class="inspector" aria-label="Inspector"><InspectorOutlet /></aside>
        </div>
      </div>
    </div>
  </div>
{/if}

<ImportDialog />
<NotificationStack />

<style>
  /* First Tab stop; off-screen until focused. */
  .skip-link {
    position: fixed;
    top: var(--sp-2);
    left: var(--sp-2);
    z-index: var(--z-toast);
    padding: var(--sp-2) var(--sp-4);
    background: var(--surface-4);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    color: var(--text-ink);
    text-decoration: none;
    transform: translateY(-200%);
  }
  .skip-link:focus { transform: none; }
  .bare { max-width: var(--content-max); margin: 0 auto; padding: var(--page-pad); display: grid; gap: var(--sp-4); }
  .back { justify-self: start; color: var(--text-soft); }
  .bare-head { display: grid; gap: var(--sp-1); margin-bottom: var(--sp-4); }
  .bare-head h1 { margin: 0; font-family: var(--font-display); font-size: var(--fs-26); color: var(--brass-200); }
  .bare-head p { margin: 0; font-size: var(--fs-13); color: var(--text-muted); }
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
