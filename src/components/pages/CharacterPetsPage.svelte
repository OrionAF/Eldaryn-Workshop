<script>
  /**
   * CharacterPetsPage.svelte - adapter: mounts the pre-redesign PetsScreen until the slice that owns this
   * page replaces this file (plan §D). `tab` is the optional third hash segment.
   */
  import PetsScreen from '../screens/PetsScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<PetsScreen {setStatus} {onNavigate} />
