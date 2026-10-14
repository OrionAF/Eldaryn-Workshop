# Graph Report - Eldaryn-Workshop  (2026-07-05)

## Corpus Check
- 82 files · ~58,783 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 428 nodes · 906 edges · 28 communities (20 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3dbf00ab`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_PresetsScreen.svelte|PresetsScreen.svelte]]
- [[_COMMUNITY_rosterStore.svelte.js|rosterStore.svelte.js]]
- [[_COMMUNITY_model.js|model.js]]
- [[_COMMUNITY_format.js|format.js]]
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
- [[_COMMUNITY_.PresetEditor.svelte|./PresetEditor.svelte]]
- [[_COMMUNITY_VerdictCard.svelte|VerdictCard.svelte]]
- [[_COMMUNITY_..libformat.js|../lib/format.js]]

## God Nodes (most connected - your core abstractions)
1. `computePresetTotals()` - 23 edges
2. `../lib/constants.js` - 20 edges
3. `createRosterStore()` - 20 edges
4. `../lib/rosterStore.svelte.js` - 17 edges
5. `newCharacter()` - 17 edges
6. `rosterStore` - 17 edges
7. `emptyStats()` - 16 edges
8. `../lib/format.js` - 13 edges
9. `offensiveStats()` - 13 edges
10. `normaliseCharacter()` - 13 edges

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

## Communities (28 total, 8 thin omitted)

### Community 0 - "PresetsScreen.svelte"
Cohesion: 0.17
Nodes (10): ../lib/awakeningData.js, ../lib/optimizer.js, ../lib/talentTreeData.js, ../lib/transcendenceData.js, awakeningLabel, equippedGlyphCount, ichorSpent, nodesPlaced (+2 more)

### Community 1 - "rosterStore.svelte.js"
Cohesion: 0.17
Nodes (12): compareEvents(), critEffect, DEFAULT_EFFECTS, doubleHitEffect, heapPop(), heapPush(), iterationSeed(), mulberry32() (+4 more)

### Community 2 - "model.js"
Cohesion: 0.07
Nodes (53): emptyGear(), CLASSES, fieldsForTab(), RARITIES, SLOTS, SOURCE_DEFS, SPECS_BY_CLASS, SWAP_ADDITIVE_KEYS (+45 more)

### Community 3 - "format.js"
Cohesion: 0.18
Nodes (6): glyphError, newGlyphStatKey, newGlyphTier, newGlyphValue, TIER_LABELS, TIERS

### Community 4 - "build job"
Cohesion: 0.18
Nodes (12): actions/checkout@v4, actions/deploy-pages@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, BASE_PATH env var, build job, deploy job, Deploy to GitHub Pages Workflow (+4 more)

### Community 5 - "totals.js"
Cohesion: 0.12
Nodes (29): FIELDS, resolveAwakeningPerPoint(), applySwap(), combineAdditive(), compareSwap(), computeDps(), computeHps(), finalAttack() (+21 more)

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
Cohesion: 0.18
Nodes (8): ../lib/constants.js, ../lib/relicsData.js, ../lib/rosterStore.svelte.js, ./Chip.svelte, compact, small, filled, selected

### Community 10 - "relicsData.js"
Cohesion: 0.07
Nodes (10): setDropField(), RELIC_TIER_LABELS, RELIC_TIER_MAX_LEVEL, RELIC_TIERS, RELICS_BY_CLASS, isTierUnlocked(), pointsSpentInTier(), rosterStore (+2 more)

### Community 11 - "Eldaryn Gear Optimiser"
Cohesion: 0.25
Nodes (7): #app mount div, src/main.js entry script reference, Deploy, Development, Eldaryn Gear Optimiser, Legacy reference, Svelte 5

### Community 22 - "StoneForm.svelte"
Cohesion: 0.06
Nodes (31): ../lib/stonesData.js, canAdd, editQuality, editValues, isSocketedHere, newAzureChoice, newAzureChoiceValue, newDef (+23 more)

### Community 23 - "SimulationScreen.svelte"
Cohesion: 0.13
Nodes (10): ../lib/simulation.js, ichorInput, ITERATION_CHOICES, iterations, lastCharacterId, optProgress, optResult, optRunning (+2 more)

### Community 24 - "optimizer.js"
Cohesion: 0.13
Nodes (29): AWAKENING_PATHS, summarizeStats(), emptyTranscendence(), normaliseTranscendence(), candidateFromCurrent(), cloneCandidate(), diffCandidate(), isAllocationLegal() (+21 more)

### Community 25 - "./PresetEditor.svelte"
Cohesion: 0.33
Nodes (7): ../lib/dps.js, ../lib/model.js, ../lib/totals.js, ./AddPetModal.svelte, ./ConfirmButton.svelte, ./PresetCard.svelte, ./PresetEditor.svelte

### Community 27 - "VerdictCard.svelte"
Cohesion: 0.22
Nodes (5): aggregate, anyDown, anyUp, mixed, rows

### Community 28 - "../lib/format.js"
Cohesion: 0.32
Nodes (6): ../lib/format.js, ../lib/transcendence.js, ./AddMountModal.svelte, ./TranscendenceDrawer.svelte, ./TranscendenceGrid.svelte, inert

## Knowledge Gaps
- **119 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+114 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `svelte` connect `package.json` to `relicsData.js`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `../lib/constants.js` connect `transcendence.js` to `PresetsScreen.svelte`, `format.js`, `Sidebar.svelte`, `TalentTierList.svelte`, `StoneForm.svelte`, `./PresetEditor.svelte`, `../lib/format.js`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `createRosterStore()` (e.g. with `setDropField()` and `deleteCharacter()`) actually correct?**
  _`createRosterStore()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _119 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `model.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07329192546583851 - nodes in this community are weakly interconnected._
- **Should `totals.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._