<script>
  /**
   * Slider.svelte - the app's only range input.
   *
   * Exists because a native range thumb is edge-aligned inside its own track,
   * so its centre can never reach either end (see the `.slider` block in
   * app.css for the full explanation and the geometry that fixes it). That fix
   * needs the visible track to be a separate element from the input, which is
   * markup, not styling - hence a component rather than a CSS-only rule.
   *
   * Geometry: the visible track is a separate element and the real input is overlaid
   * `thumb`-wider than it, offset by `-thumb/2`, so the thumb's CENTRE travels the track's full
   * 0-100%. The thumb overhangs the wrapper by thumb/2 at each extreme - that is the point, so
   * never clip `.slider`. `--fill` (0-100%) is set inline from format.js fillPct().
   *
   * `oninput` receives the parsed Number, not the event - every call site was
   * doing `Number(e.target.value)` anyway. `value` is bindable, so call sites
   * can use either `bind:value` or `oninput`.
   */
  import { fillPct } from '../lib/format.js';

  let {
    value = $bindable(0),
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    ariaLabel = undefined,
    ariaValueText = undefined,
    oninput = () => {},
    ...rest
  } = $props();

  const pct = $derived(fillPct(value, min, max));
</script>

<div class="slider" style="--fill:{pct}%">
  <div class="slider-track"></div>
  <input
    type="range"
    {min}
    {max}
    {step}
    {value}
    {disabled}
    aria-label={ariaLabel}
    aria-valuetext={ariaValueText}
    oninput={(e) => {
      value = Number(e.currentTarget.value);
      oninput(value);
    }}
    {...rest}
  />
</div>

<style>
  .slider {
    --slider-thumb: 18px;
    --slider-track-h: 6px;
    --fill: 0%;
    position: relative;
    display: flex;
    align-items: center;
    height: var(--slider-thumb);
    min-width: 60px;
    /* Reserve the thumb's overhang so the knob never laps onto a neighbouring label or value. */
    margin-inline: calc(var(--slider-thumb) / 2);
  }

  .slider-track {
    position: absolute;
    inset-inline: 0;
    height: var(--slider-track-h);
    border-radius: 2px;
    background: linear-gradient(to right, var(--brass-500) 0 var(--fill), var(--surface-4) var(--fill) 100%);
    border: 1px solid var(--line-control);
    pointer-events: none;
  }

  input[type='range'] {
    position: relative;
    appearance: none;
    -webkit-appearance: none;
    width: calc(100% + var(--slider-thumb));
    margin-inline: calc(var(--slider-thumb) / -2);
    height: var(--slider-thumb);
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  /* Both native tracks stay invisible - .slider-track is what you actually see. */
  input[type='range']::-webkit-slider-runnable-track,
  input[type='range']::-moz-range-track {
    height: var(--slider-thumb);
    background: transparent;
    border: none;
  }

  /* A brass diamond with a dark edge (design-system §4.24). */
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: calc(var(--slider-thumb) * 0.8);
    height: calc(var(--slider-thumb) * 0.8);
    margin-top: calc(var(--slider-thumb) * 0.1);
    border-radius: 2px;
    transform: rotate(45deg);
    background: var(--brass-200);
    border: 2px solid var(--surface-0);
    box-shadow: 0 0 0 1px var(--brass-500);
  }

  input[type='range']::-moz-range-thumb {
    width: calc(var(--slider-thumb) * 0.8);
    height: calc(var(--slider-thumb) * 0.8);
    box-sizing: border-box;
    border-radius: 2px;
    transform: rotate(45deg);
    background: var(--brass-200);
    border: 2px solid var(--surface-0);
    box-shadow: 0 0 0 1px var(--brass-500);
  }

  input[type='range']:focus-visible {
    outline: none;
  }
  input[type='range']:focus-visible::-webkit-slider-thumb {
    outline: var(--focus-width) solid var(--focus-ring);
    outline-offset: var(--focus-offset);
  }
  input[type='range']:focus-visible::-moz-range-thumb {
    outline: var(--focus-width) solid var(--focus-ring);
    outline-offset: var(--focus-offset);
  }

  input[type='range']:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* A fingertip needs a bigger knob and a 44 px row. */
  @media (pointer: coarse), (max-width: 700px) {
    .slider {
      --slider-thumb: 28px;
      --slider-track-h: 8px;
      height: var(--hit);
    }
  }
</style>
