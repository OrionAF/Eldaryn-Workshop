# Graph Report - Eldaryn-Workshop  (2026-07-29)

## Corpus Check
- 163 files · ~638,347 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 920 nodes · 2206 edges · 38 communities (29 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.68)
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
- [[_COMMUNITY_SigilsScreen.svelte|SigilsScreen.svelte]]
- [[_COMMUNITY_.Chip.svelte|./Chip.svelte]]
- [[_COMMUNITY_transcendence.js|transcendence.js]]
- [[_COMMUNITY_combatPower.test.js|combatPower.test.js]]
- [[_COMMUNITY_glyphsData.js|glyphsData.js]]
- [[_COMMUNITY_relicsData.js|relicsData.js]]
- [[_COMMUNITY_sigilsData.js|sigilsData.js]]
- [[_COMMUNITY_StarRating.svelte|StarRating.svelte]]
- [[_COMMUNITY_.RelicSuggesterPanel.svelte|./RelicSuggesterPanel.svelte]]
- [[_COMMUNITY_SimulationScreen.test.js|SimulationScreen.test.js]]
- [[_COMMUNITY_Sidebar.test.js|Sidebar.test.js]]
- [[_COMMUNITY_.LinkingReportCard.svelte|./LinkingReportCard.svelte]]

## God Nodes (most connected - your core abstractions)
1. `./PvpScreen.svelte` - 49 edges
2. `newCharacter()` - 43 edges
3. `createRosterStore()` - 39 edges
4. `./SimulationScreen.svelte` - 33 edges
5. `offensiveStats()` - 26 edges
6. `../lib/rosterStore.svelte.js` - 25 edges
7. `../lib/constants.js` - 25 edges
8. `rosterStore` - 25 edges
9. `../lib/format.js` - 24 edges
10. `normaliseCharacter()` - 24 edges

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

## Communities (38 total, 9 thin omitted)

### Community 0 - "../lib/format.js"
Cohesion: 0.14
Nodes (6): ./GoalTimelineChart.svelte, series, ./RunHistoryPanel.svelte, fmtDamage(), headlineLine(), histBinLabel()

### Community 1 - "rosterStore.svelte.js"
Cohesion: 0.08
Nodes (52): verifyDpsOutcome(), ARCHETYPES_BY_CLASS, archetypeVariants(), generateGauntlet(), mixSeed(), scaleArchetype(), analyzeContradiction(), buildBudget() (+44 more)

### Community 2 - "model.js"
Cohesion: 0.05
Nodes (86): emptyGear(), CLASSES, SLOTS, SOURCE_DEFS, resolveGlyphId(), clampInt(), clampMountVal(), compactRunHistory() (+78 more)

### Community 3 - "MountAndGlyphsScreen.svelte"
Cohesion: 0.12
Nodes (12): ../lib/assets.js, ../lib/glyphsData.js, ../lib/sigilEffects.js, ../lib/sigilsData.js, ./EquippedInModal.svelte, ./GlyphCard.svelte, ./GlyphPickerModal.svelte, equippedInGlyph (+4 more)

### Community 4 - "build job"
Cohesion: 0.18
Nodes (12): actions/checkout@v4, actions/deploy-pages@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, BASE_PATH env var, build job, deploy job, Deploy to GitHub Pages Workflow (+4 more)

### Community 5 - "totals.js"
Cohesion: 0.06
Nodes (40): resolveAwakeningPerPoint(), offensiveStats(), sigilHasAnyValue(), conduitNodeUnlocked(), conduitSigils(), forgeSigils(), hasSigilCurve(), isConduitSigil() (+32 more)

### Community 6 - "package.json"
Cohesion: 0.11
Nodes (17): devDependencies, jsdom, playwright, svelte, @sveltejs/vite-plugin-svelte, vite, vitest, name (+9 more)

### Community 7 - "Sidebar.svelte"
Cohesion: 0.06
Nodes (23): ../lib/storage.js, ./SettingsPanel.svelte, active, { activeScreen, onSelectScreen, onStatus }, CHARACTER_NAV, charPickerOpen, deleteCharacter(), editingCharacterId (+15 more)

### Community 9 - "transcendence.js"
Cohesion: 0.14
Nodes (9): ../lib/constants.js, ../lib/relicsData.js, ../lib/rosterStore.svelte.js, ./ConfirmButton.svelte, ./SimulationsDashboard.svelte, active, filled, selected (+1 more)

### Community 10 - "relicsData.js"
Cohesion: 0.05
Nodes (9): cardFor(), cards(), openGlyphPicker(), RELIC_TIER_LABELS, RELIC_TIER_MAX_LEVEL, RELIC_TIERS, relicLevelValue(), RELICS_BY_CLASS (+1 more)

### Community 11 - "Eldaryn Gear Optimiser"
Cohesion: 0.25
Nodes (7): #app mount div, src/main.js entry script reference, Deploy, Development, Eldaryn Gear Optimiser, Legacy reference, Svelte 5

### Community 22 - "StoneForm.svelte"
Cohesion: 0.06
Nodes (31): ../lib/stonesData.js, canAdd, editQuality, editValues, isSocketedHere, newAzureChoice, newAzureChoiceValue, newDef (+23 more)

### Community 23 - "SimulationScreen.svelte"
Cohesion: 0.10
Nodes (10): ../lib/buildConfig.js, ../lib/optimizerClient.js, ../lib/pvpGoalObjective.js, ../lib/simulation.js, ../lib/statWeights.js, ./RelicSuggesterPanel.svelte, ./SimulationScreen.svelte, buildOptObjectiveSpec() (+2 more)

