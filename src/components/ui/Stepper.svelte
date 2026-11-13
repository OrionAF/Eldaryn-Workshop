<script>
  /**
   * Stepper.svelte - `[-] value [+]` in one bordered group (design-system §4.8).
   *
   * The value is a real `input[type=number]` (spinbutton semantics); the buttons are labelled and
   * use aria-disabled at the limits so they stay focusable. Up/Down step, Shift+arrow steps x10,
   * Home/End jump to min/max when both are set. Values are clamped to [min, max].
   */
  let { value = $bindable(0), min = -Infinity, max = Infinity, step = 1, label, onchange = () => {} } = $props();

  const clamp = (n) => Math.min(max, Math.max(min, n));

  function set(n) {
    const next = clamp(n);
    if (next === value) return;
    value = next;
    onchange(next);
  }
  function bump(dir, mult = 1) {
    set((Number(value) || 0) + dir * step * mult);
  }
  function onKeyDown(event) {
    if (event.key === 'ArrowUp') bump(1, event.shiftKey ? 10 : 1);
    else if (event.key === 'ArrowDown') bump(-1, event.shiftKey ? 10 : 1);
    else if (event.key === 'Home' && Number.isFinite(min)) set(min);
    else if (event.key === 'End' && Number.isFinite(max)) set(max);
    else return;
    event.preventDefault();
  }
  function onCommit(event) {
    const n = Number(event.currentTarget.value);
    if (Number.isFinite(n) && event.currentTarget.value !== '') set(n);
    event.currentTarget.value = String(value);
  }
</script>

<div class="stepper" role="group" aria-label={label}>
  <button type="button" aria-label="Decrease {label}" aria-disabled={value <= min ? 'true' : undefined} onclick={() => value > min && bump(-1)}>−</button>
  <input
    type="number"
    class="num"
    aria-label={label}
    min={Number.isFinite(min) ? min : undefined}
    max={Number.isFinite(max) ? max : undefined}
    {step}
    {value}
    onkeydown={onKeyDown}
    onchange={onCommit}
  />
  <button type="button" aria-label="Increase {label}" aria-disabled={value >= max ? 'true' : undefined} onclick={() => value < max && bump(1)}>+</button>
</div>

<style>
  .stepper {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    background: var(--surface-3);
    height: var(--control-h);
  }
  button {
    width: 30px;
    height: 100%;
    border: 0;
    background: transparent;
    color: var(--text-soft);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0; /* the global button padding pushed the glyph below centre */
    font-family: var(--font-data); /* its minus and plus sit on the centre line */
    font-size: var(--fs-16);
    line-height: 1;
    transition: transform var(--dur-1) var(--ease-out), background-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
  }
  button:hover { color: var(--text-ink); background: var(--surface-4); }
  button:active:not([aria-disabled='true']) { transform: scale(0.9); transition-duration: var(--dur-press); }
  button[aria-disabled='true'] { color: var(--text-disabled); cursor: not-allowed; background: transparent; }
  input {
    width: 56px;
    height: 100%;
    padding: 0;
    border-radius: 0; /* the global input radius bent the divider borders into an inner box */
    text-align: center;
    background: transparent;
    color: var(--text-ink);
    border: 0;
    border-left: 1px solid var(--line-rule);
    border-right: 1px solid var(--line-rule);
    font-family: var(--font-data);
    font-size: var(--fs-13);
    appearance: textfield;
    -moz-appearance: textfield;
  }
  input::-webkit-inner-spin-button,
  input::-webkit-outer-spin-button { appearance: none; margin: 0; }
  @media (pointer: coarse), (max-width: 700px) {
    .stepper { height: var(--hit); }
    button { width: var(--hit); }
  }
</style>
