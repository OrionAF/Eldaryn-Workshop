<script>
  /**
   * CharacterOverviewPage.svelte - adapter: mounts the pre-redesign CharacterScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import CharacterScreen from '../screens/CharacterScreen.svelte';
  import ClassPrompt from '../shell/ClassPrompt.svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
  const classless = $derived(!rosterStore.current.class);
</script>

{#if classless}
  <ClassPrompt />
{/if}
<CharacterScreen {setStatus} {onNavigate} />
