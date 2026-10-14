# Graph Report - Eldaryn-Workshop  (2026-07-14)

## Corpus Check
- 107 files · ~105,900 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 688 nodes · 1453 edges · 42 communities (29 shown, 13 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f7e9bf8b`
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
- [[_COMMUNITY_PresetsScreen.svelte|PresetsScreen.svelte]]
- [[_COMMUNITY_.PresetEditor.svelte|./PresetEditor.svelte]]
- [[_COMMUNITY_clearResults|clearResults]]
- [[_COMMUNITY_RelicsScreen.svelte|RelicsScreen.svelte]]
- [[_COMMUNITY_traceLine|traceLine]]
- [[_COMMUNITY_runSim|runSim]]
- [[_COMMUNITY_durationSeconds|durationSeconds]]
- [[_COMMUNITY_SlotSilhouette.svelte|SlotSilhouette.svelte]]
- [[_COMMUNITY_fmtDamage|fmtDamage]]
- [[_COMMUNITY_rerunSaved|rerunSaved]]
- [[_COMMUNITY_main.js|main.js]]

## God Nodes (most connected - your core abstractions)
1. `computePresetTotals()` - 31 edges
2. `newCharacter()` - 30 edges
3. `createRosterStore()` - 26 edges
4. `../lib/constants.js` - 21 edges
5. `../lib/rosterStore.svelte.js` - 20 edges
6. `offensiveStats()` - 20 edges
7. `emptyStats()` - 20 edges
8. `rosterStore` - 20 edges
9. `./SavedResultsRail.svelte` - 17 edges
10. `normaliseCharacter()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `build job` --semantically_similar_to--> `npm install`  [INFERRED] [semantically similar]
  .github/workflows/deploy.yml → README.md
- `build job` --shares_data_with--> `npm run build`  [INFERRED]
  .github/workflows/deploy.yml → README.md
- `build job` --shares_data_with--> `npm test`  [INFERRED]
  .github/workflows/deploy.yml → README.md
- `createRosterStore()` --indirect_call--> `deleteCharacter()`  [INFERRED]
  src/lib/rosterStore.svelte.js → src/components/Sidebar.svelte
- `createRosterStore()` --indirect_call--> `selectCharacter()`  [INFERRED]
  src/lib/rosterStore.svelte.js → src/components/Sidebar.svelte

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **GitHub Pages deploy pipeline (build + deploy jobs and actions)** — github_workflows_deploy_workflow, github_workflows_deploy_build_job, github_workflows_deploy_deploy_job, github_workflows_deploy_actions_checkout_v4, github_workflows_deploy_actions_setup_node_v4, github_workflows_deploy_actions_upload_pages_artifact_v3, github_workflows_deploy_actions_deploy_pages_v4 [EXTRACTED 1.00]
- **Project documentation set describing Eldaryn Gear Optimiser context and history** — readme_eldaryn_gear_optimiser, readme_context_md, readme_docs_adr, readme_eldaryntracker [INFERRED 0.85]

## Communities (42 total, 13 thin omitted)

### Community 0 - "../lib/format.js"
Cohesion: 0.15
Nodes (9): ../lib/pvpSimulation.js, ./SavedResultsRail.svelte, exportSaved(), flattenScalars(), fmtSavedAt(), pickForCompare(), expandFirst(), heads() (+1 more)

### Community 1 - "rosterStore.svelte.js"
Cohesion: 0.06
Nodes (56): pvpEffect(), materializeCandidate(), createPvpWinObjective(), opponentToSide(), playerToSide(), pvpScore(), runPvpMatrix(), opponent (+48 more)

### Community 2 - "model.js"
Cohesion: 0.05
Nodes (73): setDropField(), emptyGear(), CLASSES, fieldsForTab(), GLYPH_RARITIES, RARITIES, SLOTS, SOURCE_DEFS (+65 more)

### Community 3 - "MountAndGlyphsScreen.svelte"
Cohesion: 0.12
Nodes (11): formatPct(), glyphError, newGlyphIsSpecial, newGlyphRarity, newGlyphStatKey, newGlyphTier, newGlyphValue, statLabel() (+3 more)

### Community 4 - "build job"
Cohesion: 0.18
Nodes (12): actions/checkout@v4, actions/deploy-pages@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, BASE_PATH env var, build job, deploy job, Deploy to GitHub Pages Workflow (+4 more)

### Community 5 - "totals.js"
Cohesion: 0.09
Nodes (40): FIELDS, resolveAwakeningPerPoint(), applySwap(), combineAdditive(), compareSwap(), computeDps(), computeHps(), finalAttack() (+32 more)

### Community 6 - "package.json"
Cohesion: 0.11
Nodes (17): devDependencies, jsdom, playwright, svelte, @sveltejs/vite-plugin-svelte, vite, vitest, name (+9 more)

### Community 7 - "Sidebar.svelte"
Cohesion: 0.06
Nodes (18): ../lib/storage.js, ./SettingsPanel.svelte, active, charPickerOpen, deleteCharacter(), editingCharacterId, editName, fileInput (+10 more)

### Community 8 - "constants.js"
Cohesion: 0.16
Nodes (10): allocation, changeRank(), isUnlocked(), pointsRemainingToUnlock(), pointsSpentBeforeTier(), pointsSpentInTier(), rankOf(), { specKey, talentSetIndex } (+2 more)

### Community 9 - "transcendence.js"
Cohesion: 0.22
Nodes (6): ../lib/constants.js, ../lib/rosterStore.svelte.js, ./Chip.svelte, compact, small, ./ConfirmButton.svelte

### Community 10 - "relicsData.js"
Cohesion: 0.08
Nodes (8): makeWarrior(), RELIC_TIER_LABELS, RELIC_TIER_MAX_LEVEL, RELIC_TIERS, relicLevelValue(), RELICS_BY_CLASS, rosterStore, SIGILS_BY_CLASS

### Community 11 - "Eldaryn Gear Optimiser"
Cohesion: 0.25
Nodes (7): #app mount div, src/main.js entry script reference, Deploy, Development, Eldaryn Gear Optimiser, Legacy reference, Svelte 5

### Community 22 - "StoneForm.svelte"
Cohesion: 0.13
Nodes (18): ../lib/stonesData.js, PVP_KEYS, socketedIds, sortedInventory, statLines(), STONE_STAT_ORDER, { stoneInventory, loadouts, selectedStoneId, onSelect, equippedStoneId = null }, typeRank (+10 more)

### Community 23 - "SimulationScreen.svelte"
Cohesion: 0.04
Nodes (42): ../lib/buildConfig.js, ../lib/optimizerClient.js, ../lib/sigilEffects.js, ../lib/simulation.js, ../lib/statWeights.js, ../lib/tankObjective.js, canTank, cmpPresetA (+34 more)

### Community 24 - "optimizer.js"
Cohesion: 0.08
Nodes (40): mountCard(), AWAKENING_PATHS, describeBuildConfig(), SPECS_BY_CLASS, summarizeStats(), ABORTED, candidateFromCurrent(), CHANGE_REVERTERS (+32 more)

### Community 25 - "PresetsScreen.svelte"
Cohesion: 0.04
Nodes (36): ../lib/pvpOptimizer.js, confirmingDelete, durationInput, healthMultiplier, HP_MULTIPLIERS, ichorInput, iterationsInput, lastCharacterId (+28 more)

### Community 26 - "VerdictCard.svelte"
Cohesion: 0.22
Nodes (5): aggregate, anyDown, anyUp, mixed, rows

### Community 27 - "../lib/format.js"
Cohesion: 0.18
Nodes (10): ../lib/awakeningData.js, ../lib/optimizer.js, ../lib/talentTreeData.js, ../lib/transcendence.js, ../lib/transcendenceData.js, ./SimulatedPresetCard.svelte, ./TranscendenceDrawer.svelte, ./TranscendenceGrid.svelte (+2 more)

### Community 28 - "../lib/format.js"
Cohesion: 0.29
Nodes (7): aggRate(), durationSeconds(), promoteAlternative(), runMatrix(), runOptimizer(), savePvpOptResult(), verifySelected()

### Community 29 - "SigilsScreen.svelte"
Cohesion: 0.10
Nodes (13): canAdd, editQuality, editValues, isSocketedHere, newAzureChoice, newAzureChoiceValue, newDef, newFreeKeys (+5 more)

### Community 30 - "PresetsScreen.svelte"
Cohesion: 0.33
Nodes (5): awakeningLabel, equippedGlyphCount, ichorSpent, nodesPlaced, tree

### Community 31 - "./PresetEditor.svelte"
Cohesion: 0.27
Nodes (8): ../lib/dps.js, ../lib/format.js, ../lib/model.js, ../lib/sigilsData.js, ../lib/totals.js, ./AddPetModal.svelte, ./PresetCard.svelte, ./PresetEditor.svelte

### Community 32 - "clearResults"
Cohesion: 0.33
Nodes (6): addOpponent(), applyOptimized(), clearResults(), deleteOpponent(), duplicateOpponent(), snapshotPreset()

### Community 35 - "traceLine"
Cohesion: 0.67
Nodes (3): fmtDamage(), tagLabel(), traceLine()

### Community 36 - "runSim"
Cohesion: 0.67
Nodes (3): iterationsCount(), rerunSaved(), runSim()

### Community 37 - "durationSeconds"
Cohesion: 0.67
Nodes (3): durationSeconds(), runOptimizer(), saveSimResult()

## Knowledge Gaps
- **200 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+195 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `../lib/rosterStore.svelte.js` connect `transcendence.js` to `../lib/format.js`, `RelicsScreen.svelte`, `MountAndGlyphsScreen.svelte`, `Sidebar.svelte`, `constants.js`, `SimulationScreen.svelte`, `PresetsScreen.svelte`, `VerdictCard.svelte`, `../lib/format.js`, `SigilsScreen.svelte`, `PresetsScreen.svelte`, `./PresetEditor.svelte`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `../lib/constants.js` connect `transcendence.js` to `RelicsScreen.svelte`, `MountAndGlyphsScreen.svelte`, `SlotSilhouette.svelte`, `Sidebar.svelte`, `constants.js`, `StoneForm.svelte`, `PresetsScreen.svelte`, `../lib/format.js`, `SigilsScreen.svelte`, `./PresetEditor.svelte`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `./SimulatedPresetCard.svelte` connect `../lib/format.js` to `RelicsScreen.svelte`, `transcendence.js`, `SimulationScreen.svelte`, `optimizer.js`, `PresetsScreen.svelte`, `./PresetEditor.svelte`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createRosterStore()` (e.g. with `setDropField()` and `addOpponent()`) actually correct?**
  _`createRosterStore()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _200 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `../lib/format.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14705882352941177 - nodes in this community are weakly interconnected._
- **Should `rosterStore.svelte.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06116700201207243 - nodes in this community are weakly interconnected._