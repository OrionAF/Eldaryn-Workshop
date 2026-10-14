# Graph Report - Eldaryn-Workshop  (2026-07-14)

## Corpus Check
- 103 files · ~95,904 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 620 nodes · 1330 edges · 32 communities (24 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.72)
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

## God Nodes (most connected - your core abstractions)
1. `newCharacter()` - 28 edges
2. `computePresetTotals()` - 28 edges
3. `createRosterStore()` - 24 edges
4. `../lib/constants.js` - 21 edges
5. `offensiveStats()` - 20 edges
6. `emptyStats()` - 20 edges
7. `../lib/rosterStore.svelte.js` - 19 edges
8. `rosterStore` - 19 edges
9. `normaliseCharacter()` - 17 edges
10. `optimize()` - 17 edges

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

## Communities (32 total, 8 thin omitted)

### Community 0 - "../lib/format.js"
Cohesion: 0.20
Nodes (7): ../lib/awakeningData.js, ../lib/optimizer.js, ../lib/sigilEffects.js, ../lib/sigilsData.js, ../lib/talentTreeData.js, ../lib/transcendenceData.js, ./SimulatedPresetCard.svelte

### Community 1 - "rosterStore.svelte.js"
Cohesion: 0.05
Nodes (55): SPECIAL_GLYPHS, pvpEffect(), materializeCandidate(), createPvpWinObjective(), opponentToSide(), playerToSide(), pvpScore(), opponent (+47 more)

### Community 2 - "model.js"
Cohesion: 0.07
Nodes (58): emptyGear(), SLOTS, SOURCE_DEFS, emptyAwakening(), emptyGear(), emptyMounts(), emptyRoster(), emptySigilValues() (+50 more)

### Community 3 - "MountAndGlyphsScreen.svelte"
Cohesion: 0.12
Nodes (11): formatPct(), glyphError, newGlyphIsSpecial, newGlyphRarity, newGlyphStatKey, newGlyphTier, newGlyphValue, statLabel() (+3 more)

### Community 4 - "build job"
Cohesion: 0.18
Nodes (12): actions/checkout@v4, actions/deploy-pages@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, BASE_PATH env var, build job, deploy job, Deploy to GitHub Pages Workflow (+4 more)

### Community 5 - "totals.js"
Cohesion: 0.10
Nodes (37): FIELDS, resolveAwakeningPerPoint(), applySwap(), combineAdditive(), compareSwap(), computeDps(), computeHps(), finalAttack() (+29 more)

### Community 6 - "package.json"
Cohesion: 0.11
Nodes (17): devDependencies, jsdom, playwright, svelte, @sveltejs/vite-plugin-svelte, vite, vitest, name (+9 more)

### Community 7 - "Sidebar.svelte"
Cohesion: 0.07
Nodes (18): ../lib/storage.js, ./SettingsPanel.svelte, active, charPickerOpen, deleteCharacter(), editingCharacterId, editName, fileInput (+10 more)

### Community 8 - "constants.js"
Cohesion: 0.12
Nodes (18): allocation, changeRank(), isUnlocked(), pointsRemainingToUnlock(), pointsSpentBeforeTier(), pointsSpentInTier(), rankOf(), { specKey, talentSetIndex } (+10 more)

### Community 9 - "transcendence.js"
Cohesion: 0.16
Nodes (9): ../lib/constants.js, ../lib/relicsData.js, ../lib/rosterStore.svelte.js, ./Chip.svelte, compact, small, filled, selected (+1 more)

### Community 10 - "relicsData.js"
Cohesion: 0.07
Nodes (9): setDropField(), RELIC_TIER_LABELS, RELIC_TIER_MAX_LEVEL, RELIC_TIERS, RELICS_BY_CLASS, isTierUnlocked(), pointsSpentInTier(), rosterStore (+1 more)

### Community 11 - "Eldaryn Gear Optimiser"
Cohesion: 0.25
Nodes (7): #app mount div, src/main.js entry script reference, Deploy, Development, Eldaryn Gear Optimiser, Legacy reference, Svelte 5

