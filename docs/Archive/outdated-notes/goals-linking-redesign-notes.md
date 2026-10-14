> **Status:** Superseded 2026-10-14 · **Superseded by:** the rebuilt optimiser/search (`src/lib/search/`, `features/`); presets no longer carry goals or linking.
> Describes the pre-rebuild app (v1 model, `src/lib/*Data.js`, legacy components). True on its date, not since.
> **Covers:** the goals/linking redesign — grilling decisions 1–7, slice status
> (all five complete), and the Jul 2026 game patches applied since.

# Goals, linking simulations, and new game systems — design notes

Captured 2026-07-19 from a design conversation (see also `docs/grilling.txt`, the
user's raw answers). This is the durable record of decided direction + domain
knowledge for the upcoming restructure. Nothing here is implemented yet.

## Decided direction

### Goal restructure (replaces the DPS/HPS pair)

- **HPS is removed as a user-facing concept everywhere.** The game has no
  other-player healing; "HPS" should have been sustainability from the start.
  (`computeHps` may survive internally — the Tank objective's sustain metric
  consumes it — but no goal, readout, or comparison is labelled HPS.)
- **Warrior goals: DPS, Tank, PVP** (PVP is new — it is what was earlier
  discussed as "Sustain").
- **Sentinel goals: DPS, PVP.**
- The **PVP goal** balances three factors with three linked sliders that always
  sum to 100:
  - **Maximum Damage** (Attack, Attack Speed, Crit, Spell Damage, …)
  - **Damage Mitigation** (Spell Resist, Blind Chance, Miss Chance, …)
  - **Survivability** (Health, Lifesteal, HP Regen, Attack Speed, …)
- Extra presets can carry a **Custom goal** (renameable from "Custom").

### Presets, goal assignment, and linking

- Every character has **at minimum two presets** — new characters start with
  two, and the user is prompted to assign each a different goal.
- A third (or later) preset can take the remaining class goal (Warrior's third)
  or a Custom goal. Only the first two required presets are **linked** by
  default; the user decides whether later presets join the link.
- **Linked presets share one Awakening path** (character-bound, near-permanent
  in-game — switching is very expensive and "should almost never be done").
  The Awakening path is the **bedrock**; talents are the **foundation** on top:
  still changeable later, but the initial choice should minimize future churn.
  Each linked optimizer compensates via talents for whatever the shared path
  doesn't cover (e.g. path lands on Radiant/mitigation → the PVP preset leans
  Marksman talents for damage, and vice versa).

### Sentinel spec/path focus (domain knowledge for objective design)

- **Marksman spec**: Maximum Damage + Survivability (talents: Attack%, Attack
  Speed, Lifesteal, Crit Chance, Crit Damage).
- **Disruption spec**: Damage Mitigation + Survivability (talents: Miss Chance,
  Blind Chance, Paralyze Chance, Lifesteal, Attack Speed, Attack%).
- **Shadow Path (awakening)**: Maximum Damage (Attack%, Crit Chance, Crit
  Damage, Penetration).
- **Radiant Path (awakening)**: Damage Mitigation + a touch of Survivability
  (Health%, Blind Chance, Paralyze Chance, Miss Chance).

### The Simulations page

- New page with tabs: **Dashboard** (first/default) + one tab per assigned goal
  (custom-goal presets get their own tab).
- Dashboard prompts the user to finish setting up the two required presets
  (talents, relics, pets, everything) before continuing; once done, it exposes
  goal configuration (the sliders) with explanations of each goal's direction.
- **"Initiate linking simulations"** button: a one-time, very deep simulation
  pass that lays the groundwork for all future simulations for that character.
  Its job: weigh all possible stats, find each stat's effectiveness threshold,
  **lock in the Awakening path**, then settle initial talents. Scope as stated
  (acknowledged as extreme, feasibility to be designed): both awakening paths ×
  all talent configurations × all transcendence configurations × all relic
  combinations and levels × all sigil tiers/levels × all pet tiers/levels × all
  mount levels.
- **Dashboard lifecycle** (added 2026-07-19): the setup/goal-config/"Initiate
  linking simulations" section exists only UNTIL the linking simulation has
  been run — it then disappears (it won't be run again). Afterwards the
  Dashboard becomes the character's **simulation statistics hub**: every
  simulation run is **auto-saved** (no manual "Save Result" step), with
  detailed per-run breakdowns, timelines, and graphs — deliberately
  feature-rich / data-dense.
- **Sidebar Settings** (added 2026-07-19): the sidebar's "Reset all data"
  button is replaced by a **"Settings"** button that opens a new
  container/card housing future settings plus a **"Danger Zone"** with the
  existing "Reset All Data" button and a new **"Reset initial linking
  simulations"** button (clears the linking-sim outcome so the Dashboard's
  setup section returns).

## Stat taxonomy (canonical naming)

- **2 base stats** (= "CORE stats" in older notes): Attack, Health.
- **16 secondary stats** (= "bonus stats"): 2 unique to Warrior, 3 unique to
  Sentinel.
- **2 PVP stats.**
- **3 Conduit stats** (new, see below).

## New game systems to model (all need data gathering first)

### Sigils and the Sigil Altar

- Forged at the **Sigil Altar**; every forge = 1 altar XP regardless of sigil.
- Altar level 30 → can evolve Tier 1 → Tier 2 (repeatable to T3 at 30 again).
  **Evolving destroys all obtained sigils**; sigils forged on a higher-tier
  altar have boosted base stats.
- Sigils level 1–30 via duplicates; duplicates needed to reach level N appears
  to equal N (e.g. 1→2 needs 2, 6→7 needs 7). Same for all rarities.
- All sigils of the same rarity share base-stat scaling (e.g. every Uncommon
  sigil at level 6 on a T2 altar: 1,917 Attack / 13,104 Health).
- Unknown/needs reverse engineering: base-stat scaling per altar tier ×
  rarity × level; secondary-stat and active-effect scaling.
- Legendary sigils require altar Tier 2+. Sigil catalogues are per-class.

### Pets and the Pet Altar

- Summon eggs → hatch random pets; more hatches = higher rarity odds.
- **Pet levels are tied to the Pet Altar level** (not per-pet). Altar levels by
  sacrificing pets (higher rarity = more XP). Altar level 50 → evolve
  (destroys all pets; boosted base stats; secondary stats NOT boosted by
  evolution, but ARE increased by altar levelling). Tiers up to **8**;
  Attack/Health ×3 per tier.
- Secondary stat rolls vary wildly within a rarity (4% vs 25% Attack Speed);
  unknown whether the roll ceiling is fixed at pull or grows with altar level.
  Developer is reluctant to answer.
- Same pets for both classes. Needs: cataloguing all pets + scaling reverse
  engineering.

### Mounts and the Summoning Altar

- Summoning Altar summons Commons only, then at level thresholds switches
  permanently to Uncommons, then Rares, then Epics (never mixes back down).
- Mounts level 1–5 via duplicates. **Base stats only** (Attack%/Health%), no
  secondary stats; each mount has different values (e.g. at level 2: Night
  Wolf 8%/7%, Frostfang Wolf 6%/12%). Same for both classes. No altar
  evolution known. Needs: full catalogue per mount per level.

### Conduit stats and Ancient Sigils

- Three conduit stats rolling on high-rarity gear (additional stat lines, not
  replacing secondaries): **Flame Conduit** (charges Chrono Flux on damage
  DEALT), **Earthen Conduit** (on damage TAKEN), **Dark Conduit** (both).
  7,000 Chrono Flux → awaken the Ancient Sigil transformation.
- **Ancient Sigils** (2 per class, from the top-left/top-right Transcendence
  nodes; must path to and unlock the node):
  - Sentinel: Flameborn (60s: +80% Attack, +50% Health), Stormcaller (60s:
    +60% Attack, +50% Health, +20% Miss Chance).
  - Warrior: Flameborn (same), Earthwarden (60s: +30% Attack, +100% Health).
  - All appear to share base stats 18,000 Attack / 120,000 Health; no
    secondary stats; once per fight; **only awaken in Progress / Dungeon /
    Hard Celestial Trial** — never PVP, World Boss, Fortress Boss.
- Tool impact: add the three conduit stats as stat lines where applicable;
  Ancient Sigil transformations are NOT simulated (their arenas have unknowable
  enemy stats), but their base stats compete with normal sigils and influence
  Transcendence pathing.

### Gear rarity / item level / quality and Ascension (for the power baseline)

- To be added to Gear Loadouts and the Drop Checker as new fields.
- **Rarities** (required character level to drop): Common(1), Uncommon(2),
  Rare(6), Epic(14), Legendary(27), Mythic(38), Ancient(50), Divine(63),
  Eternal(74), Oblivion(83).
- **Item level** 1–100 base, scales with character level.
- **Quality** 1–100, independent of character level.
- **Ascension** (unlocked at character level 78) raises the item-level drop
  cap: Lv1 = 100, Lv2 = 130, Lv3 = 160, Lv4 = 190, Lv5 = 240. Stats keep
  scaling with item level past 100 (~linear: ilvl 200 rolls ≈ 2× ilvl 100),
  so e.g. Divine ilvl 240 can beat Oblivion ilvl 50.
- Purpose here: a **power-level formula** over (rarity, item level, quality)
  gives the baseline for generating calibrated dummy PVP opponents — the
  archetype defines the stat *shape*, the power formula the *magnitude*.
  Power level is a baseline, not a winner predictor (secondary stats, pets,
  sigils etc. still decide fights).

### PVP dummy-opponent archetypes (decided direction)

- Catalog PVP styles per class (e.g. Sentinel "Glass Cannon": high Attack /
  Crit / Attack Speed / Crit Multi / Spell Damage, low Lifesteal / Health /
  Miss; Warrior "PVP Tank": high Health / DMG Reduction / Block / HP Regen,
  low offense). A dozen profiles per class, then dozens-to-hundreds of
  jittered variants per profile.
- The PVP goal's hybrid scoring: closed-form three-factor blend (sliders =
  exact weights) drives the deep search; finalists validated by tick-engine
  duels against the archetype gauntlet, reported as win-rate per archetype;
  contradictions between duel results and closed-form ranking are surfaced
  as red flags.
