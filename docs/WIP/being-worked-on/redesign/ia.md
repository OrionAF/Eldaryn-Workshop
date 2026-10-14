# Eldaryn Workshop: information architecture (redesign)

Status: proposal. Inputs: the user's brief (dark fantasy, dark only, desktop first, grouped by task:
Character / Builds / Tools, profile import as the main way in), the feature inventory of the current
14-screen app, and `docs/Reference/data-model.md` (§2 scopes, §6 sheet tiers, §7 profile import).

Guiding rules for every page below:

- **One scope per panel.** No panel edits two scopes at once. The old mixed screens (Sigils, Relics,
  Mounts riding, Presets + sheet) are split: collections live in Character, choices live in Builds.
- **Every simulated number carries N, a 95% interval and the seed.** Instant closed-form numbers
  are labelled "estimate, no interval" and never shown above or larger than the simulated value.
- **Runs survive navigation.** Long jobs (optimise, duel, drop simulation, batch check, floor scan)
  move from component state to a session job store, shown in the top bar.
- **Where you are is in the URL.** Hash routing (`#/builds/loadout`, `#/character/gear/set2`) gives
  back/forward, deep links and a reload that returns to the same page. View state (open tab, filters,
  tool setup) goes in a separate per-device UI key, never in the roster.
- **One markup tree.** Rail, icon rail and phone tab bar are one nav component laid out by CSS.
  The `isMobile` JS switch and the duplicated account panel go away.

---

## 1. Navigation tree

Ids (C/B/T/G) are used in the flows and the parity table.

```
GLOBAL (top bar, not an area)
  G1  Character switcher          (menu: switch, new, rename, class, delete)
  G2  Preset + realm context      (active preset, Base/Oblivion realm)
  G3  Import                      (one drop zone for every JSON kind)
  G4  Jobs tray                   (running and finished simulations)
  G5  Activity log                (every status message of the session)
  G6  Data & Settings page        (export, storage, preferences, danger zone)
  G0  Welcome                     (full-screen, only when the roster is empty)

CHARACTER  (everything character-wide; what the game account owns)
  C1  Overview          identity, import status and refresh, Oblivion hero, base stats
  C2  Skills & Clan     account skills, attunement bans, fortress
  C3  Gear              [Set 1 | Set 2 | Oblivion] x [Equipment | Enchant stones]
  C4  Talents           [Set A | Set B]
  C5  Sigils            altar + collection
  C6  Pets              altar + collection
  C7  Mounts & Glyphs   [Mounts | Glyph inventory]; per-mount sockets
  C8  Relics            levels
  C9  Awakening         path + points
  C10 Transcendence     board presets + board

BUILDS  (per-preset; what each preset chooses)
  B1  Presets           compare table of all presets; add / duplicate / delete / rename / reorder
  B2  Loadout           the active preset's choices of every source
  B3  Stat Sheet        [Base realm (this preset) | Oblivion realm (shared)]: entry + model diff
                        + per-source breakdown + absorb into base

TOOLS  (simulations; read the character, write only through an explicit Apply)
  T1  Drop Check        [Single drop | Loot bag]
  T2  Optimiser         [Setup + results | Run history]
  T3  Duel              [Duel | Verify a fight log]
  T4  Opponents         saved opponent library (sheet + loadout), used by T1, T2, T3
  T5  Oblivion Floors   Oblivion summary + floor scan
```

### What each page absorbs

| Page | Absorbs (current inventory) |
|---|---|
| G0 Welcome | WelcomeScreen (create first character, import roster/profile, privacy note); adds paste, drag-drop, capture help |
| G1 Character switcher | Sidebar "⇄ Change character" picker, ✎ edit panel (rename, class, delete), "+ New Character", banner avatar/name/class |
| G2 Context | Banner context line; the hidden "active preset" that Mounts, Relics, Awakening, Transcendence and Sigils silently depend on; Oblivion screen's global realm toggle (`oblivion.activeRealm`) |
| G3 Import | Sidebar Import, Welcome "Import from file", Drop Check "Load .json file"/paste, Duel replay file/paste: one entry point that detects the JSON kind and routes it |
| G4 Jobs tray | Optimiser progress bar/Cancel, Duel progress/Cancel, Drop Check "Simulating (done/total)", batch "Checking done/total", Oblivion "floor N: done/n"/Cancel |
| G5 Activity log | The banner toast pill (all setStatus messages), with history |
| G6 Data & Settings | SettingsPanel (Reset all data, RESET confirm), Sidebar Export, privacy note, storage behaviour from storage.js |
| C1 Overview | Character screen: class (now editable here), level, Oblivion unlocked toggle; Oblivion Level input (from Oblivion screen); base residual x5; profile import summary (new) and "Refresh from a newer profile" (new) |
| C2 Skills & Clan | Character screen: skills -/+ with level/cap, unlock and cost text; attunement ban chips; fortress groups with class remap |
| C3 Gear | Gear screen whole (realm chips, set chips, SlotSilhouette, ItemEditor, StoneForm, StoneGrid, "used by" line); the Oblivion screen's embedded Gear (realm='oblivion') |
| C4 Talents | Talents screen whole |
| C5 Sigils | Sigils screen: altar tier, Evolve Altar, collection cards and spell blocks, "in <presets>" footers. NOT the equip panel (moves to B2) |
| C6 Pets | Pets screen whole (altar level, tier change + wipe confirm, add, PetCard edit/remove) |
| C7 Mounts & Glyphs | Mounts screen: add mount, MountCard (stars, rolls, six sockets, remove), GlyphPickerModal, AddGlyphForm, GlyphCard. "Ride with <active preset>" becomes an explicit "Ridden in" menu; the primary ride control moves to B2 |
| C8 Relics | Relics screen: per-relic level -/+ and stats. The "Equip" toggle becomes an explicit "Equipped in" menu; primary equip moves to B2 |
| C9 Awakening | Awakening screen whole |
| C10 Transcendence | Transcendence screen whole (preset tabs, rename/reset/delete, node filter, BoardGrid, NodeDrawer, totals) |
| B1 Presets | Presets screen header, "+ New Preset", PresetCard grid (now a compare table), Duplicate, Delete preset, rename |
| B2 Loadout | Presets editor selector groups (gear set, talent set, pet, mount, transcendence preset, relics, generic/utility/Ancient sigils); Sigils screen SigilEquipPanel (slots, unlock levels, activation conditions, flat totals); Relics "Equip"; Mounts "Ride" |
| B3 Stat Sheet | SheetFields, SheetDiff, realm toggle Base/Oblivion, Clear sheet, Absorb into base, source note; adds per-source contribution |
| T1 Drop Check | Drop Check screen whole (import panel, batch list, realm, slot silhouette, ItemEditor, options, EnemyPicker, opponent checkboxes, VerdictCards, Apply, Discard, equipped-now list) |
| T2 Optimiser | Optimiser screen whole (TargetPicker, objective, SpacePicker, effort, seed, run, ResultList, Apply, RunHistory) |
| T3 Duel | Duel screen: my preset, opponent pick, seat, run, result, trace, timeline, Re-roll trace, ReplayCheck |
| T4 Opponents | Duel screen: OpponentPicker create/clone, OpponentEditor (name, class/spec, sheet), OpponentLoadout, Duplicate, Delete |
| T5 Oblivion Floors | Oblivion screen: summary (Power, Attack, HP), free-floor hint, max floor at 90%, floor table, Simulate/Cancel, locked state |

