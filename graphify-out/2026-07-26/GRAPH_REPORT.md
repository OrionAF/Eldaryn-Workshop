# Graph Report - Eldaryn-Workshop  (2026-07-25)

## Corpus Check
- 161 files · ~632,633 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 897 nodes · 2131 edges · 48 communities (36 shown, 12 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.68)
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
- [[_COMMUNITY_constants.js|constants.js]]
- [[_COMMUNITY_SigilsScreen.svelte|SigilsScreen.svelte]]
- [[_COMMUNITY_.Chip.svelte|./Chip.svelte]]
- [[_COMMUNITY_.PresetEditor.svelte|./PresetEditor.svelte]]
- [[_COMMUNITY_pvpGauntlet.js|pvpGauntlet.js]]
- [[_COMMUNITY_transcendence.js|transcendence.js]]
- [[_COMMUNITY_combatPower.test.js|combatPower.test.js]]
- [[_COMMUNITY_glyphsData.js|glyphsData.js]]
- [[_COMMUNITY_relicsData.js|relicsData.js]]
- [[_COMMUNITY_sigilsData.js|sigilsData.js]]
- [[_COMMUNITY_dropGoals.test.js|dropGoals.test.js]]
- [[_COMMUNITY_.DuelTimeline.svelte|./DuelTimeline.svelte]]
- [[_COMMUNITY_PresetsScreen.svelte|PresetsScreen.svelte]]
- [[_COMMUNITY_StarRating.svelte|StarRating.svelte]]
- [[_COMMUNITY_GoalSliders.test.js|GoalSliders.test.js]]
- [[_COMMUNITY_.RelicSuggesterPanel.svelte|./RelicSuggesterPanel.svelte]]
- [[_COMMUNITY_MountAndGlyphsScreen.test.js|MountAndGlyphsScreen.test.js]]
- [[_COMMUNITY_talentTreeData.js|talentTreeData.js]]

## God Nodes (most connected - your core abstractions)
1. `./PvpScreen.svelte` - 49 edges
2. `newCharacter()` - 42 edges
3. `createRosterStore()` - 39 edges
4. `./SimulationScreen.svelte` - 33 edges
5. `../lib/rosterStore.svelte.js` - 25 edges
6. `../lib/constants.js` - 25 edges
7. `rosterStore` - 25 edges
8. `../lib/format.js` - 24 edges
9. `offensiveStats()` - 24 edges
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

## Communities (48 total, 12 thin omitted)

### Community 0 - "../lib/format.js"
Cohesion: 0.16
Nodes (7): ../lib/storage.js, ./ConfirmButton.svelte, ./RunHistoryPanel.svelte, fmtDamage(), headlineLine(), histBinLabel(), ./SettingsPanel.svelte

### Community 1 - "rosterStore.svelte.js"
Cohesion: 0.07
Nodes (50): ARCHETYPES_BY_CLASS, archetypeVariants(), generateGauntlet(), mixSeed(), scaleArchetype(), analyzeContradiction(), buildBudget(), playerSideFor() (+42 more)

### Community 2 - "model.js"
Cohesion: 0.05
Nodes (83): emptyGear(), resolveGlyphId(), clampInt(), clampMountVal(), compactRunHistory(), emptyAwakening(), emptyGear(), emptyMounts() (+75 more)

### Community 3 - "MountAndGlyphsScreen.svelte"
Cohesion: 0.12
Nodes (17): ../lib/assets.js, ../lib/constants.js, ../lib/format.js, ../lib/glyphsData.js, ../lib/mountsData.js, ../lib/petsData.js, ./EquippedInModal.svelte, ./GlyphCard.svelte (+9 more)

### Community 4 - "build job"
Cohesion: 0.18
Nodes (12): actions/checkout@v4, actions/deploy-pages@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, BASE_PATH env var, build job, deploy job, Deploy to GitHub Pages Workflow (+4 more)

### Community 5 - "totals.js"
Cohesion: 0.08
Nodes (54): FIELDS, resolveAwakeningPerPoint(), STAT_FIELDS, SWAP_ADDITIVE_KEYS, applySwap(), combineAdditive(), compareSwap(), computeDps() (+46 more)

