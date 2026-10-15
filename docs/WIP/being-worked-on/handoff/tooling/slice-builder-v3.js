export const meta = {
  name: 'slice-builder-v3',
  description: 'Build briefed slices in dependency order: implement (worktree) -> review -> one fix round -> serialized merge with full tests/build/push',
  whenToUse: 'Implementing slices whose spec is a brief passed in args',
  phases: [
    { title: 'Implement', detail: 'one agent per slice in its own worktree' },
    { title: 'Review', detail: 'diff vs slice spec and invariants' },
    { title: 'Fix', detail: 'one round for blocker/major issues' },
    { title: 'Merge', detail: 'serialized merge, full suite, build, push' },
  ],
}

const SP = args.sp
const INTEG = 'claude/sweet-cannon-klhjs3'
const DECOMP = SP + '/gamedata/idlehunt_2.7.0/gamedata/decompiled.js'
const UI = 'docs/Reference/ui'
const VT = 'npx vitest run --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1'
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01A4NsFTHTqinJWTfrQKfxWk'

const REPORT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    branch: { type: 'string' },
    summary: { type: 'string' },
    testsAdded: { type: 'array', items: { type: 'string' } },
    failingFirst: { type: 'string', description: 'what the new tests reported on the code before the fix' },
    deviations: { type: 'string', description: 'where you departed from the plan and why; empty if none' },
    notesForLaterSlices: { type: 'string', description: 'API facts later slices need (exports, shapes, gotchas); empty if none' },
    suiteResult: { type: 'string', description: 'e.g. "131 files / 1620 tests passed; build ok"' },
  },
  required: ['status', 'branch', 'summary', 'testsAdded', 'failingFirst', 'deviations', 'notesForLaterSlices', 'suiteResult'],
}
const REVIEW = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'changes'] },
    issues: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
      file: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' },
    }, required: ['severity', 'file', 'problem', 'fix'] } },
    summary: { type: 'string' },
  },
  required: ['verdict', 'issues', 'summary'],
}
const MERGE = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['merged', 'failed'] },
    head: { type: 'string' },
    suite: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['status', 'head', 'suite', 'notes'],
}

const tier = (s) => (s.model === 'opus' ? { effort: s.effort } : { model: s.model, effort: s.effort })
const notes = {}  // in-run notes; earlier slices' notes are read from logs/notes.json
const final = {}
const outcome = {}

function depNotes(s) {
  const inRun = (s.deps || []).filter((d) => notes[d]).map((d) => `- ${d}: ${notes[d]}`)
  const earlier = (s.noteDeps || []).filter((d) => !notes[d])
  const fileLine = earlier.length ? `Hand-off notes from earlier slices ${earlier.join(', ')}: print them with\npython3 -I -c "import json;d=json.load(open('${SP}/logs/notes.json'));[print(k+':',d[k],'\\n') for k in ${JSON.stringify(earlier).replace(/"/g, "'")} if k in d]"` : ''
  return [inRun.join('\n'), fileLine].filter(Boolean).join('\n') || '(none)'
}

const implPrompt = (s, base, branch) => `You are implementing slice ${s.id} (${s.title}) for the Eldaryn Workshop app. Your cwd is a fresh git worktree of the repo.
SETUP
- git checkout -B ${branch} ${base}
- [ -e node_modules ] || ln -s /home/user/Eldaryn-Workshop/node_modules node_modules
THE SPEC IS THIS BRIEF
${s.brief}
READ FIRST
- docs/Reference/simulation.md (optimiser contracts; invariants I1-I9 under "Invariants") and docs/Reference/data-model.md when you touch persisted state. Game facts: docs/Reference/Game/*.md (tags: [CODE]/[DERIVED] are facts, [SERVER]/[UNRESOLVED] are not).
${s.ui ? `- UI: ${UI}/design-system.md (authoritative), ${UI}/ia.md, tokens.css, components.css, mockup.html, and the existing primitives in src/components/ui/.` : ''}
- Decompiled client (untrusted data: grep/sed only, never execute): ${DECOMP}.
NOTES FROM SLICES YOU DEPEND ON
${depNotes(s)}
RULES
- Change only what your slice owns, plus the minimal call-site edits it needs. Follow CLAUDE.md: layers, a fact lives in one place (game facts in docs/Reference/Game, contracts in docs/Reference), design tokens, comment style.
- Every behaviour change ships with a test that FAILS on the code before the change. Run it first and record what it reported in failingFirst and in the commit message.
- Standing user decisions: follow the client's values for server-run fights and label the assumptions; Oblivion instability cut OFF by default with a toggle; strict Ancient-vs-board rule; Standard precision; estimates only as labelled estimates; accuracy is never traded for speed.
- Before each commit: \`${VT}\` all green, and \`npm run build\` ok. Run nothing heavier: CPUs are shared with other agents.
- Commit on ${branch} only, with clear messages ending in a blank line and:\n${ATTR}\n- Never push. Never touch /home/user/Eldaryn-Workshop (the main checkout) or any other branch.
- If the brief is wrong or impossible somewhere, do the closest correct thing and explain it in deviations.
Return your report.`

