# Graph Report - Eldaryn-Workshop  (2026-07-08)

## Corpus Check
- 87 files · ~72,967 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 466 nodes · 1004 edges · 30 communities (22 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3dbf00ab`
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
- [[_COMMUNITY_sigilsData.js|sigilsData.js]]
- [[_COMMUNITY_..libformat.js|../lib/format.js]]
- [[_COMMUNITY_StoneForm.svelte|StoneForm.svelte]]

## God Nodes (most connected - your core abstractions)
1. `computePresetTotals()` - 25 edges
2. `../lib/constants.js` - 21 edges
3. `createRosterStore()` - 21 edges
4. `../lib/rosterStore.svelte.js` - 18 edges
5. `rosterStore` - 18 edges
6. `newCharacter()` - 17 edges
7. `./SimulatedPresetCard.svelte` - 16 edges
8. `offensiveStats()` - 16 edges
9. `emptyStats()` - 16 edges
10. `normaliseCharacter()` - 14 edges

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

## Communities (30 total, 8 thin omitted)

### Community 0 - "../lib/format.js"
Cohesion: 0.16
Nodes (11): ../lib/transcendence.js, ../lib/transcendenceData.js, awakeningLabel, equippedGlyphCount, ichorSpent, nodesPlaced, tree, ./TranscendenceDrawer.svelte (+3 more)

### Community 1 - "rosterStore.svelte.js"
Cohesion: 0.09
Nodes (25): sigilAwareDpsObjective(), BUFF_DPS_KEYS, BUFF_SWING_KEYS, buffValue(), buildSigilEffects(), DAMAGE_KINDS, expectedSigilActiveDps(), makeSigilEffect() (+17 more)

### Community 2 - "model.js"
Cohesion: 0.08
Nodes (47): emptyGear(), CLASSES, fieldsForTab(), FLAT_KEYS, RARITIES, SLOTS, SOURCE_DEFS, SPECS_BY_CLASS (+39 more)

### Community 3 - "MountAndGlyphsScreen.svelte"
Cohesion: 0.17
Nodes (7): ./AddMountModal.svelte, glyphError, newGlyphStatKey, newGlyphTier, newGlyphValue, TIER_LABELS, TIERS

### Community 4 - "build job"
Cohesion: 0.18
Nodes (12): actions/checkout@v4, actions/deploy-pages@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, BASE_PATH env var, build job, deploy job, Deploy to GitHub Pages Workflow (+4 more)

### Community 5 - "totals.js"
Cohesion: 0.11
Nodes (31): FIELDS, resolveAwakeningPerPoint(), SWAP_ADDITIVE_KEYS, applySwap(), combineAdditive(), compareSwap(), computeDps(), computeHps() (+23 more)

### Community 6 - "package.json"
Cohesion: 0.11
Nodes (17): devDependencies, jsdom, playwright, svelte, @sveltejs/vite-plugin-svelte, vite, vitest, name (+9 more)

### Community 7 - "Sidebar.svelte"
Cohesion: 0.07
Nodes (18): ../lib/storage.js, ./SettingsPanel.svelte, active, charPickerOpen, deleteCharacter(), editingCharacterId, editName, fileInput (+10 more)

### Community 8 - "TalentTierList.svelte"
Cohesion: 0.23
Nodes (10): allocation, changeRank(), isUnlocked(), pointsRemainingToUnlock(), pointsSpentBeforeTier(), pointsSpentInTier(), rankOf(), { specKey, talentSetIndex } (+2 more)

### Community 9 - "transcendence.js"
Cohesion: 0.17
Nodes (9): ../lib/constants.js, ../lib/relicsData.js, ../lib/rosterStore.svelte.js, ./Chip.svelte, compact, small, ./ConfirmButton.svelte, filled (+1 more)

### Community 10 - "relicsData.js"
Cohesion: 0.07
Nodes (9): RELIC_TIER_LABELS, RELIC_TIER_MAX_LEVEL, RELIC_TIERS, RELICS_BY_CLASS, isTierUnlocked(), pointsSpentInTier(), rosterStore, TALENT_TREES (+1 more)

### Community 11 - "Eldaryn Gear Optimiser"
Cohesion: 0.25
Nodes (7): #app mount div, src/main.js entry script reference, Deploy, Development, Eldaryn Gear Optimiser, Legacy reference, Svelte 5

### Community 22 - "StoneForm.svelte"
Cohesion: 0.14
Nodes (17): ../lib/stonesData.js, PVP_KEYS, socketedIds, sortedInventory, statLines(), STONE_STAT_ORDER, { stoneInventory, loadouts, selectedStoneId, onSelect, equippedStoneId = null }, typeRank (+9 more)

### Community 23 - "SimulationScreen.svelte"
Cohesion: 0.12
Nodes (11): ../lib/simulation.js, ichorInput, ITERATION_CHOICES, iterations, lastCharacterId, optMode, optProgress, optResult (+3 more)

### Community 24 - "optimizer.js"
Cohesion: 0.13
Nodes (29): AWAKENING_PATHS, summarizeStats(), candidateFromCurrent(), cloneCandidate(), diffCandidate(), isAllocationLegal(), isTierUnlocked(), legalTalentIncrements() (+21 more)

### Community 25 - "PresetsScreen.svelte"
Cohesion: 0.39
Nodes (7): ../lib/dps.js, ../lib/format.js, ../lib/model.js, ../lib/totals.js, ./AddPetModal.svelte, ./PresetCard.svelte, ./PresetEditor.svelte

### Community 26 - "VerdictCard.svelte"
Cohesion: 0.22
Nodes (5): aggregate, anyDown, anyUp, mixed, rows

### Community 27 - "sigilsData.js"
Cohesion: 0.26
Nodes (12): setDropField(), emptyRoster(), getCurrent(), normaliseRoster(), createRosterStore(), defaultExportFilename(), downloadRoster(), exportRoster() (+4 more)

### Community 28 - "../lib/format.js"
Cohesion: 0.13
Nodes (12): ../lib/awakeningData.js, ../lib/optimizer.js, ../lib/sigilEffects.js, ../lib/sigilsData.js, ../lib/talentTreeData.js, ./SimulatedPresetCard.svelte, awakeningLabel, fortressLabel (+4 more)

### Community 29 - "StoneForm.svelte"
Cohesion: 0.11
Nodes (13): canAdd, editQuality, editValues, isSocketedHere, newAzureChoice, newAzureChoiceValue, newDef, newFreeKeys (+5 more)

## Knowledge Gaps
- **131 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+126 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `../lib/constants.js` connect `transcendence.js` to `../lib/format.js`, `MountAndGlyphsScreen.svelte`, `Sidebar.svelte`, `TalentTierList.svelte`, `StoneForm.svelte`, `PresetsScreen.svelte`, `../lib/format.js`, `StoneForm.svelte`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `svelte` connect `package.json` to `relicsData.js`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `createRosterStore()` (e.g. with `setDropField()` and `deleteCharacter()`) actually correct?**
  _`createRosterStore()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _131 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `rosterStore.svelte.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09269162210338681 - nodes in this community are weakly interconnected._
- **Should `model.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08143839238498149 - nodes in this community are weakly interconnected._
- **Should `totals.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._