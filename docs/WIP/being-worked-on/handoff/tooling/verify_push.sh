#!/usr/bin/env bash
# verify_push.sh: full tests + build on the main checkout's HEAD, then push the integration branch and fast-forward main.
set -u
if [ -z "${MERGE_LOCK_HELD:-}" ]; then exec 9>/tmp/claude-0/-home-user-Eldaryn-Workshop/51487d85-46a3-521f-aaa4-955331a2f445/scratchpad/merge.lock; flock 9; fi
cd /home/user/Eldaryn-Workshop
[ -z "$(git status --porcelain)" ] || { echo "DIRTY"; git status --short | head -20; exit 3; }
L=/tmp/claude-0/-home-user-Eldaryn-Workshop/51487d85-46a3-521f-aaa4-955331a2f445/scratchpad/logs; mkdir -p $L
npx vitest run --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1 > $L/vitest.log 2>&1; t=$?
grep -E "Test Files|Tests  " $L/vitest.log; grep -E "^ *(FAIL|×)" $L/vitest.log | sort -u | head -30
npm run build > $L/build.log 2>&1; b=$?
tail -3 $L/build.log
if [ $t -ne 0 ] || [ $b -ne 0 ]; then echo "RED tests=$t build=$b (logs: $L/vitest.log $L/build.log)"; exit 2; fi
git push -q origin HEAD:claude/sweet-cannon-klhjs3 2>&1 || { echo "PUSHFAIL"; exit 5; }
git fetch -q origin main
if git merge-base --is-ancestor origin/main HEAD; then git push -q origin HEAD:main 2>&1 && echo "MAIN SYNCED"; else echo "MAIN DIVERGED (not pushed to main)"; fi
echo "GREEN $(git rev-parse --short HEAD)"
