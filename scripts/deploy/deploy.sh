#!/usr/bin/env bash
# Pull-based deploy for the laptop server (plan card S7).
#
# Nothing on the internet can push code onto this laptop. Instead this script
# asks GitHub once a minute for the newest commit on main, and deploys it only
# when every CI check on that exact commit has passed:
#   1. export that commit into a new folder under releases/
#   2. npm ci, then npm run build (the running version is untouched meanwhile)
#   3. point "current" at the new folder and restart the app with pm2
#   4. check the app answers; if not, switch straight back
# A file named DEPLOY_FREEZE in the deploy folder stops all deploys.
#
# Usage:
#   scripts/deploy/deploy.sh setup      # once: folders, mirror, shared .env.local
#   scripts/deploy/deploy.sh once       # deploy main now if CI passed
#   scripts/deploy/deploy.sh watch      # loop every 60 s (run by pm2)
#   scripts/deploy/deploy.sh rollback   # back to the previous release
#   scripts/deploy/deploy.sh status
set -euo pipefail

REPO_SLUG="${PAYTRACE_REPO:-AdithyaPatil-1609/paytrace}"
BRANCH="${PAYTRACE_BRANCH:-main}"
HOME_DIR="${PAYTRACE_DEPLOY_HOME:-$HOME/paytrace-deploy}"
APP_NAME="${PAYTRACE_PM2_APP:-paytrace}"
PORT="${PAYTRACE_PORT:-3000}"
KEEP=3

MIRROR="$HOME_DIR/mirror.git"
RELEASES="$HOME_DIR/releases"
SHARED="$HOME_DIR/shared"
CURRENT="$HOME_DIR/current"
LOG="$HOME_DIR/deploy.log"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG" >&2; }

setup() {
  mkdir -p "$RELEASES" "$SHARED"
  [ -d "$MIRROR" ] || git clone --mirror "https://github.com/$REPO_SLUG.git" "$MIRROR"
  if [ ! -f "$SHARED/.env.local" ]; then
    log "Put the real settings in $SHARED/.env.local (copy of your .env.local). It is never inside git."
  fi
  chmod 700 "$HOME_DIR" "$SHARED"
  [ -f "$SHARED/.env.local" ] && chmod 600 "$SHARED/.env.local"
  log "setup done in $HOME_DIR"
}

latest_sha() {
  git --git-dir="$MIRROR" fetch --quiet --prune origin "+refs/heads/$BRANCH:refs/heads/$BRANCH"
  git --git-dir="$MIRROR" rev-parse "refs/heads/$BRANCH"
}

deployed_sha() { [ -L "$CURRENT" ] && basename "$(readlink "$CURRENT")" || echo none; }

# True only when the commit has check runs and every one finished with success or skipped.
ci_passed() {
  local sha="$1" json
  json="$(curl -fsS -H 'Accept: application/vnd.github+json' \
    ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
    "https://api.github.com/repos/$REPO_SLUG/commits/$sha/check-runs?per_page=100")" || return 1
  printf '%s' "$json" | node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      const runs=(JSON.parse(s).check_runs)||[];
      const ok=runs.length>0 && runs.every(r=>r.status==="completed" && ["success","skipped","neutral"].includes(r.conclusion));
      process.exit(ok?0:1);
    });'
}

healthy() {
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/" && return 0
    sleep 3
  done
  return 1
}

switch_to() {
  ln -sfn "$RELEASES/$1" "$CURRENT"
  pm2 restart "$APP_NAME" --update-env >/dev/null
}

deploy() {
  local sha="$1" previous dir
  previous="$(deployed_sha)"
  dir="$RELEASES/$sha"
  log "deploying $sha (was $previous)"
  rm -rf "$dir.partial"; mkdir -p "$dir.partial"
  git --git-dir="$MIRROR" archive "$sha" | tar -x -C "$dir.partial"
  ln -s "$SHARED/.env.local" "$dir.partial/.env.local"
  if ! (cd "$dir.partial" && npm ci --no-audit --no-fund && npm run build) >>"$LOG" 2>&1; then
    log "build failed for $sha; $previous keeps running"
    rm -rf "$dir.partial"; return 1
  fi
  rm -rf "$dir"; mv "$dir.partial" "$dir"
  echo "$previous" > "$dir/.previous"
  switch_to "$sha"
  if healthy; then
    log "live: $sha"
  else
    log "$sha did not answer; rolling back to $previous"
    [ "$previous" != none ] && switch_to "$previous"
    return 1
  fi
  # Keep the newest few releases.
  ls -1t "$RELEASES" | { grep -v '\.partial$' || true; } | tail -n +$((KEEP + 1)) | while read -r old; do
    [ "$old" = "$sha" ] || [ "$old" = "$previous" ] || rm -rf "${RELEASES:?}/$old"
  done
}

once() {
  if [ -e "$HOME_DIR/DEPLOY_FREEZE" ]; then log "DEPLOY_FREEZE present; not deploying"; return 0; fi
  local sha; sha="$(latest_sha)"
  [ "$sha" = "$(deployed_sha)" ] && return 0
  if ! ci_passed "$sha"; then log "waiting: CI has not passed on $sha yet"; return 0; fi
  deploy "$sha" || true
}

rollback() {
  local now previous
  now="$(deployed_sha)"
  previous="$(cat "$RELEASES/$now/.previous" 2>/dev/null || echo none)"
  [ "$previous" = none ] || [ ! -d "$RELEASES/$previous" ] && { log "no previous release to roll back to"; return 1; }
  touch "$HOME_DIR/DEPLOY_FREEZE"
  switch_to "$previous"
  log "rolled back from $now to $previous; DEPLOY_FREEZE set (delete it to resume deploys)"
}

case "${1:-}" in
  setup) setup ;;
  once) once ;;
  watch) while true; do once || log "deploy check failed; will retry"; sleep 60; done ;;
  rollback) rollback ;;
  status) echo "deployed: $(deployed_sha)"; [ -e "$HOME_DIR/DEPLOY_FREEZE" ] && echo "frozen: yes" || echo "frozen: no" ;;
  *) echo "usage: $0 setup|once|watch|rollback|status" >&2; exit 2 ;;
esac