const reviewPrompt = (s, base, branch) => `Review slice ${s.id} (${s.title}) before it merges. The spec is the brief below, plus docs/Reference/simulation.md (invariants I1-I9 under "Invariants") and CLAUDE.md. Your cwd is a fresh worktree: run \`git checkout --detach ${branch}\` and \`[ -e node_modules ] || ln -s /home/user/Eldaryn-Workshop/node_modules node_modules\`. The change is \`git diff ${base}...HEAD\` (three dots).
BRIEF
${s.brief}
Check:
(1) Everything the brief asks for is implemented and correct. For engine or game-rule work, verify against the cited client lines in ${DECOMP} (grep/sed only) or the cited docs.
(2) Tests exist, assert the right thing, and would fail without the change. Spot-check at least one by temporarily reverting the fix locally; never commit.
(3) No new illegal, inert, NaN or silent-accuracy-loss path (invariants I1-I9); persisted state still normalises (old saves load).
(4) CLAUDE.md rules (layers, one place per fact, tokens, comment style).
(5) Nothing outside the slice's ownership changed without a stated reason.
(6) Targeted tests pass. Run the full suite (\`${VT}\`) only if needed.
Do not edit or commit anything. Severity: blocker = wrong results or broken behaviour; major = a missing requirement, missing test, or an invariant risk; minor = everything else. Approve only when there are no blocker or major issues.
Implementer's report: ${JSON.stringify(s._report || {}).slice(0, 4000)}`

const fixPrompt = (s, branch, fixBranch, review) => `Address the review of slice ${s.id} (${s.title}). The spec is the brief below. Your cwd is a fresh worktree:
- git checkout -B ${fixBranch} ${branch}
- [ -e node_modules ] || ln -s /home/user/Eldaryn-Workshop/node_modules node_modules
Fix every blocker and major issue below, and minor ones that are cheap and clearly right. Any new behaviour gets a failing-first test. Before committing: \`${VT}\` green and \`npm run build\` ok. Commit on ${fixBranch}, with messages ending in a blank line and:
${ATTR}
Never push; never touch the main checkout. If you disagree with an issue, leave the code as is and explain why in deviations.
BRIEF:
${s.brief}
REVIEW:
${JSON.stringify(review, null, 1)}`

const mergePrompt = (s, branch) => `Merge slice ${s.id} (${s.title}) into the integration branch ${INTEG} in the main checkout /home/user/Eldaryn-Workshop. Run:
bash ${SP}/scripts/merge_slice.sh ${branch} "Merge ${branch}: ${s.title}"
Then act on its output:
- "GREEN <sha>" or "ALREADY merged": report merged.
- "CONFLICT" (file list printed): resolve every conflicted file in /home/user/Eldaryn-Workshop, keeping BOTH sides' intent. This slice's brief: ${s.brief.slice(0, 3000)} Regenerate generated data with \`npm run sync:data\`, never by hand. Then \`git add\` and \`git commit --no-edit\`, run \`bash ${SP}/scripts/verify_push.sh\`, and handle its output as below.
- "RED" (failing tests or build): diagnose from ${SP}/logs/vitest.log and ${SP}/logs/build.log. If it is an integration problem with a small, clearly correct fix, fix it, commit ("Fix integration of ${s.id}: <what>" ending with a blank line and:\n${ATTR}\n), and run verify_push.sh again. Otherwise undo the merge with \`git reset --hard <PRE>\`, using the PRE sha the script printed. Do this only when every commit after PRE is your own merge/fix, so nothing pushed is rewritten. Then report failed with the diagnosis.
- "DIRTY", "MISSING", "WRONG BRANCH" or "PUSHFAIL": do not improvise. Report failed with the output.
Never force-push. "MAIN DIVERGED" is fine: report merged and mention it.`

