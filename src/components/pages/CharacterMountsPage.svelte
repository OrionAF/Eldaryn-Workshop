<script>
  /**
   * CharacterMountsPage.svelte - adapter: mounts the pre-redesign MountsScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import MountsScreen from '../screens/MountsScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<MountsScreen {setStatus} {onNavigate} />