### Community 24 - "optimizer.js"
Cohesion: 0.08
Nodes (44): mountCard(), AWAKENING_PATHS, describeBuildConfig(), makeWarrior(), SPECS_BY_CLASS, summarizeStats(), fakeRunner(), ABORTED (+36 more)

### Community 25 - "PresetsScreen.svelte"
Cohesion: 0.06
Nodes (24): ../lib/pvpGauntlet.js, ../lib/pvpOptimizer.js, ../lib/pvpSimulation.js, ./GauntletResultPanel.svelte, ./PvpScreen.svelte, addOpponent(), applyOptimized(), buildPvpObjectiveSpec() (+16 more)

### Community 26 - "VerdictCard.svelte"
Cohesion: 0.12
Nodes (7): ../lib/dropGoals.js, ../lib/tankObjective.js, tankEhpPct, tankProfileId, aggregate, anyDown, mixed

### Community 29 - "SigilsScreen.svelte"
Cohesion: 0.12
Nodes (16): ../lib/awakeningData.js, ../lib/optimizer.js, ../lib/talentTreeData.js, ../lib/transcendence.js, ../lib/transcendenceData.js, awakeningLabel, equippedGlyphCount, ichorSpent (+8 more)

### Community 30 - "./Chip.svelte"
Cohesion: 0.11
Nodes (28): addPet(), addPetButton(), ALIASES, assetUrl(), BY_KEY, glyphImage(), MODULES, mountImage() (+20 more)

### Community 33 - "transcendence.js"
Cohesion: 0.13
Nodes (18): hasAnyStat(), linkedPresets(), linkingSetupReady(), presetSetupChecks(), readyCharacter(), buildReasoning(), computeRegret(), goalNeedsVerification() (+10 more)

### Community 34 - "combatPower.test.js"
Cohesion: 0.07
Nodes (35): clickGoal(), goalButtons(), setDropField(), allocation, changeRank(), isUnlocked(), pointsRemainingToUnlock(), pointsSpentBeforeTier() (+27 more)

### Community 35 - "glyphsData.js"
Cohesion: 0.09
Nodes (32): GLYPH_RARITIES, glyphRarityRank(), glyphTickDamageMult(), LEGACY_GLYPH_IDS, MAJOR_GLYPH_BY_ID, MAJOR_GLYPH_FAMILIES, MAJOR_GLYPHS, majorGlyphById() (+24 more)

### Community 36 - "relicsData.js"
Cohesion: 0.15
Nodes (8): ../lib/linkingSetup.js, ./Chip.svelte, compact, small, ./DashboardSetupCard.svelte, GOAL_BLURBS, goalKinds, ./GoalSliders.svelte

### Community 37 - "sigilsData.js"
Cohesion: 0.05
Nodes (60): CAPPED_FIELDS, FIELDS, SWAP_ADDITIVE_KEYS, applySwap(), buffedAttack(), combineAdditive(), compareSwap(), computeDps() (+52 more)

### Community 43 - "./RelicSuggesterPanel.svelte"
Cohesion: 0.83
Nodes (3): makeCharacter(), makePreset(), mountPanel()

### Community 46 - "SimulationScreen.test.js"
Cohesion: 0.23
Nodes (11): ../lib/dps.js, ../lib/format.js, ../lib/model.js, ../lib/mountsData.js, ../lib/petsData.js, ../lib/statCaps.js, ../lib/totals.js, ./PetCard.svelte (+3 more)

### Community 47 - "Sidebar.test.js"
Cohesion: 0.25
Nodes (5): ./DuelTimeline.svelte, MARK_COLORS, markTitle(), sideName(), FIXTURE

### Community 48 - "./LinkingReportCard.svelte"
Cohesion: 0.33
Nodes (4): ../lib/linkingSimulation.js, ./LinkingReportCard.svelte, applyBuild(), presetExists()

## Knowledge Gaps
- **179 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+174 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `./PvpScreen.svelte` connect `PresetsScreen.svelte` to `MountAndGlyphsScreen.svelte`, `totals.js`, `transcendence.js`, `SimulationScreen.test.js`, `SimulationScreen.svelte`, `SigilsScreen.svelte`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `../lib/format.js` connect `SimulationScreen.test.js` to `../lib/format.js`, `MountAndGlyphsScreen.svelte`, `Sidebar.test.js`, `./LinkingReportCard.svelte`, `StoneForm.svelte`, `SimulationScreen.svelte`, `PresetsScreen.svelte`, `VerdictCard.svelte`, `SigilsScreen.svelte`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `../lib/rosterStore.svelte.js` connect `transcendence.js` to `../lib/format.js`, `combatPower.test.js`, `MountAndGlyphsScreen.svelte`, `relicsData.js`, `Sidebar.svelte`, `SimulationScreen.test.js`, `./LinkingReportCard.svelte`, `StoneForm.svelte`, `SimulationScreen.svelte`, `PresetsScreen.svelte`, `VerdictCard.svelte`, `SigilsScreen.svelte`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `./PvpScreen.svelte` (e.g. with `addOpponent()` and `cancelGauntlet()`) actually correct?**
  _`./PvpScreen.svelte` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `createRosterStore()` (e.g. with `setDropField()` and `addPet()`) actually correct?**
  _`createRosterStore()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _179 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `../lib/format.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14166666666666666 - nodes in this community are weakly interconnected._