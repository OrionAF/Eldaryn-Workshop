<script>
  /**
   * Panel.svelte - the framed container (design-system §2.11, §4.3).
   *
   * `level` 'primary' is F2 (brass frame, plate header, corner ticks), 'secondary' is F1. A view
   * has at most two primary panels (the screenshot lint counts `.panel.primary`). `scope` draws the
   * 2 px top rule in the scope hue and renders the ONE scope badge as text; `scope="oblivion"` also
   * adds the realm ring. Loading keeps the header and skeletons the body; error puts a Banner on top.
   */
  import Banner from './Banner.svelte';
  import Skeleton from './Skeleton.svelte';

  const SCOPES = {
    character: 'Character',
    preset: 'Preset',
    mount: 'Mount',
    oblivion: 'Oblivion',
    tool: 'Tool',
  };

  let {
    title,
    level = 'secondary',
    scope = null,
    scopeLabel = null,
    stale = false,
    loading = false,
    error = null,
    flush = false,
    meta,
    footer,
    children,
  } = $props();

  const id = $props.id();
  const badge = $derived(scopeLabel ?? (scope ? SCOPES[scope] : null));
</script>

<section
  class="panel"
  class:primary={level === 'primary'}
  class:realm-oblivion={scope === 'oblivion'}
  class:is-stale={stale}
  style={scope ? `--frame-c: var(--frame-${scope})` : undefined}
  aria-labelledby="{id}-title"
  aria-busy={loading ? 'true' : undefined}
>
  <header class="panel-head">
    <h2 id="{id}-title" class:display={level === 'primary'}>{title}</h2>
    {#if badge}<span class="scope-badge" style="--scope-c: var(--scope-{scope ?? 'tool'})">{badge}</span>{/if}
    {#if stale}<span class="stale-tag">Stale</span>{/if}
    <span class="spacer"></span>
    {@render meta?.()}
  </header>
  <div class="panel-body" class:flush>
    {#if error}<div class="err"><Banner variant="error">{error}</Banner></div>{/if}
    {#if loading}
      <Skeleton lines={3} />
    {:else}
      {@render children?.()}
    {/if}
  </div>
  {#if footer}<footer class="panel-foot">{@render footer()}</footer>{/if}
</section>

<style>
  .panel {
    position: relative;
    min-width: 0;
    background: var(--surface-2);
    border: 1px solid var(--line-rule);
    border-top: 2px solid var(--frame-c, var(--line-rule));
    border-radius: var(--r-1);
  }
  .panel-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    flex-wrap: wrap;
    min-height: var(--hit);
    padding: var(--sp-2) var(--sp-4);
    border-bottom: 1px solid var(--line-hairline);
  }
  .spacer { flex: 1; }
  h2 {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--fs-14);
    font-weight: var(--fw-bold);
    color: var(--text-ink);
  }
  h2.display { font-family: var(--font-display); font-size: var(--fs-20); line-height: var(--lh-tight); }
  .panel-body { padding: var(--sp-4); display: grid; gap: var(--sp-3); }
  .panel-body.flush { padding: 0; gap: 0; }
  .panel-foot {
    padding: var(--sp-3) var(--sp-4);
    border-top: 1px solid var(--line-hairline);
    display: flex;
    gap: var(--sp-2);
    align-items: center;
    flex-wrap: wrap;
  }
  .scope-badge {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border: 1px solid var(--scope-c);
    border-radius: var(--r-1);
    color: var(--scope-c);
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
  }
  .stale-tag {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 5px;
    border: 1px dotted var(--line-control);
    border-radius: var(--r-1);
    color: var(--text-muted);
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* F2 primary: brass frame, plate header, four corner ticks drawn as gradients. */
  .panel.primary {
    --t: linear-gradient(var(--brass-400), var(--brass-400));
    border-color: var(--frame-brass);
    border-top-color: var(--frame-c, var(--frame-brass));
    background: var(--sheen), var(--surface-2);
    box-shadow: var(--frame-highlight), var(--frame-inner), 0 0 0 1px var(--frame-edge);
  }
  .panel.primary > .panel-head { background: var(--plate); border-bottom: 2px solid var(--frame-brass); }
  .panel.primary::before {
    content: '';
    position: absolute;
    inset: -2px -1px -1px -1px;
    pointer-events: none;
    background:
      var(--t) 0 0 / var(--tick) var(--tick-w) no-repeat, var(--t) 0 0 / var(--tick-w) var(--tick) no-repeat,
      var(--t) 100% 0 / var(--tick) var(--tick-w) no-repeat, var(--t) 100% 0 / var(--tick-w) var(--tick) no-repeat,
      var(--t) 0 100% / var(--tick) var(--tick-w) no-repeat, var(--t) 0 100% / var(--tick-w) var(--tick) no-repeat,
      var(--t) 100% 100% / var(--tick) var(--tick-w) no-repeat, var(--t) 100% 100% / var(--tick-w) var(--tick) no-repeat;
  }
  .panel.realm-oblivion {
    box-shadow: var(--frame-highlight), var(--frame-inner), 0 0 0 1px var(--frame-edge),
      inset 0 0 0 2px color-mix(in srgb, var(--frame-oblivion) 55%, transparent);
  }
</style>