- Awakening-path arbitration between linked presets: **minimax regret** by
  default, Dashboard shows both goals' scores under both paths, optional
  priority slider to overrule.

### Enchantment stones

- Same treatment wanted: data gathering + reverse engineering of the scaling
  of all bonus stats they can roll.

## Stated sequencing constraint

The user wants **data gathering / reverse engineering / cataloguing (sigils,
pets, mounts, enchantment stones) BEFORE the restructuring work begins** — the
linking simulation's usefulness depends on those scalings being known.

## Decisions from the grilling session (2026-07-19)

1. **Linking-sim deliverables over method**: outputs are what matter — locked
   awakening path, recommended talent lean per linked preset, per-stat
   priority/threshold report with visible reasoning. Search method is free
   (staged elimination / beam search / stat weights), deep where it counts
   (the path decision). Literal exhaustive enumeration is explicitly NOT
   required.
2. **Path arbitration**: minimax regret by default (pick the path that hurts
   the losing goal least); Dashboard shows both goals' scores under both
   paths; optional priority slider to overrule.
3. **PVP goal scoring**: hybrid. Closed-form three-factor blend (sliders are
   exact weights: Maximum Damage / Damage Mitigation / Survivability, sum
   100) drives the deep search; finalists are validated with tick-engine
   duels; contradictions between duel ranking and closed-form ranking are
   surfaced as red flags.
