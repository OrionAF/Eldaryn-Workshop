<script>
  import Sidebar from './components/Sidebar.svelte';
  import WelcomeScreen from './components/WelcomeScreen.svelte';
  import PresetsScreen from './components/PresetsScreen.svelte';
  import DropCheckScreen from './components/DropCheckScreen.svelte';
  import GearLoadoutsScreen from './components/GearLoadoutsScreen.svelte';
  import TalentSetsScreen from './components/TalentSetsScreen.svelte';
  import PetsScreen from './components/PetsScreen.svelte';
  import RelicsScreen from './components/RelicsScreen.svelte';
  import SigilsScreen from './components/SigilsScreen.svelte';
  import MountAndGlyphsScreen from './components/MountAndGlyphsScreen.svelte';
  import AwakeningScreen from './components/AwakeningScreen.svelte';
  import TranscendenceScreen from './components/TranscendenceScreen.svelte';
  import SimulationScreen from './components/SimulationScreen.svelte';
  import { rosterStore } from './lib/rosterStore.svelte.js';

  // Per-screen suffix for the banner subline - what's actually in scope on
  // that screen, not a redundant restatement of the screen's own <h2> title.
  const SCREEN_CONTEXT = {
    presets: (c) => `${c.presets.length} preset${c.presets.length === 1 ? '' : 's'} · 2 loadouts · 2 talent sets`,
    drop: (c) => `${c.presets.length} preset${c.presets.length === 1 ? '' : 's'} watching this drop`,
    gear: () => '2 loadouts',
    talents: () => '2 talent sets',
    pets: (c) => `${c.pets.length} pet${c.pets.length === 1 ? '' : 's'}`,
    relics: () => 'character-wide levels',
    sigils: (c) => `${c.presets.length} preset${c.presets.length === 1 ? '' : 's'} · 3 slots each`,
    simulation: () => '60s world boss · Monte Carlo',
    mounts: () => 'character-wide',
    awakening: () => 'character-wide',
    transcendence: () => 'character-wide',
  };

  // View-only, not persisted.
  let activeScreen = $state('presets');
  let statusMessage = $state('');

  const character = $derived(rosterStore.current);
  const profileReady = $derived(!!character.class);
  const avatarIcon = $derived(character.class === 'Warrior' ? 'swords' : character.class === 'Sentinel' ? 'bow' : null);
  const contextSub = $derived.by(() => {
    const cls = character.class || 'No class';
    const suffix = SCREEN_CONTEXT[activeScreen]?.(character) ?? '';
    return suffix ? `${cls} · ${suffix}` : cls;
  });

  function selectScreen(id) {
    activeScreen = id;
    statusMessage = ''; // a screen switch silently dismisses the toast
  }

  function setStatus(msg) {
    statusMessage = msg;
  }
</script>

{#if rosterStore.roster.characters.length === 0}
  <WelcomeScreen />
{:else}
  <div class="shell">
    <Sidebar {activeScreen} onSelectScreen={selectScreen} onStatus={setStatus} />

    <main>
      <div class="banner">
        <div class="avatar" aria-hidden="true">
          {#if avatarIcon === 'swords'}
            <svg viewBox="0 0 24 24" class="avatar-icon" aria-hidden="true">
              <!-- sword \ -->
              <path d="M19.5 3 9.5 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              <path d="M6.5 10 12 15.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <path d="M9.5 13 5.5 17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <circle cx="4.5" cy="18.5" r="1.1" fill="currentColor" />
              <!-- sword / (mirrored) -->
              <path d="M4.5 3 14.5 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              <path d="M17.5 10 12 15.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <path d="M14.5 13 18.5 17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <circle cx="19.5" cy="18.5" r="1.1" fill="currentColor" />
            </svg>
          {:else if avatarIcon === 'bow'}
            <svg viewBox="0 0 24 24" class="avatar-icon" aria-hidden="true">
              <!-- bow stave -->
              <path d="M8 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              <!-- drawn string -->
              <path d="M8 3 13 12 8 21" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" />
              <!-- arrow shaft -->
              <path d="M13 12h8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              <!-- arrowhead -->
              <path d="M18.5 9 21 12 18.5 15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              <!-- fletching -->
              <path d="M13 12 10.5 10.5M13 12 10.5 13.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
            </svg>
          {/if}
        </div>
        <div class="banner-text">
          <div class="character-name">{character.name}</div>
          <div class="context-sub">{contextSub}</div>
        </div>
        {#if statusMessage}
          <div class="status-pill" role="status">{statusMessage}</div>
        {/if}
      </div>

      {#if !profileReady}
        <p class="onboarding-hint">
          Choose a class for this character to get started — open ⇄ Change character in the rail,
          click the ✎ next to the character, and pick a class.
        </p>
      {:else if activeScreen === 'presets'}
        <PresetsScreen {setStatus} onNavigate={selectScreen} />
      {:else if activeScreen === 'drop'}
        <DropCheckScreen {setStatus} />
      {:else if activeScreen === 'gear'}
        <GearLoadoutsScreen />
      {:else if activeScreen === 'talents'}
        <TalentSetsScreen />
      {:else if activeScreen === 'pets'}
        <PetsScreen />
      {:else if activeScreen === 'relics'}
        <RelicsScreen />
      {:else if activeScreen === 'sigils'}
        <SigilsScreen />
      {:else if activeScreen === 'simulation'}
        <SimulationScreen {setStatus} />
      {:else if activeScreen === 'mounts'}
        <MountAndGlyphsScreen />
      {:else if activeScreen === 'awakening'}
        <AwakeningScreen />
      {:else}
        <TranscendenceScreen />
      {/if}
    </main>
  </div>
{/if}

<style>
  .shell {
    display: grid;
    grid-template-columns: 212px 1fr;
    min-height: 100vh;
    max-width: none;
  }
  main {
    padding: 18px 26px 34px;
    min-width: 0;
    max-width: var(--content-max-width);
  }
  /* Rail -> bottom tab bar (Sidebar.svelte) at the same breakpoint - the
     shell drops to one column and reserves space at the bottom so page
     content doesn't sit underneath the fixed bar. */
  @media (max-width: 700px) {
    .shell {
      grid-template-columns: 1fr;
    }
    main {
      padding: 12px 12px calc(64px + env(safe-area-inset-bottom, 0px));
    }
  }
  .banner {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid var(--color-gold);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-gold-light);
    background: radial-gradient(circle at 35% 30%, #2a2550, #1a1733 70%);
  }
  .avatar:not(:has(.avatar-icon)) {
    background: repeating-linear-gradient(45deg, var(--color-border-hairline), var(--color-border-hairline) 4px, #1a1733 4px, #1a1733  8px);
  }
  .avatar-icon {
    width: 62%;
    height: 62%;
  }
  .banner-text {
    flex: 1;
    min-width: 0;
  }
  .character-name {
    font-size: 15px;
    font-weight: 600;
  }
  .context-sub {
    font-size: 11px;
    color: var(--color-muted);
  }
  .status-pill {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    background: var(--color-gold-tint);
    color: var(--color-gold-light);
    white-space: nowrap;
  }
  .onboarding-hint {
    color: var(--color-muted);
    padding-top: var(--space-6);
    max-width: 32rem;
  }
</style>
