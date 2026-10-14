# Graph Report - Eldaryn-Workshop  (2026-07-20)

## Corpus Check
- 137 files · ~131,780 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 746 nodes · 1729 edges · 35 communities (26 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8fa4d21f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_..libformat.js|../lib/format.js]]
- [[_COMMUNITY_rosterStore.svelte.js|rosterStore.svelte.js]]
- [[_COMMUNITY_model.js|model.js]]
- [[_COMMUNITY_MountAndGlyphsScreen.svelte|MountAndGlyphsScreen.svelte]]
- [[_COMMUNITY_build job|build job]]
- [[_COMMUNITY_totals.js|totals.js]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_Sidebar.svelte|Sidebar.svelte]]
- [[_COMMUNITY_constants.js|constants.js]]
- [[_COMMUNITY_transcendence.js|transcendence.js]]
- [[_COMMUNITY_relicsData.js|relicsData.js]]
- [[_COMMUNITY_Eldaryn Gear Optimiser|Eldaryn Gear Optimiser]]
- [[_COMMUNITY_CONTEXT.md (domain terminology doc)|CONTEXT.md (domain terminology doc)]]
- [[_COMMUNITY_docsadr (architectural decision records)|docs/adr/ (architectural decision records)]]
- [[_COMMUNITY_Eldaryn (mobile game)|Eldaryn (mobile game)]]
- [[_COMMUNITY_EldarynTracker (legacy PythonStreamlit prototype)|EldarynTracker (legacy Python/Streamlit prototype)]]
- [[_COMMUNITY_localStorage persistence|localStorage persistence]]
- [[_COMMUNITY_npm run dev|npm run dev]]
- [[_COMMUNITY_npm run preview|npm run preview]]
- [[_COMMUNITY_Vite|Vite]]
- [[_COMMUNITY_StoneForm.svelte|StoneForm.svelte]]
- [[_COMMUNITY_SimulationScreen.svelte|SimulationScreen.svelte]]
- [[_COMMUNITY_optimizer.js|optimizer.js]]
- [[_COMMUNITY_PresetsScreen.svelte|PresetsScreen.svelte]]
- [[_COMMUNITY_VerdictCard.svelte|VerdictCard.svelte]]
- [[_COMMUNITY_..libformat.js|../lib/format.js]]
- [[_COMMUNITY_..libformat.js|../lib/format.js]]
- [[_COMMUNITY_SigilsScreen.svelte|SigilsScreen.svelte]]
- [[_COMMUNITY_.Chip.svelte|./Chip.svelte]]
- [[_COMMUNITY_.PresetEditor.svelte|./PresetEditor.svelte]]
- [[_COMMUNITY_transcendence.js|transcendence.js]]
- [[_COMMUNITY_.RelicSuggesterPanel.svelte|./RelicSuggesterPanel.svelte]]
- [[_COMMUNITY_GoalSliders.test.js|GoalSliders.test.js]]

