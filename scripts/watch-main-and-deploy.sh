#!/usr/bin/env bash
set -euo pipefail

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH}"
export PATH

PIANO_PROD_DIR="${PIANO_PROD_DIR:-$HOME/piano-prod}"
REPO_DIR="${PIANO_PROD_DIR}/repo"
STATE_DIR="${PIANO_PROD_DIR}/state"
ENV_FILE="${PIANO_PROD_DIR}/.env.production"
mkdir -p "$STATE_DIR"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$STATE_DIR/agent.log"; }

[[ -f "$ENV_FILE" && -d "$REPO_DIR/.git" ]] || { log "Deployment checkout or config is missing."; exit 0; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

LOCK_DIR="$STATE_DIR/agent.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  owner="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ -n "$owner" ]] && kill -0 "$owner" 2>/dev/null; then exit 0; fi
  rm -f "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR" 2>/dev/null || exit 0
  mkdir "$LOCK_DIR" 2>/dev/null || exit 0
fi
printf '%s\n' "$$" > "$LOCK_DIR/pid"
trap 'rm -f "$LOCK_DIR/pid"; rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

remote_sha="$(git -C "$REPO_DIR" ls-remote origin "refs/heads/${DEPLOY_BRANCH}" 2>/dev/null | cut -f1 || true)"
[[ "$remote_sha" =~ ^[0-9a-f]{40}$ ]] || { log "Cannot read remote branch."; exit 0; }
[[ "$remote_sha" != "$(cat "$STATE_DIR/deployed-sha" 2>/dev/null || true)" ]] || exit 0

last_sha="$(cat "$STATE_DIR/last-query-sha" 2>/dev/null || true)"
last_at="$(cat "$STATE_DIR/last-query-at" 2>/dev/null || echo 0)"
now="$(date +%s)"
if [[ "$remote_sha" == "$last_sha" ]] && (( now - last_at < 300 )); then exit 0; fi
printf '%s\n' "$remote_sha" > "$STATE_DIR/last-query-sha"
printf '%s\n' "$now" > "$STATE_DIR/last-query-at"

verdict="$($REPO_DIR/scripts/check-ci.sh "$remote_sha")"
case "$verdict" in
  green)
    log "CI is green for $remote_sha; deploying."
    if "$REPO_DIR/scripts/deploy-production.sh" --sha "$remote_sha"; then
      log "Released $remote_sha."
    else
      log "Release failed; see deploy.log."
    fi
    ;;
  red) log "CI failed for $remote_sha; current release stays live." ;;
  *) log "CI is $verdict for $remote_sha; waiting." ;;
esac
