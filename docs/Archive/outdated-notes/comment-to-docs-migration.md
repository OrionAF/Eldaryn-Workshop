# Comment → documentation migration

> **Status:** Migration done; verification now automated and repeatable ·
> **Started:** 2026-07-28 · **Second pass:** 2026-07-29
> **Goal:** move source-of-truth out of code comments and into
> `docs/Reference/`, leaving comments to explain local intent and cite the
> reference.

## Second pass — 2026-07-29

The first pass left "72 files not deeply read" as the open item, on the theory
that the only way to finish was to read them all. That was the wrong shape for
the job: a one-time read produces a claim that decays the moment anyone edits,
and it cannot be repeated cheaply.

**What was done instead: the defect classes were turned into checks and run
over all 158 source files at once.** Every class of defect the first pass found
by hand is now something a script finds in seconds:

| Check | Result |
|---|---|
| Comments citing a file that does not exist | **0** (the deleted-component class of defect) |
| Comments pointing into `docs/WIP/` (transient by design) | **0** |
| Staleness markers (`not yet`, `placeholder`, `later slice`, `future`, `TODO`, …) | 5 hits → **2 real defects**, fixed below |
| `§` citations in `src/` that do not resolve to a real section | **0 of 51** |
| Catalogue cross-file claims verified against the file they describe | **9 of 9 true** |
| Untagged game numbers in the data catalogues | 17, all local field-shape notes |

Tier-1 (read the code, not just the comment) was done for the two things the
first pass ranked highest:

- **`rosterStore.svelte.js`** — its one load-bearing claim, *"every mutator
  ends with an explicit `persist()`"*, was checked across all **78 exposed
  functions** by following each one's call graph to `persist()`. Exactly two
  never reach it — `mountsWithGlyph` (a pure filter) and `exportDownload`
  (reads and downloads) — and both are genuinely read-only. **The claim holds.**
  Worth noting `exportDownload` is the case the rule exists for: it does not
  persist, it *relies* on every prior mutation already having done so.
- **The data catalogues** — every "same principle as X.js", "feeds Y.js" and
  "Z.js checks this" claim across the eight catalogue files was executed
  against the named file. All nine hold. `talentTreeData`'s "6 tiers, 14–15
  talents, thresholds [0,5,10,15,20,25]" was verified by importing the module:
  arms/protection/marksmanship 14, disruption 15, thresholds exact.

**What this does NOT claim.** Nobody read all 72 files line by line, and a
comment that quietly stopped matching its function without tripping any of the
checks above would still survive. That residual risk is unchanged and
unavoidable; what changed is that it is now the *only* residual risk, and the
checks are cheap enough to re-run on demand.

## Coverage — read this before trusting "complete"

**Every file's comments have now been read.** The depth varied, and that
matters:

| Depth | Files | What was done |
|---|---|---|
| **Full source read** | 18 | Comment compared against the code it describes. This is how 4 of the 7 defects were found. |
| **Comments read, code spot-checked** | ~72 | All comments reviewed; the code was only opened where a comment looked suspicious or made a cross-file claim. |

A comment can only be *proven* stale by reading the code it describes. The
second tier is therefore weaker: a comment that quietly stopped matching its
function without tripping a staleness marker would survive. Targeted sweeps
compensated (staleness phrases, references to deleted components, cross-file
claims), which is how `buildConfig.js` and the `dps.js` factory were caught —
but this is not the same guarantee as tier one.

**If a file in tier two later turns out to have lied, that is expected, not a
surprise.** Re-audit the specific file rather than assuming the whole sweep was
sound.

## Why this exists

The 2026-07-28 combat audit found that this project's most expensive errors all
had the same shape: a comment that was accurate when written, silently became
false, and then **suppressed re-examination** because it read as authoritative.
Four separate headers had been lying for weeks.

The rule adopted in response (`docs/README.md`, `CLAUDE.md`): *a fact lives in
exactly one place.* The test is — **would this comment need to change if a
different file changed?** If yes, it is documentation, not a comment.

