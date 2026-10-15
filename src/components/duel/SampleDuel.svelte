<script>
  /**
   * SampleDuel.svelte - "One sample duel (not a statistic)" (ia.md §3.4): the traced duel on the
   * timeline, its swing/avoid/lost/disrupt counts with defined headers, and the event table. The
   * win-rate table above is the evidence; this panel is one draw from it.
   */
  import { formatFlat } from '../../lib/format.js';
  import { classifyDuelEvent, traceSummary } from '../../lib/features/duel.js';
  import { parseEventType } from '../../lib/engine/pvp/events.js';
  import DuelTimeline from '../DuelTimeline.svelte';
  import Panel from '../ui/Panel.svelte';
  import Button from '../ui/Button.svelte';

  /** @type {{trace: Object[], traceResult?: Object|null, attackerName: string, defenderName: string, mineSide: 'attacker'|'defender', seed?: any, rerolling?: boolean, onreroll: () => void}} */
  let { trace, traceResult = null, attackerName, defenderName, mineSide, seed = null, rerolling = false, onreroll } = $props();

  const EVENT_CAP = 60;
  const stats = $derived(traceSummary(trace));
  const other = (s) => (s === 'attacker' ? 'defender' : 'attacker');
  const rows = $derived([
    [mineSide === 'attacker' ? attackerName : defenderName, stats[mineSide]],
    [mineSide === 'attacker' ? defenderName : attackerName, stats[other(mineSide)]],
  ]);
  const won = $derived(traceResult ? traceResult.attackerWon === (mineSide === 'attacker') : null);
  const nameOf = (lane) => (lane === 'attacker' ? attackerName : lane === 'defender' ? defenderName : '');
  const events = $derived(
    trace
      .map((ev) => ({ ev, ...classifyDuelEvent(ev) }))
      .filter((m) => ['damage', 'heal', 'spell', 'death', 'end'].includes(m.mark)),
  );
  const shown = $derived(events.slice(0, EVENT_CAP));
  const label = (ev) => {
    const kind = parseEventType(ev.type).kind ?? ev.type;
    const text = String(kind).replace(/_/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
</script>

<Panel title="One sample duel (not a statistic)" scope="tool">
  {#snippet meta()}
    <span class="note">
      {#if seed != null}seed <span class="num">{seed}</span> · {/if}{won === null ? '' : won ? 'you win' : 'you lose'}{#if traceResult?.totalDuration} in <span class="num">{secs(traceResult.totalDuration)}</span>{/if}
    </span>
    <Button variant="ghost" size="small" disabled={rerolling} onclick={onreroll}>Re-roll sample</Button>
  {/snippet}

  <div class="tl">
    <DuelTimeline events={trace} {attackerName} {defenderName} durationMs={traceResult?.totalDuration ?? 0} />
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region must be keyboard reachable) -->
  <div class="scroll" tabindex="0" role="region" aria-label="Sample duel counts">
    <table class="stat-table" data-testid="trace-stats">
      <thead>
        <tr>
          <th scope="col"></th>
          <th scope="col" class="r" title="Basic attacks swung, including swings that were avoided or lost">Swings</th>
          <th scope="col" class="r" title="Share of swings that were critical hits">Crit</th>
          <th scope="col" class="r" title="Share of this side's swings the other side blocked or dodged">Avoided</th>
          <th scope="col" class="r" title="Swings this side lost to its own blind, paralysis or fear">Lost</th>
          <th scope="col" class="r" title="Blind, paralysis, silence, fear or stagger this side landed on the other">Disrupts</th>
          <th scope="col" class="r" title="Damage dealt, including spells and minions">Damage</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as [name, s] (name)}
          <tr>
            <th scope="row" class="lbl">{name}</th>
            <td class="r num">{s.swings}</td>
            <td class="r num">{s.swings ? pct(s.crits / s.swings) : '-'}</td>
            <td class="r num">{s.swings ? pct(s.avoided / s.swings) : '-'}</td>
            <td class="r num">{s.lost}</td>
            <td class="r num">{s.disrupts}</td>
            <td class="r num">{formatFlat(Math.round(s.damage))}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="note defs">
    Swings: basic attacks thrown. Avoided: swings the other side blocked or dodged. Lost: swings lost to blind, paralysis or fear.
    Disrupts: status effects landed on the other side.
  </p>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region must be keyboard reachable) -->
  <div class="scroll" tabindex="0" role="region" aria-label="Sample duel events">
    <table class="stat-table" data-testid="trace-events">
      <thead>
        <tr><th scope="col" class="r">Time</th><th scope="col">Who</th><th scope="col">Event</th><th scope="col" class="r">Amount</th></tr>
      </thead>
      <tbody>
        {#each shown as m, i (i)}
          <tr>
            <td class="r num">{secs(m.ev.timestamp)}</td>
            <td class="lbl">{nameOf(m.lane)}</td>
            <td class="lbl">{label(m.ev)}{m.ev.isCrit || m.ev.type?.endsWith('crit') ? ' (crit)' : ''}</td>
            <td class="r num">{m.amount ? formatFlat(Math.round(m.amount)) : '-'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if events.length > shown.length}
    <p class="note">Showing the first {shown.length} of {events.length} events.</p>
  {/if}
</Panel>

<style>
  .note { color: var(--text-muted); font-size: var(--fs-12); margin: 0; }
  .defs { max-width: 70ch; }
  .tl { overflow-x: auto; }
  .scroll { overflow: auto; max-height: 340px; }
  table { border-collapse: collapse; width: 100%; font-size: var(--fs-13); }
  th, td { padding: 3px var(--sp-3); border-bottom: 1px solid var(--line-hairline); text-align: left; }
  thead th { color: var(--text-muted); font-size: var(--fs-11); text-transform: uppercase; letter-spacing: 0.08em; }
  .r { text-align: right; }
  .lbl { font-weight: 400; color: var(--text-soft); font-family: var(--font-ui); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
</style>
