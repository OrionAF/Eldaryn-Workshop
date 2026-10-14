# Graph Report - Eldaryn-Workshop  (2026-07-09)

## Corpus Check
- 94 files · ~84,528 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 535 nodes · 1145 edges · 32 communities (22 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.77)
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
- [[_COMMUNITY_TalentTierList.svelte|TalentTierList.svelte]]
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
- [[_COMMUNITY_sigilEffects.js|sigilEffects.js]]
- [[_COMMUNITY_SlotSilhouette.svelte|SlotSilhouette.svelte]]

## God Nodes (most connected - your core abstractions)
1. `computePresetTotals()` - 25 edges
2. `createRosterStore()` - 24 edges
3. `../lib/constants.js` - 22 edges
4. `newCharacter()` - 21 edges
5. `emptyStats()` - 20 edges
6. `../lib/rosterStore.svelte.js` - 19 edges
7. `rosterStore` - 19 edges
8. `offensiveStats()` - 18 edges
9. `normaliseCharacter()` - 15 edges
10. `../lib/format.js` - 14 edges

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

## Communities (32 total, 10 thin omitted)

### Community 0 - "../lib/format.js"
Cohesion: 0.18
Nodes (10): ../lib/transcendence.js, ../lib/transcendenceData.js, awakeningLabel, equippedGlyphCount, ichorSpent, nodesPlaced, tree, ./TranscendenceGrid.svelte (+2 more)

### Community 1 - "rosterStore.svelte.js"
Cohesion: 0.09
Nodes (34): materializeCandidate(), createPvpWinObjective(), opponentToSide(), playerToSide(), pvpScore(), opponent, verifyPvpWinRates(), buildPvpSide() (+26 more)

### Community 2 - "model.js"
Cohesion: 0.06
Nodes (69): setDropField(), emptyGear(), AWAKENING_PATHS, CLASSES, RARITIES, SLOTS, SOURCE_DEFS, SPECS_BY_CLASS (+61 more)

### Community 3 - "MountAndGlyphsScreen.svelte"
Cohesion: 0.18
Nodes (6): glyphError, newGlyphStatKey, newGlyphTier, newGlyphValue, TIER_LABELS, TIERS

### Community 4 - "build job"
Cohesion: 0.18
Nodes (12): actions/checkout@v4, actions/deploy-pages@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, BASE_PATH env var, build job, deploy job, Deploy to GitHub Pages Workflow (+4 more)

### Community 5 - "totals.js"
Cohesion: 0.11
Nodes (32): FIELDS, resolveAwakeningPerPoint(), SWAP_ADDITIVE_KEYS, applySwap(), combineAdditive(), compareSwap(), computeDps(), computeHps() (+24 more)

### Community 6 - "package.json"
Cohesion: 0.11
Nodes (17): devDependencies, jsdom, playwright, svelte, @sveltejs/vite-plugin-svelte, vite, vitest, name (+9 more)

### Community 7 - "Sidebar.svelte"
Cohesion: 0.07
Nodes (18): ../lib/storage.js, ./SettingsPanel.svelte, active, charPickerOpen, deleteCharacter(), editingCharacterId, editName, fileInput (+10 more)

### Community 8 - "TalentTierList.svelte"
Cohesion: 0.17
Nodes (9): allocation, changeRank(), isUnlocked(), pointsRemainingToUnlock(), pointsSpentBeforeTier(), pointsSpentInTier(), rankOf(), { specKey, talentSetIndex } (+1 more)

### Community 9 - "transcendence.js"
Cohesion: 0.19
Nodes (6): ../lib/relicsData.js, ../lib/rosterStore.svelte.js, ./Chip.svelte, compact, small, app

### Community 11 - "Eldaryn Gear Optimiser"
Cohesion: 0.25
Nodes (7): #app mount div, src/main.js entry script reference, Deploy, Development, Eldaryn Gear Optimiser, Legacy reference, Svelte 5

