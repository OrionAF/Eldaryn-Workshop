<script>
  /**
   * BuildsLoadoutPage.svelte - adapter: mounts the pre-redesign PresetsScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import PresetsScreen from '../screens/PresetsScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<PresetsScreen {setStatus} {onNavigate} />
