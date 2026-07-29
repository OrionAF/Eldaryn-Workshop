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
   * All visual styling lives in app.css so a stray bare `input[type=range]`
   * elsewhere still inherits the same look.
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