4. **Duel opponents**: generated dummy archetypes per class (catalogued PVP
   styles, e.g. Glass Cannon / PVP Tank), dozens of jittered variants each;
   magnitudes anchored by a gear-based power-level formula (rarity, item
   level, quality — item levels above 100 simply rate slightly higher;
   Ascension is not a separate input), cross-checked against saved real
   opponents.
   Win-rates reported per archetype.
5. **Sequencing**: two parallel tracks. The restructure (HPS removal, goals,
   sliders, Simulations page, linking over hand-entered data) does NOT wait
   for reverse engineering; data gathering runs alongside, cheap items first
   (mount catalogue, gear rarity/ilvl/quality fields + regression from
   logged drops), long-tail items (pet/sigil altar scalings) upgrade the
   forward-looking projections when they land. Architectural commitment NOW:
   every stat source storable as hand-entered stats OR catalogue reference
   (id + tier/level + rolled stats), both normalising to the same totals.
6. **Custom goal**: the full factor-slider panel (damage / mitigation /
   survivability + EHP/sustain where the class has them), free weights
   summing to 100, renameable. Not a new scoring engine. The linking
   simulation reads ONLY the two required presets — never Custom presets.
7. **Awakening evaluation**: always neutral across both paths, even for
   already-awakened characters. A reset is "too expensive to reconsider per
   activity", not catastrophic (<1 day to restock the cost) — so a genuine
   "switch is worth it" verdict is a real, actionable recommendation.

