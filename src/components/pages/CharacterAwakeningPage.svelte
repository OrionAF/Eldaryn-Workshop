<script>
  /**
   * CharacterAwakeningPage.svelte - adapter: mounts the pre-redesign AwakeningScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import AwakeningScreen from '../screens/AwakeningScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<AwakeningScreen {setStatus} {onNavigate} />
