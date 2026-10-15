<script>
  /**
   * CharacterGearPage.svelte - C3. GearScreen holds the page (the Oblivion screen embeds it pinned to
   * its realm until U11 retires that); `tab` ('stones') opens the Enchant stones tab.
   */
  import GearScreen from '../screens/GearScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<GearScreen {tab} />
