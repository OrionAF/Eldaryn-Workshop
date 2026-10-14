# Reference — current truth

Everything in here is believed accurate **right now**. If you find something
that isn't, fix it or archive it in the same change — do not leave it.

## Three tiers

**Root level — canonical, living documents.** Documents that describe how the
app models the world and must never go stale or be archived while the app
exists.

- `combat-model.md` — the canonical reference for damage, healing, mitigation,
  survivability, duels, scoring and the gauntlet. Read it before touching any
  combat math. Every constant in it carries a provenance tag
  (RULED / PATCH / OBSERVED / ASSUMED / INVENTED); only the first three may be
  quoted to the user as game facts.

**`Source/` — raw inputs.** Screenshots, scrapes, patch notes, the user's own
answers. The evidence everything else is derived from. Source material is
never "outdated" — a screenshot of the game in July 2026 is permanently a true
record of July 2026 — so it does not get archived, though it may become
superseded by newer captures.

**`Notes/` — derived notes.** Per-topic records of decisions, reviews and
fixes. Each is datestamped and each must be currently accurate.

## Why root ≠ Notes

A canonical document and a note fail differently. A note about feature A
becomes wrong when feature B replaces it, and gets archived. `combat-model.md`
never gets archived — it gets *corrected*, because there is always a current
combat model and this is the file that describes it.
