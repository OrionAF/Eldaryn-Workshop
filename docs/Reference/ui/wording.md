# Wording: how the app talks to players

> **Status:** Current · **Last verified:** 2026-10-16
> **Covers:** the voice of every user-facing string (labels, hints, notes, empty states, banners,
> errors, toasts, tooltips). Layout and states are in `design-system.md`; this file is words only.

## 1. Who reads it

A typical Eldaryn player on a phone. They know the game's own words (Attack, Crit, Haste, presets of
gear, pets, mounts, sigils, relics, talents, Oblivion, Celestial Trial, Arena) and common gamer words
(DPS, build, stats, buff). They do not know statistics, software or this app's internals, and they
should not need to.

The app's author and a few power users do want the precise detail. They keep it, one click away
(§4), never in the main text.

## 2. Rules

1. **Say what it means for the player, not how the code does it.** "Can tell builds apart when one is
   2 points better" beats "Resolves differences of 2 points".
2. **Everyday words.** Use the plain word from §3. Never use a symbol or letter as a word (N, σ, Δ,
   CI, p, n0, maxN).
3. **Short.** One idea per sentence; aim for 20 words or fewer. A hint is one or two sentences. Cut
   anything the player cannot act on or would not miss.
4. **Second person, active voice.** "Your current build", "you change as little as possible".
   Buttons are verbs: "Restore a backup", not "Backup restore".
5. **Numbers stay exact.** Never round, drop or reword a number or a unit the code computes. Keep
   every `<span class="num">` and `--font-data` wrapper (CLAUDE.md: numeric data renders in tabular
   monospace). Use the game's own names for stats and systems.
6. **Truthful.** Plain must not mean wrong. Do not promise more than the code does ("always finds
   the best build" is false; "finds a better build if one is clearly better" is true). Facts tagged
   [SERVER] or [UNRESOLVED] in `docs/Reference/Game/` stay "unknown" or "assumed".
7. **No jargon in errors.** Say what went wrong and what to do: "This file is not a backup from this
   app. Choose a file saved with Export." The raw technical reason may follow in the details.
8. **One name per thing.** Use §3 everywhere; do not invent synonyms page by page.

## 3. Words to use

| Instead of | Say | Notes |
|---|---|---|
| N, sample, samples, trials | fights | "8 fights", "up to 8,192 fights per build" |
| resolved, significant | clearly better / clearly worse | |
| inconclusive, unresolved | too close to call | already plain; keep it |
| equivalent (within ±x) | about the same (within x) | |
| precision, resolution, zone, delta | how small a difference it can spot | "spots differences of 1% or more" |
| effort (Quick / Standard / Thorough) | Effort | keep the three names; explain as "more effort spots smaller differences and takes longer" |
| dimensions, search space, toggles | parts of your build it may change | "3 of 9 parts" |
| seed | Seed (hint: "the same seed gives the same result") | keep the field, explain it |
| interval, confidence, 95% CI | range (likely range) | "likely between 4% and 6%" |
| paired difference | difference on the same fights | |
| corrected for the number of rows | (drop it, or move to details) | |
| worker(s), cores, thread(s) | (drop it, or "uses N of your device's M cores" in Settings only) | |
| CPU thermal profile | Speed vs. battery | options keep their names |
| calibrate, calibration | speed test | "Run a speed test to see time estimates" |
| residual, carried residual | the gap between the game's numbers and the app's | |
| model / computed values | the app's numbers | "sheet" = "in-game stats" |
| normalised, dropped reference | removed because the game no longer has it | |
| JSON, payload, parse | file | "That file could not be read" |
| roster | your characters | "Restore all your characters from a backup" |
| job | run | "Runs keep going when you change page" |
| upper bound | up to | "Up to 4 min on this device" |
| screen / race / ladder / rung (internal) | first check / compare / step | the run phases already have plain text in `lib/ui/runPhases.js` |

App terms that stay because the UI teaches them: **preset**, **Optimiser**, **Drop Check**,
**Push** (as an objective name), **Single drop**, **Loot bag**, **Opponent**.

## 4. Where the detail goes

When a precise sentence is still useful to a power user, keep it but move it out of the way:

- Put it in a native `<details>` with a short `<summary>` such as "How this works" or "Details",
  styled like the existing ones (`ToolsOptimiserPage.svelte` `.phases`, `SetupEstimate.svelte`
  `.basis`). The plain sentence stays visible above it.
- The Debug log, the Activity log and the Optimiser's run Details may keep technical words; they
  are for diagnosis. Their headings and first lines still follow §2.

## 5. Out of scope

- Game names, item names and stat names from the client data.
- Text inside `docs/` (this file excepted) and code comments.
- The Debug log's downloaded file and machine-readable fields.
