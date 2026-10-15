# Redesign: open decisions (2026-10-15)

> **Status:** waiting on the user. The build left these open. The current behaviour stays until you
> answer.

- C1: Oblivion scan uses fixed N per floor, deviating from invariant I5; add a one-sample look function (follow-up slice) or accept fixed N with Wilson interval?
- C2: Should the inconclusive verdict soften to 'upgrade with caveat' when one metric is clearly up and another unresolved?
- C3: Batch Drop Check runs the Standard comparator (maxN 32,768/metric) for every preset of every item; add a cap or Quick option?
- C4: Optimiser run cost: add a Resume button (task supports resumeFrom), measured-cost text, or guard?
- C5: Approve Newcombe->Tango (A1) and Oblivion-Mythic (M2) plan changes, and edit plan.md/gear.md accordingly?
- C6: Cancel landing after task completion: keep the full result instead of 'cancelled'? Staleness check for restored jobs?
- C7: Drop Check bag-row Apply overwrites saved Single-drop item; add confirm text/new mutator or leave?
- C8: Legacy Oblivion sheets with no owner stay unverified; auto-assign to a preset or just warn?
- C9: Optimiser Apply silently changes other presets via character-wide sigil condition; keep, or warn and repair?
- C10: Re-verify combat-pve.md §11 Bulwark-on-miss claim against the decompile (touches game facts)?
- C11: Investigate Druid preset sigil list mapping (M3) in the decompile or leave the open risk?
- C12: UI scope: species/mount pickers stay selects, no relic art tile/sortable table, no pet search, export-all filename differs from ia §2.1, Reset keeps UI-prefs key, toast 6 s vs 20 s, no Retry/Saving state in save indicator - confirm?
- C13: Track roster byte budget against full quota; import components.css globally or delete it?
- Final integration (after P1-P4 merge): delete --color-* alias block and legacy classes in app.css and run the grep sweep + ia.md §5 parity sweep with page-specific route smoke assertions; confirm whether to dispatch that as a fifth follow-up slice.
