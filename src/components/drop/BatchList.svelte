<script>
  /**
   * BatchList.svelte - the ranked result of "Import drops": one row per imported item, best verdict
   * first. A row is a button; clicking it loads that item into the single-drop view (`onselect(entry)`),
   * where the full breakdown and "Apply to set" already work.
   *
   * Props: ranked (features/dropBatch.js rankEntries), cls (the character's class, for slot names),
   * status ('running'|'done'|'cancelled'|'error'), progress ({done,total}|null), stale (gear changed
   * since the check), skipped ([{name, reason}]), selectedKey, onselect, oncancel, onrerun.
   */
  import { rarityById } from '../../lib/game/gear.js';
  import { VERDICT_LABEL, VERDICT_GLYPH, flat, signedFlat, signedPct, ciFlat, rarityColor } from './dropFormat.js';
  import { slotLabel, statLabel, formatStatValue } from '../gear/gearFormat.js';

  let { ranked, cls, status = 'done', progress = null, stale = false, skipped = [], selectedKey = null, onselect, oncancel, onrerun } = $props();

  const running = $derived(status === 'running');

  function secondaries(item) {
    return (item.secondaryStats ?? []).map((s) => `${statLabel(s.type)} ${formatStatValue(s.type, s.value)}`);
  }
</script>

<section class="batch" aria-label="Imported drops">
  <div class="batch-head">
    <h3 class="subheading">Imported drops <span class="count mono">{ranked.length}</span></h3>
    {#if running}
      <span class="status" role="status">Checking{progress ? ` ${progress.done}/${progress.total}` : ''}…</span>
      <button type="button" class="btn-ghost" onclick={oncancel}>Cancel</button>
    {:else}
      <span class="status" role="status">
        {status === 'cancelled' ? 'Cancelled: unfinished items show the closed-form estimate.' : status === 'error' ? 'The check failed.' : 'Best verdict across all presets, simulated DPS.'}
      </span>
      <button type="button" class="btn-ghost" onclick={onrerun}>Check again</button>
    {/if}
  </div>
  {#if stale && !running}
    <p class="stale">Your gear changed since this check. Check again for current verdicts.</p>
  {/if}

  <ol class="items">
    {#each ranked as r, i (r.entry.key)}
      {@const e = r.entry}
      {@const b = r.best}
      <li>
        <button
          type="button"
          class="item {b?.verdict ?? ''}"
          class:selected={selectedKey === e.key}
          data-key={e.key}
          data-verdict={b?.verdict ?? 'empty'}
          aria-label={`Load ${e.name} into the single-drop view`}
          onclick={() => onselect(e)}
        >
          <span class="rank mono">{i + 1}</span>
          <span class="body">
            <span class="title">
              <span class="name" style:color={rarityColor(e.item.rarity)}>{e.name}</span>
              <span class="meta">
                {slotLabel(cls, e.slot)}{e.realm === 'oblivion' ? ' · Oblivion' : ''}
                · {e.item.rarity ? rarityById(e.item.rarity)?.name : 'unknown rarity'}
                {#if e.item.itemLevel}· ilvl <span class="mono">{e.item.itemLevel}</span>{/if}
              </span>
            </span>
            <span class="secs">
              {#each secondaries(e.item) as s}<span class="sec mono">{s}</span>{:else}<span class="sec">no secondaries</span>{/each}
              {#if e.dropped}<span class="sec dim">{e.dropped} not usable by this class</span>{/if}
            </span>
            {#if b}
              <span class="delta">
                <span class="badge"><span aria-hidden="true">{VERDICT_GLYPH[b.verdict]}</span> {VERDICT_LABEL[b.verdict]}</span>
                <span class="where">
                  {b.presetCount > 1 ? `best of ${b.presetCount} presets: ` : ''}{b.row.name}
                </span>
                {#if b.sim}
                  <span class="mono num" data-metric="sim">
                    {signedFlat(b.sim.delta.delta)} DPS ({signedPct(b.score, 2)})
                    <span class="ci">95% CI {ciFlat(b.sim.delta)}, N={b.sim.delta.n}</span>
                  </span>
                {:else}
                  <span class="mono num" data-metric="closed">
                    Auto-attack {flat(b.row.closed.before)} → {flat(b.row.closed.after)} ({signedPct(b.row.closed.pct, 2)})
                    <span class="ci">{running ? 'simulating…' : 'closed form, no interval'}</span>
                  </span>
                {/if}
              </span>
            {/if}
          </span>
        </button>
      </li>
    {/each}
  </ol>

  {#if skipped.length}
    <div class="skipped">
      <span class="micro-label">Skipped</span>
      <ul>
        {#each skipped as s}<li><span class="sk-name">{s.name}</span> <span class="sk-reason">{s.reason}</span></li>{/each}
      </ul>
    </div>
  {/if}
</section>

<style>
  .batch {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .batch-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .batch-head h3 {
    margin: 0;
  }
  .count {
    color: var(--color-muted);
    margin-left: 4px;
  }
  .status {
    flex: 1;
    min-width: 160px;
    font-size: 11.5px;
    color: var(--color-muted);
  }
  .stale {
    margin: 0;
    font-size: 11.5px;
    color: var(--color-warning);
  }
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .item {
    width: 100%;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    text-align: left;
    background: var(--color-inset);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 9px 12px;
    color: var(--color-ink);
    cursor: pointer;
    font: inherit;
  }
  .item:hover,
  .item.selected {
    border-color: var(--color-gold-light);
  }
  .item.upgrade {
    border-left: 3px solid var(--color-upgrade);
  }
  .item.downgrade {
    border-left: 3px solid var(--color-downgrade);
  }
  .item.mixed {
    border-left: 3px solid var(--color-warning);
  }
  .rank {
    min-width: 1.5em;
    color: var(--color-dim);
    font-size: 12px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }
  .title {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .name {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 12.5px;
    letter-spacing: 0.06em;
  }
  .meta,
  .secs {
    font-size: 11px;
    color: var(--color-muted);
  }
  .secs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
  }
  .sec.dim,
  .ci {
    color: var(--color-dim);
  }
  .delta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    font-size: 11.5px;
  }
  .badge {
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--color-muted);
  }
  .upgrade .badge,
  .upgrade .num {
    color: var(--color-upgrade);
  }
  .downgrade .badge,
  .downgrade .num {
    color: var(--color-downgrade);
  }
  .mixed .badge {
    color: var(--color-warning);
  }
  .where {
    color: var(--color-muted);
  }
  .ci {
    margin-left: 4px;
  }
  .skipped {
    font-size: 11.5px;
    color: var(--color-muted);
  }
  .skipped ul {
    margin: 2px 0 0;
    padding-left: 16px;
  }
  .sk-reason {
    color: var(--color-dim);
  }
  @media (max-width: 700px) {
    .item {
      min-height: 44px;
    }
  }
</style>
