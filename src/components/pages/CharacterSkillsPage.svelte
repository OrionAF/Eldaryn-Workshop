<script>
  /**
   * CharacterSkillsPage.svelte - adapter: mounts the pre-redesign CharacterScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import CharacterScreen from '../screens/CharacterScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<CharacterScreen {setStatus} {onNavigate} />
