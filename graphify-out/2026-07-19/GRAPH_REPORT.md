# Graph Report - Eldaryn-Workshop  (2026-07-19)

## Corpus Check
- 119 files · ~120,765 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 749 nodes · 1651 edges · 49 communities (37 shown, 12 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.72)
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
- [[_COMMUNITY_clearResults|clearResults]]
- [[_COMMUNITY_transcendence.js|transcendence.js]]
- [[_COMMUNITY_newCharacter|newCharacter]]
- [[_COMMUNITY_traceLine|traceLine]]
- [[_COMMUNITY_runSim|runSim]]
- [[_COMMUNITY_durationSeconds|durationSeconds]]
- [[_COMMUNITY_StoneForm.svelte|StoneForm.svelte]]
- [[_COMMUNITY_fmtDamage|fmtDamage]]
- [[_COMMUNITY_rerunSaved|rerunSaved]]
- [[_COMMUNITY_storage.js|storage.js]]
- [[_COMMUNITY_.RelicSuggesterPanel.svelte|./RelicSuggesterPanel.svelte]]
- [[_COMMUNITY_GoalSliders.test.js|GoalSliders.test.js]]

## God Nodes (most connected - your core abstractions)
1. `newCharacter()` - 35 edges
2. `createRosterStore()` - 28 edges
3. `offensiveStats()` - 23 edges
4. `../lib/constants.js` - 21 edges
5. `optimize()` - 21 edges
6. `../lib/rosterStore.svelte.js` - 20 edges
7. `emptyStats()` - 20 edges
8. `rosterStore` - 20 edges
9. `computePresetTotals()` - 20 edges
10. `normaliseCharacter()` - 18 edges

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

## Communities (49 total, 12 thin omitted)

### Community 0 - "../lib/format.js"
Cohesion: 0.19
Nodes (7): ../lib/pvpSimulation.js, ./SavedResultsRail.svelte, exportSaved(), flattenScalars(), fmtSavedAt(), pickForCompare(), toggleSaved()

### Community 1 - "rosterStore.svelte.js"
Cohesion: 0.06
Nodes (55): AWAKENING_PATHS, describeBuildConfig(), SPECIAL_GLYPHS, SPECS_BY_CLASS, createDropScorer(), DROP_GOALS, scoreSwapMonteCarlo(), warrior() (+47 more)

### Community 2 - "model.js"
Cohesion: 0.06
Nodes (65): emptyGear(), makeWarrior(), SLOTS, emptyAwakening(), emptyGear(), emptyMounts(), emptyRoster(), emptySigilValues() (+57 more)

### Community 3 - "MountAndGlyphsScreen.svelte"
Cohesion: 0.12
Nodes (11): formatPct(), glyphError, newGlyphIsSpecial, newGlyphRarity, newGlyphStatKey, newGlyphTier, newGlyphValue, statLabel() (+3 more)

### Community 4 - "build job"
Cohesion: 0.18
Nodes (12): actions/checkout@v4, actions/deploy-pages@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, BASE_PATH env var, build job, deploy job, Deploy to GitHub Pages Workflow (+4 more)

### Community 5 - "totals.js"
Cohesion: 0.07
Nodes (50): FIELDS, resolveAwakeningPerPoint(), STAT_FIELDS, SWAP_ADDITIVE_KEYS, applySwap(), combineAdditive(), compareSwap(), computeDps() (+42 more)

### Community 6 - "package.json"
Cohesion: 0.11
Nodes (17): devDependencies, jsdom, playwright, svelte, @sveltejs/vite-plugin-svelte, vite, vitest, name (+9 more)

### Community 7 - "Sidebar.svelte"
Cohesion: 0.07
Nodes (18): ../lib/storage.js, ./SettingsPanel.svelte, active, charPickerOpen, deleteCharacter(), editingCharacterId, editName, fileInput (+10 more)

### Community 8 - "constants.js"
Cohesion: 0.25
Nodes (9): allocation, changeRank(), isUnlocked(), pointsRemainingToUnlock(), pointsSpentBeforeTier(), pointsSpentInTier(), rankOf(), { specKey, talentSetIndex } (+1 more)

### Community 9 - "transcendence.js"
Cohesion: 0.19
Nodes (6): ../lib/constants.js, ../lib/rosterStore.svelte.js, ./ConfirmButton.svelte, filled, selected, app

### Community 10 - "relicsData.js"
Cohesion: 0.14
Nodes (3): isTierUnlocked(), pointsSpentInTier(), rosterStore

### Community 11 - "Eldaryn Gear Optimiser"
Cohesion: 0.25
Nodes (7): #app mount div, src/main.js entry script reference, Deploy, Development, Eldaryn Gear Optimiser, Legacy reference, Svelte 5

### Community 22 - "StoneForm.svelte"
Cohesion: 0.13
Nodes (18): ../lib/stonesData.js, PVP_KEYS, socketedIds, sortedInventory, statLines(), STONE_STAT_ORDER, { stoneInventory, loadouts, selectedStoneId, onSelect, equippedStoneId = null }, typeRank (+10 more)

### Community 23 - "SimulationScreen.svelte"
Cohesion: 0.04
Nodes (41): ../lib/pvpGoalObjective.js, ../lib/simulation.js, ../lib/statWeights.js, cmpPresetA, cmpPresetAId, cmpPresetB, cmpPresetBId, cmpResult (+33 more)

