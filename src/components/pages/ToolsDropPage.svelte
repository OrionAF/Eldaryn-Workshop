<script>
  /**
   * ToolsDropPage.svelte - adapter: mounts the pre-redesign DropCheckScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import DropCheckScreen from '../screens/DropCheckScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<DropCheckScreen {setStatus} {onNavigate} />
