<script>
  /**
   * TargetPicker.svelte - the shared "Fight" picker (ia.md §3.3 step 2, §5.17): what a tool fights.
   * `target` is a bindable plain spec in the shape search/objectives.js resolveTarget accepts; the
   * objective follows `objectiveKindsFor(kind)` (the page owns the objective control). Under the
   * fields it prints the resolved target's fidelity and its labelled assumptions, so a server-run
   * fight is never presented as exact (plan Q1). Hard dungeons are `<id>_hard` ids (D1).
   * The PVP branch is disabled, with a link to Opponents, while the character has none.
   */
  import { TARGET_KINDS, objectiveKindsFor, resolveTarget } from '../../lib/search/objectives.js';
  import { targetOut } from '../../lib/search/result.js';
  import { PVP_MAX_OPPONENTS, PVP_SEATS } from '../../lib/search/pvpObjective.js';
  import { chapterLabel } from '../../lib/game/combatPve.js';
  import { RAIDS } from '../../lib/game/fortress.js';
  import { FORTRESS_BOSS_GROUPS } from '../../lib/engine/pve/fortressBoss.js';
  import { CLASSIC_DUNGEONS } from '../../lib/game/pveContent.js';
  import { WORLD_BOSS_AFFINITIES } from '../../lib/game/worldBoss.js';
  import { classLabel } from '../../lib/game/classes.js';
  import { TARGET_KIND_LABEL } from '../../lib/ui/optimiserView.js';
  import Select from '../ui/Select.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import Chip from '../Chip.svelte';
  import Button from '../ui/Button.svelte';

  let {
    target = $bindable(),
    objective = $bindable(),
    character = null,
    oblivionUnlocked = false,
    playerLevel = null,
    opponents = [],
    onNavigate = () => {},
  } = $props();

  const DEFAULTS = {
    dummy: { kind: 'dummy', seconds: 60 },
    chapter: { kind: 'chapter', chapter: 1, level: 1 },
    dungeon: { kind: 'dungeon', id: 'dungeon_1', step: 1 },
    raid: { kind: 'raid', id: 'raid_1', step: 1 },
    oblivion: { kind: 'oblivion', floor: 1 },
    worldBoss: { kind: 'worldBoss', affinity: 'NONE' },
    fortressBoss: { kind: 'fortressBoss', group: 'TOP', stars: 1, aliveDefenders: 0, maxClanSize: 50, kills: 0 },
    custom: { kind: 'custom', mob: { hp: 1000000, attack: 10000, attackSpeed: 1 }, seconds: 60 },
  };
  const pvpDefault = () => ({ kind: 'pvp', opponentIds: opponents.slice(0, 1).map((o) => o.id), seats: 'attacker' });
  const SEAT_LABEL = { attacker: 'Attacker', defender: 'Defender', both: 'Both' };
  const AFFINITY_LABEL = { NONE: 'None', FORTIFIED: 'Fortified', ENRAGED: 'Enraged' };

  const kinds = $derived([...TARGET_KINDS.filter((k) => k !== 'oblivion' || oblivionUnlocked || target.kind === 'oblivion'), 'pvp']);
  const kindOptions = $derived(
    kinds.map((k) => ({
      value: k,
      label: TARGET_KIND_LABEL[k],
      disabled: k === 'pvp' && opponents.length === 0 && target.kind !== 'pvp',
    })),
  );
  const dungeonOptions = [
    ...CLASSIC_DUNGEONS.map((d) => ({ value: d.id, label: d.name })),
    ...CLASSIC_DUNGEONS.map((d) => ({ value: `${d.id}_hard`, label: `Hard: ${d.name}` })),
  ];
  const raidOptions = $derived(
    RAIDS.map((r) => ({
      value: r.id,
      label: `${r.name}${playerLevel != null && playerLevel < r.requiredPlayerLevel ? ` (needs level ${r.requiredPlayerLevel})` : ''}`,
    })),
  );
  const affinityOptions = Object.keys(WORLD_BOSS_AFFINITIES).map((k) => ({ value: k, label: AFFINITY_LABEL[k] ?? k }));
  const GROUP_LABEL = { TOP: 'Top fortress (Fortress Guardian)', BOTTOM: 'Bottom fortress (Fortress Warden)', CORE: 'Core (Core Overlord)' };
  const groupOptions = FORTRESS_BOSS_GROUPS.map((g) => ({ value: g, label: GROUP_LABEL[g] ?? g }));
  const seatOptions = PVP_SEATS.map((s) => ({ value: s, label: SEAT_LABEL[s] }));
  const chosenIds = $derived(target.kind === 'pvp' ? target.opponentIds : []);

  function pickKind(kind) {
    if (kind === target.kind) return;
    target = kind === 'pvp' ? pvpDefault() : structuredClone(DEFAULTS[kind]);
    const allowed = objectiveKindsFor(kind, kind === 'pvp' ? null : target);
    if (!allowed.includes(objective.kind)) objective = { kind: allowed[0] };
  }

  function toggleOpponent(id) {
    const has = chosenIds.includes(id);
    if (!has && chosenIds.length >= PVP_MAX_OPPONENTS) return;
    target = { ...target, opponentIds: has ? chosenIds.filter((x) => x !== id) : [...chosenIds, id] };
  }

  function pickGroup(group) {
    const { stars, ...rest } = target;
    target = group === 'CORE' ? { ...rest, group } : { ...rest, group, stars: stars ?? 1 };
  }

  const patch = (p) => (target = { ...target, ...p });
  /** An emptied or invalid number field leaves the target as it was (resolveTarget would throw on NaN). */
  const patchInt = (key, v) => { if (Number.isFinite(v)) patch({ [key]: Math.round(v) }); };
  const patchMob = (p) => (target = { ...target, mob: { ...target.mob, ...p } });

  /** The target as the result will echo it: fidelity and tagged assumptions. Null while the fields are invalid. */
  const resolved = $derived.by(() => {
    try {
      return targetOut(resolveTarget($state.snapshot(target), { character }));
    } catch {
      return null;
    }
  });
  const fidelityText = $derived(
    resolved?.fidelity === 'server-model'
      ? 'The server runs this fight. The app models it from the client\'s own tables: a model, not exact rules.'
      : 'Fought with the client\'s own rules.',
  );