## God Nodes (most connected - your core abstractions)
1. `./PvpScreen.svelte` - 42 edges
2. `newCharacter()` - 39 edges
3. `./SimulationScreen.svelte` - 32 edges
4. `createRosterStore()` - 30 edges
5. `../lib/rosterStore.svelte.js` - 25 edges
6. `rosterStore` - 25 edges
7. `offensiveStats()` - 23 edges
8. `../lib/constants.js` - 21 edges
9. `normaliseCharacter()` - 21 edges
10. `optimize()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `build job` --semantically_similar_to--> `npm install`  [INFERRED] [semantically similar]
  .github/workflows/deploy.yml → README.md
- `build job` --shares_data_with--> `npm run build`  [INFERRED]
  .github/workflows/deploy.yml → README.md
- `build job` --shares_data_with--> `npm test`  [INFERRED]
  .github/workflows/deploy.yml → README.md
- `createRosterStore()` --indirect_call--> `setDropField()`  [INFERRED]
  src/lib/rosterStore.svelte.js → src/components/DropCheckScreen.test.js
- `createRosterStore()` --indirect_call--> `deleteCharacter()`  [INFERRED]
  src/lib/rosterStore.svelte.js → src/components/Sidebar.svelte

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **GitHub Pages deploy pipeline (build + deploy jobs and actions)** — github_workflows_deploy_workflow, github_workflows_deploy_build_job, github_workflows_deploy_deploy_job, github_workflows_deploy_actions_checkout_v4, github_workflows_deploy_actions_setup_node_v4, github_workflows_deploy_actions_upload_pages_artifact_v3, github_workflows_deploy_actions_deploy_pages_v4 [EXTRACTED 1.00]
- **Project documentation set describing Eldaryn Gear Optimiser context and history** — readme_eldaryn_gear_optimiser, readme_context_md, readme_docs_adr, readme_eldaryntracker [INFERRED 0.85]

## Communities (35 total, 9 thin omitted)

### Community 0 - "../lib/format.js"
Cohesion: 0.09
Nodes (11): ./DuelTimeline.svelte, MARK_COLORS, markTitle(), sideName(), FIXTURE, ./GoalTimelineChart.svelte, series, ./RunHistoryPanel.svelte (+3 more)

### Community 1 - "rosterStore.svelte.js"
Cohesion: 0.05
Nodes (58): SPECIAL_GLYPHS, createPvpWinObjective(), opponentToSide(), playerToSide(), pvpScore(), runPvpMatrix(), opponent, verifyPvpWinRates() (+50 more)

### Community 2 - "model.js"
Cohesion: 0.06
Nodes (67): emptyGear(), SLOTS, compactRunHistory(), emptyAwakening(), emptyGear(), emptyMounts(), emptyRoster(), emptySigilValues() (+59 more)

### Community 3 - "MountAndGlyphsScreen.svelte"
Cohesion: 0.12
Nodes (11): formatPct(), glyphError, newGlyphIsSpecial, newGlyphRarity, newGlyphStatKey, newGlyphTier, newGlyphValue, statLabel() (+3 more)

### Community 4 - "build job"
Cohesion: 0.18
Nodes (12): actions/checkout@v4, actions/deploy-pages@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, BASE_PATH env var, build job, deploy job, Deploy to GitHub Pages Workflow (+4 more)

### Community 5 - "totals.js"
Cohesion: 0.06
Nodes (63): FIELDS, resolveAwakeningPerPoint(), CLASSES, fieldsForTab(), GLYPH_RARITIES, RARITIES, SOURCE_DEFS, STAT_FIELDS (+55 more)

### Community 6 - "package.json"
Cohesion: 0.11
Nodes (17): devDependencies, jsdom, playwright, svelte, @sveltejs/vite-plugin-svelte, vite, vitest, name (+9 more)

### Community 7 - "Sidebar.svelte"
Cohesion: 0.07
Nodes (21): active, { activeScreen, onSelectScreen, onStatus }, CHARACTER_NAV, charPickerOpen, deleteCharacter(), editingCharacterId, editName, fileInput (+13 more)

### Community 8 - "constants.js"
Cohesion: 0.13
Nodes (14): allocation, changeRank(), isUnlocked(), pointsRemainingToUnlock(), pointsSpentBeforeTier(), pointsSpentInTier(), rankOf(), { specKey, talentSetIndex } (+6 more)

### Community 9 - "transcendence.js"
Cohesion: 0.14
Nodes (8): ../lib/relicsData.js, ../lib/rosterStore.svelte.js, ../lib/storage.js, ./ConfirmButton.svelte, ./SettingsPanel.svelte, ./SimulationsDashboard.svelte, active, app

### Community 10 - "relicsData.js"
Cohesion: 0.05
Nodes (10): clickGoal(), goalButtons(), setDropField(), RELIC_TIER_LABELS, RELIC_TIER_MAX_LEVEL, RELIC_TIERS, RELICS_BY_CLASS, isTierUnlocked() (+2 more)

### Community 11 - "Eldaryn Gear Optimiser"
Cohesion: 0.25
Nodes (7): #app mount div, src/main.js entry script reference, Deploy, Development, Eldaryn Gear Optimiser, Legacy reference, Svelte 5

### Community 22 - "StoneForm.svelte"
Cohesion: 0.06
Nodes (32): ../lib/stonesData.js, canAdd, editQuality, editValues, isSocketedHere, newAzureChoice, newAzureChoiceValue, newDef (+24 more)

### Community 23 - "SimulationScreen.svelte"
Cohesion: 0.09
Nodes (12): ../lib/buildConfig.js, ../lib/optimizerClient.js, ../lib/pvpGoalObjective.js, ../lib/sigilEffects.js, ../lib/sigilsData.js, ../lib/simulation.js, ../lib/statWeights.js, ./RelicSuggesterPanel.svelte (+4 more)

### Community 24 - "optimizer.js"
Cohesion: 0.08
Nodes (42): mountCard(), AWAKENING_PATHS, describeBuildConfig(), makeWarrior(), SPECS_BY_CLASS, summarizeStats(), fakeRunner(), ABORTED (+34 more)

### Community 25 - "PresetsScreen.svelte"
Cohesion: 0.09
Nodes (20): ../lib/pvpOptimizer.js, ../lib/pvpSimulation.js, ./PvpScreen.svelte, addOpponent(), applyOptimized(), buildPvpObjectiveSpec(), clearResults(), deleteOpponent() (+12 more)

### Community 26 - "VerdictCard.svelte"
Cohesion: 0.14
Nodes (7): ../lib/dropGoals.js, ../lib/tankObjective.js, tankEhpPct, tankProfileId, aggregate, anyDown, mixed

### Community 27 - "../lib/format.js"
Cohesion: 0.25
Nodes (16): emptyTranscendence(), normaliseTranscendence(), canUnlock(), costForCount(), costForSigil(), effectiveUnlockedSet(), indexNodesByPosition(), isAdjacent() (+8 more)

### Community 28 - "../lib/format.js"
Cohesion: 0.40
Nodes (3): ./LinkingReportCard.svelte, applyBuild(), presetExists()

### Community 29 - "SigilsScreen.svelte"
Cohesion: 0.13
Nodes (13): ../lib/awakeningData.js, ../lib/optimizer.js, ../lib/talentTreeData.js, ../lib/transcendence.js, ../lib/transcendenceData.js, awakeningLabel, equippedGlyphCount, ichorSpent (+5 more)

### Community 31 - "./PresetEditor.svelte"
Cohesion: 0.24
Nodes (10): ../lib/constants.js, ../lib/dps.js, ../lib/format.js, ../lib/model.js, ../lib/totals.js, ./AddPetModal.svelte, ./PresetCard.svelte, ./PresetEditor.svelte (+2 more)

### Community 33 - "transcendence.js"
Cohesion: 0.14
Nodes (16): hasAnyStat(), linkedPresets(), linkingSetupReady(), presetSetupChecks(), readyCharacter(), buildReasoning(), computeRegret(), goalUnitLabel() (+8 more)

### Community 43 - "./RelicSuggesterPanel.svelte"
Cohesion: 0.83
Nodes (3): makeCharacter(), makePreset(), mountPanel()

### Community 44 - "GoalSliders.test.js"
Cohesion: 0.14
Nodes (9): ../lib/linkingSetup.js, ../lib/linkingSimulation.js, ./Chip.svelte, compact, small, ./DashboardSetupCard.svelte, GOAL_BLURBS, goalKinds (+1 more)

## Knowledge Gaps
- **150 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+145 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `./PvpScreen.svelte` connect `PresetsScreen.svelte` to `rosterStore.svelte.js`, `transcendence.js`, `SimulationScreen.svelte`, `SigilsScreen.svelte`, `./PresetEditor.svelte`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `../lib/rosterStore.svelte.js` connect `transcendence.js` to `../lib/format.js`, `MountAndGlyphsScreen.svelte`, `Sidebar.svelte`, `constants.js`, `GoalSliders.test.js`, `StoneForm.svelte`, `SimulationScreen.svelte`, `PresetsScreen.svelte`, `VerdictCard.svelte`, `../lib/format.js`, `SigilsScreen.svelte`, `./PresetEditor.svelte`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `./SimulationScreen.svelte` connect `SimulationScreen.svelte` to `transcendence.js`, `relicsData.js`, `VerdictCard.svelte`, `SigilsScreen.svelte`, `./PresetEditor.svelte`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `./PvpScreen.svelte` (e.g. with `addOpponent()` and `commitRename()`) actually correct?**
  _`./PvpScreen.svelte` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `createRosterStore()` (e.g. with `setDropField()` and `addOpponent()`) actually correct?**
  _`createRosterStore()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _150 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `../lib/format.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._