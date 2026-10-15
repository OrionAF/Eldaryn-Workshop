<script>
  /**
   * CharacterGearPage.svelte - adapter: mounts the pre-redesign GearScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import GearScreen from '../screens/GearScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<GearScreen {setStatus} {onNavigate} />