</script>

<div class="picker" data-testid="target-picker">
  <Select label="Fight" options={kindOptions} value={target.kind} onchange={pickKind} />

  {#if target.kind === 'pvp'}
    <div class="field" data-testid="pvp-opponents">
      <span class="lbl">Opponents (up to {PVP_MAX_OPPONENTS})</span>
      <div class="chips">
        {#each opponents as o (o.id)}
          <Chip label={`${o.name || 'Opponent'} (${classLabel(o.class)})`} selected={chosenIds.includes(o.id)} onClick={() => toggleOpponent(o.id)} />
        {/each}
      </div>
    </div>
    <div class="field" data-testid="pvp-seats">
      <span class="lbl">My seat</span>
      <SegmentedControl label="My seat" options={seatOptions} value={target.seats} onchange={(v) => patch({ seats: v })} />
    </div>
  {:else if target.kind === 'dummy'}
    <NumberField label="Seconds" unit="s" min={5} max={600} value={target.seconds} onchange={(v) => patch({ seconds: Math.round(v) })} />
  {:else if target.kind === 'chapter'}
    <div class="two">
      <NumberField label="Chapter" min={1} max={22} value={target.chapter} onchange={(v) => patch({ chapter: Math.round(v) })} />
      <NumberField label="Level" min={1} max={10} value={target.level} onchange={(v) => patch({ level: Math.round(v) })} />
    </div>
    <span class="hint" data-testid="chapter-name">{chapterLabel(target.chapter)}</span>
  {:else if target.kind === 'dungeon'}
    <Select label="Dungeon" options={dungeonOptions} value={target.id} onchange={(v) => patch({ id: v })} />
    <NumberField label="Step" min={1} max={8} value={target.step} onchange={(v) => patch({ step: Math.round(v) })} />
  {:else if target.kind === 'raid'}
    <Select label="Village raid" options={raidOptions} value={target.id} onchange={(v) => patch({ id: v })} />
    <NumberField label="Step" min={1} max={8} value={target.step} onchange={(v) => patch({ step: Math.round(v) })} />
  {:else if target.kind === 'oblivion'}
    <NumberField label="Floor" min={1} max={999} value={target.floor} onchange={(v) => patch({ floor: Math.round(v) })} />
    <Checkbox
      label="Apply the instability output cut (assumed, off by default)"
      checked={target.applyOutputCut === true}
      onchange={(on) => (target = on ? { ...target, applyOutputCut: true } : { kind: 'oblivion', floor: target.floor })}
    />
  {:else if target.kind === 'worldBoss'}
    <Select label="Affinity" options={affinityOptions} value={target.affinity} onchange={(v) => patch({ affinity: v })} />
  {:else if target.kind === 'fortressBoss'}
    <Select label="Fortress" options={groupOptions} value={target.group} onchange={pickGroup} />
    {#if target.group !== 'CORE'}
      <NumberField label="Stars" min={1} max={5} value={target.stars} onchange={(v) => patchInt('stars', v)} />
    {/if}
    <div class="two">
      <NumberField label="Alive defenders" min={0} value={target.aliveDefenders} onchange={(v) => patchInt('aliveDefenders', v)} />
      <NumberField label="Clan size" min={1} value={target.maxClanSize} onchange={(v) => patchInt('maxClanSize', v)} />
    </div>
    <NumberField label="Defender kills" min={0} value={target.kills} onchange={(v) => patchInt('kills', v)} />
    {#if resolved?.fortress}
      <span class="hint" data-testid="fortress-shield">
        Boss shield {resolved.fortress.shieldPercent}%. Credited damage is raw x {resolved.fortress.total.toFixed(2)}; the credit never changes which build is best.
      </span>
    {/if}
  {:else if target.kind === 'custom'}
    <NumberField label="Mob HP" min={1} value={target.mob.hp} onchange={(v) => patchMob({ hp: v })} />
    <div class="two">
      <NumberField label="Mob attack" min={0} value={target.mob.attack} onchange={(v) => patchMob({ attack: v })} />
      <NumberField label="Attack speed" min={0.1} value={target.mob.attackSpeed} onchange={(v) => patchMob({ attackSpeed: v })} />
    </div>
    <NumberField label="Seconds" unit="s" min={5} max={600} value={target.seconds} onchange={(v) => patch({ seconds: Math.round(v) })} />
  {/if}

  {#if opponents.length === 0}
    <p class="hint" data-testid="pvp-hint">
      PVP win rate needs a saved opponent.
      <Button variant="ghost" size="small" onclick={() => onNavigate('#/tools/opponents')}>Add one on Opponents</Button>
    </p>
  {/if}

  {#if resolved}
    <div class="fidelity" data-testid="fidelity" data-fidelity={resolved.fidelity}>
      <p class="hint">{fidelityText}</p>
      {#if resolved.assumptions.length}
        <ul class="assume" aria-label="Assumptions">
          {#each resolved.assumptions as a (a.id)}
            <li><b class="tag {a.tag.toLowerCase()}">{a.tag}</b> {a.label}{a.value ? `: ${a.value}` : ''}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .picker { display: grid; gap: var(--sp-3); }
  .field { display: grid; gap: 4px; }
  .lbl { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2); }
  .hint { margin: 0; color: var(--text-muted); font-size: var(--fs-12); }
  .assume { list-style: none; margin: var(--sp-1) 0 0; padding: 0; display: grid; gap: 3px; font-size: var(--fs-12); color: var(--text-soft); }
  .tag {
    display: inline-block;
    padding: 1px 5px;
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    font-size: var(--fs-11);
    letter-spacing: var(--track-label);
    color: var(--text-muted);
  }
  .tag.unresolved, .tag.server { color: var(--status-warn); border-color: var(--status-warn); }
</style>
