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

Verified against a real combat example: 303 rating → 60.2% effect, 283 rating → 58.6% effect.

## PVP damage formula (documented, not implemented)

The full PVP damage calculation, supplied during the Phase 0 UI planning session, for future
reference:

```
final_damage = (attacker_normal_damage × (1 − defender_dmg_reduction%))
               × (1 + attacker_pvp_attack_effect%)
               × (1 − defender_pvp_defense_effect%)
```

Worked example: attacker normal damage 862,534; defender DMG Reduction 9.9%; attacker PVP Attack
303 rating (60.2% effect); defender PVP Defense 283 rating (58.6% effect).

```
862534 × (1 − 0.099) = 777,142
777,142 × (1 + 0.602) = 1,244,562
1,244,562 × (1 − 0.586) = 515,248   (≈ 515,423 reported in-game; small delta from rounding)
```

This tool is **PVE-only** in its current phase. PVP damage is not calculated anywhere in the
codebase — see [docs/adr/0001-defer-pvp-combat-modeling.md](docs/adr/0001-defer-pvp-combat-modeling.md)
for why the stat fields exist ahead of the calculation that will eventually use them.

## Defensive/PVP-adjacent stat fields (tracked, not computed)

`block_chance`, `miss_chance`, `blind_chance`, `penetration`, `dmg_reduction`, `paralyze_chance`,
`pvp_attack`, `pvp_defense` are all part of `OffensiveStats` (`src/lib/dps.js`) and participate in
gear-swap math (`applySwap`), but are **not** read by `computeDps`, `computeHps`, or `compareSwap`'s
verdict logic. They exist purely for display and data continuity ahead of a future PVP/defensive
phase.

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