## Defects found — 7 across the sweep

Every one was a comment that had been accurate when written and silently went
false. None were caught by tests, because none of them affect behaviour — that
is precisely why they survived.

| # | File | The false claim |
|---|---|---|
| 1 | `constants.js` | defensive/PVP stats are "display and swap-tracking only" (superseded ADR 0001) |
| 2 | `dps.js` (factory) | same claim again — "tracked but not yet computed with". **Third instance** of one falsehood |
| 3 | `rosterStore.svelte.js` | "the *(future)* linking simulation" — shipped in slice 4 |
| 4 | `model.js` ×3 | same: "later slices", "the future linking simulation" |
| 5 | `talentTreeData.js` | "one placeholder tier with one placeholder talent" — trees are fully transcribed, 6 tiers, 14–15 talents. Would have told a reader real game data was invented |
| 6 | `relicsData.js` | described the **pre-redesign** model: per-loadout equipping, per-loadout levels, `Loadout.relics.entries`. None of it exists |
| 7 | `buildConfig.js` | written "for the Saved Results rail" — a component deleted in slice 3 |
| 8 | `optimizerObjectives.js` | "duel validation against archetypes is **a later slice**" — the gauntlet shipped in slice 5. Found by the staleness sweep, 2026-07-29 |
| 9 | `SettingsPanel.svelte` | "Houses **future app settings (placeholder for now)** plus the Danger Zone" — there is no placeholder section in the markup; the panel is the Danger Zone. 2026-07-29 |

Plus one in the opposite direction: **`big-rework-v1-notes.md` was wrong and
the code was right** — it claimed extrapolated glyph rarities are flagged
`observed: false`; the field is `observedRarities`. Cite-don't-restate only
helps if the doc is checked against the code too.

**Defects 8 and 9 are the same species as 3, 4 and 5: a comment describing
work as pending after it shipped.** Five of the nine are that one pattern, and
it is now the pattern most worth automating against — "later slice", "not yet",
"future", "placeholder" are cheap to grep and the claim they make is exactly
the kind that goes false without anyone touching the file.

