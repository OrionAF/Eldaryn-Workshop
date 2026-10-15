<script>
  /**
   * Radio.svelte - one option of a radio group: a real <input type=radio> visually hidden over a
   * 16 px ring, same family as Checkbox (design-system §4.34). Group by sharing `name`; the caller
   * owns `checked` and reacts in `onchange`.
   */
  let { checked = false, label, name, value = '', ariaLabel, disabled = false, onchange = () => {} } = $props();
</script>

<label class="radio">
  <input type="radio" {name} {value} {checked} {disabled} aria-label={ariaLabel} onchange={() => onchange(value)} />
  <span class="ring" aria-hidden="true"></span>
  <span class="text">{label}</span>
</label>

<style>
  .radio {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-height: 24px;
    cursor: pointer;
    color: var(--text-soft);
    font-size: var(--fs-14);
  }
  .radio:hover { color: var(--text-ink); }
  input { position: absolute; opacity: 0; width: 16px; height: 16px; margin: 0; }
  .ring {
    position: relative;
    width: 16px;
    height: 16px;
    flex: none;
    border: 1px solid var(--line-control);
    border-radius: 50%;
    background: var(--surface-3);
  }
  .ring::after {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: var(--brass-400);
    transform: scale(0);
    transition: transform var(--dur-1) var(--ease-out);
  }
  input:checked + .ring { border-color: var(--brass-400); }
  input:checked + .ring::after { transform: scale(1); }
  input:focus-visible + .ring { outline: var(--focus-width) solid var(--focus-ring); outline-offset: var(--focus-offset); }
  input:disabled + .ring { border-color: var(--line-rule); background: transparent; }
  .radio:has(input:disabled) { color: var(--text-disabled); cursor: not-allowed; }
  @media (pointer: coarse), (max-width: 700px) {
    .radio { min-height: var(--hit); }
  }
</style>
