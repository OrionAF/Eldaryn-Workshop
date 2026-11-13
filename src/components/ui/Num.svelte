<script>
  /**
   * Num.svelte - a figure that shows its own change (design-system §2.13). When `value` moves, the digits
   * roll to the new figure and tint for a moment: `flash="verdict"` tints up or down (only where more is
   * better), `"neutral"` tints brass either way, `"none"` only rolls.
   *
   * Decoration only. The text is always format(value) unless a roll is in flight, and with reduced motion
   * (or under jsdom) no roll ever starts.
   */
  import { untrack } from 'svelte';
  import { motionOK, cssMs, cssToken, flashColor } from '../../lib/motion.js';

  let { value, format = String, flash = 'neutral' } = $props();

  let el = $state(null);
  let rolling = $state(null); // the in-between figure while the digits roll
  let prev = untrack(() => value);
  let frame = 0;

  $effect(() => {
    const to = value;
    const from = untrack(() => rolling) ?? prev;
    prev = to;
    if (to === from || !Number.isFinite(to) || !Number.isFinite(from) || !motionOK()) {
      rolling = null;
      return;
    }
    const whole = Number.isInteger(to) && Number.isInteger(from);
    const ms = cssMs('--dur-3') * 1.5;
    const t0 = performance.now();
    rolling = from; // hold the old figure until the first frame, or the new one would show for one
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const at = from + (to - from) * (1 - (1 - p) ** 4);
      rolling = p === 1 ? null : whole ? Math.round(at) : at;
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    if (flash === 'verdict') flashColor(el, cssToken(to > from ? '--verdict-up' : '--verdict-down'));
    else if (flash === 'neutral') flashColor(el, cssToken('--brass-200'));
    return () => cancelAnimationFrame(frame);
  });
</script>

<span class="num-roll" bind:this={el}>{format(rolling ?? value)}</span>

<style>
  .num-roll { font-variant-numeric: tabular-nums; }
</style>
