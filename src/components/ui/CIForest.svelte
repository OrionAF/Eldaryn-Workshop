<script>
  /**
   * CIForest.svelte - one interval mark on the table's shared scale (design-system §4.15).
   *
   * `domain` is the table's {min,max,step}; `tone` is up | down | side | base | est. An interval
   * bar is drawn only when lo and hi are finite and tone is not est; an est mark is a hollow
   * diamond. Colour comes from `tone`, which the caller derives from the verdict (never from the
   * sign of the point estimate). `label` is the visually hidden sentence for assistive tech.
   */
  import { forestPos } from '../../lib/ui/forestScale.js';

  let { domain, est = null, lo = null, hi = null, tone = 'side', label = '' } = $props();
  const ok = (v) => v != null && Number.isFinite(v);
  const bar = $derived(tone !== 'est' && ok(lo) && ok(hi));
  const left = $derived(bar ? forestPos(lo, domain) : 0);
  const width = $derived(bar ? forestPos(hi, domain) - left : 0);
</script>

<span class="wrap">
  <span class="forest is-{tone}" style="--zero: {forestPos(0, domain)}%" aria-hidden="true">
    {#if bar}<i class="bar" style="left: {left}%; width: {width}%"></i>{/if}
    {#if ok(est)}<i class="pt" style="left: {forestPos(est, domain)}%"></i>{/if}
  </span>
  {#if label}<span class="visually-hidden">{label}</span>{/if}
</span>

<style>
  .wrap { display: block; min-width: 0; }
  .forest { --fc: var(--verdict-side); position: relative; display: block; height: 22px; }
  .forest::before {
    content: '';
    position: absolute;
    top: -8px;
    bottom: -8px;
    left: var(--zero, 50%);
    width: 1px;
    background: var(--line-control);
  }
  .bar {
    position: absolute;
    top: 50%;
    height: 6px;
    margin-top: -3px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--fc) 45%, transparent);
    border: 1px solid var(--fc);
    box-sizing: border-box;
    min-width: 2px;
  }
  .pt {
    position: absolute;
    top: 50%;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    transform: rotate(45deg);
    background: var(--fc);
    border: 1.5px solid var(--surface-0);
    box-sizing: border-box;
  }
  .is-up { --fc: var(--verdict-up); }
  .is-down { --fc: var(--verdict-down); }
  .is-side { --fc: var(--verdict-side); }
  .is-base { --fc: var(--brass-400); }
  .is-est .pt { background: transparent; border: 1.5px dashed var(--text-muted); }
</style>