### Explicit removals and changes (each justified)

| Removed / changed | Why |
|---|---|
| 14 per-screen nav colour dots (`--nav-<id>`) | Encode nothing the label does not; the three area headers and icons do the grouping. Stone-type colours that reuse `--nav-oblivion` get their own `--stone-oblivion` token |
| Banner context line and empty banner | Replaced by the top bar (character, preset, realm) and the context header (page, scope) |
| Toast without timeout, cleared on navigation | Replaced by notifications (info auto-dismisses after 6 s, errors stay until dismissed) plus G5 history. Nothing is lost on navigation |
| "No class" full-screen block and its hint | A character can no longer exist without a class through the UI: G0 and G1 "New character" both require a class; an imported/legacy classless character opens C1 with the class picker focused and the rest of the nav marked "needs class" instead of blank |
| Hidden Oblivion nav item + CharacterScreen fallback | One code path: T5 is always listed, shown dimmed with a lock glyph while locked; its locked state has the "Unlock Oblivion" toggle inline (same mutator as C1). Changes `navVisibility` tests (see §6) |
| Pet card "Edit/Save" toggle | Changes save live, so "Save" lied. Becomes "Expand / Collapse" |
| SettingsPanel placeholder "More settings coming soon." | G6 is a real page with Data and Preferences sections |
| Separate mobile markup tree + More sheet | One nav tree, CSS layout; the phone tab bar holds the three areas (§2.4) |
| "Ride with <active preset>" / relic "Equip" acting on a hidden active preset | Kept as convenience, but always name the preset ("Ridden in: [x] Farm [ ] PVP") |
| Drop Check closed-form verdict shown first | Kept, demoted to "instant estimate (auto-attacks only, no interval)" under the simulated verdict |
| Hard-coded N (Drop Check 32/200/64, Duel 400) and fixed seed 1 | Kept as the defaults; N and seed become visible, and each tool gets an effort control plus "Run more to tighten" (accuracy is never traded for speed) |
| EnemyPicker vs TargetPicker | One shared Target picker; Drop Check uses the subset valid for survival |

Nothing else is removed. Every control in the inventory is mapped in §5.

---

## 2. Global chrome and page layout (desktop first)

### 2.1 Persistent elements

**Top bar** (56 px, full width, sticky; carved-stone strip with a thin gold rule underneath):

| Position | Element | Behaviour |
|---|---|---|
| Left | Crest + "ELDARYN WORKSHOP" (Cinzel) | Link to B1 Presets (or C1 when the character has no presets yet) |
| Left | **G1 Character switcher**: class crest avatar, name, `Class · Lv 87` | Menu: character list (name, class, level, preset count, last import date), "+ New character" (dialog: name + class required, level optional), "Edit character" (rename, class, delete with ConfirmButton; delete disabled for the last one) |
| Centre | **G2 Context**: `Preset ▾ Farm build` and realm segmented control `Base | Oblivion` | Sets `activePresetId` and `oblivion.activeRealm` (both persisted, character-wide). Realm control only enabled when Oblivion is unlocked (disabled with tooltip "Unlock Oblivion on Overview"). This is the one place the active preset and realm are changed, and it is always visible |
| Right | **G4 Jobs tray**: rune icon with a count; ring progress while any job runs | Popover lists jobs: tool, target, `done/total`, elapsed, Cancel, "Open result". Finished jobs stay until dismissed or reload |
| Right | Save state: "Saved" (with time on hover) / "Not saved: storage unavailable" (red, sticky) | Surfaces the silent `saveRoster` failure and the no-localStorage case |
| Right | **G3 Import** (gold button) | Opens the import dialog (§3.1). Also: dropping a `.json` anywhere on the window opens it |
| Right | **G5 Activity** bell, **G6** cog | Activity drawer (session log); Data & Settings page |

**Left rail** (grouped nav): three section headers CHARACTER / BUILDS / TOOLS (Cinzel small caps,
gold), each with its pages (icon + label, 40 px rows, active = gold left bar + lit stone tint). Rail
foot: the privacy line "100% local: nothing leaves this device" (one line, muted). No account panel in
the rail any more; it moved to G1/G6.

Rail badges: C1 shows a dot when a profile import report has unread warnings; T1 shows the count of
unchecked drops from the last profile import; T5 shows a lock glyph while Oblivion is locked;
pages needing a class show "needs class" when the class is null.

**Context header** (per page, sticky under the top bar inside the content column, 64 px):
breadcrumb `Character / Gear`, page title (serif), **scope badge** (§4), sub-tabs, page actions on the
right (e.g. "Inspector" toggle, "Reset board", "Run"). When a Character page depends on the active
preset (C3 "used by", C5 spec, C7 inert majors, C9 override, C10 flavour) the header also shows a
`Context: Farm build (Talent Set A · Mage)` chip, clickable to switch preset via G2.

**Inspector** (right column, optional per page): contextual detail. Default content on Character and
Builds pages is the **active preset's stat card**: effective totals (sheet value where entered, else
computed; source tag per row) and, on hover/selection of anything (item, stone, pet, relic, node,
sigil), "this contributes: +x Attack, +y% Crit" from the engine source breakdown. On Tools pages it
shows the selected result's full build and change list.

**Notifications**: stack top-right under the top bar, max 3; info auto-dismiss 6 s, errors and
warnings sticky with a close button; every message is also written to G5.

### 2.2 Grid at 1440 px

```
| rail 240 | content (fluid, 12 col)                            | inspector 344 |
|          | page padding 24, gutter 16                          | (when open)   |
```

- Content column = 1440 − 240 − 344 = 856 px (808 px inside 24 px padding); 12 columns, 16 px gutters.
- Pages without an inspector (Tools, C10 board, B1 compare) get 1200 px of content and lay out their
  own panes: Tools use **setup pane 360 + results fluid**; B1 uses a full-width compare table.
- Dense defaults: 13-14 px UI text, 13 px tabular mono for data (`--font-data`), table rows 32 px,
  controls 32 px high (44 px hit target on touch, §2.4).
- Max content width 1680; beyond that the content centres and the inspector stays docked right.

