<script>
  /**
   * ToolsOpponentsPage.svelte - adapter: mounts the pre-redesign DuelScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import DuelScreen from '../screens/DuelScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<DuelScreen {setStatus} {onNavigate} />
