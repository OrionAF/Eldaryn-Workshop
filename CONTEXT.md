# Eldaryn Gear Optimiser — Domain Glossary

## Rating vs. Effect (PVP Attack / PVP Defense)

**Rating** is the raw, summable flat value that gear/sources grant for PVP Attack and PVP
Defense — it stacks additively across sources, the same way flat Attack does. Rating is what's
stored on a character/piece and what swap math operates on.

**Effect** is the derived, non-stored percentage a given Rating produces, via a diminishing-returns
formula:

```
effect% = rating / (rating + 200) * 100
```

Effect is never entered directly and never appears as its own stored field — it's always computed
live from the current Rating total for display (e.g. `PVP Attack: 303 (60.2%)`).

The formula is confirmed by the 2.7.0 client. Where the effect applies in a fight (attacker
swings only, not spells, DoTs or thorns) is in `docs/Reference/Game/combat-pvp.md`, and the
conversion itself is in `docs/Reference/Game/stats.md`.

## Defensive and PVP stats

Block, Miss, Blind, Penetration, DMG Reduction, Paralyze/Disruption, PVP Attack and PVP Defense
all take part in combat in the game. How each one resolves is in
`docs/Reference/Game/combat-pve.md` and `combat-pvp.md`. (An earlier version of this glossary
called them display-only and the tool PVE-only. Both claims went stale long ago.)

## Mode: Compare vs. Edit (Gear Panel tab)

The Gear Panel tab's per-slot Stats Summary Row has two modes:

- **Compare** — the Stats Summary Row is read-only, showing each loadout's currently-equipped
  stats for the selected slot as the baseline. The Item Stat Input Form (candidate/drop item) and
  Upgrade/Downgrade Result row are visible.
- **Edit** — the Stats Summary Row becomes directly editable, letting the user correct or seed a
  slot's currently-equipped stats. There is no separate "current gear" entry form — this is the
  only way that data gets in. The Item Stat Input Form and Result row are hidden in this mode.

## Drop

A single candidate/incoming item under consideration, held at the roster level
(`Roster.drop`, not per-character or per-loadout — see `src/lib/model.js`). One Drop is tested
against both loadouts simultaneously in the Gear Panel tab's Compare mode. Discarding a Drop
clears it for both loadouts at once (there is only ever one Drop).
