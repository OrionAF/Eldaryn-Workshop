<script>
  /**
   * ContextHeader.svelte - per-page header under the top bar (ia.md §2.1, design-system §4.2):
   * breadcrumb, title, scope badge, one-line scope sentence and, for Character pages that depend on
   * the active preset, the "Context: <preset>" echo (which focuses the preset picker in the top bar).
   * The sentence is the heading's accessible description.
   */
  import { AREAS, pageById } from '../../lib/routes.js';
  import ScopeChip from '../ui/ScopeChip.svelte';

  let { route, character } = $props();
  const id = $props.id();

  const page = $derived(route.kind === 'page' ? pageById(route.id) : null);
  const area = $derived(page ? AREAS.find((a) => a.id === page.area) : null);
  const title = $derived(page ? page.title : 'Data & Settings');
  const crumb = $derived(page ? [area.label, page.label] : ['Global', 'Settings']);
  const presetCount = $derived(character?.presets?.length ?? 0);
  const activePreset = $derived(character?.presets?.find((p) => p.id === character.activePresetId) ?? character?.presets?.[0] ?? null);

  const scope = $derived(page?.scope ?? 'global');
  const target = $derived(
    !page ? 'This device' : page.scope === 'preset' ? (activePreset?.name ?? '') : page.scope === 'character' ? (character?.name ?? '') : '',
  );
  const sentence = $derived(
    !page
      ? 'Stored in this browser only.'
      : page.sentence.replace('{n}', String(presetCount)),
  );

  function focusPreset() {
    document.querySelector('#context-preset select')?.focus();
  }
</script>

<div class="context-header">
  <nav class="crumb" aria-label="Breadcrumb">{crumb[0]} / {crumb[1]}</nav>
  <div class="row">
    <h1 {id} aria-describedby="{id}-scope">{title}</h1>
    <ScopeChip {scope} {target} />
    <span class="sentence" id="{id}-scope">{sentence}</span>
    <span class="grow"></span>
    {#if page?.usesPreset && activePreset}
      <button type="button" class="echo" onclick={focusPreset}>Context: {activePreset.name}</button>
    {/if}
  </div>
</div>

<style>
  .context-header {
    position: sticky;
    top: var(--topbar-h);
    z-index: var(--z-sticky);
    padding: var(--sp-3) var(--page-pad);
    background: var(--surface-0);
    border-bottom: 1px solid var(--line-rule);
  }
  .crumb { font-size: var(--fs-12); color: var(--text-muted); }
  .row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-3); }
  h1 { margin: 0; font-size: var(--fs-26); line-height: var(--lh-tight); }
  .sentence { font-size: var(--fs-13); color: var(--text-soft); }
  .grow { flex: 1; }
  .echo {
    padding: 4px var(--sp-3);
    background: none;
    border: 1px dashed var(--line-control);
    border-radius: var(--r-1);
    color: var(--text-soft);
    font-size: var(--fs-12);
    cursor: pointer;
  }
  .echo:hover { border-color: var(--line-control-hover); color: var(--text-ink); }
  @media (max-width: 700px) {
    .context-header { position: static; padding: var(--sp-3) var(--page-pad-phone); }
    .crumb { display: none; }
    h1 { font-size: var(--fs-20); }
  }
  @media (max-height: 520px) {
    .context-header { position: static; }
  }
</style>
