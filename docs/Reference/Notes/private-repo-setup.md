# The private workspace repo

> **Status:** Current · **Last verified:** 2026-07-28
> **Covers:** how `docs/`, `EldarynTracker/` and the root instruction files are
> version-controlled without ever reaching the public GitHub repo.

## Why

`Eldaryn-Workshop` is public. Its `.gitignore` deliberately excludes `/docs`,
`/EldarynTracker`, `CLAUDE.md`, `/CONTEXT.md` and `/graphify-out` — "internal
planning/domain notes, kept locally, not published".

That kept them private and left them with **no version control and no backup**.
On 2026-07-28 a restructure accident destroyed five documents that were
therefore unrecoverable (`Archive/DATA-LOSS-2026-07-28.md`). This setup fixes
that without changing anything about the public repo.

## The shape

A **second git repo whose git-dir lives outside the project** but whose work
tree is the project root. The two repos coexist in one folder and neither knows
about the other.

```
D:\CodingProjects\
├── .eldaryn-private.git\      ← private repo's git-dir (NOT inside the project)
└── Eldaryn-Workshop\
    ├── .git\                  ← public repo, completely untouched
    ├── src\                   ← public repo tracks
    ├── docs\                  ← private repo tracks
    ├── EldarynTracker\        ← private repo tracks
    └── CLAUDE.md, CONTEXT.md  ← private repo tracks
```

No submodules, no nested `.git`, no change to `.gitignore`. This is the
standard "dotfiles bare repo" pattern.

## Using it

**`edoc` is already installed** as a PowerShell function in
`C:\Users\Orion\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`
(created 2026-07-28 — that folder and file did not exist before). It loads
automatically in every new Windows PowerShell session; run `. $PROFILE` to load
it into a session that is already open.

Use it exactly like `git`, from any directory:

```powershell
edoc status
edoc add docs/
edoc commit -m "Record the calibration findings"
edoc push
edoc log --oneline
```

Note: PowerShell 7 (`pwsh`) reads a *different* profile at
`Documents\PowerShell\`. Only 5.1 is installed today; if that changes, the
function needs copying across.

## What is tracked, and what is deliberately not

**Tracked** (~12 MB): all of `docs/`; `EldarynTracker/`'s depth-1 files — the
Python tools, `eldaryn.db`, `eldaryn_gear.db`, `combat_power_observations.csv`,
`found_sigils.csv`, `found_glyphs.csv`, the handoff spec — plus
`sample screenshots/`; `CLAUDE.md`; `CONTEXT.md`.

**Excluded**, via `.eldaryn-private.git/info/exclude`:

| Path | Size | Why |
|---|---|---|
| `EldarynTracker/Warrior_Gear` | 365 MB | 540 raw gear screenshots |
| `EldarynTracker/Sentinel_Gear` | 245 MB | 268 raw gear screenshots |
| `__pycache__`, `*.pyc` | — | build artifacts |

**Those 610 MB still have no backup.** They are write-once input already
digested into `eldaryn.db`, so version control is the wrong tool — but losing
them means losing the ability to re-derive or re-audit that data. They need an
external drive or a cloud sync folder. This is an open gap, not a solved one.

## Who commits

The user granted Claude **standing authorization on 2026-07-28** to
`edoc commit` and `edoc push` without asking, so documentation never sits
uncommitted. Scope and the exceptions that still require asking are in
`CLAUDE.md` under "Standing authorization". It covers `edoc` only — the public
repo still follows the normal commit-only-when-asked rule.

## Two things that will trip you up

**1. `-f` is needed the first time a path is added.** The private repo reads
the work tree's `.gitignore` — the public one — which excludes exactly the
paths this repo exists to track. Force-add once and it is tracked forever
after, because `.gitignore` only applies to *untracked* files:

```powershell
edoc add -f docs/some-new-folder
```

**⚠ Never `edoc add -f EldarynTracker`** — `-f` overrides `info/exclude` too,
and would sweep in all 610 MB. Add specific files or subpaths.

**2. `status.showUntrackedFiles=no` is set** on this repo, so `edoc status`
will not list the thousands of public-repo files as untracked. The consequence:
**genuinely new private files will not show up in `edoc status` either.** Add
them explicitly when you create them.

## Remote

**Live since 2026-07-28:** `https://github.com/OrionAF/eldaryn-private.git`,
branch `main` tracking `origin/main`. First push was 112 objects / 14.84 MiB.

There is now an offsite copy of everything the public repo excludes — except
the screenshot corpora below, which remain in exactly one place.

⚠ **Verify the GitHub repo is actually private** if you have not already: open
it in a logged-out or incognito browser. A 404 means private. Anything else
means the docs, `eldaryn.db` and `CLAUDE.md` are public, which defeats the
entire purpose of this setup.
