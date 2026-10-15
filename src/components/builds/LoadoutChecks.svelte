<script>
  /**
   * LoadoutChecks.svelte - the M1 `checkPreset` badges: every gate this preset breaks (error) and every
   * advisory (warn), each with its own sentence. Nothing here repairs the preset; normalisation does that.
   */
  import { checkPreset } from '../../lib/model/legality.js';
  import Banner from '../ui/Banner.svelte';

  let { character, preset } = $props();
  const issues = $derived(checkPreset(character, preset));
</script>

{#if issues.length}
  <div class="checks" data-testid="preset-checks">
    {#each issues as issue (issue.gate + issue.field + issue.detail)}
      <Banner variant={issue.warn ? 'warn' : 'error'} lead={issue.warn ? 'Note.' : 'Not allowed.'}>{issue.detail}</Banner>
    {/each}
  </div>
{/if}

<style>
  .checks { display: grid; gap: var(--sp-2); }
</style>
