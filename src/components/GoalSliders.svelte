<script>
  /**
   * The PVP/Custom goal's three factor sliders (Maximum Damage / Damage
   * Mitigation / Survivability). Invariant: the three weights always sum to
   * 100 - moving one slider redistributes the remainder across the other two
   * proportionally to their current values (equal split when both are 0), so
   * "70/20/10" is always a complete statement of the blend. Emits the full
   * weights record via onChange; the parent persists it (setPresetGoal
   * re-normalises, so the invariant also survives bad input).
   */
  import Slider from './Slider.svelte';

  let { weights, onChange } = $props();

  const FACTORS = [
    { key: 'damage', label: 'Maximum Damage' },
    { key: 'mitigation', label: 'Damage Mitigation' },
    { key: 'survivability', label: 'Survivability' },
  ];

  function setWeight(key, rawValue) {
    const value = Math.max(0, Math.min(100, Number(rawValue) || 0));
    const rest = 100 - value;
    const others = FACTORS.filter((f) => f.key !== key).map((f) => f.key);
    const otherSum = (Number(weights[others[0]]) || 0) + (Number(weights[others[1]]) || 0);
    const next = { [key]: value };
    if (otherSum <= 0) {
      next[others[0]] = rest / 2;
      next[others[1]] = rest / 2;
    } else {
      next[others[0]] = ((Number(weights[others[0]]) || 0) / otherSum) * rest;
      next[others[1]] = ((Number(weights[others[1]]) || 0) / otherSum) * rest;
    }
    onChange(next);
  }
</script>

<div class="goal-sliders">
  {#each FACTORS as f (f.key)}
    <label class="factor">
      <span class="factor-label micro-label">{f.label}</span>
      <Slider
        min={0}
        max={100}
        step={1}
        value={Math.round(Number(weights[f.key]) || 0)}
        oninput={(v) => setWeight(f.key, v)}
        ariaLabel={f.label}
      />
      <span class="factor-value">{Math.round(Number(weights[f.key]) || 0)}</span>
    </label>
  {/each}
</div>

<style>
  .goal-sliders {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .factor {
    display: grid;
    grid-template-columns: 110px 1fr 34px;
    align-items: center;
    gap: 8px;
  }
  /* Slider look lives in app.css's .slider block. */
  .factor-value {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: var(--color-soft);
    text-align: right;
  }
</style>