## Implementation status

- **Slice 1 (2026-07-19) — DONE**: user-facing HPS removed (drop goal, verdict
  line, preset readouts); `preset.goal` persisted (kind/name/ehpWeight/
  weights/linked) with `normalisePresetGoal`; two-preset minimum seeded on
  new characters and topped up on old saves (first two linked); goal
  assignment UI in PresetEditor (kind chips, custom name, tank slider,
  `GoalSliders.svelte` three-factor sum-100 sliders, linked toggle);
  SimulationScreen's optimizer goal now reads the selected preset's persisted
  goal (tank controls write through; pvp/custom presets show a notice and
  can't run yet). Next slices: PVP factor scoring engine → Simulations page →
  linking simulation.
- **Slice 2 (2026-07-19) — DONE**: the PVP three-factor closed-form scoring
  engine (`src/lib/pvpGoalObjective.js` — read its header, it is the worked
  proposal for the factor formulas). Maximum Damage = duel-chain expected
  damage/s (computeDps × reference-Block/Penetration factor × PVP Attack
  chain + the sigil-active increment, unblockable); Damage Mitigation =
  1 / expected landed fraction of an incoming stream (miss, blind/paralyze
  uptime driven by own attack speed, block vs reference Penetration, DMG
  Reduction, Spell Resist on a 25% spell share, PVP Defense); Survivability
  = 8 × Health + 30s of self-healing (computeHps) — see the Jul 2026 PVP HP
  patch below. Geometric blend under the
  slider weights (sum 100), same rationale as tankObjective. Opponent-
  dependent stats are valued against documented reference constants (half
  soft cap, halved again for class-gated stats). Wired: objective spec kind
  `pvp-goal` (optimizerObjectives.js, single-stage closed-form), and
  SimulationScreen now runs PVP and Custom presets (goal readout shows the
  weight split, result panel shows a three-factor before/after breakdown,
  "PVP Score" units). Duel validation of finalists against archetype
  gauntlets remains a later slice, as decided.
- **Slice 3 (2026-07-19) — DONE**: the Simulations page + auto-saved run
  history + sidebar Settings card.
  - One **Simulations** nav item replaces Simulation and PVP
    (`SimulationsScreen.svelte`): Dashboard tab first, then deduped goal
    tabs (DPS / Tank / PVP appear when any preset carries that goal;
    DPS/Tank embed `SimulationScreen` with the preset picker filtered by
    goal, PVP embeds `PvpScreen` whole, each Custom preset gets its own
    named tab locked to that preset, optimizer-only). Visited tabs stay
    mounted behind `hidden` so in-flight searches survive tab switches.
  - **Auto-saved run history** (`character.runHistory`, model.js): every
    finished run records itself - kinds sim / sim-compare / opt / pvp-sim /
    pvp-opt / pvp-matrix (new). Entries split `headline` (tiny, kept
    forever, feeds charts) from `detail` (full payload; newest 50 per kind
    keep it, older compact to null; pinned never compact); a preventive
    byte budget guards the single localStorage key. Legacy `savedResults`
    migrate once (absence of the `runHistory` field is the trigger); the
    manual Save buttons and `SavedResultsRail.svelte` are gone. Traced
    sample fights store a capped 400-event combat timeline.
  - **Dashboard** (`SimulationsDashboard.svelte`): setup section
    (`DashboardSetupCard.svelte` + `linkingSetup.js` checklists, goal
    config in place, disabled "Initiate Linking Simulations" button) shows
    only while `character.linkingSim === null`; the statistics hub
    (`RunHistoryPanel.svelte`) is always on - filters, per-run breakdowns
    (histogram, percentile strip, damage-by-source, optimizer changes,
    matrix mini-grid), `GoalTimelineChart.svelte` SVG progression charts
    from headlines, `DuelTimeline.svelte` SVG combat strips.
  - **Sidebar Settings card**: the "Reset all data" trigger became
    "Settings" (`SettingsPanel.svelte`): placeholder for future settings +
    a Danger Zone housing the type-RESET wipe and "Reset initial linking
    simulations" (`rosterStore.resetLinkingSim`).
  - Deliberately dropped this slice: re-running a saved snapshot (the old
    rail's Re-run button) - can return later as an action on history rows.
- **Slice 4 (2026-07-20) — DONE**: the linking simulation.
  - `src/lib/linkingSimulation.js` — the 4-run orchestrator (2 linked presets
    × 2 awakening paths) + the pure verdict math. Each run = one
    `runOptimizerTask` with `searchDimensions:{awakening:false}` on a clone
    seeded to that path at `max(points, AWAKENING_TOTAL_POINTS)` (endgame
    projection — the lock is near-permanent); objective per goal: dps →
    `pve-accurate` (500 sims), tank → `tank`, pvp/custom → `pvp-goal`; runs
    sequentially at `maxPasses: 8` (deeper than the default 5 — plumbed
    through optimizerClient/optimizerWorker). `runTask` is injectable for
    tests. Path chosen by **minimax regret** (`pickPath`), tiltable by a
    priority slider; `regret(path) = (best − score)/best` per preset,
    `weightedMaxRegret` under the slider weights, argmin locks the path.
  - Report only, never auto-apply (decision 1): persisted to
    `character.linkingSim` via `rosterStore.completeLinkingSim` (JSON-plain:
    2×2 scores, per-preset recommended candidate + changes + talent lean +
    stat priorities; only the 2 locked-path candidates stored).
    `LinkingReportCard.svelte` renders it above the Dashboard — verdict +
    reasoning, the 2×2 matrix, per-preset sections, an explicit "Lock in
    Awakening path" button (guarded when already on it) and per-preset
    "Apply recommended build" (`applyOptimizerCandidate`, disabled for a
    deleted preset). `DashboardSetupCard.svelte` gained the priority slider,
    the enable gate (`linkingSetupReady`), the live 4-stage progress panel,
    and Cancel (aborts + discards).
  - `statWeights.js` generalized: `computeStatWeights(character, preset,
    { goalKind, ehpWeight, weights })` dispatches to the goal's closed-form
    scorer and widens the probe set for tank/pvp; the no-options default is
    byte-identical to before (Simulation screen untouched). `talentLean.js`
    classifies an allocation offense vs defense by statKey.
  - Remaining: duel-validation of finalists vs generated archetype gauntlets
    (also the moment to tune pvpGoalObjective's reference constants against
    duel rankings).
- **Slice 5 (2026-07-20) — DONE**: the PVP archetype gauntlet — the duel-
  validation half of the hybrid.
  - `src/lib/pvpArchetypes.js` — a code-defined starter catalogue (~6
    archetypes/class: Berserker, Juggernaut, Bruiser, Vampire, Penetrator,
    Blocklord / Marksman, Disruptor, Evasion-Tank, Lifesteal-Bruiser,
    Crit-Fisher, Balanced). Each is a class-scoped stat *shape*
    (attack/health split + fixed class-gated secondaries). `scaleArchetype`
    scales the split to a primary budget and clamps secondaries to hard
    caps; `generateGauntlet` emits both classes' archetypes + deterministic
    jittered variants (mulberry32). v1 carries no sigils / no PVP ratings
    (future refinement). Starter numbers are tunable.
  - `src/lib/pvpGauntlet.js` — `runGauntlet` duels each finalist
    (`[result.best, ...result.topCandidates]`) × each archetype-variant via
    `runPvpSimulation` under CRN, main-thread with yield-between-cells +
    cancel; aggregates per-archetype mean win-rate + CI and overall.
    `analyzeContradiction` flags when the duel leader beats the closed-form
    leader beyond combined CI. Budget defaults to the build's Attack+Health
    (`buildBudget`), manual override in the UI. `runDuel`/`makeOpponentSide`
    injectable for tests.
  - On-demand (user decision): a "Validate vs archetype gauntlet" button +
    budget field on `PvpScreen`'s optimizer result; live progress + cancel;
    `GauntletResultPanel.svelte` renders the finalist×archetype win-rate
    grid + contradiction banner; auto-saves a new `'pvp-gauntlet'` run kind
    (RunHistoryPanel renders its mini-grid).
  - **The core redesign is complete.** Open trailers (not blocking):
    tune pvpGoalObjective's reference constants against gauntlet data,
    refine the archetype catalogue numbers, add sigils/PVP ratings to
    archetypes, and a linking-report gauntlet affordance. Plus the standing
    parallel data-gathering track (mounts/sigils/pets/stones scalings, gear
    rarity/ilvl/quality → the real gear power formula).

## Game patches applied after the redesign

- **Jul 2026 — "PvP fights last longer" (8× HP).** Every fighter in Arena and
  Clan War enters with `PVP_HEALTH_MULTIPLIER` (= 8) × their Health, with no
  level-45 breakpoint — so the multiplier stopped being a mode the user picks.
  `pvpSimulation.js` defaults `healthMultiplier` to 8 (still a parameter, for
  tests and for the next re-tune), the PvpScreen ×1/×2/×3 toggle became a
  static "×8 PVP pool" readout, and every PVP entry point (optimizer,
  gauntlet, `pvp` objective spec) defaults to the same constant.
  - **Healing is NOT multiplied.** HP Regen (and shields, once a class has
    them) is sized off ORIGINAL max HP, so the regen tick divides the
    multiplier back out; Lifesteal is a share of damage dealt and was never
    affected. The pool grows, the healing does not — the longer fight is what
    gives healing more ticks.
  - **The 60s timeout is judged on HP PERCENTAGE**, not the raw number. The
    old flat rule (and the test that pinned it) is inverted.
  - `pvpGoalObjective`'s Survivability factor multiplies the Health term by
    the same 8 with the healing term left at 1×, so the closed-form sees the
    same pool:recovery ratio the duels do. `REF_FIGHT_SEC` (30s) was left
    alone and is the obvious knob if longer fights turn out to favour
    recovery more than that implies — tune it with the gauntlet, alongside the
    reference-opponent constants.
  - Mystic's Arcane Barrier (sized off original max HP, doubled in PVP) is
    **not** implemented — the class doesn't exist in the app yet.

## Remaining open items (implementation-level)

- Migration: existing single-preset rosters must gain a second required
  preset + goal assignment prompts (normalisation + UI flow).
- Whether Warrior's Tank goal keeps consuming `computeHps` internally after
  user-facing HPS removal (default: yes, it's just no longer user-facing).
- ~~Exact closed-form definitions of the three PVP factor scores~~ — decided
  in Slice 2 (`pvpGoalObjective.js` header). The reference-opponent constants
  (REF_BLOCK, REF_PEN, REF_MISS, REF_SPELL_SHARE, REF_ENEMY_SWINGS_PER_SEC,
  REF_FIGHT_SEC) are tunable and should be revisited once the duel-validation
  slice can measure closed-form vs duel-ranking agreement.
- The gear power-level formula's functional form (fit by regression once
  rarity/ilvl/quality fields exist on logged gear).
- Dummy-archetype catalogue contents (the actual dozen profiles per class).
