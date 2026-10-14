# Graph Report - Eldaryn-Workshop  (2026-07-04)

## Corpus Check
- 73 files · ~46,715 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 355 nodes · 727 edges · 23 communities (15 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c6d72e01`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_MountAndGlyphsScreen.svelte|MountAndGlyphsScreen.svelte]]
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

## God Nodes (most connected - your core abstractions)
1. `createRosterStore()` - 20 edges
2. `computePresetTotals()` - 18 edges
3. `../lib/constants.js` - 17 edges
4. `../lib/rosterStore.svelte.js` - 16 edges
5. `emptyStats()` - 16 edges
6. `rosterStore` - 16 edges
7. `newCharacter()` - 15 edges
8. `normaliseCharacter()` - 13 edges
9. `offensiveStats()` - 12 edges
10. `../lib/format.js` - 11 edges

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

## Communities (23 total, 8 thin omitted)

### Community 0 - "MountAndGlyphsScreen.svelte"
Cohesion: 0.06
Nodes (37): ../lib/awakeningData.js, ../lib/constants.js, ../lib/dps.js, ../lib/format.js, ../lib/model.js, ../lib/relicsData.js, ../lib/rosterStore.svelte.js, ../lib/stonesData.js (+29 more)

### Community 1 - "rosterStore.svelte.js"
Cohesion: 0.27
Nodes (10): emptyRoster(), getCurrent(), normaliseRoster(), defaultExportFilename(), downloadRoster(), exportRoster(), hasLocalStorage, importRoster() (+2 more)

### Community 2 - "model.js"
Cohesion: 0.10
Nodes (36): emptyGear(), SLOTS, emptyAwakening(), emptyGear(), emptySocketedStones(), emptySourceState(), emptyStats(), emptyTranscendence() (+28 more)

### Community 3 - "format.js"
Cohesion: 0.15
Nodes (15): CLASSES, FLAT_KEYS, RARITIES, SOURCE_DEFS, SPECS_BY_CLASS, SWAP_SPECIAL_KEYS, TALENT_TREE_KEYS, TRANSCENDENCE_COST_TIERS (+7 more)

### Community 4 - "build job"
Cohesion: 0.18
Nodes (12): actions/checkout@v4, actions/deploy-pages@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, BASE_PATH env var, build job, deploy job, Deploy to GitHub Pages Workflow (+4 more)

### Community 5 - "totals.js"
Cohesion: 0.13
Nodes (26): FIELDS, resolveAwakeningPerPoint(), SWAP_ADDITIVE_KEYS, applySwap(), combineAdditive(), compareSwap(), computeDps(), computeHps() (+18 more)

### Community 6 - "package.json"
Cohesion: 0.12
Nodes (16): devDependencies, jsdom, svelte, @sveltejs/vite-plugin-svelte, vite, vitest, name, private (+8 more)

### Community 7 - "Sidebar.svelte"
Cohesion: 0.07
Nodes (18): ../lib/storage.js, ./SettingsPanel.svelte, active, charPickerOpen, deleteCharacter(), editingCharacterId, editName, fileInput (+10 more)

### Community 8 - "TalentTierList.svelte"
Cohesion: 0.21
Nodes (11): ../lib/talentTreeData.js, allocation, changeRank(), isUnlocked(), pointsRemainingToUnlock(), pointsSpentBeforeTier(), pointsSpentInTier(), rankOf() (+3 more)

### Community 9 - "transcendence.js"
Cohesion: 0.30
Nodes (13): normaliseTranscendence(), canUnlock(), costForCount(), costForSigil(), effectiveUnlockedSet(), indexNodesByPosition(), isAdjacent(), parsePosition() (+5 more)

### Community 10 - "relicsData.js"
Cohesion: 0.07
Nodes (12): setDropField(), AWAKENING_PATHS, RELIC_TIER_LABELS, RELIC_TIER_MAX_LEVEL, RELIC_TIERS, relicLevelValue(), RELICS_BY_CLASS, isTierUnlocked() (+4 more)

### Community 11 - "Eldaryn Gear Optimiser"
Cohesion: 0.25
Nodes (7): #app mount div, src/main.js entry script reference, Deploy, Development, Eldaryn Gear Optimiser, Legacy reference, Svelte 5

### Community 22 - "StoneForm.svelte"
Cohesion: 0.11
Nodes (13): canAdd, editQuality, editValues, isSocketedHere, newAzureChoice, newAzureChoiceValue, newDef, newFreeKeys (+5 more)

## Knowledge Gaps
- **97 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+92 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `svelte` connect `package.json` to `relicsData.js`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Why does `../lib/rosterStore.svelte.js` connect `MountAndGlyphsScreen.svelte` to `TalentTierList.svelte`, `StoneForm.svelte`, `Sidebar.svelte`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `createRosterStore()` (e.g. with `setDropField()` and `deleteCharacter()`) actually correct?**
  _`createRosterStore()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _97 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MountAndGlyphsScreen.svelte` be split into smaller, more focused modules?**
  _Cohesion score 0.058173076923076925 - nodes in this community are weakly interconnected._
- **Should `model.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10374149659863946 - nodes in this community are weakly interconnected._
- **Should `totals.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12701612903225806 - nodes in this community are weakly interconnected._