#!/usr/bin/env bash
# merge_slice.sh <branch> <message>: merge a slice branch into the integration branch (main checkout), then verify_push.
set -u
# one merge at a time across workflows (verify_push skips its own lock when this one is held)
exec 9>/tmp/claude-0/-home-user-Eldaryn-Workshop/51487d85-46a3-521f-aaa4-955331a2f445/scratchpad/merge.lock; flock 9; export MERGE_LOCK_HELD=1
cd /home/user/Eldaryn-Workshop
SP=/tmp/claude-0/-home-user-Eldaryn-Workshop/51487d85-46a3-521f-aaa4-955331a2f445/scratchpad
[ "$(git rev-parse --abbrev-ref HEAD)" = "claude/sweet-cannon-klhjs3" ] || { echo "WRONG BRANCH $(git rev-parse --abbrev-ref HEAD)"; exit 6; }
# another workflow may be resolving a conflict outside the lock: wait for a clean tree (up to 90 min) instead of failing
waited=0
while [ -n "$(git status --porcelain)" ] || [ -e .git/MERGE_HEAD ]; do
  [ $waited -ge 5400 ] && { echo "DIRTY"; git status --short | head -20; exit 3; }
  flock -u 9; sleep 30; waited=$((waited+30)); flock 9
done
git rev-parse -q --verify "$1" >/dev/null || { echo "MISSING $1"; exit 4; }
if git merge-base --is-ancestor "$1" HEAD; then echo "ALREADY merged"; exit 0; fi
pre=$(git rev-parse HEAD)
echo "PRE=$pre"
if ! git -c user.name="Claude" -c user.email="noreply@anthropic.com" merge --no-ff --no-edit -m "$2" "$1" > $SP/logs/merge.log 2>&1; then
  echo "CONFLICT"; git diff --name-only --diff-filter=U; exit 1
fi
echo "MERGED"
bash $SP/scripts/verify_push.sh; rc=$?
if [ $rc -eq 0 ]; then
  # free disk: drop this slice's finished agent worktrees (impl, review, fix)
  tip=$(git rev-parse "$1"); btip=$(git rev-parse -q --verify "${1%-r1}")
  git worktree list --porcelain | awk '/^worktree /{p=$2} /^HEAD /{print p" "$2}' | while read p h; do
    [ "$p" = "/home/user/Eldaryn-Workshop" ] && continue
    if [ "$h" = "$tip" ] || [ "$h" = "$btip" ]; then git worktree unlock "$p" 2>/dev/null; git worktree remove --force --force "$p" 2>/dev/null && echo "cleaned $p"; fi
  done
  git worktree prune
fi
exit $rc