### Community 6 - "package.json"
Cohesion: 0.11
Nodes (17): devDependencies, jsdom, playwright, svelte, @sveltejs/vite-plugin-svelte, vite, vitest, name (+9 more)

### Community 7 - "Sidebar.svelte"
Cohesion: 0.07
Nodes (21): active, { activeScreen, onSelectScreen, onStatus }, CHARACTER_NAV, charPickerOpen, deleteCharacter(), editingCharacterId, editName, fileInput (+13 more)

### Community 8 - "constants.js"
Cohesion: 0.25
Nodes (9): allocation, changeRank(), isUnlocked(), pointsRemainingToUnlock(), pointsSpentBeforeTier(), pointsSpentInTier(), rankOf(), { specKey, talentSetIndex } (+1 more)

### Community 9 - "transcendence.js"
Cohesion: 0.15
Nodes (7): ../lib/model.js, ../lib/rosterStore.svelte.js, ./SimulationsDashboard.svelte, active, filled, selected, app

### Community 10 - "relicsData.js"
Cohesion: 0.09
Nodes (3): isTierUnlocked(), pointsSpentInTier(), rosterStore

### Community 11 - "Eldaryn Gear Optimiser"
Cohesion: 0.25
Nodes (7): #app mount div, src/main.js entry script reference, Deploy, Development, Eldaryn Gear Optimiser, Legacy reference, Svelte 5

### Community 22 - "StoneForm.svelte"
Cohesion: 0.06
Nodes (31): ../lib/stonesData.js, canAdd, editQuality, editValues, isSocketedHere, newAzureChoice, newAzureChoiceValue, newDef (+23 more)

### Community 23 - "SimulationScreen.svelte"
Cohesion: 0.08
Nodes (17): ../lib/awakeningData.js, ../lib/buildConfig.js, ../lib/optimizer.js, ../lib/optimizerClient.js, ../lib/pvpGoalObjective.js, ../lib/relicsData.js, ../lib/sigilEffects.js, ../lib/sigilsData.js (+9 more)

### Community 24 - "optimizer.js"
Cohesion: 0.08
Nodes (50): mountCard(), summarizeStats(), fakeRunner(), ABORTED, alignStonesToCurrentSlots(), candidateFromCurrent(), CHANGE_REVERTERS, cheapestUnlockPaths() (+42 more)

### Community 25 - "PresetsScreen.svelte"
Cohesion: 0.06
Nodes (24): ../lib/pvpGauntlet.js, ../lib/pvpOptimizer.js, ../lib/pvpSimulation.js, ./GauntletResultPanel.svelte, ./PvpScreen.svelte, addOpponent(), applyOptimized(), buildPvpObjectiveSpec() (+16 more)

### Community 26 - "VerdictCard.svelte"
Cohesion: 0.12
Nodes (11): ../lib/dps.js, ../lib/dropGoals.js, ../lib/tankObjective.js, ../lib/totals.js, tankEhpPct, tankProfileId, ./PresetCard.svelte, ./PresetEditor.svelte (+3 more)

### Community 27 - "../lib/format.js"
Cohesion: 0.16
Nodes (20): resolveMajorGlyph(), activeSpecialGlyphIds(), applySpecialGlyphsToMech(), BUFF_DPS_KEYS, BUFF_SWING_KEYS, buffValue(), buildSigilEffects(), DAMAGE_KINDS (+12 more)

### Community 28 - "constants.js"
Cohesion: 0.13
Nodes (11): clickGoal(), goalButtons(), setDropField(), CLASSES, fieldsForTab(), SLOTS, SOURCE_DEFS, SWAP_SPECIAL_KEYS (+3 more)

### Community 29 - "SigilsScreen.svelte"
Cohesion: 0.16
Nodes (11): ../lib/transcendence.js, ../lib/transcendenceData.js, awakeningLabel, equippedGlyphCount, ichorSpent, mountsWithStats, nodesPlaced, tree (+3 more)

### Community 30 - "./Chip.svelte"
Cohesion: 0.12
Nodes (26): addPet(), addPetButton(), ALIASES, assetUrl(), BY_KEY, glyphImage(), MODULES, mountImage() (+18 more)

