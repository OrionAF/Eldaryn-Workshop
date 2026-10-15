<script>
  /**
   * CharacterSigilsPage.svelte - adapter: mounts the pre-redesign SigilsScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import SigilsScreen from '../screens/SigilsScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<SigilsScreen {setStatus} {onNavigate} />
