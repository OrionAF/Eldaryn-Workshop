# What changes next, and why

**The optimiser.** The glyph bug you found was one case of a wider problem. The optimiser could suggest things the game doesn't allow: talent points you don't have yet, a 4th relic slot you haven't bought, a Mage sigil on a Druid. It could also suggest things that do nothing: a glyph whose sigil isn't equipped, or a condition that never triggers against the dummy.

The replacement checks every suggestion three ways before showing it:
- **Legal:** it must survive a save-and-reload through the app's own data rules, plus every game rule.
- **Effective:** each change must actually alter what the combat engine receives.
- **Needed:** each change must earn its place. Changes that aren't needed are removed.

Every result lists:
- each change's own effect, with a confidence range;
- any extra gain from changes working together;
- exactly what Apply will write: this preset, the whole character, or a mount, plus the other presets it touches.

**Honest statistics.** Runs no longer stop on a timer or a fixed budget. Each comparison keeps simulating until the answer is clear, or until it can say "too close to call" and how many more fights would settle it. The builds that win the search are re-measured on fresh random fights, so a lucky streak can't promote them. "Significant" now accounts for testing many builds at once.

Specific fixes:
- Time-to-kill counts lost fights.
- Survival no longer ranks builds by a rough estimate.
- PVP ties no longer favour builds that lose faster.
- The PVP search tries the PVP-only sigil conditions.

Runs will be slower: minutes for PVE, longer for PVP. You can watch progress, leave the page, cancel and resume.

**Engine and data accuracy.** All 120 audit findings are covered, including:
- Primal Awakening in Wolf form, which cast the Bear buff.
- Necromancer minions, which were wrongly healed and reset between mobs and summoned too early.
- Dungeons and raids, which now run on the game's 10 ms tick with per-fight time limits.
- Dungeon monsters, which regain the Block and Penetration lost from our data. Hard dungeons are added.
- World Boss shields, which follow the game's own setting.
- Saved PVP opponents with blank sheet rows, whose blanks are treated as zero instead of silently breaking every duel.
- Form sigils, now fixed at level 1.
- Talent points, Awakening points and relic slots, now limited by level and purchases.
- Sigil conditions, now shared by every preset as in the game.
- Stat sheets, now flagged as out of date after a build changes.
- Imports, which can no longer wipe your roster by accident.

**Safety net.** New automatic tests generate thousands of random characters across all 8 specs and both realms. They check that:
- every suggestion is legal and changes something;
- no stat is ever NaN, and bad inputs stop with a clear error;
- opponents with blank rows still simulate correctly;
- results match your real exported profile and fight log;
- core formulas match a line-by-line copy of the game client.

**New look.** The app is rebuilt to the chosen design (navy, brass and ember, with fonts bundled into the app), grouped into Character, Builds and Tools. It gets:
- links straight to any page, and back/forward navigation;
- a jobs tray for long runs;
- an import dialog that shows what it will change before writing;
- result pages that show every number with its confidence range.

Every current feature keeps a home, mapped one by one.

**Order.** 36 pieces of work run in 17 waves of at most two at a time:
1. engine and statistics;
2. the data model and optimiser;
3. the tests;
4. the new interface.

The fixed optimiser starts working in the current interface after wave 8. The expensive model is used only for the hard simulation and statistics work.
