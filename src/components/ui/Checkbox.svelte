<script>
  /**
   * Checkbox.svelte - real <input type=checkbox> visually hidden over a 16 px box; `switch`
   * renders the 32x18 pill and role=switch (design-system §4.34). Focus ring lands on the box.
   */
  let { checked = $bindable(false), label, switch: isSwitch = false, disabled = false, onchange = () => {} } = $props();
</script>

<label class="check" class:switch={isSwitch}>
  <input
    type="checkbox"
    role={isSwitch ? 'switch' : undefined}
    bind:checked
    {disabled}
    onchange={() => onchange(checked)}
  />
  <span class="box" aria-hidden="true">
    {#if !isSwitch}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
    {/if}
  </span>
  <span class="text">{label}</span>
</label>

<style>
  .check {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-height: 24px;
    cursor: pointer;
    color: var(--text-soft);
    font-size: var(--fs-14);
  }
  .check:hover { color: var(--text-ink); }
  input { position: absolute; opacity: 0; width: 16px; height: 16px; margin: 0; }
  .box {
    width: 16px;
    height: 16px;
    flex: none;
    display: grid;
    place-items: center;
    border: 1px solid var(--line-control);
    border-radius: 2px;
    background: var(--surface-3);
    color: transparent;
  }
  .box svg { width: 12px; height: 12px; }
  input:checked + .box { background: var(--brass-400); border-color: var(--brass-400); color: var(--on-brass); }
  input:focus-visible + .box { outline: var(--focus-width) solid var(--focus-ring); outline-offset: var(--focus-offset); }
  input:disabled + .box { border-color: var(--line-rule); background: transparent; }
  .check:has(input:disabled) { color: var(--text-disabled); cursor: not-allowed; }
  .switch .box { width: 32px; height: 18px; border-radius: var(--r-pill); position: relative; }
  .switch .box::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--text-soft);
    transition: transform var(--dur-1) var(--ease-out);
  }
  .switch input:checked + .box { background: var(--brass-tint); border-color: var(--brass-400); }
  .switch input:checked + .box::after { transform: translateX(14px); background: var(--brass-400); }
  @media (pointer: coarse), (max-width: 700px) {
    .check { min-height: var(--hit); }
  }
</style>