### Community 22 - "StoneForm.svelte"
Cohesion: 0.13
Nodes (18): ../lib/stonesData.js, PVP_KEYS, socketedIds, sortedInventory, statLines(), STONE_STAT_ORDER, { stoneInventory, loadouts, selectedStoneId, onSelect, equippedStoneId = null }, typeRank (+10 more)

### Community 23 - "SimulationScreen.svelte"
Cohesion: 0.12
Nodes (11): ../lib/simulation.js, ichorInput, ITERATION_CHOICES, iterations, lastCharacterId, optMode, optProgress, optResult (+3 more)

### Community 24 - "optimizer.js"
Cohesion: 0.12
Nodes (29): mountCard(), fieldsForTab(), TRANSCENDENCE_COST_TIERS, summarizeStats(), candidateFromCurrent(), cloneCandidate(), diffCandidate(), isAllocationLegal() (+21 more)

### Community 25 - "PresetsScreen.svelte"
Cohesion: 0.06
Nodes (27): ../lib/pvpOptimizer.js, ../lib/pvpSimulation.js, addOpponent(), applyOptimized(), clearResults(), confirmingDelete, deleteOpponent(), healthMultiplier (+19 more)

### Community 26 - "VerdictCard.svelte"
Cohesion: 0.17
Nodes (6): ./ConfirmButton.svelte, aggregate, anyDown, anyUp, mixed, rows

### Community 27 - "../lib/format.js"
Cohesion: 0.25
Nodes (10): ../lib/constants.js, ../lib/dps.js, ../lib/format.js, ../lib/model.js, ../lib/totals.js, ./AddMountModal.svelte, ./AddPetModal.svelte, ./PresetCard.svelte (+2 more)

### Community 28 - "../lib/format.js"
Cohesion: 0.10
Nodes (13): canAdd, editQuality, editValues, isSocketedHere, newAzureChoice, newAzureChoiceValue, newDef, newFreeKeys (+5 more)

### Community 29 - "SigilsScreen.svelte"
Cohesion: 0.22
Nodes (6): ../lib/awakeningData.js, ../lib/optimizer.js, ../lib/sigilEffects.js, ../lib/sigilsData.js, ../lib/talentTreeData.js, ./SimulatedPresetCard.svelte

### Community 30 - "sigilEffects.js"
Cohesion: 0.12
Nodes (15): sigilAwareDpsObjective(), BUFF_DPS_KEYS, BUFF_SWING_KEYS, buffValue(), buildSigilEffects(), DAMAGE_KINDS, expectedSigilActiveDps(), makeSigilEffect() (+7 more)

## Knowledge Gaps
- **151 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+146 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `../lib/constants.js` connect `../lib/format.js` to `../lib/format.js`, `MountAndGlyphsScreen.svelte`, `Sidebar.svelte`, `TalentTierList.svelte`, `transcendence.js`, `StoneForm.svelte`, `PresetsScreen.svelte`, `../lib/format.js`, `SigilsScreen.svelte`, `SlotSilhouette.svelte`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `../lib/rosterStore.svelte.js` connect `transcendence.js` to `../lib/format.js`, `MountAndGlyphsScreen.svelte`, `Sidebar.svelte`, `TalentTierList.svelte`, `SimulationScreen.svelte`, `PresetsScreen.svelte`, `VerdictCard.svelte`, `../lib/format.js`, `../lib/format.js`, `SigilsScreen.svelte`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `./SimulatedPresetCard.svelte` connect `SigilsScreen.svelte` to `../lib/format.js`, `transcendence.js`, `SimulationScreen.svelte`, `optimizer.js`, `PresetsScreen.svelte`, `../lib/format.js`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `createRosterStore()` (e.g. with `setDropField()` and `addOpponent()`) actually correct?**
  _`createRosterStore()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _151 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `rosterStore.svelte.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08985200845665962 - nodes in this community are weakly interconnected._
- **Should `model.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0586997685672207 - nodes in this community are weakly interconnected._