### 2.3 Collapse rules

| Viewport | Rail | Inspector | Content |
|---|---|---|---|
| >= 1280 | 240 px, labels | Docked 344 px where the page has one | 12 col |
| 1024-1279 (**1100 px**) | 64 px icon rail; group headers become hairline dividers; hover/focus shows a label flyout; a pin button expands it over content | Becomes a right slide-over (360 px, overlay, Esc closes) opened by the header "Inspector" button or by selecting an item | 1100 − 64 = 1036 px, 12 col; Tools keep setup 340 + results |
| 701-1023 | 64 px icon rail | Slide-over | 8 col; two-pane pages stack (setup above results, collapsible once run) |
| <= 700 (phone) | Bottom tab bar (below) | Bottom sheet (drag handle, 85 vh max) | 4 col, single column, 16 px gutters, no horizontal scroll |

### 2.4 Phone (<= 700 px)

- Top bar 52 px: avatar (opens G1 as a sheet), preset chip (opens G2 sheet with realm control),
  jobs ring, overflow menu (Import, Activity, Data & Settings).
- Bottom tab bar, 4 items: **Character, Builds, Tools, Import**. Picking an area opens its last-used
  page; the area's pages are a horizontally scrollable tab strip under the top bar (so all of C1-C10
  are one swipe away, not buried in "More").
- 44 px minimum targets, StarRating 40 px pitch, Modal close 44 px (all kept from today).
- C10 board keeps the tap-opens-NodeDrawer rule; tables switch to stacked row cards with the numeric
  columns kept in mono.

---

## 3. Key flows

### 3.1 First run (empty roster)

1. **G0 Welcome**, full screen over a dark stone backdrop with the crest. Primary panel:
   "Import your game profile". A large drop zone accepts a file, drag-drop or pasted JSON. Under it,
   a collapsed "How do I get this file?" with capture steps and what is and is not read (the
   data-model.md §7 table in plain words: name/class/level, both gear sets and stones, talents,
   pets, mounts and glyphs, sigils, relics, awakening, transcendence, skills, fortress, Oblivion,
   the live stat sheet; never player id, clan, quests, shop or currencies).
2. Secondary actions, side by side below: "Restore a backup" (roster file) and "Start manually"
   (name + class required, level optional; the CTA states what is missing while disabled).
3. Privacy note at the foot.
4. **Kind detection** (shared with G3): roster backup / game profile / loot bag / arena fight log /
   unrecognised. The error names the case: "Not valid JSON (line 3)" vs "Valid JSON, but not a
   roster, profile, loot bag or fight log". A roster with zero characters says so instead of
   silently returning to Welcome.
5. **Import report** (dialog, before anything is written): character name, class, level; counts per
   domain (items per set, stones, talents, pets, mounts, glyphs, sigils, relics, transcendence
   presets); the stat sheet that will be loaded and into which preset/realm; a "Defaulted / dropped"
   list (e.g. quality null on items, OBLIVION_POWER rows removed, references that did not resolve
   against the catalogue). Buttons: "Create character" / "Cancel".
6. Lands on **C1 Overview** with the report pinned as a dismissible card, and two next steps:
   "Review your build" (B1) and, if the profile held pending loot, "Check N new drops" (T1).
   Manual start lands on C1 with "Next: add gear" checklist links (C3, C4, ...).

Requires new code: import preview (report from a dry-run of `normaliseCharacter`) and the dropped-
item list.

### 3.2 Weekly use: new drops to a verdict

1. G3 Import (or drop the file on the window). Detected as a **game profile** for an existing
   character name: the dialog offers **"Update <name>"** (default when the name matches) or
   "Add as a new character". Update shows a diff summary (gear changed in Set 1: 2 slots; +3 stones;
   talents unchanged; sheet updated for preset Farm build) and writes after confirm.
   An auto-backup of the replaced character is kept for one undo ("Undo update" in the notification
   and in G5). *Requires a new model operation (merge profile into existing character, keeping
   presets, opponents and runs); flag for the model owner.*
2. If the profile (or a separate loot-bag JSON) has pending items, the report offers
   "Check N drops" which opens **T1 Drop Check → Loot bag** and starts the batch as a job (G4).
3. Batch list (results pane): ranked rows, each with simulated DPS delta, 95% CI and N first, best
   preset, verdict glyph + word (never colour alone); skipped items listed with reason. The instant
   closed-form estimate fills in immediately and is replaced row by row, labelled
   "estimate, no interval" until then.
4. Click a row → the left pane becomes the **Single drop** editor with that item loaded (no scroll
   jump: two panes side by side on desktop). Verdict cards per equipment set show every preset that
   wears the set; survival and PVP metrics add when toggled (enemy from the shared Target picker,
   opponents from T4).
5. "Apply to Set 1" → confirm dialog states the scope: "Writes Character gear Set 1. Changes 2
   presets: Farm build, Boss build" (mixed verdicts add "helps Farm, hurts Boss"). After apply the
   batch is marked stale (existing signature check) with "Check again".
6. Optional follow-up link: "Re-optimise Farm build" (T2 prefilled).

### 3.3 Optimise a build

1. **T2 Optimiser**, setup pane (left, 360 px), top to bottom, each a framed step:
   1. *Build to improve*: preset select (default = G2 active preset).
   2. *Fight*: shared Target picker (Training dummy, Campaign chapter + level, Dungeon + step,
      Village raid + step with "(needs level N)", Oblivion floor (enabled only when unlocked),
      World boss affinity, Custom mob, PVP vs saved opponents with opponent chips and seat). The
      server-model warning appears inline on dungeon/raid/PVP.
   3. *Maximise*: objective select (DPS, TTK median, TTK P90, Survival chance + "survive for (s)",
      PVP win rate).
   4. *Allowed to change*: the 12 toggles grouped: **Gear** (gear set) · **Talents** (talent set,
      talent points) · **Companions** (pet, mount, glyphs) · **Relics** (relics, slots to fill
      1-4) · **Sigils** (sigils, utility, Ancient, conditions) · **Transcendence**. Group-level
      "all/none", "Reset to defaults", and the fixed note "Gear, stones, levels, Awakening and
      pet/mount rolls never change".
   5. *Effort*: Quick / Standard / Thorough with the actual budgets printed (screening N, finalist
      N, max builds, time cap) and Seed. A one-line plan summary: "Searches 5 dimensions vs
      Campaign 14-6, finalists re-measured at N=128".
   The setup is kept per character in the UI key, so it survives navigation and reload.
