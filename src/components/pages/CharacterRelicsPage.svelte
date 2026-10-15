<script>
  /**
   * CharacterRelicsPage.svelte - adapter: mounts the pre-redesign RelicsScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import RelicsScreen from '../screens/RelicsScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<RelicsScreen {setStatus} {onNavigate} />
