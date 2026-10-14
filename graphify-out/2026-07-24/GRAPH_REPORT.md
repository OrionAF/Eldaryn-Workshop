# Graph Report - Eldaryn-Workshop  (2026-07-20)

## Corpus Check
- 143 files · ~135,930 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 773 nodes · 1808 edges · 47 communities (38 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.68)
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
- [[_COMMUNITY_pvpGauntlet.js|pvpGauntlet.js]]
- [[_COMMUNITY_transcendence.js|transcendence.js]]
- [[_COMMUNITY_simulation.js|simulation.js]]
- [[_COMMUNITY_pvpOptimizer.js|pvpOptimizer.js]]
- [[_COMMUNITY_relicsData.js|relicsData.js]]
- [[_COMMUNITY_buildConfig.js|buildConfig.js]]
- [[_COMMUNITY_dropGoals.test.js|dropGoals.test.js]]
- [[_COMMUNITY_DropCheckScreen.test.js|DropCheckScreen.test.js]]
- [[_COMMUNITY_simulation.test.js|simulation.test.js]]
- [[_COMMUNITY_.RelicSuggesterPanel.svelte|./RelicSuggesterPanel.svelte]]

## God Nodes (most connected - your core abstractions)
1. `./PvpScreen.svelte` - 48 edges
2. `newCharacter()` - 41 edges
3. `./SimulationScreen.svelte` - 32 edges
4. `createRosterStore()` - 30 edges
5. `../lib/rosterStore.svelte.js` - 25 edges
6. `rosterStore` - 25 edges
7. `offensiveStats()` - 23 edges
8. `emptyStats()` - 22 edges
9. `../lib/constants.js` - 21 edges
10. `normaliseCharacter()` - 21 edges

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

## Communities (47 total, 9 thin omitted)

### Community 0 - "../lib/format.js"
Cohesion: 0.05
Nodes (21): ../lib/linkingSetup.js, ../lib/linkingSimulation.js, ./DashboardSetupCard.svelte, GOAL_BLURBS, goalKinds, ./DuelTimeline.svelte, MARK_COLORS, markTitle() (+13 more)

### Community 1 - "rosterStore.svelte.js"
Cohesion: 0.15
Nodes (19): SPECIAL_GLYPHS, resolvePvpSigils(), activeSpecialGlyphIds(), applySpecialGlyphsToMech(), BUFF_DPS_KEYS, BUFF_SWING_KEYS, buffValue(), buildSigilEffects() (+11 more)

### Community 2 - "model.js"
Cohesion: 0.06
Nodes (71): emptyGear(), SLOTS, compactRunHistory(), emptyAwakening(), emptyGear(), emptyMounts(), emptyRoster(), emptySigilValues() (+63 more)

### Community 3 - "MountAndGlyphsScreen.svelte"
Cohesion: 0.12
Nodes (11): formatPct(), glyphError, newGlyphIsSpecial, newGlyphRarity, newGlyphStatKey, newGlyphTier, newGlyphValue, statLabel() (+3 more)

### Community 4 - "build job"
Cohesion: 0.18
Nodes (12): actions/checkout@v4, actions/deploy-pages@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, BASE_PATH env var, build job, deploy job, Deploy to GitHub Pages Workflow (+4 more)

### Community 5 - "totals.js"
Cohesion: 0.09
Nodes (39): FIELDS, resolveAwakeningPerPoint(), CLASSES, fieldsForTab(), GLYPH_RARITIES, RARITIES, SOURCE_DEFS, SPECS_BY_CLASS (+31 more)

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
Nodes (9): ../lib/constants.js, ../lib/rosterStore.svelte.js, ../lib/storage.js, ./ConfirmButton.svelte, ./SettingsPanel.svelte, active, filled, selected (+1 more)

### Community 10 - "relicsData.js"
Cohesion: 0.11
Nodes (3): isTierUnlocked(), pointsSpentInTier(), rosterStore

### Community 11 - "Eldaryn Gear Optimiser"
Cohesion: 0.25
Nodes (7): #app mount div, src/main.js entry script reference, Deploy, Development, Eldaryn Gear Optimiser, Legacy reference, Svelte 5

### Community 22 - "StoneForm.svelte"
Cohesion: 0.13
Nodes (18): ../lib/stonesData.js, PVP_KEYS, socketedIds, sortedInventory, statLines(), STONE_STAT_ORDER, { stoneInventory, loadouts, selectedStoneId, onSelect, equippedStoneId = null }, typeRank (+10 more)

### Community 23 - "SimulationScreen.svelte"
Cohesion: 0.08
Nodes (17): ../lib/awakeningData.js, ../lib/buildConfig.js, ../lib/optimizer.js, ../lib/optimizerClient.js, ../lib/pvpGoalObjective.js, ../lib/relicsData.js, ../lib/sigilEffects.js, ../lib/sigilsData.js (+9 more)

### Community 24 - "optimizer.js"
Cohesion: 0.08
Nodes (52): mountCard(), computeDps(), computeHps(), pvpEffect(), summarizeStats(), ABORTED, alignStonesToCurrentSlots(), candidateFromCurrent() (+44 more)

