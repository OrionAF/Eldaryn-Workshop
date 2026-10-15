<script>
  /**
   * InspectorOutlet.svelte - renders whatever the current page registered with lib/inspector.svelte.js.
   * The shell mounts it inside #shell-inspector; it renders nothing when no page registered a snippet.
   */
  import { inspector } from '../lib/inspector.svelte.js';
</script>

{#if inspector.current}
  {@render inspector.current()}
{/if}
