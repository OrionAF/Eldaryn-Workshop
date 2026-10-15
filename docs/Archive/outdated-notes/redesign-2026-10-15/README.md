# Redesign (2026-10-14): accuracy-first simulator and new UI

- `summary.md`: one-page, user-facing summary.
- `plan.md`: the implementation plan. Slices, invariants, result contract, waves and the coverage table.
- `findings/`: the verified audit findings the plan covers. `all_findings.json` is indexed by `#n` in `plan.md`; `<unit>.txt` holds readable per-unit dumps.
- `ia.md`: the new information architecture. `design-system.md` §5 amends it.
- `design-system.md`, `tokens.css`, `components.css`, `mockup.html`: the chosen design (Forge look on the Obsidian layout). Open `mockup.html#v1` to `#v17`. All mockup data is invented.

When the build is done, the contracts move to `docs/Reference/` (`simulation.md`, an updated `data-model.md`) and this folder is archived.