2. **Run** → job appears in G4; the results pane shows phase ("screening: 84 builds tried,
   searching Relics" → "re-measuring finalists 3/6"), elapsed time and Cancel. The user may leave
   the page; the job continues and notifies on finish.
3. **Results** (right pane):
   - Baseline row pinned at the top (sticky): current preset value, 95% CI, N.
   - Ranked rows as a forest plot: point + CI bar on a shared axis with the baseline line, delta vs
     current with its paired CI, and a text tag "significant" / "within noise" (colour only adds).
   - **Per-change contribution**: expanding a row lists each change (`Pet: Wolf → Drake`) with its
     own marginal effect and CI, measured by adding that change alone to the baseline with paired
     seeds, plus "interaction" as the remainder. *Requires a finalist ablation pass in the task;
     shown as "not measured" for runs saved before it exists.*
   - "Run more" on any row re-measures it at higher N to tighten the interval.
   - Truncation and cancel notes stay ("Stopped early on the time limit", "Cancelled: finalists not
     re-measured").
4. **Apply**: "Apply to Farm build" opens a review dialog grouped by scope: *Preset Farm build*
   (pet, mount, relics, sigils, conditions, transcendence preset, sets chosen) · *Character-wide*
   (talent ranks in Talent Set A, also used by Boss build) · *Per-mount* (glyph sockets on Drake,
   also ridden by PVP build). Confirm → writes via the existing `apply.js` guards → notification
   "Applied rank 2 to Farm build" with "Open Loadout" and "Verify in Duel" (PVP) links. The run is
   marked "applied" and the baseline flagged stale.
5. **Run history** sub-tab: table of saved runs (name, date, target, objective, baseline → best,
   delta, N, significance, tags pinned/cancelled/stopped), rename, notes, pin, delete, "Clear
   unpinned", and **"Re-run with these settings"** (new: requires storing the setup on the run).

### 3.4 Duel an opponent

1. **T4 Opponents** (or the opponent pane inside T3): list of up to 12 opponents (name, class, spec,
   sheet completeness). "+ New opponent" (spec select) and "Clone my preset as…" (preset + spec).
   The editor: name, class/spec chips with the "changing drops sigils/glyphs the new spec cannot
   use" note, stat sheet (the same Sheet table component as B3, model column alongside), loadout
   (generic/utility/Ancient sigils with level and condition, major glyphs with rarity, altar tier).
   Missing required stats are listed at the top of the editor ("Needs: HP, Attack").
2. **T3 Duel**, setup pane: my preset, opponent, seat (Attacker / Defender / **Both**), effort
   (N = 400 default, 1 600, 6 400; seed shown). Blockers listed with links to fix them
   ("Rival has no HP: open in Opponents").
3. Run → G4 job. Result pane:
   - **Win rate** with 95% Wilson CI band (wide, labelled axis, 50% line), N, seed, verdict text
     ("Favoured" / "Unfavoured" / "Too close to call at N=400: about N=1 600 would resolve a 3-pt
     edge") and "Run more". With Both seats: two rows (I attack / I defend) plus the mean.
   - **Fighters as simulated**: side-by-side stat columns (my effective stats incl. ×8 PVP HP, theirs)
     so the inputs are visible next to the output.
   - Mean / P90 duration, timeouts share, the ties-go-to-defender note.
4. **Sample duel** panel, visually secondary and titled "One sample duel (not a statistic)":
   full-width timeline (taller lanes, zoom + pan, keyboard focusable marks, legend), event table
   beneath it (time, who, kind, amount, crit), trace stats table with defined column headers
   (tooltips for Swings, Avoided, Lost, Disrupts), "Re-roll sample".
5. **Verify a fight log** sub-tab (replay check): file / paste / G3-routed fight log, "hold the log to
   the fighters above", rule table and mismatches.
6. Results stay in the session job store; a staleness marker appears if the preset or opponent
   changes after the run.

### 3.5 Oblivion floors

1. If locked: T5 shows the lock state with an inline "Unlock Oblivion" toggle (writes
   `oblivion.unlocked`, same mutator and skill-cap reconcile as C1) and what unlocking changes
   (Oblivion nav, realm switch, Oblivion gear tab, Oblivion sheet, skill caps +1).
2. Unlocked: summary strip (Oblivion Level with an edit link to C1, Power, Attack, HP in the
   Oblivion realm for the chosen preset), definitions of Instability and Net strain inline, and
   "free of net strain up to floor N".
3. Scan setup: preset (default active), floors (default 1-30), win threshold (default 90%), effort
   (N per floor shown), seed. *Floor range, threshold and N controls need task parameters; until
   then they show their fixed values read-only.*
4. Run → G4 job; table fills row by row: floor, instability, net strain (bar), win % with Wilson
   range (bar + range whisker), N, median clear. Highest floor at the threshold is the headline.
   Early stop on hopeless floors is reported ("stopped after floor 24: no wins").
5. Gear changes after the scan mark it stale ("Oblivion gear changed since this scan"). "Edit
   Oblivion gear" jumps to C3 → Oblivion tab, with a back link.

---

## 4. The scope model, made visible

Scopes (data-model.md §2): **character-wide** (one value for every preset), **per-preset** (the
preset chooses), **per-mount** (glyph sockets, reached through `preset.mountId`). Realm (Base /
Oblivion) is an orthogonal axis: the Oblivion loadout and the Oblivion sheet are character-wide;
the rest of the active preset carries into the realm.

### 4.1 Visual language

| Scope | Badge (context header and panel frame) | Frame | Subline |
|---|---|---|---|
| Character-wide | Crest glyph + "Character" | Gold ornate frame (`--scope-character`) | "Shared by all 3 presets" or "Used by: Farm, Boss" chips when presets reference it |
| Per-preset | Banner glyph + "Preset: Farm build" | Arcane-blue frame (`--scope-preset`), the preset's name in the frame title | "Only this preset" |
| Per-mount | Saddle glyph + "Mount: Drake" | Bronze frame (`--scope-mount`) | "Ridden in: Farm, PVP" |
| Realm | "Oblivion realm" | Violet inner rule (`--realm-oblivion`) added to any of the above | "One Oblivion loadout for all presets" |
| Tool / view | No frame colour, plain stone panel | | Tool settings are not part of any build |

Rules:

- **Every editable panel carries exactly one badge.** The area tells the default (Character pages
  are gold, Builds pages are blue), the badge confirms it, and per-mount panels inside C7 switch to
  bronze.
- **Cross-scope writes are previewed.** Any action that writes outside the page's scope says so
  before it happens: Absorb into base (B3 → character base, preview of the new five base values),
  Drop Check Apply (→ a character gear set and its presets), Optimiser Apply (grouped by scope),
  pet altar tier change (→ wipes collection and clears every preset's pet, names them), Evolve
  Altar (destroys owned non-Ancient sigils, names presets that lose equips), class change (drops
  other-class relics, sigils, talents; lists what goes).
- **Choices and collections are split.** B2 Loadout picks from the collections (cards with art,
  rarity glow, level, and an "edit in Pets" link); C5/C6/C7/C8 edit the collections and show
  "Equipped in / Ridden in" with explicit preset names. Nothing acts on a hidden active preset.
- **Shared Oblivion data says it is shared.** B3's Oblivion realm tab is gold-framed (character-wide)
  inside the blue Builds area, with "Oblivion sheet: shared by every preset"; C3's Oblivion tab says
  "One loadout; the rest of the active preset carries over".
- **Active-preset dependence is shown, not hidden.** Character pages whose display depends on the
  active preset show the Context chip (§2.1) and recompute when G2 changes.
- **Return paths.** Jumping across areas (B2 → C6 to add a pet) keeps a "← Back to Loadout: Farm
  build" link in the context header.

### 4.2 Field placement

| Data (persisted path) | Scope | Edited in | Shown read-only in |
|---|---|---|---|
| name, class, level | Character | C1 (and G1 menu) | top bar |
| baseResidual | Character | C1 Base stats (+ B3 Absorb) | B3, inspector |
| skills, attunementBans, fortress | Character | C2 | inspector breakdown |
| equipment.set1/set2, enchantStones | Character | C3 | B2 (set summary), T1 |
| equipment.oblivion, oblivionEnchantStones | Character, Oblivion realm | C3 Oblivion tab | T1 (Oblivion realm), T5 |
| talentSets | Character | C4 | B2 (set + spec) |
| pets.altar, pets.owned | Character | C6 | B2 pet picker |
| mounts (species, rolls, level) | Character | C7 | B2 mount picker |
| mount.glyphs | Per-mount | C7 mount card sockets | B2 (ridden mount's sockets, link to edit) |
| glyphs (inventory) | Character | C7 Glyph inventory | |
| sigils.altarTier, sigils.owned | Character | C5 | B2 sigil picker |
| relics (levels) | Character | C8 | B2 relic picker |
| awakening | Character | C9 | inspector |
| transcendence.presets, activePresetId | Character | C10 | B2 (board preset picker) |
| oblivion.unlocked, level | Character | C1 Oblivion card (+ T5 unlock) | T5 |
| oblivion.activeRealm | Character | G2 realm control | everywhere (top bar) |
| oblivion.sheet | Character, Oblivion realm | B3 Oblivion tab | T5 |
| presets[], activePresetId | Per-preset list | B1 (list), G2 (active) | everywhere |
| preset equipmentSet, talentSet, petId, mountId, relicIds, sigilSpecies, utility/ancient, sigilConditions, transcendencePresetId | Per-preset | B2 | B1 compare table |
| preset.sheet | Per-preset | B3 Base tab | B1 (source tag), inspector |
| drop | Character (tool data) | T1 | |
| opponents | Character (tool data) | T4 | T1, T2, T3 pickers |
| runs | Character (tool data) | T2 Run history | |

---

## 5. Parity table: every inventory screen and control → new location

The inventory lists the shell, Welcome, Settings and Import/Export three times each; they are merged
here.

### 5.1 App shell and navigation

| Current | New location |
|---|---|
| 14 rail nav buttons (fixed order) | Left rail grouped: CHARACTER (Overview, Skills & Clan, Gear, Talents, Sigils, Pets, Mounts & Glyphs, Relics, Awakening, Transcendence), BUILDS (Presets, Loadout, Stat Sheet), TOOLS (Drop Check, Optimiser, Duel, Opponents, Oblivion Floors). "Character" splits into C1 + C2; "Presets" splits into B1-B3 |
| Nav colour dots | Removed (§1 removals) |
| Brand text | Top bar crest + wordmark (G) |
| Oblivion hidden until unlocked; CharacterScreen fallback | T5 always listed, locked state with inline unlock (§3.5) |
| Unknown screen id → Presets | Unknown hash route → B1 (or G0 if roster empty) |
| activeScreen not persisted, default Presets | Hash route + UI key; reload returns to the same page; default after import is C1 |
| "⇄ Change character" picker rows (name, class, preset count) | G1 menu list (adds level, last import) |
| ✎ edit panel: rename, class select ("Choose class..." clears), Delete ConfirmButton (disabled at 1), Close | G1 "Edit character" dialog; class and name also editable inline on C1. Clearing the class stays possible only via the dialog with a warning |
| "+ New Character" (name only, classless) | G1 "+ New character" dialog, name + class required |
| Export button | G6 Data: "Export all characters" (whole roster, file named `Eldaryn-roster_<date>_<time>.json`) and new "Export this character" |
| Import button + hidden file input + import error | G3 Import dialog (file, drag-drop, paste), kind detection, specific errors |
| Settings toggle | G6 cog in top bar |
| Privacy line | Rail foot + G0 + G6 |
| Mobile bottom bar (4 main + More) and More sheet with account panel | Phone tab bar Character / Builds / Tools / Import + area tab strip; account tools in G1 sheet and overflow menu (§2.4) |
| Banner avatar (class SVG icons), name, context line | Top bar G1 (class crest art), context header |
| Toast pill (role=status) | Notifications + G5 Activity log (role=status kept on the live region) |
| "No class" onboarding hint | C1 opens with class picker focused; nav pages show "needs class" (§1 removals) |
| Screen props setStatus / onNavigate | Kept as app services: `notify()` and router `go(route)` |

### 5.2 Welcome

| Current | New location |
|---|---|
| Character name input + Class select + "Get started" | G0 "Start manually" panel (same validation; reason shown while disabled) |
| "or" divider + "Import from file" | G0 primary "Import your game profile" drop zone (file / drag / paste) + "Restore a backup" |
| Brand, Welcome title, subtitle | G0 hero |
| Import hint paragraph | G0 "How do I get this file?" + accepted kinds list |
| Privacy note | G0 foot |
| Import error | G0 inline, kind-specific |
| No success feedback | Import report dialog, then C1 with the report card |

### 5.3 Settings

| Current | New location |
|---|---|
| Close button | G6 is a page; leave via nav |
| Placeholder text | Replaced by G6 Preferences (density compact/comfortable, reduce motion, default tool effort) |
| "Reset all data" + type RESET + Confirm reset (exact, case-sensitive; Enter) + Cancel | G6 Danger zone, same RESET rule; adds "Export first" button beside it, a list of what is wiped (every character, presets, collections, opponents, runs, the v1 backup key and the legacy settings key), and an error line on wrong text |

### 5.4 Import / export and persistence

| Current | New location |
|---|---|
| Roster import (v1/v2) replaces everything silently | G3 → "Replace all characters?" confirm with counts and an offered auto-download of the current roster first |
| Profile import → new character (" (imported)" suffix) | G3 → report → "Create character" (kept) or new "Update <name>" (§3.2) |
| Drop Check "Load .json file" / paste textarea / "Check these drops" | T1 Loot bag tab (kept) and G3 routing for loot bags |
| Duel replay file / paste | T3 Verify tab (kept) and G3 routing for fight logs |
| Export filename / download | G6 Data |
| Auto-save, silent save failure, no-storage mode | Top bar save state (§2.1) |
| Normalisation drops references silently | Import report "Defaulted / dropped" list; on load, a one-time Activity entry when normalisation dropped anything |
| v1 key read-only, deleted only by reset | Unchanged; stated in G6 Danger zone |

### 5.5 Shared primitives

| Current | New location |
|---|---|
| Modal (native dialog, light dismiss, Esc, title id) | Kept; unique generated title id per instance (fixes fixed `modal-title`) |
| ConfirmButton (label → prompt + confirm + Cancel) | Kept for single-item destructive actions; focus moves to the confirm button on swap |
| Chip (selected / disabled-dashed = not owned, sizes) | Kept, colours moved to tokens; "not owned" also gets a text/tooltip reason and a link to where to fix it |
| Slider (track fill, thumb reaches ends) | Kept for every range; paired with a number field wherever exact values matter (mount rolls, pet secondaries) |
| StarRating (radiogroup, keys, clear by clicking current) | Kept on C7; adds a visible "Clear" affordance where 0 is meaningful (not on mounts, which stay 1-5) |

### 5.6 Character screen

| Current | New location |
|---|---|
| H2 Character, class label (read-only) | C1 identity card; class now editable here |
| Level input (1-100, commit on change, "Level saved") | C1 identity card; commits on change, inline "Saved" tick instead of a toast |
| "Oblivion unlocked" checkbox (reconciles skill caps) | C1 Oblivion card, with a note of what it changes; also T5 locked state |
| Skills −/+ with level/cap, unlock level, (locked), effect, next cost, hint | C2 Skills table: icon, name, level stepper, cap, effect now → next, gem cost, plus a total-gems-to-max column |
| Attunement ban chips (cap per class) | C2 Attunement panel, with the slot formula and the "removed from drop roll table" note as a tooltip on disabled chips |
| Fortress group checkboxes (TOP/BOTTOM exclusive), remapped buffs with "(was …)" | C2 Fortress panel as a TOP/BOTTOM radio pair + CORE checkbox; same remapped labels/values (`fortressView`) |
| Base residual inputs x5 + hint | C1 Base stats card; adds "Reset to client defaults" and a pointer to B3 Absorb |

### 5.7 Presets (B1 / B2)

| Current | New location |
|---|---|
| "+ New Preset" (cap 8, toast at cap) | B1 header action; disabled at 8 with the reason inline |
| PresetCard (name, EDITING badge, ATK/HP/spd/crit, source chip, mini-chips) | B1 compare table: one column per preset (name, source tag sheet/computed, effective ATK, HP, Attack speed, Crit, Crit damage and the other headline stats, sources summary); the active preset column is highlighted; click a column header = make active (G2) |
| Card click = set active preset | B1 column click and G2 |
| Editor header "EDITING - NAME", Duplicate (cap 8), Delete preset (min 2) | B1 row actions per preset (Duplicate, Delete with ConfirmButton, disabled at 2 / 8 with reason) and B2 header actions for the active one |
| Preset name input (commit on blur/Enter) | B1 inline rename and B2 header title (editable) |
| Gear Set chips (Set N · items) | B2 "Gear" slot: Set 1 / Set 2 cards with filled-slot count and set power summary |
| Talent Set chips (Set A/B · spec) | B2 "Talents" slot: Set A / Set B cards with spec and points |
| Pet chips (+ none, empty note) | B2 "Pet" picker: art cards with rarity glow, search, None; empty state links to C6 |
| Mount chips (+ none, empty note) | B2 "Mount" picker: art cards with level stars and rolls; ridden mount's sockets read-only beneath with "Edit sockets" → C7 |
| Transcendence chips | B2 "Transcendence board" picker with node count/bonus summary; "Edit boards" → C10 |
| Relic chips (cap 4, disabled at level 0, cap error) | B2 "Relics" 4-slot tray; picker lists class relics with level; level-0 relics show "Level 0: set on Relics" link; cap message inline |
| Generic sigil chips (slots by level), utility row, ancient row, slot errors | B2 "Sigils" tray: 3 generic slots (locked ones show "Unlocks at level n"), utility slot (named Summon/Shield/Form, absent for Warrior/Sentinel), Ancient slot |
| Presets hint text | B1/B2 context header subline |
| Pets/Mounts notes (text only) | Real links to C6/C7 |

### 5.8 Stat sheet (B3)

| Current | New location |
|---|---|
| Realm toggle Base/Oblivion (only when unlocked) | B3 tabs "Base realm: <preset>" (blue) / "Oblivion realm: shared" (gold) |
| "Clear sheet" | B3 header action (ConfirmButton) |
| SheetFields rows: label, Model value, input (+ unit), raw input on capped rows | B3 single table: Stat · Model · Your sheet (input) · raw (capped rows) · Gap · Tolerance · Status. Entry and diff are one table, so there is one list of stats |
| Draft/commit/blank/invalid behaviour, "." parsing | Kept; the invalid state adds a message ("Read as 48 124? Use 48.124 for flat stats") and a live parsed echo under the focused field |
| Instruction note ("." thousands vs decimal) | Per-row unit hint (flat rows show "1.234 = one thousand…"; percent rows show "%") plus the note collapsed |
| Source note "Using your sheet / computed totals" | B3 header + B1 source tag + inspector |
| SheetDiff summary "N/M explained", ok/off rows | B3 header summary and Status column with text ("explained" / "off by 3.2") and the numeric tolerance |
| Absorb into base + footnote | B3 "Absorb into base" opens a preview: current base → new base for the five stats, presets affected; confirm; Undo in notification |
| (new) per-source contribution | B3 row expand: model value broken down by source (base, gear set, stones, talents, pet, mount + glyphs, relics (labelled assumption), sigils, awakening, transcendence, skills, fortress, carried residual) |

### 5.9 Gear (C3)

| Current | New location |
|---|---|
| Realm chips Base/Oblivion (only when unlocked) and Set chips | C3 sub-tabs "Set 1 · used by Farm, Boss" / "Set 2 · …" / "Oblivion" (disabled with lock when locked). Switching keeps the stone selection when still valid |
| SlotSilhouette (9 / 12 slots, class weapon names, ilvl, rarity colour, stone dot, selected) | C3 Equipment tab left column (paper-doll in an ornate frame); socketed stone shown as a coloured gem with its type name on hover/focus |
| ItemEditor (Clear slot, rarity, ilvl, quality, Attack, Health, secondaries, conduit) | C3 Equipment tab centre column; ranges shown as visible helper text, not only `title`; out-of-range values flagged instead of silently 0 |
| Socket line | C3 item panel footer: socketed stone card with its stats and "Unsocket"/"Change" |
| "used by" line / Oblivion carry-over line | C3 sub-tab label and scope subline |
| StoneForm add mode (type, quality, grade, guaranteed, Azure choice, free stats, Add stone) | C3 Enchant stones tab: "+ Add stone" panel (right column), same rules |
| StoneForm details (quality, amplify ±, grade, stat rows, Socket in <Set> <Slot>, Unsocket, Remove stone) | C3 Enchant stones tab detail panel; socket target select lists Set 1 and Set 2 slots explicitly (no chip switch needed) |
| StoneGrid (ordering, gold ring, heading per pool) | C3 Enchant stones tab grid with sort (default = current order) and filter by type; pool label "Base pool (Set 1 and Set 2)" / "Oblivion pool" |
| Inspector (new) | Selected item/stone contribution to the active preset |

### 5.10 Talents (C4)

| Current | New location |
|---|---|
| Set A/B chips, used-by text | C4 sub-tabs "Set A · used by Farm" / "Set B · unused" |
| Specialization select | C4 header select per set |
| Points readout x/cap | C4 header, as a bar + mono numbers |
| Reset Set (ConfirmButton) | C4 header action |
| Tier sections with Unlocked/Locked badge | C4 tier bands with talent art icons; lock text "needs N more points in earlier tiers" kept |
| Talent rows: name, rank badge, −/+, description with value and NEXT | C4 talent tiles (icon, rank pips, −/+; description in tile and inspector) |
| No class / no spec messages | Kept as empty states with a link to C1 class picker |
| (new) set effect summary | Inspector: total effect of the set |

### 5.11 Sigils (C5) and sigil equip (B2)

| Current | New location |
|---|---|
| Header hint (class, unlock level) | C5 context header subline |
| Altar tier −/+ | C5 Altar panel |
| Evolve Altar ConfirmButton | C5 Altar panel, separated as a destructive action with the list of sigils it destroys and presets that lose equips |
| Tier multiplier hint | C5 Altar panel |
| "Equipped" preset chips + SigilEquipPanel (3 slots, utility, Ancient, unlock levels, flat totals) | B2 Sigils tray (§5.7); flat totals in B2 and the inspector |
| Activation conditions (level 54 gate, per-sigil select, PvE/PvP note) | B2 Sigils tray, per equipped sigil, gate message kept |
| Collection by rarity; SigilCard (art, level stepper/input, not owned, Ancient owned toggle, ATK/HP at tier, spell blocks, notes, "in <presets>") | C5 collection grid; compact cards by default with "Details" expand (spell blocks, Druid/Mage variants as tabs); level field clamps with a message; footer "Equipped in: …" with an "Equip in ▾" menu naming presets |
| No class message | Empty state with link to C1 |

### 5.12 Pets (C6)

| Current | New location |
|---|---|
| Altar level −/+ and Slider | C6 Altar panel: one number field with −/+ and a slider (same value) |
| Altar tier select + Change tier / Wipe collection confirm + Keep tier | C6 Altar panel; the confirm dialog lists the pets that will be removed and the presets whose pet is cleared |
| Species select + Add Pet + counter n/MAX | C6 header "+ Add pet" (species picker with art, sorted by rarity) and the counter |
| PetCard (art, name/evolved name, base ATK/HP, altar preview, secondaries, used by, Edit/Save, Remove) | C6 grid cards; Edit/Save → Expand/Collapse; "Used by" names presets |
| Edit mode: species, secondary stat select, value (text or slider), remove secondary, add secondary | C6 expanded card; secondaries get a number field always, slider optional |
| Empty state | Kept |

### 5.13 Mounts & Glyphs (C7)

| Current | New location |
|---|---|
| Header hint (unlock level, socket counts, only ridden counts) | C7 context header subline |
| Mount species select + Add mount + same-species hint | C7 Mounts tab "+ Add mount" (picker with art); the new card opens with its rolls focused |
| MountCard StarRating level, Base HP/ATK sliders, effective "Ridden:" bonus, used by | C7 mount card (bronze per-mount frame for the sockets section); rolls get number fields beside the sliders |
| Six socket buttons → GlyphPickerModal (filtered list, "Also on", sealed disabled, Empty this socket) | C7 mount card sockets (larger, art) → same picker dialog |
| "Ride with <active preset>" toggle | C7 card "Ridden in ▾" menu with each preset named; primary control is B2 Mount picker |
| Remove mount | C7 card ConfirmButton |
| AddGlyphForm (tier, type, rarity, sealed, Add) | C7 Glyph inventory tab "+ Add glyph" panel |
| GlyphCard (rarity, art, sealed/Unlock, minor secondary stat + value, major effect + inert warning, mythic, "On <mounts>", Mark sealed, Remove) | C7 Glyph inventory grid, grouped Minor/Major/Mythic, filter and sort; the inert warning checks the ridden-in presets ("inert in Farm: its sigil is not equipped") |
| Empty states, "No character selected." | Kept |
| (new) ridden mount total incl. glyphs | Inspector and B2 |

### 5.14 Relics (C8)

| Current | New location |
|---|---|
| Header hint with active preset n/4 | C8 subline "levels are character-wide"; equip count lives in B2 |
| Per relic: name, LV badge, −/+ | C8 table by tier (Bronze/Silver/Gold) with relic art, level field + −/+ + "Max" |
| Stats at max(level,1) | C8 stats column; level 0 rows say "shown at level 1" |
| Equip toggle (active preset, cap 4) | C8 "Equipped in ▾" menu naming presets (cap enforced per preset); primary is B2 Relics tray |
| Used-by | C8 "Equipped in" column |
| No class message | Empty state with link to C1 |

### 5.15 Awakening (C9)

| Current | New location |
|---|---|
| Path cards (Shadow/Radiant) | C9 two large path panels with art and a short description, aria-pressed |
| Points readout, −/+, Reset Awakening | C9 points field with −/+ and "Max"; reset button labelled "Reset path and points" |
| Override source line (spec/class/path default) | C9 header, plus the Context chip naming the preset whose spec drives it |
| Bonus list (+total, +per point) | C9 table with units, plus "preview other path" column for comparison |
| No path message | Kept |

### 5.16 Transcendence (C10)

| Current | New location |
|---|---|
| Header hint (unlock level, class flavour) | C10 subline + Context chip (the flavour follows the active preset's spec) |
| Preset tablist, "+ Preset" | C10 sub-tabs (board presets), "+ Board" |
| Rename (18 chars), Reset board, Delete preset (not default), Used by | C10 header actions; "Used by" names build presets |
| Node filter chips + Clear | C10 left filter panel; adds a list of matching nodes |
| BoardGrid pan/zoom/pinch, centred on core | C10 main canvas (full content width); adds zoom +/− and reset-view buttons |
| BoardNode states, desktop click toggles, hover tooltip | Kept; tooltip also on keyboard focus |
| Mobile NodeDrawer | Kept (phone bottom sheet) |
| Totals bar (nodes, Ichor in use, Offense/Defense) | C10 inspector: totals, per-side breakdown; Ichor labelled "information, not a budget" |
| Toasts for unreachable / strands / no class | Inline message next to the board (and G5) |

### 5.17 Optimiser (T2)

| Current | New location |
|---|---|
| Preset chips | T2 setup step 1 select |
| Target select + per-target fields (dummy secs, chapter/level, dungeon/step, raid/step + needs level, Oblivion floor, world boss affinity, custom mob) | T2 setup step 2, shared Target picker |
| PVP opponents chips, My seat chips, PVP disabled hint + Duel link | T2 step 2 PVP branch; link goes to T4 Opponents |
| Maximise select + Survive for (s) | T2 step 3 |
| 12 allowed-to-change chips + Relic slots to fill + "never changed" hint | T2 step 4, grouped with all/none and defaults |
| Effort chips + Seed | T2 step 5 with budgets printed |
| "Optimise <preset>" button, disabled reasons | T2 setup foot; reasons shown inline |
| Cancel, progress bar, progress text | T2 results pane header + G4 |
| Output header and meta line | T2 results header |
| Baseline row | T2 sticky baseline row |
| Result rows (rank, value, CI, N, delta, significant/within noise, change list, Show full build, Apply) | T2 forest-plot rows; change list with per-change contribution; full build in the inspector; Apply → scoped review dialog |
| PVP matchups list | T2 row expand: matchup table (opponent × seat) |
| Footnotes (PVE residual, PVP Wilson/ties, server model) | T2 results footer "How to read this" |
| Cancel/partial/truncation notes, status messages | T2 results header + notifications |
| Run history (open/hide, rename, pin, delete, notes, Clear unpinned, compacted note) | T2 Run history tab (table + detail); adds Re-run with settings and compare two runs |

### 5.18 Drop Check (T1)

| Current | New location |
|---|---|
| Collapsible import panel (file, paste, Check these drops) | T1 Loot bag tab import strip (and G3) |
| Batch list (Cancel / Check again, rows, skipped, stale banner, status) | T1 Loot bag tab results; rows load into the Single drop pane without scrolling away |
| Realm chips | T1 Single drop header (defaults to G2 realm) |
| SlotSilhouette (active preset's set) | T1 left pane; label says whose set is drawn, with a set switcher |
| ItemEditor | T1 left pane (same component as C3) |
| Discard this drop | T1 left pane footer |
| Presets select (All / one) | T1 options panel |
| Simulated DPS / Survival / PVP checkboxes, EnemyPicker, opponent checkboxes | T1 options panel: metrics with their N visible and an effort control; enemy via shared Target picker; opponents from T4 |
| Fidelity banner | T1 results header, short, with "details" |
| Equipped-now list | T1 left pane under the editor ("In this slot now") |
| VerdictCards (per set, per preset lines, Apply / mixed confirm, Stat changes) | T1 results pane; simulated delta first, instant estimate second; Apply → scoped confirm |
| Status line (waiting/simulating/complete/cancelled/failed) | T1 results header + G4; results keep the previous values greyed while re-running instead of blanking |
| Sheet hint + "Enter a sheet on Presets" link | T1 results footer, link to B3 |
| Toasts (imported, loaded, applied, discarded) | Notifications + G5 |

### 5.19 Duel (T3) and Opponents (T4)

| Current | New location |
|---|---|
| My preset chips | T3 setup |
| Opponent chips | T3 setup select (from T4) |
| New opponent spec select + "+ New opponent"; Clone row | T4 header actions |
| Seat label + Swap sides | T3 seat control Attacker / Defender / Both (no silent re-run; "Run" re-runs) |
| "Run 400 duels" / Cancel / done/n | T3 Run with effort (N shown) + G4 |
| Re-roll trace | T3 Sample duel panel "Re-roll sample" |
| Opponent editor (Duplicate, Delete, name, class/spec chips, SheetFields) | T4 editor; sheet uses the B3 table component |
| Opponent loadout (sigils, utility, Ancient, level, condition, major glyphs + rarity, altar tier) | T4 editor Loadout section |
| Replay check (file, paste, hold to fighters, Check log, report) | T3 "Verify a fight log" tab (and G3 routing) |
| Result: win rate, CI, verdict, durations, timeouts, ties note, cancelled badge | T3 result pane (§3.4) + fighters-as-simulated columns |
| Trace table, DuelTimeline | T3 Sample duel panel (larger timeline, event table, defined headers) |
| Blockers list | T3 setup, each with a fix link |
| "No saved opponents yet" | T4 empty state; T3 links to T4 |

### 5.20 Oblivion (T5)

| Current | New location |
|---|---|
| Realm chips (global activeRealm) | G2 realm control in the top bar |
| Oblivion Level input | C1 Oblivion card (T5 shows it with an edit link) |
| Simulate floors 1-30 / Scanning / Cancel | T5 scan setup + G4 |
| Locked text + "Go to Character" | T5 locked state with inline unlock |
| Summary (Power, Attack, HP), free-floor hint, max floor at 90% | T5 summary strip |
| Floor table (30 rows, instability, net strain, win %, range, median clear) | T5 table with bars, N column, staleness marker |
| Embedded GearScreen realm='oblivion' | C3 Oblivion tab (link from T5) |
| Toasts (finished / cancelled / failed) | Notifications + G5 |

---

## 6. Test contract impact (for the build phase)

Kept unchanged: every `data-testid` in Optimiser, Drop Check, Duel, Oblivion, Sigils, Pets, Mounts,
Sheet and Character tests; aria-labels on inputs and steppers; Modal, ConfirmButton, StarRating
semantics; SettingsPanel RESET rules.

Changed on purpose (tests to rewrite with the new IA):

- `Sidebar.test.js` / `navVisibility.test.js`: grouped nav (3 sections, 18 items), Oblivion always
  listed (locked state instead of hidden), phone tab bar = Character / Builds / Tools / Import, no
  More sheet; account panel tests move to G1 and G6.
- Presets tests split across B1 (cards → compare table columns), B2 (selectors) and B3 (sheet).
- Sigils equip-panel, Relics equip and Mounts ride tests move to B2, with the explicit "Equipped in /
  Ridden in" menus covered in C5/C7/C8.
- The shell's classless-character hint is replaced by the C1 class prompt.
- New: hash routing, import kind detection and report, profile update into an existing character,
  job store surviving navigation, notification timeouts.