One correction note was also *removed* rather than added: `talentTreeData.js`
carried a paragraph explaining that its header used to say "placeholder" and
was wrong. The positive claim above it ("THESE ARE REAL, TRANSCRIBED TREES …
treat the numbers as game data") already does that job, and the history of a
comment is a record — it belongs here, which is where it now lives.

**The propagation pattern is the lesson.** Defect 1 and 2 are one claim in two
files; defects 3 and 4 are one claim in four places. A falsehood that gets
copied is far more durable than one that does not, and fixing the first
instance does not fix the rest.

## Done

| File | What happened |
|---|---|
| `model.js` | 88-line shape header → `Reference/data-model.md`; header is now a navigation aid that explicitly defers |
| `totals.js` | Aggregation rules → `data-model.md` §5; pipeline → `combat-model.md` §1 |
| `pvpSimulation.js` | 116-line header → ~30; model → `combat-model.md` §6; kept tick arithmetic, `statNow()` rule, batch simultaneity |
| `pvpGoalObjective.js` | 100 → 16; full three-factor derivation → `combat-model.md` §8 |
| `tankObjective.js` | 45 → 12; inversion + factor rationale → `combat-model.md` §8 |
| `simulation.js` | Model → §5; kept the float-accumulator detail and *why* it differs from the duel engine |
| `statCaps.js` | Curve → §2; kept the two-operations warning (where callers actually go wrong) |
| `sigilEffects.js` | Activation model + PVE-unsupported list → §7; kept the mechanics registry |
| `constants.js` | **Fixed a false claim** (stale ADR 0001); caps table now cross-references §2 |
| `dps.js` | Scope corrected; double-hit ruling recorded; `computeHps` caveat added |
| `optimizer.js`, `linkingSimulation.js`, `relicSuggester.js`, `statWeights.js` | Audit-era corrections (overstated memo claim, biased-maxima defect, what `gain` measures, post-curve probing) |

New documents created: `Reference/data-model.md`; `Reference/combat-model.md`
substantially expanded.

Added 2026-07-29, from the combat-audit fix pass:

| File | What happened |
|---|---|
| `statWeights.js` | Header rewritten around the raw-then-curve-once discipline |
| `optimizer.js` | Heuristic-gaps list corrected (glyph stopping rule, `topCandidates` bias, biased maxima) |
| `linkingSimulation.js` | Biased-maxima defect replaced by the verification stage it now runs |
| `pvpArchetypes.js` | Known-wrong Penetrator note replaced by the general jitter-vs-cap rule |
| `relicSuggester.js` | What `gain` measures, and why there is no CI |
| `pvpGoalObjective.js`, `dps.js`, `pvpSimulation.js` | Citations made doc-explicit rather than "the model doc §5" |

**All 51 `§` citations in `src/` resolve** against real section headers
(re-verified 2026-07-29, up from 14). Five were reworded that day because they
named a section without naming the doc close enough to be unambiguous.

## Remaining

**The file-by-file backlog is closed** — see the second-pass section at the top
for what replaced it and what it does not cover. The table below is kept as the
inventory of where comment mass actually sits, which is useful when deciding
where to look next; it is no longer a to-do list.

Files with ≥10 comment lines, largest first, as of the first pass.

| File | Comment lines |
|---|---|
| `src/lib/rosterStore.svelte.js` | 162 |
| `src/lib/sigilsData.js` | 139 |
| `src/lib/petsData.js` | 116 |
| `src/lib/glyphsData.js` | 89 |
| `src/components/SimulationScreen.svelte` | 84 |
| `src/components/PvpScreen.svelte` | 63 |
| `src/lib/transcendence.js` | 45 |
| `src/lib/dropGoals.js` | 43 |
| `src/lib/optimizerObjectives.js` | 40 |
| `src/lib/format.js` | 39 |
| `src/lib/assets.js` | 37 |
| `src/lib/pvpGauntlet.js` | 36 |
| `src/components/TranscendenceGrid.svelte` | 36 |
| `src/lib/talentTreeData.js` | 32 |
| `src/lib/pvpArchetypes.js` | 31 |
| `src/components/VerdictCard.svelte` | 30 |
| `src/components/SigilsScreen.svelte` | 29 |
| `src/lib/relicsData.js` | 27 |
| `src/components/StarRating.svelte` | 27 |
| `src/lib/storage.js` | 26 |
| `src/components/SimulationsScreen.svelte` | 26 |
| `src/components/StoneGrid.svelte` | 26 |
| `src/components/StatsFields.svelte` | 25 |
| `src/components/SimulatedPresetCard.svelte` | 25 |
| `src/components/MountAndGlyphsScreen.svelte` | 24 |
| `src/lib/optimizerClient.js` | 22 |
| `src/lib/mountsData.js` | 22 |
| `src/lib/awakeningData.js` | 22 |
| `src/components/TranscendenceNode.svelte` | 21 |
| `src/lib/transcendenceData.js` | 20 |
| `src/components/Modal.svelte` | 20 |
| `src/lib/talentLean.js` | 20 |
| `src/components/SlotSilhouette.svelte` | 19 |
| `src/components/PetCard.svelte` | 19 |
| `src/components/TalentTierList.svelte` | 17 |
| `src/components/TranscendenceScreen.svelte` | 17 |
| `src/components/PetsScreen.svelte` | 16 |
| `src/lib/optimizerWorker.js` | 16 |
| `src/lib/linkingSetup.js` | 16 |
| `src/components/Slider.svelte` | 16 |
| `src/components/GlyphCard.svelte` | 15 |
| `src/components/Sidebar.svelte` | 15 |
| `src/components/RelicSuggesterPanel.svelte` | 14 |
| `src/lib/buildConfig.js` | 14 |
| `src/components/PresetsScreen.svelte` | 14 |
| `src/components/RunHistoryPanel.svelte` | 14 |
| `src/components/MountCard.svelte` | 13 |
| `src/components/DropCheckScreen.svelte` | 13 |
| `src/components/LinkingReportCard.svelte` | 12 |
| `src/components/DashboardSetupCard.svelte` | 12 |
| `src/App.svelte` | 11 |
| `src/components/GlyphPickerModal.svelte` | 11 |
| `src/components/SettingsPanel.svelte` | 11 |
| `src/test-setup.js` | 10 |
| `src/components/GoalTimelineChart.svelte` | 10 |
| `src/components/GoalSliders.svelte` | 10 |

### Suggested order — worked 2026-07-29

1. ✅ **`rosterStore.svelte.js`** — its one load-bearing claim verified across
   all 78 exposed functions. Holds.
2. ✅ **The data catalogues** — nine cross-file claims executed against the
   files they describe; all true. `talentTreeData`'s tree shape verified by
   import. This was ranked "highest risk of stale game facts" and turned out to
   be the cleanest area in the sweep, which is worth knowing: the first pass
   had already done the expensive part here.
3. ✅ **The remaining lib modules** — covered by the repo-wide checks, which is
   where defect 8 (`optimizerObjectives`) surfaced.
4. ✅ **Components** — same, and where defect 9 (`SettingsPanel`) surfaced.
   The prediction held exactly: little to migrate, and the win was catching
   stale claims rather than moving text.

## Method — follow this exactly

Two file-destroying incidents happened on 2026-07-28 (see
`Archive/DATA-LOSS-2026-07-28.md`, and an encoding corruption of 18 files).
Both came from bulk PowerShell operations.

1. **Read the whole file before editing it.** No exceptions.
2. **Write the doc first**, verify it landed, *then* trim the comment. Never
   delete first.
3. **Use per-file `Edit` calls. Never a script that rewrites many files.**
   In particular never `Set-Content -Encoding utf8` on source (adds a BOM and
   can double-encode UTF-8).
4. **Verify every `§` citation resolves** to a real section header before
   finishing.
5. Run the suite after each batch.

## What to look for beyond migration

- **Claims that are simply false now.** The point of the exercise. Check
  anything asserting what a stat "is not used for", what is "not yet
  implemented", or what some other file does.
- **Numbers stated in comments.** A game number in a comment is a
  provenance-free assertion; it belongs in `combat-model.md` with a tag.
- **Comments that duplicate a doc.** Delete the comment, leave the citation —
  duplication is what rots.

## Definition of done — met 2026-07-29, with the original wording amended

The original was *"every file in `src/` has been read"*. That was replaced,
deliberately: a one-time read is not a property of the codebase, it is a claim
about an afternoon, and it decays on the next commit. What holds instead:

- Every cross-file fact lives in `Reference/` with the code citing it.
- **Every `§` citation resolves** — 51 of 51, checked.
- **No comment names a file that does not exist** — checked.
- **No comment in `src/` points into `docs/WIP/`**, which is transient by
  design and would strand the reference when a document graduates.
- No comment asserts a game number without a provenance tag (the catalogues'
  remaining numbers are local field-shape notes, not game facts).
- Suite green — 67 files, 751 tests.

Each of those is re-checkable in seconds, which the original wasn't.

**What is deliberately still open:** a comment that quietly stopped matching
its own function, without tripping any of the above. Only reading the code
catches that, it was never going to be caught in one pass across 158 files, and
it is the reason `rosterStore` and the catalogues got tier-1 treatment rather
than everything getting a promise. When a file in that tail turns out to have
lied, re-audit that file — as the first pass said, that is expected, not a
surprise.

~~Related: task #14 (`docs/` is still untracked in git).~~ Done — `docs/` is
tracked and pushed via `edoc`; see `Reference/Notes/private-repo-setup.md`.