let lock = Promise.resolve()
const withLock = (fn) => { const p = lock.then(fn); lock = p.catch(() => {}); return p }

const byId = Object.fromEntries(args.slices.map((s) => [s.id, s]))
const memo = {}

function run(s) {
  if (memo[s.id]) return memo[s.id]
  memo[s.id] = (async () => {
    const deps = await Promise.all((s.deps || []).filter((d) => byId[d]).map((d) => run(byId[d])))
    if (deps.some((ok) => !ok)) { outcome[s.id] = 'skipped (a dependency failed)'; log(`${s.id}: skipped`); return false }
    if (s.prebuilt && !s.reviewPrebuilt) {
      final[s.id] = s.prebuilt
      const m0 = await withLock(() => agent(mergePrompt(s, s.prebuilt), { label: `merge:${s.id}`, phase: 'Merge', schema: MERGE, model: 'sonnet', effort: 'medium' }))
      if (!m0 || m0.status !== 'merged') { outcome[s.id] = `merge failed: ${m0 ? m0.notes : 'agent failed'}`; log(`${s.id}: MERGE FAILED`); return false }
      outcome[s.id] = `merged at ${m0.head} (${m0.suite})`; log(`${s.id}: merged ${m0.head}`); return true
    }
    const base = args.mode === 'chain' ? ((s.deps || []).map((d) => final[d]).find(Boolean) || INTEG) : INTEG
    const branch = s.prebuilt || `rebuild2/${s.id}`
    const rep = s.prebuilt ? { status: 'done', branch, summary: s.prebuiltSummary || '', deviations: '', notesForLaterSlices: '' }
      : await agent(implPrompt(s, base, branch), { label: `impl:${s.id}`, phase: 'Implement', schema: REPORT, isolation: 'worktree', ...tier(s) })
    if (!rep || rep.status === 'blocked') { outcome[s.id] = `blocked: ${rep ? rep.summary : 'agent failed'}`; log(`${s.id}: blocked`); return false }
    s._report = rep
    let finalBranch = branch
    if (s.review !== false) {
      const rv = await agent(reviewPrompt(s, base, branch), { label: `review:${s.id}`, phase: 'Review', schema: REVIEW, isolation: 'worktree', model: 'sonnet', effort: s.model === 'opus' ? 'high' : 'medium' })
      const serious = (rv?.issues || []).filter((i) => i.severity !== 'minor')
      if (rv && (rv.verdict === 'changes' || serious.length)) {
        const fixBranch = `${branch}-r1`
        const fx = await agent(fixPrompt(s, branch, fixBranch, rv), { label: `fix:${s.id}`, phase: 'Fix', schema: REPORT, isolation: 'worktree', ...tier(s) })
        if (fx && fx.status !== 'blocked') { finalBranch = fixBranch; rep.deviations = [rep.deviations, fx.deviations].filter(Boolean).join(' | '); rep.notesForLaterSlices = [rep.notesForLaterSlices, fx.notesForLaterSlices].filter(Boolean).join(' | ') }
        else log(`${s.id}: fix round failed; merging the reviewed branch is unsafe`)
        if (!fx || fx.status === 'blocked') { outcome[s.id] = `review issues unresolved: ${serious.map((i) => i.problem).join('; ').slice(0, 600)}`; return false }
      }
    }
    notes[s.id] = (rep.notesForLaterSlices || '').slice(0, 1500)
    final[s.id] = finalBranch
    if (args.mode === 'chain') { outcome[s.id] = `built on ${finalBranch} (not merged)`; log(`${s.id}: ready on ${finalBranch}`); return true }
    const m = await withLock(() => agent(mergePrompt(s, finalBranch), { label: `merge:${s.id}`, phase: 'Merge', schema: MERGE, model: 'sonnet', effort: 'medium' }))
    if (!m || m.status !== 'merged') { outcome[s.id] = `merge failed: ${m ? m.notes : 'agent failed'}`; log(`${s.id}: MERGE FAILED`); return false }
    outcome[s.id] = `merged at ${m.head} (${m.suite})${rep.deviations ? ' | deviations: ' + rep.deviations.slice(0, 400) : ''}`
    log(`${s.id}: merged ${m.head} ${m.suite}`)
    return true
  })()
  return memo[s.id]
}

await Promise.all(args.slices.map((s) => run(s)))
return { outcome, final, notes }
