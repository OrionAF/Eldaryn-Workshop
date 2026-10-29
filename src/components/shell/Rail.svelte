<script>
  /**
   * Rail.svelte - the one navigation tree (ia.md §2, design-system §4.1/§4.27).
   *
   * `<nav aria-label="Main">` lists the 18 pages in three groups. CSS lays it out as the full rail
   * (>= 1280), the 64px icon rail (labels hidden, `data-tip` flyout) and, on a phone, as the area
   * strip under the top bar (only the current area's group, scrolling sideways). `<nav
   * aria-label="Areas">` is the phone bottom tab bar (Character / Builds / Tools); CSS shows
   * one or the other. There is no JS breakpoint switch.
   *
   * Items are plain anchors, so Back/Forward, deep links and open-in-new-tab work without handlers.
   */
  import { AREAS } from '../../lib/routes.js';
  import { navGroups } from '../navVisibility.js';
  import { areaHash } from '../../lib/router.svelte.js';
  import NavIcon from './NavIcon.svelte';

  let { route, character } = $props();

  const groups = $derived(navGroups(character));
  const currentArea = $derived(route.kind === 'page' ? route.area : null);

  // Re-read when the route changes: the router has just stored the page as that area's last-used.
  const areaLinks = $derived.by(() => {
    void route;
    return Object.fromEntries(AREAS.map((a) => [a.id, areaHash(a.id)]));
  });

  const idFor = (areaId) => `rail-head-${areaId}`;
  /** Phone strip labels that would not fit; the full label stays on the rail and is the link's name. */
  const SHORT_LABEL = { 'tools/oblivion': 'Oblivion' };
</script>

<nav class="rail" aria-label="Main">
  {#each groups as { area, items } (area.id)}
    <section class="group" class:current={currentArea === area.id} aria-labelledby={idFor(area.id)}>
      <h2 class="group-head micro-label" id={idFor(area.id)}>{area.label}</h2>
      <ul>
        {#each items as { page, locked, needsClass } (page.id)}
          <li>
            <a
              class="item"
              href={`#/${page.id}`}
              data-tip={page.label}
              data-page={page.id}
              aria-label={SHORT_LABEL[page.id] ? page.label : undefined}
              aria-current={route.kind === 'page' && route.id === page.id ? 'page' : undefined}
            >
              <span class="glyph"><NavIcon name={page.id} /></span>
              {#if SHORT_LABEL[page.id]}
                <span class="label label-full">{page.label}</span>
                <span class="label label-short" aria-hidden="true">{SHORT_LABEL[page.id]}</span>
              {:else}
                <span class="label">{page.label}</span>
              {/if}
              {#if locked}
                <span class="tag lock"><NavIcon name="lock" size={12} /> locked</span>
              {:else if needsClass}
                <span class="tag">needs class</span>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
  <p class="privacy">100% local: nothing leaves this device.</p>
</nav>

<nav class="areas" aria-label="Areas">
  {#each AREAS as area (area.id)}
    <a class="tab" href={areaLinks[area.id]} aria-current={currentArea === area.id ? 'page' : undefined}>
      <span class="glyph"><NavIcon name={area.id} size={20} /></span>
      <span class="micro-label">{area.label}</span>
    </a>
  {/each}
</nav>

<style>
  .rail {
    position: sticky;
    top: var(--topbar-h);
    align-self: start;
    height: calc(100vh - var(--topbar-h));
    overflow-y: auto;
    width: var(--rail-w);
    padding: var(--sp-3) 0 var(--sp-4);
    background: var(--surface-1);
    border-right: 1px solid var(--line-rule);
    z-index: var(--z-rail);
  }
  .group + .group { margin-top: var(--sp-3); }
  .group-head {
    margin: 0;
    padding: var(--sp-2) var(--sp-4);
    font-family: var(--font-ui);
    font-size: var(--fs-11);
    color: var(--brass-400);
    border-bottom: 1px solid var(--brass-700);
  }
  ul { list-style: none; margin: 0; padding: var(--sp-1) 0 0; }
  .item {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-height: 36px;
    padding: 0 var(--sp-4);
    color: var(--text-soft);
    text-decoration: none;
    font-size: var(--fs-14);
  }
  .item:hover { background: var(--surface-3); color: var(--text-ink); }
  .item[aria-current='page'] {
    background: var(--surface-4);
    color: var(--text-ink);
    font-weight: var(--fw-bold);
    box-shadow: inset 3px 0 0 var(--ember-500);
  }
  .glyph { display: inline-flex; justify-content: center; width: 18px; color: var(--brass-400); }
  .label-short { display: none; }
  .lock { display: inline-flex; align-items: center; gap: 4px; }
  .tag {
    margin-left: auto;
    font-size: var(--fs-11);
    color: var(--text-muted);
    white-space: nowrap;
  }
  .privacy {
    margin: var(--sp-6) var(--sp-4) 0;
    font-size: var(--fs-12);
    color: var(--text-muted);
  }

  .areas { display: none; }

  /* Icon rail: labels hidden, the data-tip flyout names the page. */
  @media (max-width: 1279px) {
    .rail { width: var(--rail-w-icon); }
    .group-head {
      height: 0;
      padding: 0;
      overflow: hidden;
      border-bottom: 1px solid var(--brass-700);
      margin: var(--sp-1) var(--sp-3);
    }
    .item { justify-content: center; padding: 0; }
    .label, .tag, .privacy { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; margin: 0; }
    .item:hover::after, .item:focus-visible::after {
      content: attr(data-tip);
      position: fixed;
      left: calc(var(--rail-w-icon) + var(--sp-1));
      padding: 6px var(--sp-2);
      background: var(--surface-4);
      border: 1px solid var(--line-control);
      border-radius: var(--r-2);
      box-shadow: var(--elev-2);
      font-size: var(--fs-12);
      color: var(--text-ink);
      white-space: nowrap;
      z-index: var(--z-tooltip);
    }
  }

  /* Phone: the strip lists the current area's pages; the tab bar picks the area. */
  @media (max-width: 700px) {
    .rail {
      position: sticky;
      top: var(--topbar-h-phone);
      width: auto;
      height: auto;
      display: flex;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-snap-type: x proximity;
      padding: 0;
      border-right: 0;
      border-bottom: 1px solid var(--line-rule);
      z-index: var(--z-sticky);
    }
    .group:not(.current), .group-head, .privacy { display: none; }
    .group + .group { margin: 0; }
    ul { display: flex; padding: 0; }
    li { flex: none; scroll-snap-align: start; }
    .item { min-height: var(--hit); padding: 0 var(--sp-3); }
    .item[aria-current='page'] { box-shadow: inset 0 -3px 0 var(--brass-400); background: none; }
    .item .label, .item .tag { position: static; width: auto; height: auto; clip-path: none; margin: 0; }
    .item .glyph { display: none; }
    .item .label-full { display: none; }
    .item .label-short { display: inline; }
    .item:hover::after, .item:focus-visible::after { content: none; }
    .areas {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      padding-bottom: env(safe-area-inset-bottom, 0px);
      background: var(--surface-1);
      border-top: 1px solid var(--line-rule);
      z-index: var(--z-topbar);
    }
    .tab {
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 2px;
      height: 56px;
      min-height: var(--hit);
      color: var(--text-soft);
      text-decoration: none;
      background: none;
      border: 0;
      border-radius: 0;
      cursor: pointer;
    }
    .tab[aria-current='page'] { color: var(--ember-300); box-shadow: inset 0 3px 0 var(--ember-500); }
  }
</style>
