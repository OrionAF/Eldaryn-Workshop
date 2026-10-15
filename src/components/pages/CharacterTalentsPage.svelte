<script>
  /**
   * CharacterTalentsPage.svelte - adapter: mounts the pre-redesign TalentsScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import TalentsScreen from '../screens/TalentsScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<TalentsScreen {setStatus} {onNavigate} />
