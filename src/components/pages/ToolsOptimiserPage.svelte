<script>
  /**
   * ToolsOptimiserPage.svelte - adapter: mounts the pre-redesign OptimiserScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import OptimiserScreen from '../screens/OptimiserScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<OptimiserScreen {setStatus} {onNavigate} />
