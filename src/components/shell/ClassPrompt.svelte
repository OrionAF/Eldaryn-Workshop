<script>
  /**
   * ClassPrompt.svelte - shown on Overview for a classless (imported or legacy) character
   * (ia.md §1 removals): the class picker takes focus, and the other pages are marked "needs class".
   */
  import { onMount } from 'svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { CLASSES, classLabel } from '../../lib/game/classes.js';
  import Select from '../ui/Select.svelte';
  import Banner from '../ui/Banner.svelte';

  let value = $state('');
  let host = $state(null);
  const options = [{ value: '', label: 'Choose class...' }, ...CLASSES.map((c) => ({ value: c, label: classLabel(c) }))];

  onMount(() => host?.querySelector('select')?.focus());

  function pick(cls) {
    if (cls) rosterStore.setCharacterClass(rosterStore.current.id, cls);
  }
</script>

<div class="prompt" bind:this={host}>
  <Banner variant="warn" lead="This character has no class.">
    Choose one to unlock the other pages: talents, relics, sigils and gear all depend on it.
  </Banner>
  <Select label="Class" {options} bind:value onchange={pick} />
</div>

<style>
  .prompt { display: grid; gap: var(--sp-3); max-width: 28rem; margin-bottom: var(--sp-4); }
</style>