### Community 25 - "PresetsScreen.svelte"
Cohesion: 0.06
Nodes (24): ../lib/pvpGauntlet.js, ../lib/pvpOptimizer.js, ../lib/pvpSimulation.js, ./GauntletResultPanel.svelte, ./PvpScreen.svelte, addOpponent(), applyOptimized(), buildPvpObjectiveSpec() (+16 more)

### Community 26 - "VerdictCard.svelte"
Cohesion: 0.11
Nodes (10): ../lib/dropGoals.js, ../lib/tankObjective.js, ./Chip.svelte, compact, small, tankEhpPct, tankProfileId, aggregate (+2 more)

### Community 27 - "../lib/format.js"
Cohesion: 0.28
Nodes (14): cheapestUnlockPaths(), canUnlock(), costForCount(), costForSigil(), indexNodesByPosition(), isAdjacent(), parsePosition(), positionKey() (+6 more)

### Community 28 - "../lib/format.js"
Cohesion: 0.11
Nodes (13): canAdd, editQuality, editValues, isSocketedHere, newAzureChoice, newAzureChoiceValue, newDef, newFreeKeys (+5 more)

### Community 29 - "SigilsScreen.svelte"
Cohesion: 0.16
Nodes (11): ../lib/transcendence.js, ../lib/transcendenceData.js, awakeningLabel, equippedGlyphCount, ichorSpent, nodesPlaced, tree, ./TranscendenceDrawer.svelte (+3 more)

### Community 30 - "./Chip.svelte"
Cohesion: 0.16
Nodes (15): capStats(), CHANCE_KEYS, iterationSeed(), makeFighter(), maxHpNow(), PARALYZE_TICKS, percentile(), PVP_SIGIL_MECHANICS (+7 more)

### Community 31 - "./PresetEditor.svelte"
Cohesion: 0.39
Nodes (7): ../lib/dps.js, ../lib/format.js, ../lib/model.js, ../lib/totals.js, ./AddPetModal.svelte, ./PresetCard.svelte, ./PresetEditor.svelte

### Community 32 - "pvpGauntlet.js"
Cohesion: 0.26
Nodes (12): ARCHETYPES_BY_CLASS, archetypeVariants(), generateGauntlet(), mixSeed(), scaleArchetype(), analyzeContradiction(), buildBudget(), playerSideFor() (+4 more)

### Community 33 - "transcendence.js"
Cohesion: 0.13
Nodes (17): hasAnyStat(), linkedPresets(), linkingSetupReady(), presetSetupChecks(), readyCharacter(), buildReasoning(), computeRegret(), goalUnitLabel() (+9 more)

### Community 34 - "simulation.js"
Cohesion: 0.27
Nodes (13): run(), compareEvents(), compareSimulations(), critEffect, doubleHitEffect, heapPop(), heapPush(), iterationSeed() (+5 more)

### Community 35 - "pvpOptimizer.js"
Cohesion: 0.38
Nodes (10): createMultiPvpWinObjective(), createPvpWinObjective(), opponentToSide(), playerToSide(), pvpScore(), runPvpMatrix(), opponent, verifyPvpWinRates() (+2 more)

### Community 36 - "relicsData.js"
Cohesion: 0.31
Nodes (5): RELIC_TIER_LABELS, RELIC_TIER_MAX_LEVEL, RELIC_TIERS, relicLevelValue(), RELICS_BY_CLASS

### Community 37 - "buildConfig.js"
Cohesion: 0.33
Nodes (4): AWAKENING_PATHS, describeBuildConfig(), makeWarrior(), SIGILS_BY_CLASS

### Community 38 - "dropGoals.test.js"
Cohesion: 0.39
Nodes (6): createDropScorer(), DROP_GOALS, scoreSwapMonteCarlo(), warrior(), DROP_GOAL_KINDS, applyStatCaps()

### Community 39 - "DropCheckScreen.test.js"
Cohesion: 0.50
Nodes (3): clickGoal(), goalButtons(), setDropField()

### Community 43 - "./RelicSuggesterPanel.svelte"
Cohesion: 0.83
Nodes (3): makeCharacter(), makePreset(), mountPanel()

## Knowledge Gaps
- **151 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+146 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `./PvpScreen.svelte` connect `PresetsScreen.svelte` to `PvpScreen.test.js`, `transcendence.js`, `./PresetEditor.svelte`, `SimulationScreen.svelte`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `../lib/rosterStore.svelte.js` connect `transcendence.js` to `../lib/format.js`, `MountAndGlyphsScreen.svelte`, `Sidebar.svelte`, `constants.js`, `SimulationScreen.svelte`, `PresetsScreen.svelte`, `VerdictCard.svelte`, `../lib/format.js`, `SigilsScreen.svelte`, `./PresetEditor.svelte`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `../lib/format.js` connect `./PresetEditor.svelte` to `../lib/format.js`, `MountAndGlyphsScreen.svelte`, `transcendence.js`, `StoneForm.svelte`, `SimulationScreen.svelte`, `PresetsScreen.svelte`, `VerdictCard.svelte`, `../lib/format.js`, `SigilsScreen.svelte`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `./PvpScreen.svelte` (e.g. with `addOpponent()` and `cancelGauntlet()`) actually correct?**
  _`./PvpScreen.svelte` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `createRosterStore()` (e.g. with `setDropField()` and `addOpponent()`) actually correct?**
  _`createRosterStore()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _151 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `../lib/format.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05204872646733112 - nodes in this community are weakly interconnected._