### Community 31 - "./PresetEditor.svelte"
Cohesion: 0.18
Nodes (8): AWAKENING_PATHS, describeBuildConfig(), makeWarrior(), SPECS_BY_CLASS, RELIC_TIER_LABELS, RELIC_TIER_MAX_LEVEL, RELIC_TIERS, RELICS_BY_CLASS

### Community 32 - "pvpGauntlet.js"
Cohesion: 0.21
Nodes (11): sigilHasAnyValue(), sigilDamageInputs(), hasSigilCurve(), sigilEffectValue(), sigilMinForgeTier(), sigilStat(), sigilUnlockedAt(), BY_NAME (+3 more)

### Community 33 - "transcendence.js"
Cohesion: 0.11
Nodes (20): hasAnyStat(), linkedPresets(), linkingSetupReady(), presetSetupChecks(), readyCharacter(), buildReasoning(), computeRegret(), goalUnitLabel() (+12 more)

### Community 34 - "combatPower.test.js"
Cohesion: 0.22
Nodes (14): combatPower(), CP_SPELL_FACTORS, cpDamageIndex(), cpMitigation(), cpSpellDamageShare(), cpSurvivabilityIndex(), CALIBRATION, CSV (+6 more)

### Community 35 - "glyphsData.js"
Cohesion: 0.18
Nodes (13): GLYPH_RARITIES, glyphRarityRank(), glyphTickDamageMult(), LEGACY_GLYPH_IDS, MAJOR_GLYPH_BY_ID, MAJOR_GLYPH_FAMILIES, MAJOR_GLYPHS, majorGlyphById() (+5 more)

### Community 36 - "relicsData.js"
Cohesion: 0.15
Nodes (8): ../lib/linkingSetup.js, ./Chip.svelte, compact, small, ./DashboardSetupCard.svelte, GOAL_BLURBS, goalKinds, ./GoalSliders.svelte

### Community 37 - "sigilsData.js"
Cohesion: 0.21
Nodes (7): conduitNodeUnlocked(), conduitSigils(), forgeSigils(), isConduitSigil(), SIGIL_EFFECTS, SIGIL_MIN_FORGE_TIER, SIGIL_RARITY_CURVES

### Community 39 - "./DuelTimeline.svelte"
Cohesion: 0.25
Nodes (5): ./DuelTimeline.svelte, MARK_COLORS, markTitle(), sideName(), FIXTURE

### Community 40 - "PresetsScreen.svelte"
Cohesion: 0.33
Nodes (4): ../lib/linkingSimulation.js, ./LinkingReportCard.svelte, applyBuild(), presetExists()

### Community 43 - "./RelicSuggesterPanel.svelte"
Cohesion: 0.83
Nodes (3): makeCharacter(), makePreset(), mountPanel()

### Community 44 - "MountAndGlyphsScreen.test.js"
Cohesion: 0.38
Nodes (3): cardFor(), cards(), openGlyphPicker()

## Knowledge Gaps
- **171 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+166 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `./PvpScreen.svelte` connect `PresetsScreen.svelte` to `MountAndGlyphsScreen.svelte`, `dropGoals.test.js`, `transcendence.js`, `SimulationScreen.svelte`, `VerdictCard.svelte`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `../lib/rosterStore.svelte.js` connect `transcendence.js` to `../lib/format.js`, `MountAndGlyphsScreen.svelte`, `relicsData.js`, `Sidebar.svelte`, `PresetsScreen.svelte`, `constants.js`, `StoneForm.svelte`, `SimulationScreen.svelte`, `PresetsScreen.svelte`, `VerdictCard.svelte`, `SigilsScreen.svelte`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `../lib/format.js` connect `MountAndGlyphsScreen.svelte` to `../lib/format.js`, `./DuelTimeline.svelte`, `PresetsScreen.svelte`, `GoalSliders.test.js`, `StoneForm.svelte`, `SimulationScreen.svelte`, `PresetsScreen.svelte`, `VerdictCard.svelte`, `SigilsScreen.svelte`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `./PvpScreen.svelte` (e.g. with `addOpponent()` and `cancelGauntlet()`) actually correct?**
  _`./PvpScreen.svelte` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `createRosterStore()` (e.g. with `setDropField()` and `addPet()`) actually correct?**
  _`createRosterStore()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _171 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `rosterStore.svelte.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06946386946386947 - nodes in this community are weakly interconnected._