### Community 22 - "StoneForm.svelte"
Cohesion: 0.13
Nodes (18): ../lib/stonesData.js, PVP_KEYS, socketedIds, sortedInventory, statLines(), STONE_STAT_ORDER, { stoneInventory, loadouts, selectedStoneId, onSelect, equippedStoneId = null }, typeRank (+10 more)

### Community 23 - "SimulationScreen.svelte"
Cohesion: 0.05
Nodes (33): ../lib/buildConfig.js, ../lib/simulation.js, ../lib/tankObjective.js, canTank, confirmDeleteId, durationInput, durationSeconds(), expandedSavedId (+25 more)

### Community 24 - "optimizer.js"
Cohesion: 0.10
Nodes (28): mountCard(), AWAKENING_PATHS, describeBuildConfig(), makeWarrior(), SPECS_BY_CLASS, summarizeStats(), ABORTED, candidateFromCurrent() (+20 more)

### Community 25 - "PresetsScreen.svelte"
Cohesion: 0.05
Nodes (33): ../lib/optimizerClient.js, ../lib/pvpOptimizer.js, ../lib/pvpSimulation.js, addOpponent(), applyOptimized(), clearResults(), confirmingDelete, deleteOpponent() (+25 more)

### Community 26 - "VerdictCard.svelte"
Cohesion: 0.22
Nodes (5): aggregate, anyDown, anyUp, mixed, rows

### Community 27 - "../lib/format.js"
Cohesion: 0.32
Nodes (6): ../lib/format.js, ../lib/transcendence.js, ./TranscendenceDrawer.svelte, ./TranscendenceGrid.svelte, inert, active

### Community 28 - "../lib/format.js"
Cohesion: 0.33
Nodes (12): canUnlock(), costForCount(), costForSigil(), effectiveUnlockedSet(), indexNodesByPosition(), isAdjacent(), parsePosition(), positionKey() (+4 more)

### Community 29 - "SigilsScreen.svelte"
Cohesion: 0.11
Nodes (13): canAdd, editQuality, editValues, isSocketedHere, newAzureChoice, newAzureChoiceValue, newDef, newFreeKeys (+5 more)

### Community 30 - "PresetsScreen.svelte"
Cohesion: 0.33
Nodes (5): awakeningLabel, equippedGlyphCount, ichorSpent, nodesPlaced, tree

### Community 31 - "./PresetEditor.svelte"
Cohesion: 0.26
Nodes (7): ../lib/dps.js, ../lib/model.js, ../lib/totals.js, ./AddPetModal.svelte, ./ConfirmButton.svelte, ./PresetCard.svelte, ./PresetEditor.svelte

## Knowledge Gaps
- **181 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+176 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `../lib/rosterStore.svelte.js` connect `transcendence.js` to `../lib/format.js`, `MountAndGlyphsScreen.svelte`, `Sidebar.svelte`, `constants.js`, `SimulationScreen.svelte`, `PresetsScreen.svelte`, `VerdictCard.svelte`, `../lib/format.js`, `SigilsScreen.svelte`, `PresetsScreen.svelte`, `./PresetEditor.svelte`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `../lib/constants.js` connect `transcendence.js` to `../lib/format.js`, `MountAndGlyphsScreen.svelte`, `Sidebar.svelte`, `constants.js`, `StoneForm.svelte`, `PresetsScreen.svelte`, `../lib/format.js`, `SigilsScreen.svelte`, `./PresetEditor.svelte`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `./SimulatedPresetCard.svelte` connect `../lib/format.js` to `transcendence.js`, `SimulationScreen.svelte`, `optimizer.js`, `PresetsScreen.svelte`, `../lib/format.js`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `createRosterStore()` (e.g. with `setDropField()` and `addOpponent()`) actually correct?**
  _`createRosterStore()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _181 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `rosterStore.svelte.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05194805194805195 - nodes in this community are weakly interconnected._
- **Should `model.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0673274094326726 - nodes in this community are weakly interconnected._