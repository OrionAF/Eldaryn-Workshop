<script>
  /**
   * BuildsPresetsPage.svelte - B1 (plan §D U7): the preset compare table. `tab` is the optional third hash segment.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import PresetCompare from '../builds/PresetCompare.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();
</script>

<PresetCompare character={rosterStore.current} {setStatus} />
