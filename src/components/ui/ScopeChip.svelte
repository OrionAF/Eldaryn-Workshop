<script>
  /**
   * ScopeChip.svelte - what a change writes, and what else it touches (design-system §4.11):
   * "PRESET | Farm build only", "CHARACTER | Talent Set A, also Boss build". `sideEffects` is a
   * list of preset names (or {name} objects). Reads as one sentence.
   */
  let { scope = 'preset', target = '', sideEffects = [] } = $props();
  const LABEL = { character: 'Character', preset: 'Preset', mount: 'Mount', oblivion: 'Oblivion', tool: 'Tool' };
  const names = $derived(sideEffects.map((s) => (typeof s === 'string' ? s : s.name)));
</script>

<span class="scope-chip" style="--scope-c: var(--scope-{scope})">
  <b>{LABEL[scope] ?? scope}</b>
  <span class="t">{target}{#if names.length}{target ? ', ' : ''}<em>also {names.join(', ')}</em>{/if}</span>
</span>

<style>
  .scope-chip {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--scope-c);
    border-radius: var(--r-1);
    font-size: var(--fs-11);
    line-height: 1;
    white-space: nowrap;
    max-width: 100%;
  }
  b {
    display: inline-flex;
    align-items: center;
    padding: 3px 6px;
    color: var(--scope-c);
    font-weight: var(--fw-heavy);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    background: color-mix(in srgb, var(--scope-c) 10%, transparent);
  }
  .t {
    display: inline-flex;
    align-items: center;
    padding: 3px 7px;
    color: var(--text-soft);
    border-left: 1px solid color-mix(in srgb, var(--scope-c) 45%, transparent);
    font-size: var(--fs-12);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  em { font-style: normal; color: var(--status-warn); font-weight: var(--fw-bold); }
</style>
