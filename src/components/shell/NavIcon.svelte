<script>
  /**
   * NavIcon.svelte - the rail, tab-bar and lock icons as inline SVG (design-system §3.5), so no
   * icon depends on a font having the glyph. Decorative: the label next to it names the page.
   * Unknown names draw a plain diamond.
   */
  let { name = '', size = 18 } = $props();

  const PATHS = {
    'character/overview': 'M12 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM5 20c0-3.9 3.1-6 7-6s7 2.1 7 6',
    'character/skills': 'M12 3l2.4 5.6L20 9.5l-4.2 3.9L17 19l-5-3-5 3 1.2-5.6L4 9.5l5.6-.9z',
    'character/gear': 'M14 4l6 6-9 9-4-1-1-4zM5 20l3-3',
    'character/talents': 'M12 3l3 5 5 1-3.5 4 .8 5.5-5.3-2.5L6.7 18.5 7.5 13 4 9l5-1z',
    'character/sigils': 'M12 3l8 9-8 9-8-9zM12 8l3.5 4-3.5 4-3.5-4z',
    'character/pets': 'M7 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM17 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM12 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM12 12c3 0 5 2.5 5 5 0 2-2 2-5 1-3 1-5 1-5-1 0-2.5 2-5 5-5z',
    'character/mounts': 'M5 20V9l4-4 3 3h4l3 4-3 2v6M9 5v4',
    'character/relics': 'M12 3l7 4v6c0 4-3 6-7 8-4-2-7-4-7-8V7z',
    'character/awakening': 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
    'character/transcendence': 'M12 3v18M3 12h18M6 6l12 12M18 6L6 18',
    'builds/presets': 'M4 6h16M4 12h16M4 18h16',
    'builds/loadout': 'M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z',
    'builds/sheet': 'M5 4h14v16H5zM5 9h14M5 14h14M10 9v11',
    'tools/drop': 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
    'tools/optimiser': 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
    'tools/duel': 'M5 19L17 7M14 5h5v5M19 19L7 7M10 5H5v5',
    'tools/opponents': 'M8 9a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM16 11a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM2 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5M15 15c3 0 6 1.5 6 5',
    'tools/oblivion': 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1',
    character: 'M12 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM5 20c0-3.9 3.1-6 7-6s7 2.1 7 6',
    builds: 'M4 6h16M4 12h16M4 18h16',
    tools: 'M14 4l6 6-9 9-4-1-1-4zM5 20l3-3',
    import: 'M12 16V4M7 9l5-5 5 5M5 14v6h14v-6',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z',
  };
  const d = $derived(PATHS[name] ?? 'M12 4l8 8-8 8-8-8z');
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path {d} /></svg>
