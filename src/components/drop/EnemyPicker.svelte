<script>
  /**
   * EnemyPicker.svelte - the PVE target for Drop Check's survival metric: a campaign chapter and
   * level, a classic dungeon step, a village raid step, or (Oblivion realm) a dungeon floor. Emits a spec for
   * features/swap.js buildEnemy().
   *
   * Props: value ({kind, ...}), realm ('base'|'oblivion'), playerLevel (marks raids above it), onchange(spec).
   */
  import { PVE_CHAPTERS, PVE_HARD_CHAPTERS, PVE_PROGRESS_CONSTANTS, chapterLabel } from '../../lib/game/combatPve.js';
  import { RAIDS } from '../../lib/game/fortress.js';
  import { CLASSIC_DUNGEONS, OBLIVION_FLOORS } from '../../lib/game/pveContent.js';
  import Select from '../ui/Select.svelte';

  let { value, realm = 'base', playerLevel = null, onchange } = $props();

  const levels = Array.from({ length: PVE_PROGRESS_CONSTANTS.levelsPerChapter }, (_, i) => i + 1);
  const kinds = $derived(
    realm === 'oblivion'
      ? [{ id: 'oblivion', label: 'Oblivion floor' }]
      : [{ id: 'campaign', label: 'Campaign' }, { id: 'dungeon', label: 'Dungeon' }, { id: 'raid', label: 'Village raid' }],
  );
  const kind = $derived(kinds.some((k) => k.id === value?.kind) ? value.kind : kinds[0].id);

  const chapterOptions = [...PVE_CHAPTERS, ...PVE_HARD_CHAPTERS].map((c) => ({ value: c.chapter, label: chapterLabel(c.chapter) }));
  const numbered = (list) => list.map((n) => ({ value: n, label: String(n) }));
  const levelOptions = numbered(levels);
  const stepOptions = numbered(Array.from({ length: 8 }, (_, i) => i + 1));
  const kindOptions = $derived(kinds.map((k) => ({ value: k.id, label: k.label })));
  const dungeonOptions = CLASSIC_DUNGEONS.map((d) => ({ value: d.id, label: d.name }));
  const raidOptions = $derived(
    RAIDS.map((r) => ({
      value: r.id,
      label: `${r.name}${playerLevel != null && playerLevel < r.requiredPlayerLevel ? ` (needs level ${r.requiredPlayerLevel})` : ''}`,
    })),
  );
  const floorOptions = OBLIVION_FLOORS.map((f) => ({ value: f.floor, label: String(f.floor) }));

  function pickKind(k) {
    if (k === 'campaign') onchange({ kind: 'campaign', chapter: 1, level: 1 });
    else if (k === 'dungeon') onchange({ kind: 'dungeon', id: CLASSIC_DUNGEONS[0].id, step: 1 });
    else if (k === 'raid') onchange({ kind: 'raid', id: RAIDS[0].id, step: 1 });
    else onchange({ kind: 'oblivion', floor: 10 });
  }
  const patch = (p) => onchange({ ...value, ...p });
</script>

<div class="enemy-picker">
  <Select label="Target" options={kindOptions} value={kind} onchange={pickKind} />

  {#if kind === 'campaign'}
    <Select label="Chapter" options={chapterOptions} value={value.chapter} onchange={(v) => patch({ chapter: Number(v) })} />
    <Select label="Level" options={levelOptions} value={value.level} onchange={(v) => patch({ level: Number(v) })} />
  {:else if kind === 'dungeon'}
    <Select label="Dungeon" options={dungeonOptions} value={value.id} onchange={(v) => patch({ id: v })} />
    <Select label="Step" options={stepOptions} value={value.step} onchange={(v) => patch({ step: Number(v) })} />
  {:else if kind === 'raid'}
    <Select label="Village raid" options={raidOptions} value={value.id} onchange={(v) => patch({ id: v })} />
    <Select label="Step" options={stepOptions} value={value.step} onchange={(v) => patch({ step: Number(v) })} />
  {:else}
    <Select label="Floor" options={floorOptions} value={value.floor} onchange={(v) => patch({ floor: Number(v) })} />
  {/if}
</div>

<style>
  .enemy-picker { display: grid; gap: var(--sp-3); min-width: 0; }
</style>