### Community 24 - "optimizer.js"
Cohesion: 0.15
Nodes (18): mountCard(), alignStonesToCurrentSlots(), candidateFromCurrent(), cloneCandidate(), createMonteCarloObjective(), isBuyableNode(), materializeCandidate(), optimize() (+10 more)

### Community 25 - "PresetsScreen.svelte"
Cohesion: 0.04
Nodes (38): ../lib/buildConfig.js, ../lib/pvpOptimizer.js, ../lib/sigilEffects.js, confirmingDelete, durationInput, healthMultiplier, HP_MULTIPLIERS, ichorInput (+30 more)

### Community 26 - "VerdictCard.svelte"
Cohesion: 0.11
Nodes (10): ../lib/dropGoals.js, ../lib/tankObjective.js, ./Chip.svelte, compact, small, tankEhpPct, tankProfileId, aggregate (+2 more)

### Community 27 - "../lib/format.js"
Cohesion: 0.13
Nodes (26): createPvpWinObjective(), opponentToSide(), playerToSide(), pvpScore(), runPvpMatrix(), opponent, verifyPvpWinRates(), buildPvpSide() (+18 more)

### Community 28 - "../lib/format.js"
Cohesion: 0.25
Nodes (8): aggRate(), buildPvpObjectiveSpec(), durationSeconds(), promoteAlternative(), runMatrix(), runOptimizer(), savePvpOptResult(), verifySelected()

### Community 29 - "SigilsScreen.svelte"
Cohesion: 0.12
Nodes (16): ../lib/awakeningData.js, ../lib/optimizer.js, ../lib/relicsData.js, ../lib/talentTreeData.js, ../lib/transcendence.js, ../lib/transcendenceData.js, awakeningLabel, equippedGlyphCount (+8 more)

### Community 30 - "./Chip.svelte"
Cohesion: 0.50
Nodes (3): clickGoal(), goalButtons(), setDropField()

### Community 31 - "./PresetEditor.svelte"
Cohesion: 0.27
Nodes (8): ../lib/dps.js, ../lib/format.js, ../lib/model.js, ../lib/sigilsData.js, ../lib/totals.js, ./AddPetModal.svelte, ./PresetCard.svelte, ./PresetEditor.svelte

### Community 32 - "clearResults"
Cohesion: 0.33
Nodes (6): addOpponent(), applyOptimized(), clearResults(), deleteOpponent(), duplicateOpponent(), snapshotPreset()

### Community 33 - "transcendence.js"
Cohesion: 0.15
Nodes (24): CLASSES, fieldsForTab(), GLYPH_RARITIES, RARITIES, SOURCE_DEFS, SWAP_SPECIAL_KEYS, TALENT_TREE_KEYS, TRANSCENDENCE_COST_TIERS (+16 more)

### Community 34 - "newCharacter"
Cohesion: 0.20
Nodes (5): RELIC_TIER_LABELS, RELIC_TIER_MAX_LEVEL, RELIC_TIERS, relicLevelValue(), RELICS_BY_CLASS

### Community 35 - "traceLine"
Cohesion: 0.67
Nodes (3): fmtDamage(), tagLabel(), traceLine()

### Community 36 - "runSim"
Cohesion: 0.67
Nodes (3): iterationsCount(), rerunSaved(), runSim()

### Community 37 - "durationSeconds"
Cohesion: 0.50
Nodes (5): buildOptObjectiveSpec(), durationSeconds(), runOptimizer(), saveSimResult(), scoreUnitFor()

### Community 38 - "StoneForm.svelte"
Cohesion: 0.11
Nodes (13): canAdd, editQuality, editValues, isSocketedHere, newAzureChoice, newAzureChoiceValue, newDef, newFreeKeys (+5 more)

### Community 43 - "./RelicSuggesterPanel.svelte"
Cohesion: 0.47
Nodes (5): ../lib/optimizerClient.js, ./RelicSuggesterPanel.svelte, makeCharacter(), makePreset(), mountPanel()

## Knowledge Gaps
- **205 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+200 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `../lib/rosterStore.svelte.js` connect `transcendence.js` to `../lib/format.js`, `MountAndGlyphsScreen.svelte`, `StoneForm.svelte`, `Sidebar.svelte`, `constants.js`, `SimulationScreen.svelte`, `PresetsScreen.svelte`, `VerdictCard.svelte`, `SigilsScreen.svelte`, `./PresetEditor.svelte`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `./SimulatedPresetCard.svelte` connect `SigilsScreen.svelte` to `transcendence.js`, `SimulationScreen.svelte`, `optimizer.js`, `PresetsScreen.svelte`, `./PresetEditor.svelte`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `../lib/constants.js` connect `transcendence.js` to `MountAndGlyphsScreen.svelte`, `StoneForm.svelte`, `Sidebar.svelte`, `constants.js`, `StoneForm.svelte`, `PresetsScreen.svelte`, `VerdictCard.svelte`, `SigilsScreen.svelte`, `./PresetEditor.svelte`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createRosterStore()` (e.g. with `setDropField()` and `addOpponent()`) actually correct?**
  _`createRosterStore()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _205 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `rosterStore.svelte.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06116700201207243 - nodes in this community are weakly interconnected._
- **Should `model.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06134371957156767 - nodes in this community are weakly interconnected._