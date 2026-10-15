<script>
  /**
   * CharacterTranscendencePage.svelte - adapter: mounts the pre-redesign TranscendenceScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import TranscendenceScreen from '../screens/TranscendenceScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<TranscendenceScreen {setStatus} {onNavigate} />
